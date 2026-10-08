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
compileProgram('top-level', `let g: i64 = 5;\nfunction twice(x: i64) -> i64 { return x + x; }\nreturn twice(g);\n`, 10);
compileProgram('string-global', `let message: string = \"ok\";\nfunction size() -> i64 { return length(message); }\nreturn size();\n`, 2);
compileProgram('cli', `return argCount();\n`, 2);
compileProgram('use-header', `use \"cstdint\";\nreturn 0;\n`, 0);
compileProgram('unsafe', `unsafe { let p: char* = nullptr; }\nreturn 0;\n`, 0);
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
console.log('[gen1-fast] all fast checks passed');
