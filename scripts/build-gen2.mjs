#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN0 = path.join(ROOT, 'generations', 'gen0');
const GEN1 = path.join(ROOT, 'generations', 'gen1');
const GEN2 = path.join(ROOT, 'generations', 'gen2');
const WORK = path.join(GEN2, 'build', 'native-work');
const BUNDLE = path.join(GEN2, 'final', 'compiler.raz');
const CPP = path.join(WORK, 'backend', 'output.cpp');
const REPAIRED_CPP = path.join(WORK, 'backend', 'output.bootstrap-fixed.cpp');
const CANDIDATE = path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const RUNTIME = path.join(ROOT, 'runtime', 'raz_runtime.hpp');
const GEN1_BIN = path.join(GEN1, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const GEN1_CHECKSUM = path.join(GEN1, 'bin', 'razc.sha256');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
    throw new Error(`${command} failed with ${result.status}${detail}`);
  }
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

function renameIdentifiers(source, renames) {
  let output = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      if (end < 0) return output + source.slice(i);
      output += source.slice(i, end + 1); i = end + 1; continue;
    }
    if (source[i] === '"') {
      const start = i++;
      let escaped = false;
      while (i < source.length) {
        const c = source[i++];
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') break;
      }
      output += source.slice(start, i); continue;
    }
    if (/[A-Za-z_]/.test(source[i])) {
      const start = i++;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
      const id = source.slice(start, i);
      output += renames.get(id) ?? id;
      continue;
    }
    output += source[i++];
  }
  return output;
}

const sourceModules = [
  'src/model/ast.raz',
  'src/core/lexer.raz',
  'src/core/parser.raz',
  'src/core/text.raz',
  'src/source/includes.raz',
  'src/validation/semantics.raz',
  'src/core/rir.raz',
];
const targetModules = [
  'src/targets/cpp17/model.raz',
  'src/targets/cpp17/parser.raz',
  'src/targets/cpp17/types.raz',
  'src/targets/cpp17/emitter.raz',
];

if (!fs.existsSync(GEN1_BIN)) throw new Error(`Frozen Gen1 compiler not found: ${GEN1_BIN}`);
if (!fs.existsSync(GEN1_CHECKSUM)) throw new Error(`Gen1 checksum not found: ${GEN1_CHECKSUM}`);
run('sha256sum', ['-c', GEN1_CHECKSUM], { cwd: path.dirname(GEN1_CHECKSUM) });

fs.mkdirSync(path.dirname(BUNDLE), { recursive: true });
fs.mkdirSync(path.dirname(CANDIDATE), { recursive: true });
const front = sourceModules.map((p) => fs.readFileSync(path.join(GEN2, p), 'utf8')).join('\n\n');
const backRaw = targetModules.map((p) => fs.readFileSync(path.join(GEN2, p), 'utf8')).join('\n\n');
const back = stripMain(backRaw, 'Gen2 C++17 target');
const frontNames = declaredNames(front);
const backNames = declaredNames(back);
const renames = new Map();
for (const name of backNames) if (frontNames.has(name)) renames.set(name, `cpp17_${name}`);
const renamedBack = renameIdentifiers(back, renames);
const driver = fs.readFileSync(path.join(GEN2, 'src/driver/main.raz'), 'utf8');
const bundle = [
  '// Raz Gen2 preview bundle. Generated from modular files under generations/gen2/src/.',
  front,
  renamedBack,
  driver,
].join('\n\n');
fs.writeFileSync(BUNDLE, bundle, 'utf8');
if (process.argv.includes('--bundle-only')) {
  console.log(`[gen2] bundle ready: ${BUNDLE}`);
  process.exit(0);
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
fs.copyFileSync(BUNDLE, path.join(WORK, 'frontend', 'input.raz'));
fs.copyFileSync(RUNTIME, path.join(WORK, 'raz_runtime.hpp'));

console.log('[gen2] compile modular bundle with frozen Gen1');
run(GEN1_BIN, [], { cwd: WORK });

const generated = fs.readFileSync(CPP, 'utf8');
const generatedIncludes = generated.split(/\r?\n/).filter((line) => line.startsWith('#include'));
const requiredIncludes = [
  '#include <cstdint>',
  '#include <cstddef>',
  '#include <string>',
  '#include <vector>',
  '#include "raz_runtime.hpp"',
];
for (const include of requiredIncludes) {
  if (!generatedIncludes.includes(include)) throw new Error(`Gen2 compiler source omitted explicit native dependency: ${include}`);
}
if (generatedIncludes.some((include) => include.includes('iostream') || include.includes('fstream'))) {
  throw new Error('Gen2 compiler output unexpectedly includes runtime transitive headers');
}

console.log('[gen2] apply isolated Gen1 bootstrap type-inference repair');
run(process.execPath, [path.join(ROOT, 'scripts', 'repair-gen2-bootstrap-cpp.mjs'), CPP, REPAIRED_CPP]);

console.log('[gen2] build native candidate');
const optimization = process.env.RAZ_BUILD_OPT ?? '-O0';
run(process.env.CXX ?? 'c++', ['-std=c++17', optimization, REPAIRED_CPP, '-I', WORK, '-o', CANDIDATE]);
fs.chmodSync(CANDIDATE, 0o755);
console.log(`[gen2] candidate ready: ${CANDIDATE}`);
