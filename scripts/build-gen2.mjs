#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { adaptGen2SourceForGen1Bootstrap, validateGen2BootstrapIncludes, gen1BootstrapCompatHeader } from './gen2-bootstrap-adapter.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN1 = path.join(ROOT, 'legacy', 'gen1');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const LIBRARY_ROOT = path.join(ROOT, 'library', 'raz');
const SELF_HOST = process.argv.includes('--self-host');
const SELF_HOST_BIN = path.join(GEN2, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const WORK = path.join(GEN2, 'build', 'native-work');
const ENTRY = path.join(GEN2, 'compiler.raz');
const FLAT_BUNDLE = path.join(GEN2, 'build', 'bootstrap', 'compiler.bundle.raz');
const CPP = path.join(WORK, 'backend', 'output.cpp');
const REPAIRED_CPP = path.join(WORK, 'backend', 'output.bootstrap-fixed.cpp');
const CANDIDATE = path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const BOOTSTRAP_COMPAT = path.join(WORK, 'gen1_bootstrap_compat.hpp');
const FROZEN_GEN1_BIN = path.join(GEN1, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const GEN1_CANDIDATE = path.join(GEN1, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const GEN1_CHECKSUM = path.join(GEN1, 'bin', 'razc.sha256');
const USE_BOOTSTRAP_CANDIDATES = process.env.RAZ_BOOTSTRAP_USE_CANDIDATES === '1';
const GEN1_BIN = USE_BOOTSTRAP_CANDIDATES && fs.existsSync(GEN1_CANDIDATE) ? GEN1_CANDIDATE : FROZEN_GEN1_BIN;

function run(command, args, options = {}) {
  const started = Date.now();
  const timeout = options.timeout ?? Number(process.env.RAZ_STAGE_TIMEOUT_MS ?? 180000);
  const label = options.label ?? `${command} ${args.join(' ')}`;
  console.log(`[gen2] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`${label} timed out after ${elapsed}s (limit ${timeout}ms); set RAZ_STAGE_TIMEOUT_MS to adjust the limit`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
    throw new Error(`${label} failed with ${result.status} after ${elapsed}s${detail}`);
  }
  console.log(`[gen2] ${label} completed in ${elapsed}s`);
  return result;
}

function stripMain(source, label) {
  const match = /^function main\(\) -> i64[ \t]*\{/m.exec(source);
  if (!match) return source;
  const open = source.indexOf('{', match.index);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let lineComment = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') { lineComment = true; i++; continue; }
    if (c === '"') { quoted = true; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(0, match.index) + source.slice(i + 1);
  }
  throw new Error(`${label} has an unterminated main function`);
}

function declaredNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/^(?:struct|function)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) names.add(match[1]);
  return names;
}

const sourceModules = [
  'src/model/ast.raz',
  'src/core/lexer.raz',
  'src/core/parser.raz',
  'src/core/text.raz',
  'src/source/includes.raz',
  'src/source/modules.raz',
  'src/source/macros.raz',
  'src/validation/semantics.raz',
  'src/validation/lowering.raz',
  'src/validation/rir.raz',
  'src/core/rir.raz',
];
const targetModules = [
  'src/targets/cpp17/model.raz',
  'src/targets/cpp17/rir_parser.raz',
  'src/targets/cpp17/types.raz',
  'src/targets/cpp17/emitter.raz',
  'src/targets/cpp17/validate.raz',
];

fs.mkdirSync(path.dirname(FLAT_BUNDLE), { recursive: true });
fs.mkdirSync(path.dirname(CANDIDATE), { recursive: true });
const front = sourceModules.map((p) => fs.readFileSync(path.join(GEN2, p), 'utf8')).join('\n\n');
const backRaw = targetModules.map((p) => fs.readFileSync(path.join(GEN2, p), 'utf8')).join('\n\n');
const back = stripMain(backRaw, 'Gen2 C++17 target');
const frontNames = declaredNames(front);
const backNames = declaredNames(back);
const collisions = [...backNames].filter((name) => frontNames.has(name));
if (collisions.length) {
  throw new Error(`Gen2 include entry requires globally unique declarations; rename target helpers explicitly: ${collisions.join(', ')}`);
}
const driver = fs.readFileSync(path.join(GEN2, 'src/driver/main.raz'), 'utf8');
const bundle = [
  '// Raz compiler bundle. Generated from modular files under compiler/razc/src/.',
  front,
  back,
  driver,
].join('\n\n');
fs.writeFileSync(FLAT_BUNDLE, bundle, 'utf8');
if (process.argv.includes('--bundle-only')) {
  console.log(`[gen2] temporary bootstrap bundle ready: ${FLAT_BUNDLE}`);
  process.exit(0);
}

if (SELF_HOST) {
  if (!fs.existsSync(SELF_HOST_BIN)) throw new Error(`Gen2 self-host compiler not found: ${SELF_HOST_BIN}`);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
  console.log('[gen2] compile canonical include-based compiler entry with the current Gen2 binary');
  run(SELF_HOST_BIN, [ENTRY, '--emit-cpp', CPP, '-L', LIBRARY_ROOT], { label: 'Gen2 compiles its own compiler.raz entry' });
  const optimization = process.env.RAZ_BUILD_OPT ?? '-O0';
  console.log('[gen2] build self-hosted native candidate');
  run(process.env.CXX ?? 'g++', ['-std=c++17', optimization, CPP, '-I', LIBRARY_ROOT, '-o', CANDIDATE], { label: 'build self-hosted Gen2 candidate' });
  fs.chmodSync(CANDIDATE, 0o755);
  console.log(`[gen2] self-hosted candidate ready: ${CANDIDATE}`);
  process.exit(0);
}

if (!fs.existsSync(GEN1_BIN)) throw new Error(`Gen1 compiler not found: ${GEN1_BIN}`);
if (GEN1_BIN === FROZEN_GEN1_BIN) {
  if (!fs.existsSync(GEN1_CHECKSUM)) throw new Error(`Gen1 checksum not found: ${GEN1_CHECKSUM}`);
  run('sha256sum', ['-c', GEN1_CHECKSUM], { cwd: path.dirname(GEN1_CHECKSUM) });
} else {
  console.log('[gen2] bootstrapping with rebuilt Gen1 candidate (frozen binary remains untouched)');
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
// The canonical Gen2 source imports std.io like user programs. Frozen Gen1
// cannot parse source-backed module imports yet, so the
// one-time bootstrap input removes only this directive and uses Gen1's legacy
// I/O builtins. This flattened file is temporary; canonical compiler.raz uses include directives.
const bootstrapCore = adaptGen2SourceForGen1Bootstrap(bundle);
const bootstrapBundle = `use "gen1_bootstrap_compat.hpp";\n${bootstrapCore}`;
fs.writeFileSync(path.join(WORK, 'frontend', 'input.raz'), bootstrapBundle, 'utf8');
fs.writeFileSync(BOOTSTRAP_COMPAT, gen1BootstrapCompatHeader(), 'utf8');

console.log(`[gen2] compile modular bundle with ${GEN1_BIN === FROZEN_GEN1_BIN ? 'frozen Gen1' : 'rebuilt Gen1 candidate'}`);
run(GEN1_BIN, [], { cwd: WORK, label: `compile modular bundle with ${GEN1_BIN === FROZEN_GEN1_BIN ? 'frozen Gen1' : 'rebuilt Gen1 candidate'}` });

const generated = fs.readFileSync(CPP, 'utf8');
validateGen2BootstrapIncludes(generated);

console.log('[gen2] apply isolated Gen1 bootstrap type-inference repair');
run(process.execPath, [path.join(ROOT, 'scripts', 'repair-gen2-bootstrap-cpp.mjs'), CPP, REPAIRED_CPP], { label: 'repair isolated Gen1 bootstrap output' });

console.log('[gen2] build native candidate');
const optimization = process.env.RAZ_BUILD_OPT ?? '-O0';
run(process.env.CXX ?? 'g++', ['-std=c++17', optimization, REPAIRED_CPP, '-I', WORK, '-o', CANDIDATE], { label: 'build native Gen2 candidate' });
fs.chmodSync(CANDIDATE, 0o755);
console.log(`[gen2] candidate ready: ${CANDIDATE}`);
