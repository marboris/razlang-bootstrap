#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'generations', 'gen1');
const BIN = path.join(GEN, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const EXAMPLE = path.join(GEN, 'examples', 'hello.raz');
const WORK = path.join(GEN, 'build', 'example');
const RUNTIME = path.join(ROOT, 'runtime', 'raz_runtime.hpp');

function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${command} failed (${r.status})\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  }
  return r;
}

if (!fs.existsSync(BIN)) {
  console.error(`[gen1-example] frozen Gen1 binary is missing: ${BIN}`);
  console.error('[gen1-example] complete Gen1 bootstrap/freeze first.');
  process.exit(2);
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
fs.copyFileSync(EXAMPLE, path.join(WORK, 'frontend', 'input.raz'));
fs.copyFileSync(RUNTIME, path.join(WORK, 'backend', 'raz_runtime.hpp'));

run(BIN, [], WORK);
const cpp = path.join(WORK, 'backend', 'output.cpp');
const exe = path.join(WORK, process.platform === 'win32' ? 'hello.exe' : 'hello');
run(process.env.CXX ?? 'c++', ['-std=c++17', cpp, '-I', path.join(WORK, 'backend'), '-o', exe], ROOT);
const result = run(exe, [], WORK);
const stdout = (result.stdout ?? '').trim();
if (stdout !== 'Hello, Raz Gen1!') {
  throw new Error(`[gen1-example] unexpected output: ${JSON.stringify(stdout)}`);
}
console.log('[gen1-example] hello.raz compiled by Gen1 and ran successfully');
