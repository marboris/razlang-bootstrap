#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'generations', 'gen1', 'build', 'fast-check');
const BIN = path.join(BUILD, 'bin');
const SOURCES = [
  [path.join(ROOT, 'generations', 'gen1', 'src', 'frontend', 'compiler.raz'), 'frontendc'],
  [path.join(ROOT, 'generations', 'gen1', 'src', 'backend', 'cpp_backend.raz'), 'backendc'],
  [path.join(ROOT, 'generations', 'gen1', 'src', 'ir', 'rir_verify.raz'), 'rirverify'],
];
const SEED = path.join(ROOT, 'generations', 'gen0', 'seed', 'seed.mjs');
const LANGUAGE = path.join(ROOT, 'config', 'language.json');
const TARGET = path.join(ROOT, 'config', 'targets', 'cpp17.json');
const RUNTIME = path.join(ROOT, 'runtime', 'raz_runtime.hpp');

function run(command, args) {
  const r = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

fs.mkdirSync(BIN, { recursive: true });
fs.mkdirSync(path.join(BUILD, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(BUILD, 'backend'), { recursive: true });
fs.mkdirSync(path.join(BUILD, 'ir'), { recursive: true });
fs.copyFileSync(RUNTIME, path.join(BUILD, 'raz_runtime.hpp'));
for (const [source, name] of SOURCES) {
  const cpp = path.join(BUILD, `${name}.cpp`);
  const out = path.join(BIN, name);
  console.log(`[gen1-fast-build] ${name}`);
  run(process.execPath, [SEED, 'compile', source, '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
  run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', cpp, '-o', out]);
  fs.chmodSync(out, 0o755);
}
fs.copyFileSync(RUNTIME, path.join(BUILD, 'backend', 'raz_runtime.hpp'));
console.log('[gen1-fast-build] ready');
