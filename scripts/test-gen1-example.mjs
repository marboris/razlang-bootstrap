#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { legacyRuntimeHeader } from './legacy-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'legacy', 'gen1');
const BIN = process.env.RAZC
  ? path.resolve(ROOT, process.env.RAZC)
  : path.join(GEN, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const EXAMPLE = path.join(GEN, 'examples', 'hello.raz');
const WORK = path.join(GEN, 'build', 'example');

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
fs.writeFileSync(path.join(WORK, 'backend', 'raz_runtime.hpp'), legacyRuntimeHeader(), 'utf8');

function compileAndRun(name, source, args, expectedOutput) {
  fs.writeFileSync(path.join(WORK, 'frontend', 'input.raz'), source, 'utf8');
  run(BIN, [], WORK);
  const cpp = path.join(WORK, 'backend', 'output.cpp');
  const exe = path.join(WORK, process.platform === 'win32' ? `${name}.exe` : name);
  run(process.env.CXX ?? 'c++', ['-std=c++17', cpp, '-I', path.join(WORK, 'backend'), '-o', exe], ROOT);
  const result = run(exe, args, WORK);
  const stdout = (result.stdout ?? '').trim();
  if (stdout !== expectedOutput) {
    throw new Error(`[gen1-example] ${name}: unexpected output: ${JSON.stringify(stdout)}`);
  }
}

compileAndRun('hello', fs.readFileSync(EXAMPLE, 'utf8'), [], 'Hello, Raz Gen1!');
compileAndRun(
  'cli',
  'use "raz_runtime.hpp";\nprint(argAt(1));\nreturn 0;\n',
  ['candidate-arg'],
  'candidate-arg',
);
console.log('[gen1-example] hello and runtime/CLI smoke tests passed');
