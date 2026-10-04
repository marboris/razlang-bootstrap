#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE0 = path.join(ROOT, 'razc-stage0.mjs');
const LANGUAGE = path.join(ROOT, 'raz.language.json');
const SOURCE = path.join(ROOT, 'tests', 'cases', 'arithmetic.raz');
const RUNTIME = path.join(ROOT, 'raz_runtime.hpp');
const BUILD = path.join(ROOT, '.build', 'targets');
const versions = ['11', '14', '17', '20', '23'];

fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
fs.copyFileSync(RUNTIME, path.join(BUILD, 'raz_runtime.hpp'));

function run(cmd, args) {
  const p = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  if (p.error) throw p.error;
  if (p.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${p.status})\n${p.stdout ?? ''}${p.stderr ?? ''}`);
  return p;
}

let passed = 0;
for (const v of versions) {
  const target = path.join(ROOT, 'targets', `cpp${v}.target.json`);
  const cpp = path.join(BUILD, `arithmetic-cpp${v}.cpp`);
  const bin = path.join(BUILD, `arithmetic-cpp${v}`);
  try {
    run(process.execPath, [STAGE0, 'compile', SOURCE, '-o', cpp, '--language', LANGUAGE, '--target', target]);
    run('c++', [`-std=c++${v}`, '-O0', cpp, '-o', bin]);
    const p = spawnSync(bin, [], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
    if (p.error) throw p.error;
    if (p.status !== 207) throw new Error(`expected exit 207, got ${p.status}`);
    console.log(`[PASS] C++${v}`);
    passed++;
  } catch (e) {
    console.error(`[FAIL] C++${v}: ${e.message}`);
  }
}
console.log(`target-profiles: ${passed}/${versions.length}`);
process.exitCode = passed === versions.length ? 0 : 1;
