#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'generations', 'gen1', 'build', 'fast-check');
const BIN = path.join(BUILD, 'bin');
const FRONTEND = path.join(ROOT, 'generations', 'gen1', 'src', 'frontend', 'compiler.raz');
const BACKEND = path.join(ROOT, 'generations', 'gen1', 'src', 'backend', 'cpp_backend.raz');
const VERIFY = path.join(ROOT, 'generations', 'gen1', 'src', 'ir', 'rir_verify.raz');
const SEED = path.join(ROOT, 'generations', 'gen0', 'seed', 'seed.mjs');
const LANGUAGE = path.join(ROOT, 'config', 'language.json');
const TARGET = path.join(ROOT, 'config', 'targets', 'cpp17.json');
const RUNTIME = path.join(ROOT, 'runtime', 'raz_runtime.hpp');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  return result;
}

function ensureBuilt() {
  fs.mkdirSync(path.join(BUILD, 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(BUILD, 'backend'), { recursive: true });
  fs.mkdirSync(path.join(BUILD, 'ir'), { recursive: true });
  fs.mkdirSync(BIN, { recursive: true });
  fs.copyFileSync(RUNTIME, path.join(BUILD, 'raz_runtime.hpp'));
  const missing = ['frontendc', 'backendc', 'rirverify'].filter((name) => !fs.existsSync(path.join(BIN, name)));
  if (missing.length) {
    throw new Error(`Gen1 fast-check binaries missing: ${missing.join(', ')}. Run: npm run build:gen1:fast`);
  }
}

function compileProgram(name, source, expectedExit, expectedError = null) {
  const work = path.join(BUILD, `case-${name}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(work, 'backend'), { recursive: true });
  fs.mkdirSync(path.join(work, 'ir'), { recursive: true });
  fs.writeFileSync(path.join(work, 'frontend', 'input.raz'), source, 'utf8');
  const f = run(path.join(BIN, 'frontendc'), [], { cwd: work, capture: true });
  if (expectedError) {
    const diagnostics = `${f.stdout ?? ''}\n${f.stderr ?? ''}`;
    if (f.status === 0 || !diagnostics.includes(expectedError)) {
      console.error(f.stdout ?? '');
      console.error(f.stderr ?? '');
      throw new Error(`${name}: expected frontend error containing ${expectedError}`);
    }
    return;
  }
  if (f.status !== 0) {
    console.error(f.stdout ?? '');
    console.error(f.stderr ?? '');
    throw new Error(`${name}: frontend failed`);
  }
  fs.copyFileSync(path.join(work, 'frontend', 'output.rir'), path.join(work, 'ir', 'input.rir'));
  fs.copyFileSync(path.join(work, 'frontend', 'output.rir'), path.join(work, 'backend', 'input.rir'));
  const v = run(path.join(BIN, 'rirverify'), [], { cwd: work, capture: true });
  if (v.status !== 0) throw new Error(`${name}: RIR verifier failed: ${v.stdout}\n${v.stderr}`);
  const b = run(path.join(BIN, 'backendc'), [], { cwd: work, capture: true });
  if (b.status !== 0) {
    console.error(b.stdout ?? '');
    console.error(b.stderr ?? '');
    throw new Error(`${name}: backend failed`);
  }
  const exe = path.join(work, 'program');
  const c = run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', path.join(work, 'backend', 'output.cpp'), '-I', BUILD, '-o', exe], { capture: true });
  if (c.status !== 0) throw new Error(`${name}: C++ build failed: ${c.stdout}\n${c.stderr}`);
  const p = run(exe, ['sample-arg'], { cwd: work, capture: true });
  if (p.status !== expectedExit) throw new Error(`${name}: expected exit ${expectedExit}, got ${p.status}`);
}

function testIncludes() {
  const work = path.join(BUILD, 'case-includes');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(work, 'backend'), { recursive: true });
  fs.mkdirSync(path.join(work, 'ir'), { recursive: true });
  fs.writeFileSync(path.join(work, 'frontend', 'part.raz'), `let x: i64 = 7;\n`, 'utf8');
  fs.writeFileSync(path.join(work, 'frontend', 'input.raz'), `include "part.raz";\ninclude "part.raz";\nreturn x + 2;\n`, 'utf8');
  const f = run(path.join(BIN, 'frontendc'), [], { cwd: work, capture: true });
  if (f.status !== 0) throw new Error(`includes: frontend failed: ${f.stdout}\n${f.stderr}`);
  const rir = fs.readFileSync(path.join(work, 'frontend', 'output.rir'), 'utf8');
  if ((rir.match(/global i64 x/g) ?? []).length !== 1) throw new Error('includes: duplicate include was not ignored');
}

function testIncludeDeclarationInBlock() {
  const work = path.join(BUILD, 'case-include-declaration');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(work, 'frontend', 'decl.raz'), `function helper() -> i64 { return 1; }\n`, 'utf8');
  fs.writeFileSync(path.join(work, 'frontend', 'input.raz'), `if (true) { include "decl.raz"; }\nreturn 0;\n`, 'utf8');
  const f = run(path.join(BIN, 'frontendc'), [], { cwd: work, capture: true });
  const diagnostics = `${f.stdout ?? ''}\n${f.stderr ?? ''}`;
  if (f.status === 0 || !diagnostics.includes('parse-error: declaration is only allowed at file scope')) {
    throw new Error('include-declaration: expected file-scope declaration diagnostic');
  }
}

function testGen1ExampleSource() {
  const example = fs.readFileSync(path.join(ROOT, 'generations', 'gen1', 'examples', 'hello.raz'), 'utf8');
  if (!example.includes('print(\"Hello, Raz Gen1!\");') || !example.includes('return 0;')) {
    throw new Error('gen1-example: hello source does not contain the documented program');
  }
  compileProgram('example-hello', example, 0);
}

function testGlobalNameCollision() {
  const work = path.join(BUILD, 'case-global-collision');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(work, 'frontend', 'input.raz'), `let same: i64 = 1;\nfunction same() -> i64 { return 1; }\nreturn 0;\n`, 'utf8');
  const f = run(path.join(BIN, 'frontendc'), [], { cwd: work, capture: true });
  const diagnostics = `${f.stdout ?? ''}\n${f.stderr ?? ''}`;
  if (f.status === 0 || !diagnostics.includes('global conflicts with function: same')) {
    throw new Error('global-collision: expected global/function collision diagnostic');
  }
}


function testRirVerifierFixtures() {
  const work = path.join(BUILD, 'case-rir-verifier');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'ir'), { recursive: true });
  const fixtures = [
    ['valid.rir', true, 'RIR-1 OK'],
    ['references.rir', true, 'RIR-1 OK'],
    ['duplicate-label.rir', false, 'duplicate label'],
    ['undefined-value.rir', false, 'undefined value'],
    ['bad-target.rir', false, 'control-flow target'],
  ];

  for (const [filename, shouldPass, expectedReport] of fixtures) {
    const source = path.join(ROOT, 'tests', 'cases', 'rir', filename);
    const input = path.join(work, 'ir', 'input.rir');
    const reportPath = path.join(work, 'ir', 'verification.txt');
    fs.writeFileSync(input, fs.readFileSync(source, 'utf8'), 'utf8');
    fs.rmSync(reportPath, { force: true });
    const result = run(path.join(BIN, 'rirverify'), [], { cwd: work, capture: true });
    const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
    const passed = shouldPass
      ? result.status === 0 && report.includes(expectedReport)
      : result.status !== 0 && report.includes(expectedReport);
    if (!passed) {
      throw new Error(
        `RIR verifier fixture ${filename} failed: status=${result.status}, report=${JSON.stringify(report)}, stderr=${JSON.stringify(result.stderr ?? '')}`,
      );
    }
  }
}

function testFreezeMetadataLifecycle() {
  const tempRoot = fs.mkdtempSync(path.join(BUILD, 'freeze-test-'));
  try {
    const scriptDir = path.join(tempRoot, 'scripts');
    const gen = path.join(tempRoot, 'generations', 'gen77');
    const bin = path.join(gen, 'bin');
    const build = path.join(gen, 'build');
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(build, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'freeze.sh'), path.join(scriptDir, 'freeze.sh'));
    fs.writeFileSync(path.join(gen, 'gen.json'), JSON.stringify({
      generation: 77,
      status: 'source-complete-bootstrap-pending',
      milestone: 'pending',
    }, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(build, 'razc-candidate'), 'candidate-binary-v1\n', 'utf8');
    fs.writeFileSync(path.join(bin, 'razc'), 'provisional-binary\n', 'utf8');

    const freeze = spawnSync('sh', [path.join(scriptDir, 'freeze.sh'), '77', '--replace-pending'], {
      cwd: tempRoot,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (freeze.status !== 0) {
      throw new Error(`freeze did not complete: ${freeze.stdout ?? ''}\n${freeze.stderr ?? ''}`);
    }
    const metadata = JSON.parse(fs.readFileSync(path.join(gen, 'gen.json'), 'utf8'));
    if (metadata.status !== 'frozen') {
      throw new Error(`freeze did not update metadata status: ${metadata.status}`);
    }
    const candidateBytes = fs.readFileSync(path.join(build, 'razc-candidate'));
    const frozenBytes = fs.readFileSync(path.join(bin, 'razc'));
    if (!candidateBytes.equals(frozenBytes)) {
      throw new Error('freeze did not install the exact candidate binary');
    }
    const checksum = spawnSync('sha256sum', ['-c', 'razc.sha256'], {
      cwd: bin,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (checksum.status !== 0) throw new Error(`frozen checksum is invalid: ${checksum.stdout ?? ''} ${checksum.stderr ?? ''}`);

    const secondFreeze = spawnSync('sh', [path.join(scriptDir, 'freeze.sh'), '77', '--replace-pending'], {
      cwd: tempRoot,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (secondFreeze.status === 0 || !(secondFreeze.stderr ?? '').includes('not marked pending')) {
      throw new Error('freeze allowed replacing a generation after it was marked frozen');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testCycle() {
  const work = path.join(BUILD, 'case-cycle');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(work, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(work, 'frontend', 'a.raz'), `include "b.raz";\n`, 'utf8');
  fs.writeFileSync(path.join(work, 'frontend', 'b.raz'), `include "a.raz";\n`, 'utf8');
  fs.writeFileSync(path.join(work, 'frontend', 'input.raz'), `include "a.raz";\nreturn 0;\n`, 'utf8');
  const f = run(path.join(BIN, 'frontendc'), [], { cwd: work, capture: true });
  if (f.status === 0 || !(f.stdout ?? '').includes('include-error: include cycle detected')) {
    throw new Error('cycle: expected include cycle diagnostic');
  }
}

ensureBuilt();
compileProgram('top-level', `use "cstdint";\nlet g: i64 = 5;\nfunction twice(x: i64) -> i64 { return x + x; }\nreturn twice(g);\n`, 10);
compileProgram('string-global', `use "raz_runtime.hpp";\nlet message: string = "ok";\nfunction size() -> i64 { return length(message); }\nreturn size();\n`, 2);
compileProgram('cli', `use "raz_runtime.hpp";\nreturn argCount();\n`, 2);
compileProgram('use-header', `use \"cstdint\";\nreturn 0;\n`, 0);
const explicitHeaderIncludes = fs.readFileSync(path.join(BUILD, 'case-use-header', 'backend', 'output.cpp'), 'utf8').split(/\r?\n/).filter((line) => line.startsWith('#include'));
if (explicitHeaderIncludes.length !== 1 || explicitHeaderIncludes[0] !== '#include "cstdint"') {
  throw new Error('use-header: backend emitted an undeclared include or unnecessary CLI setup');
}
compileProgram('use-angle-header', `use cstdint;\nreturn 0;\n`, 0);
const angleHeaderIncludes = fs.readFileSync(path.join(BUILD, 'case-use-angle-header', 'backend', 'output.cpp'), 'utf8').split(/\r?\n/).filter((line) => line.startsWith('#include'));
if (angleHeaderIncludes.length !== 1 || angleHeaderIncludes[0] !== '#include <cstdint>') {
  throw new Error('use-angle-header: backend did not preserve the bare include');
}
const cliCpp = fs.readFileSync(path.join(BUILD, 'case-cli', 'backend', 'output.cpp'), 'utf8');
if (!cliCpp.includes('raz::set_cli(argc, argv);')) throw new Error('cli: backend omitted CLI initialization');
compileProgram('unsafe', `use "cstdint";\nunsafe { let p: char* = nullptr; }\nreturn 0;\n`, 0);
const unsafeRir = fs.readFileSync(path.join(BUILD, 'case-unsafe', 'frontend', 'output.rir'), 'utf8');
if (!unsafeRir.includes('local char* p') || !unsafeRir.includes('const char* nullptr')) {
  throw new Error('unsafe: nullptr/unsafe body was not lowered into RIR');
}
compileProgram('unsafe-negative', `let p: char* = nullptr;\nreturn 0;\n`, 0, 'nullptr requires unsafe');
compileProgram('main-negative', `function main() -> i64 { return 0; }\nreturn 0;\n`, 0, 'user-defined main is not allowed');
testGen1ExampleSource();
testIncludes();
testIncludeDeclarationInBlock();
testGlobalNameCollision();
testCycle();
testRirVerifierFixtures();
testFreezeMetadataLifecycle();
console.log('[gen1-fast] all fast checks passed');
