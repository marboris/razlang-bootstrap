#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'generations', 'gen0', 'build');
const WORK = path.join(BUILD, 'native-work');
const BUNDLE = path.join(ROOT, 'generations', 'gen0', 'final', 'compiler.raz');
const FIRST_CPP = path.join(BUILD, 'candidate.cpp');
const SECOND_CPP = path.join(WORK, 'backend', 'output.cpp');
// Candidate built from the seed (never the frozen bin/razc) and its self-built successor.
const FIRST_BINARY = path.join(BUILD, process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const NEXT_BINARY = path.join(BUILD, process.platform === 'win32' ? 'gen0-selfbuild.exe' : 'gen0-selfbuild');
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

console.log('[self-host] candidate compiler -> C++');
run(FIRST_BINARY, [], WORK);
fs.copyFileSync(SECOND_CPP, FIRST_CPP);

console.log('[self-host] candidate C++ -> gen0-selfbuild');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O2', FIRST_CPP, '-o', NEXT_BINARY]);

console.log('[self-host] gen0-selfbuild -> C++');
run(NEXT_BINARY, [], WORK);
const first = fs.readFileSync(FIRST_CPP);
const second = fs.readFileSync(SECOND_CPP);
if (!first.equals(second)) {
  throw new Error(`self-host C++ mismatch: candidate=${first.length}, gen0-selfbuild=${second.length}`);
}

console.log(`self-host check OK (${first.length} C++ bytes)`);
console.log(`self-built compiler (not frozen): ${NEXT_BINARY}`);
