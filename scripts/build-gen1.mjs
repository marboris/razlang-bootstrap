#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { legacyRuntimeHeader } from './legacy-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'legacy', 'gen1');
const BUILD = path.join(GEN, 'build');
const WORK = path.join(BUILD, 'native-work');
const FRONTEND = path.join(GEN, 'src', 'frontend', 'compiler.raz');
const BACKEND = path.join(GEN, 'src', 'backend', 'cpp_backend.raz');
const GEN0 = path.join(ROOT, 'legacy', 'gen0');
const FROZEN_SEED = path.join(GEN0, 'bin', 'razc');
const FROZEN_CHECKSUM = path.join(GEN0, 'bin', 'razc.sha256');
const NATIVE_SEED_CANDIDATE = path.join(GEN0, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const USE_BOOTSTRAP_CANDIDATES = process.env.RAZ_BOOTSTRAP_USE_CANDIDATES === '1';
const SEED_CANDIDATE = USE_BOOTSTRAP_CANDIDATES && fs.existsSync(NATIVE_SEED_CANDIDATE) ? NATIVE_SEED_CANDIDATE : FROZEN_SEED;
const BUNDLE = path.join(GEN, 'final', 'compiler.raz');
const CPP = path.join(BUILD, 'compiler.cpp');
const BINARY = path.join(BUILD, process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');

function run(command, args, options = {}) {
  const timeout = options.timeout ?? Number(process.env.RAZ_STAGE_TIMEOUT_MS ?? 180000);
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${command} timed out after ${elapsed}s (limit ${timeout}ms); set RAZ_STAGE_TIMEOUT_MS to adjust`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
    throw new Error(`${command} failed with ${result.status} after ${elapsed}s${detail}`);
  }
  console.log(`[gen1] ${path.basename(command)} completed in ${elapsed}s`);
  return result;
}

function stripMain(source, label) {
  const match = /^function main\(\) -> i64[ \t]*\{/m.exec(source);
  if (!match) throw new Error(`${label} has no main function`);
  const open = source.indexOf('{', match.index);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let lineComment = false;
  for (let i = open; i < source.length; i++) {
    const current = source[i];
    if (lineComment) {
      if (current === '\n') lineComment = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') quoted = false;
      continue;
    }
    if (current === '/' && source[i + 1] === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (current === '"') {
      quoted = true;
      continue;
    }
    if (current === '{') depth++;
    else if (current === '}') {
      depth--;
      if (depth === 0) return source.slice(0, match.index) + source.slice(i + 1);
    }
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
      output += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (source[i] === '"') {
      const start = i++;
      let escaped = false;
      while (i < source.length) {
        const current = source[i++];
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '"') break;
      }
      output += source.slice(start, i);
      continue;
    }
    if (/[A-Za-z_]/.test(source[i])) {
      const start = i++;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
      const identifier = source.slice(start, i);
      output += renames.get(identifier) ?? identifier;
      continue;
    }
    output += source[i++];
  }
  return output;
}

fs.mkdirSync(path.join(GEN, 'final'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
fs.writeFileSync(path.join(WORK, 'backend', 'raz_runtime.hpp'), legacyRuntimeHeader(), 'utf8');
fs.writeFileSync(path.join(BUILD, 'raz_runtime.hpp'), legacyRuntimeHeader(), 'utf8');

console.log('[gen1] bundle frontend + backend');
const frontend = stripMain(fs.readFileSync(FRONTEND, 'utf8'), 'Gen1 frontend');
const backend = stripMain(fs.readFileSync(BACKEND, 'utf8'), 'Gen1 backend');
const frontendNames = declaredNames(frontend);
const backendNames = declaredNames(backend);
const renames = new Map();
for (const name of backendNames) {
  if (frontendNames.has(name)) renames.set(name, `rirBackend_${name}`);
}
const wrapper = `
function main() -> i64 {
    let source: string = readFile("frontend/input.raz");
    let rir: string = compileSource(source);
    if (rir == "") return 1;
    let cpp: string = generate(rir);
    if (cpp == "") return 1;
    writeFile("backend/output.cpp", cpp);
    return 0;
}
`;
fs.writeFileSync(BUNDLE, `${frontend}\n${renameIdentifiers(backend, renames)}\n${wrapper}`, 'utf8');

if (SEED_CANDIDATE === FROZEN_SEED) {
  console.log('[gen1] verify frozen Gen0 checksum');
  run('sha256sum', ['-c', FROZEN_CHECKSUM], { cwd: path.dirname(FROZEN_CHECKSUM) });
} else {
  console.log('[gen1] bootstrap with rebuilt Gen0 candidate (frozen binary remains untouched)');
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
fs.copyFileSync(BUNDLE, path.join(WORK, 'frontend', 'input.raz'));
fs.writeFileSync(path.join(WORK, 'backend', 'raz_runtime.hpp'), legacyRuntimeHeader(), 'utf8');

console.log(`[gen1] compile final bundle with ${SEED_CANDIDATE === FROZEN_SEED ? 'frozen Gen0' : 'rebuilt Gen0 candidate'}`);
run(SEED_CANDIDATE, [], { cwd: WORK });
const optimization = process.env.RAZ_BUILD_OPT ?? '-O0';
const nativeFlags = ['-std=c++17', optimization];
if (process.env.RAZ_GLIBCXX_ASSERTIONS === '1') {
  nativeFlags.push('-D_GLIBCXX_ASSERTIONS');
  console.log('[gen1] libstdc++ assertions enabled for bootstrap validation');
}
console.log(`[gen1] build native candidate (${optimization}; set RAZ_BUILD_OPT=-O2 for an optimized freeze build)`);
run(process.env.CXX ?? 'g++', [...nativeFlags, path.join(WORK, 'backend', 'output.cpp'), '-I', path.join(WORK, 'backend'), '-o', BINARY]);
fs.chmodSync(BINARY, 0o755);
fs.copyFileSync(path.join(WORK, 'backend', 'output.cpp'), CPP);
console.log(`[gen1] candidate ready: ${BINARY}`);
