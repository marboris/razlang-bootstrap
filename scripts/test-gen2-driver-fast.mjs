#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'generations', 'gen2', 'build', 'driver-fast');
const GEN1 = path.join(ROOT, 'generations', 'gen1', 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const RUNTIME = path.join(ROOT, 'runtime', 'raz_runtime.hpp');
const CANDIDATE = path.join(WORK, process.platform === 'win32' ? 'razc-driver-test.exe' : 'razc-driver-test');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (options.status !== undefined && result.status !== options.status) {
    throw new Error(`${command} ${args.join(' ')}: expected exit ${options.status}, got ${result.status}\n${output}`);
  }
  return { ...result, output };
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'backend'), { recursive: true });
fs.copyFileSync(RUNTIME, path.join(WORK, 'raz_runtime.hpp'));
const driver = fs.readFileSync(path.join(ROOT, 'generations', 'gen2', 'src', 'driver', 'main.raz'), 'utf8');
const withoutUses = driver.replace(/^(?:use (?:cstdint|cstddef|string|vector);|use "raz_runtime\.hpp";)\s*$/gm, '');
const uses = 'use cstdint;\nuse cstddef;\nuse string;\nuse vector;\nuse "raz_runtime.hpp";\n';
const stubs = `
function compileSourceAt(source: string, entryPath: string) -> string { return "stub-rir"; }
function generate(rir: string) -> string { return "driver-stub-payload\n"; }
`;
fs.writeFileSync(path.join(WORK, 'frontend', 'input.raz'), `${uses}${stubs}\n${withoutUses}`, 'utf8');
run(GEN1, [], { cwd: WORK, status: 0 });
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', path.join(WORK, 'backend', 'output.cpp'), '-I', WORK, '-o', CANDIDATE], { status: 0 });

const version = run(CANDIDATE, ['--version'], { status: 0 });
if (!version.output.includes('razc Gen2 preview 0.1.0')) throw new Error('--version output mismatch');
run(CANDIDATE, ['--help'], { status: 0 });
const noArgs = run(CANDIDATE, [], { status: 2 });
if (!noArgs.output.includes('Usage: razc')) throw new Error('usage output missing for empty args');
const input = path.join(WORK, 'input.raz');
fs.writeFileSync(input, 'driver-stub-payload\n', 'utf8');
const output = path.join(WORK, 'result.cpp');
run(CANDIDATE, [input, '--emit-cpp', output], { status: 0 });
if (fs.readFileSync(output, 'utf8') !== 'driver-stub-payload\n') throw new Error('driver did not use supplied input/output paths');
const unknown = run(CANDIDATE, [input, '--unknown-option'], { status: 2 });
if (!unknown.output.includes('unknown argument')) throw new Error('unknown-option diagnostic missing');
const noOutput = run(CANDIDATE, [input, '-o'], { status: 2 });
if (!noOutput.output.includes('missing path')) throw new Error('missing output path diagnostic missing');
console.log('[gen2-driver-fast] CLI arguments, version/help, paths, and diagnostics passed');
