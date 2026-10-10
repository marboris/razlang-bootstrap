#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN2 = path.join(ROOT, 'generations', 'gen2');
const WORK = path.join(GEN2, 'build', 'fast-check');
const CANDIDATE = process.env.RAZC ?? path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const RUNTIME = path.join(ROOT, 'runtime');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (options.status !== undefined && result.status !== options.status) {
    throw new Error(`${command} ${args.join(' ')}: expected exit ${options.status}, got ${result.status}\n${output}`);
  }
  return { ...result, output };
}

function writeSource(relPath, text) {
  const file = path.join(WORK, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function compileGenerated(cpp, exe, includeRuntime = false) {
  const args = ['-std=c++17', '-O0', cpp];
  if (includeRuntime) args.push('-I', RUNTIME);
  args.push('-o', exe);
  const result = run(process.env.CXX ?? 'c++', args, { status: 0 });
  return result;
}

if (!fs.existsSync(CANDIDATE)) {
  throw new Error(`Gen2 candidate not found: ${CANDIDATE}. Run npm run build:gen2 first.`);
}
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const version = run(CANDIDATE, ['--version'], { status: 0 });
if (!version.output.includes('razc Gen2 preview 0.1.0')) throw new Error('CLI --version output mismatch');
run(CANDIDATE, ['--help'], { status: 0 });
run(CANDIDATE, [], { status: 2 });

const simple = writeSource('simple.raz', 'use cstdint;\nreturn 7;\n');
const simpleCpp = path.join(WORK, 'simple.cpp');
run(CANDIDATE, [simple, '--emit-cpp', simpleCpp], { status: 0 });
const simpleText = fs.readFileSync(simpleCpp, 'utf8');
const includes = simpleText.split(/\r?\n/).filter((line) => line.startsWith('#include'));
if (includes.length !== 1 || includes[0] !== '#include <cstdint>') {
  throw new Error(`explicit use test failed; unexpected includes: ${includes.join(', ')}`);
}
const simpleExe = path.join(WORK, 'simple');
compileGenerated(simpleCpp, simpleExe);
run(simpleExe, [], { status: 7 });

const hello = path.join(ROOT, 'generations', 'gen2', 'examples', 'hello.raz');
const helloCpp = path.join(WORK, 'hello.cpp');
const emittedHello = run(CANDIDATE, [hello, '-o', helloCpp], { status: 0 });
if (!emittedHello.output.includes('razc: wrote')) throw new Error('CLI did not report output path');
const helloExe = path.join(WORK, 'hello');
compileGenerated(helloCpp, helloExe, true);
const helloRun = run(helloExe, [], { status: 0 });
if (!(helloRun.stdout ?? '').includes('Hello from Raz Gen2!')) throw new Error('hello output mismatch');

const main = writeSource('include-case/main.raz', 'use cstdint;\ninclude "part.raz";\nreturn answer();\n');
writeSource('include-case/part.raz', 'function answer() -> i64 { return 42; }\n');
const includeCpp = path.join(WORK, 'include-case.cpp');
run(CANDIDATE, [main, '--emit-cpp', includeCpp], { status: 0 });
const includeExe = path.join(WORK, 'include-case-bin');
compileGenerated(includeCpp, includeExe);
run(includeExe, [], { status: 42 });

const unknown = run(CANDIDATE, [simple, '--unknown-option'], { status: 2 });
if (!unknown.output.includes('unknown argument')) throw new Error('unknown option diagnostic missing');
const missingOut = run(CANDIDATE, [simple, '--emit-cpp'], { status: 2 });
if (!missingOut.output.includes('missing path')) throw new Error('missing output path diagnostic missing');

console.log('[gen2-fast] CLI, explicit headers, C++ output, hello, relative includes, and diagnostics passed');
