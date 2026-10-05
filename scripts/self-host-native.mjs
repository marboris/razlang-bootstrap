#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, '.build', 'native');
const WORK = path.join(BUILD, 'work');
const BUNDLE = path.join(BUILD, 'compiler.raz');
const FIRST_CPP = path.join(BUILD, 'compiler-generation-0.cpp');
const SECOND_CPP = path.join(WORK, 'backend', 'output.cpp');
const FIRST_BINARY = path.join(BUILD, process.platform === 'win32' ? 'razc.exe' : 'razc');
const NEXT_BINARY = path.join(BUILD, process.platform === 'win32' ? 'razc-generation-1.exe' : 'razc-generation-1');
const INPUT = path.join(WORK, 'frontend', 'input.raz');

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}

console.log('[self-host] build seed-generated native compiler');
run(process.execPath, [path.join(ROOT, 'scripts', 'build-native.mjs')]);
fs.copyFileSync(BUNDLE, INPUT);

console.log('[self-host] native compiler -> C++ generation 0');
run(FIRST_BINARY, [], WORK);
fs.copyFileSync(SECOND_CPP, FIRST_CPP);

console.log('[self-host] compile generation 0 -> generation 1');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O2', FIRST_CPP, '-o', NEXT_BINARY]);

console.log('[self-host] generation 1 -> C++ generation 1');
run(NEXT_BINARY, [], WORK);
const first = fs.readFileSync(FIRST_CPP);
const second = fs.readFileSync(SECOND_CPP);
if (!first.equals(second)) {
  throw new Error(`self-host C++ mismatch: generation 0=${first.length}, generation 1=${second.length}`);
}

console.log(`self-host bootstrap OK (${first.length} C++ bytes)`);
console.log(`next compiler: ${NEXT_BINARY}`);
