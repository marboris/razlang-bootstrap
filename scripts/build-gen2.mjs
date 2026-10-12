#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
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
const STAGE2_CPP = path.join(WORK, 'backend', 'output.stage2.cpp');
const STAGE3_CPP = path.join(WORK, 'backend', 'output.stage3.cpp');
const SELF_HOST_STAGE1 = path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate-stage1.exe' : 'razc-candidate-stage1');
const SELF_HOST_STAGE2 = path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate-stage2.exe' : 'razc-candidate-stage2');
const SMOKE_CPP = path.join(WORK, 'backend', 'selfhost-smoke.cpp');
const SMOKE_BIN = path.join(WORK, 'backend', process.platform === 'win32' ? 'selfhost-smoke.exe' : 'selfhost-smoke');
const REPAIRED_CPP = path.join(WORK, 'backend', 'output.bootstrap-fixed.cpp');
const CANDIDATE = path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const BOOTSTRAP_COMPAT = path.join(WORK, 'gen1_bootstrap_compat.hpp');
const FROZEN_GEN1_BIN = path.join(GEN1, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const GEN1_CANDIDATE = path.join(GEN1, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const GEN1_CHECKSUM = path.join(GEN1, 'bin', 'razc.sha256');
const USE_BOOTSTRAP_CANDIDATES = process.env.RAZ_BOOTSTRAP_USE_CANDIDATES === '1';
const GEN1_BIN = USE_BOOTSTRAP_CANDIDATES && fs.existsSync(GEN1_CANDIDATE) ? GEN1_CANDIDATE : FROZEN_GEN1_BIN;

function requireHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

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

function expandCompilerIncludes(filePath, state = { active: new Set(), seen: new Set() }) {
  const absolute = path.resolve(filePath);
  if (state.active.has(absolute)) {
    throw new Error(`compiler include cycle detected at ${path.relative(GEN2, absolute)}`);
  }
  if (state.seen.has(absolute)) return '';
  if (!fs.existsSync(absolute)) throw new Error(`compiler include not found: ${absolute}`);

  state.active.add(absolute);
  state.seen.add(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const output = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*include\s+"([^"\n]+)"\s*;\s*(?:\/\/.*)?$/.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }
    const includedPath = path.resolve(path.dirname(absolute), match[1]);
    output.push(expandCompilerIncludes(includedPath, state));
  }
  state.active.delete(absolute);
  return output.join('\n');
}

fs.mkdirSync(path.dirname(FLAT_BUNDLE), { recursive: true });
fs.mkdirSync(path.dirname(CANDIDATE), { recursive: true });
const expandedEntry = expandCompilerIncludes(ENTRY);
const declarations = new Map();
for (const match of expandedEntry.matchAll(/^(?:struct|function)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
  const owners = declarations.get(match[1]) ?? 0;
  declarations.set(match[1], owners + 1);
}
const collisions = [...declarations].filter(([, count]) => count > 1).map(([name]) => name);
if (collisions.length) {
  throw new Error(`compiler.raz includes duplicate top-level declarations: ${collisions.join(', ')}`);
}
const bundle = [
  '// Raz compiler bundle. Generated from the canonical compiler.raz include graph.',
  expandedEntry,
].join('\n\n');
fs.writeFileSync(FLAT_BUNDLE, bundle, 'utf8');
if (process.argv.includes('--bundle-only')) {
  console.log(`[gen2] temporary bootstrap bundle ready: ${FLAT_BUNDLE}`);
  process.exit(0);
}

if (SELF_HOST) {
  if (!fs.existsSync(SELF_HOST_BIN)) throw new Error(`Gen2 self-host compiler not found: ${SELF_HOST_BIN}`);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(SELF_HOST_STAGE1, { force: true });
  fs.rmSync(SELF_HOST_STAGE2, { force: true });
  fs.rmSync(CANDIDATE, { force: true });
  fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
  const optimization = process.env.RAZ_BUILD_OPT ?? '-O0';
  const cxx = process.env.CXX ?? 'g++';

  // Stage 1 is a compatibility bootstrap: the frozen compiler may still emit
  // identifiers using the previous backend contract. Do not demand a fixed
  // point yet, because a backend/name-mangling change converges one stage later.
  console.log('[gen2] stage 1/3: active Gen2 compiles compiler.raz');
  run(SELF_HOST_BIN, [ENTRY, '--emit-cpp', CPP, '-L', LIBRARY_ROOT], { label: 'Gen2 stage 1 emits compiler C++' });
  run(cxx, ['-std=c++17', optimization, CPP, '-I', LIBRARY_ROOT, '-o', SELF_HOST_STAGE1], { label: 'build stage-1 Gen2 candidate' });
  fs.chmodSync(SELF_HOST_STAGE1, 0o755);

  // Stage 2 runs the compiler implementation from the source tree, including
  // its current readable-name mapping. Build that output as the convergence candidate.
  console.log('[gen2] stage 2/3: stage-1 Gen2 compiles compiler.raz');
  run(SELF_HOST_STAGE1, [ENTRY, '--emit-cpp', STAGE2_CPP, '-L', LIBRARY_ROOT], { label: 'Gen2 stage 2 emits compiler C++' });
  run(cxx, ['-std=c++17', optimization, STAGE2_CPP, '-I', LIBRARY_ROOT, '-o', SELF_HOST_STAGE2], { label: 'build stage-2 Gen2 candidate' });
  fs.chmodSync(SELF_HOST_STAGE2, 0o755);

  // Stage 3 must reproduce stage 2 byte-for-byte. This permits a single
  // transition from an older frozen emitter while still enforcing a stable fixed point.
  console.log('[gen2] stage 3/3: stage-2 Gen2 verifies the self-host fixed point');
  run(SELF_HOST_STAGE2, [ENTRY, '--emit-cpp', STAGE3_CPP, '-L', LIBRARY_ROOT], { label: 'Gen2 stage 3 emits compiler C++' });
  const secondCpp = fs.readFileSync(STAGE2_CPP, 'utf8');
  const thirdCpp = fs.readFileSync(STAGE3_CPP, 'utf8');
  if (secondCpp !== thirdCpp) {
    const secondHash = requireHash(secondCpp);
    const thirdHash = requireHash(thirdCpp);
    throw new Error(`self-host fixed-point mismatch after stage 2: stage 2 C++ sha256=${secondHash}, stage 3 sha256=${thirdHash}`);
  }
  console.log(`[gen2] self-host fixed point verified (${thirdCpp.length.toLocaleString()} C++ characters; stage 2 == stage 3)`);

  // The stage-2 executable was compiled from output.stage2.cpp, which has
  // just been proven byte-identical to output.stage3.cpp. Promote that exact
  // executable instead of asking the C++ compiler to rebuild identical input.
  fs.copyFileSync(SELF_HOST_STAGE2, CANDIDATE);
  fs.chmodSync(CANDIDATE, 0o755);
  const stage1Version = run(SELF_HOST_STAGE1, ['--version'], { label: 'verify stage-1 version', capture: true });
  const stage2Version = run(SELF_HOST_STAGE2, ['--version'], { label: 'verify stage-2 version', capture: true });
  const finalVersion = run(CANDIDATE, ['--version'], { label: 'verify final version', capture: true });
  const stage1VersionText = (stage1Version.stdout ?? '').trim();
  const stage2VersionText = (stage2Version.stdout ?? '').trim();
  const expectedVersion = (finalVersion.stdout ?? '').trim();
  if (stage1VersionText !== expectedVersion || stage2VersionText !== expectedVersion) {
    throw new Error(`self-host version mismatch: stage 1='${stage1VersionText}', stage 2='${stage2VersionText}', final='${expectedVersion}'`);
  }

  run(CANDIDATE, [path.join(GEN2, 'examples', 'hello.raz'), '--emit-cpp', SMOKE_CPP, '-L', LIBRARY_ROOT], { label: 'final candidate smoke emit' });
  run(cxx, ['-std=c++17', optimization, SMOKE_CPP, '-I', LIBRARY_ROOT, '-o', SMOKE_BIN], { label: 'final candidate smoke build' });
  const smoke = run(SMOKE_BIN, [], { label: 'final candidate smoke run', capture: true });
  if (!(smoke.stdout ?? '').includes('Hello from Raz Gen2!')) throw new Error('final candidate smoke output mismatch');

  console.log(`[gen2] three-stage self-host candidate ready: ${CANDIDATE}`);
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
