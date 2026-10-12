#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptGen2SourceForGen1Bootstrap, gen1BootstrapCompatHeader } from './gen2-bootstrap-adapter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'compiler', 'razc', 'build', 'driver-fast');
const GEN1 = path.join(ROOT, 'legacy', 'gen1', 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const CANDIDATE = path.join(WORK, process.platform === 'win32' ? 'razc-driver-test.exe' : 'razc-driver-test');
const REPAIRED_CPP = path.join(WORK, 'backend', 'output.bootstrap-fixed.cpp');

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
fs.writeFileSync(path.join(WORK, 'gen1_bootstrap_compat.hpp'), gen1BootstrapCompatHeader(), 'utf8');
const compilerDir = path.join(ROOT, 'compiler', 'razc', 'src');
const ast = fs.readFileSync(path.join(compilerDir, 'model', 'ast.raz'), 'utf8');
const textCore = fs.readFileSync(path.join(compilerDir, 'core', 'text.raz'), 'utf8');
const lexer = fs.readFileSync(path.join(compilerDir, 'core', 'lexer.raz'), 'utf8');
const driver = fs.readFileSync(path.join(compilerDir, 'driver', 'main.raz'), 'utf8');
const withoutUses = driver.replace(/^(?:use "(?:cstdint|cstddef|string|vector)";|use std\.(?:io|text|containers);)\s*$/gm, '');
const uses = 'use "cstdint";\nuse "cstddef";\nuse "string";\nuse "vector";\nuse "gen1_bootstrap_compat.hpp";\n';
const stubs = `
function compileSourceAt(source: string, entryPath: string) -> string { return "stub-rir"; }
function generate(rir: string) -> string { return "driver-stub-payload\n"; }
function validateCpp17Output(cpp: string) -> string { return ""; }
function pathDir(path: string) -> string { return "project"; }
function joinPath(base: string, relative: string) -> string { return base + "/" + relative; }
function resolveRazModules(source: string, entryPath: string, roots: List<string>) -> string { return source; }
function expandRazMacros(source: string, sourcePath: string) -> string { return source; }

`;
const bootstrapInput = adaptGen2SourceForGen1Bootstrap(`${uses}${ast}\n${textCore}\n${lexer}\n${stubs}\n${withoutUses}`);
fs.writeFileSync(path.join(WORK, 'frontend', 'input.raz'), bootstrapInput, 'utf8');
run(GEN1, [], { cwd: WORK, status: 0 });
run(process.execPath, [path.join(ROOT, 'scripts', 'repair-gen2-bootstrap-cpp.mjs'), path.join(WORK, 'backend', 'output.cpp'), REPAIRED_CPP], { status: 0 });
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', REPAIRED_CPP, '-I', WORK, '-o', CANDIDATE], { status: 0 });

const version = run(CANDIDATE, ['--version'], { status: 0 });
if (!version.output.includes('razc Gen2 preview 0.4.0-g2-016')) throw new Error('--version output mismatch');
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
