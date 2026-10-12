#!/usr/bin/env node
// The resolver is tested by running the Gen2 compiler itself. JavaScript only
// prepares fixtures and checks results; it contains no module-resolution logic.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const STDLIB = path.join(ROOT, 'library', 'raz');
const CANDIDATE = process.env.RAZC ?? path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const WORK = path.join(GEN2, 'build', 'resolver-fast');
const cppMangle = (prefix, name) => `${prefix}_${name}`;
const cppFunction = (name) => cppMangle('rz_f', name);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (options.status !== undefined && result.status !== options.status) {
    throw new Error(`${command} ${args.join(' ')}: expected exit ${options.status}, got ${result.status}\n${output}`);
  }
  return { ...result, output };
}
function write(rel, source) {
  const target = path.join(WORK, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, 'utf8');
  return target;
}
function expect(condition, message) { if (!condition) throw new Error(message); }

if (!fs.existsSync(CANDIDATE)) throw new Error(`Gen2 candidate not found: ${CANDIDATE}; run npm run build:gen2 first`);
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

// Dotted module names are resolved and expanded by Raz, transitively and once.
const moduleRoot = path.join(WORK, 'modules');
write('modules/demo/math/math.raz', 'use "cstdint";\nfunction answer() -> i64 { return 42; }\n');
write('modules/demo/wrapper/wrapper.raz', 'use demo.math;\nfunction wrapped() -> i64 { return answer(); }\n');
const main = write('app/main.raz', [
  '/*',
  'use missing.inside_comment;',
  '*/',
  'use "cstddef";',
  'use demo.wrapper;',
  'use demo.math;',
  'return wrapped();',
  '',
].join('\n'));
const output = path.join(WORK, 'module.cpp');
run(CANDIDATE, [main, '--emit-cpp', output, '-L', moduleRoot], { status: 0 });
const code = fs.readFileSync(output, 'utf8');
expect((code.match(new RegExp(`raz_i64 ${cppFunction('answer')}\\(\\) \\{`, 'g')) ?? []).length === 1, 'transitive module was not deduplicated');
expect((code.match(new RegExp(`raz_i64 ${cppFunction('wrapped')}\\(\\) \\{`, 'g')) ?? []).length === 1, 'wrapper module missing or duplicated');
expect(code.includes('#include <cstddef>'), 'native use header was not preserved');
expect(!code.includes('use demo.wrapper;') && !code.includes('use demo.math;'), 'Raz module directive leaked into C++ output');
expect(code.includes(`raz_i64 ${cppFunction('main')}() {`) && !code.includes('raz_fn_main') && !code.includes('raz_main()'), 'main must use the general readable Raz function naming rule');
const moduleExe = path.join(WORK, 'module-case');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', output, '-I', STDLIB, '-o', moduleExe], { status: 0 });
run(moduleExe, [], { status: 42 });

// Include directives remain relative to the file that declares them, including nested includes.
const includeMain = write('relative/main.raz', 'use "cstdint";\ninclude "parts/first.raz";\ninclude "parts/first.raz";\nreturn included();\n');
write('relative/parts/first.raz', 'include "nested/second.raz";\nfunction included() -> i64 { return nestedValue(); }\n');
write('relative/parts/nested/second.raz', 'function nestedValue() -> i64 { return 9; }\n');
const includeCpp = path.join(WORK, 'include.cpp');
run(CANDIDATE, [includeMain, '--emit-cpp', includeCpp], { status: 0 });
const includeText = fs.readFileSync(includeCpp, 'utf8');
expect((includeText.match(new RegExp(`${cppFunction('nestedValue')}\\(\\) \\{`, 'g')) ?? []).length === 1, 'nested include was not expanded/deduplicated');
const includeExe = path.join(WORK, 'include-case');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', includeCpp, '-I', STDLIB, '-o', includeExe], { status: 0 });
run(includeExe, [], { status: 9 });

// Directive-like text in comments/strings must remain inert, and lexical path
// aliases must resolve to one source file for de-duplication.
const lexicalIncludeMain = write('lexical-includes/main.raz', [
  'use "cstdint";',
  'use "string";',
  '// include "missing-from-comment.raz";',
  String.raw`let marker: string = "include \"missing-from-string.raz\";";`,
  'include "parts/./unit.raz";',
  'include "parts/sub/../unit.raz";',
  'return included();',
  '',
].join('\n'));
write('lexical-includes/parts/unit.raz', 'function included() -> i64 { return 13; }\n');
const lexicalIncludeCpp = path.join(WORK, 'lexical-includes.cpp');
run(CANDIDATE, [lexicalIncludeMain, '--emit-cpp', lexicalIncludeCpp], { status: 0 });
const lexicalIncludeText = fs.readFileSync(lexicalIncludeCpp, 'utf8');
expect((lexicalIncludeText.match(new RegExp(`raz_i64 ${cppFunction('included')}\\(\\) \\{`, 'g')) ?? []).length === 1,
  'lexically equivalent include paths were not normalized/deduplicated');
expect(!lexicalIncludeText.split(/\r?\n/).some((line) => line.startsWith('#include') && /missing-from-(?:comment|string)\.raz/.test(line)),
  'directive-like text in comments or strings was treated as an include');
expect(lexicalIncludeText.includes('missing-from-string.raz'),
  'string literal containing include-like text must remain part of the user program');
const lexicalIncludeExe = path.join(WORK, 'lexical-includes-case');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', lexicalIncludeCpp, '-I', STDLIB, '-o', lexicalIncludeExe], { status: 0 });
run(lexicalIncludeExe, [], { status: 13 });

// Missing modules and both module/include cycles must fail before emitting C++.
const unresolved = write('unresolved.raz', 'use no.such.module;\nreturn 0;\n');
const unresolvedResult = run(CANDIDATE, [unresolved, '--emit-cpp', path.join(WORK, 'unresolved.cpp'), '-L', moduleRoot], { status: 1 });
expect(unresolvedResult.output.includes('cannot resolve module no.such.module'), 'missing module diagnostic absent');
write('cyclic/a/a.raz', 'use cyclic.b;\nfunction a() -> i64 { return 1; }\n');
write('cyclic/b/b.raz', 'use cyclic.a;\nfunction b() -> i64 { return 2; }\n');
const moduleCycle = write('module-cycle.raz', 'use cyclic.a;\nreturn 0;\n');
const cycleResult = run(CANDIDATE, [moduleCycle, '--emit-cpp', path.join(WORK, 'cycle.cpp'), '-L', WORK], { status: 1 });
expect(cycleResult.output.includes('module dependency cycle'), 'module cycle diagnostic absent');
write('include-cycle/a.raz', 'include "b.raz";\n');
write('include-cycle/b.raz', 'include "a.raz";\n');
const includeCycle = path.join(WORK, 'include-cycle', 'a.raz');
const includeCycleResult = run(CANDIDATE, [includeCycle, '--emit-cpp', path.join(WORK, 'include-cycle.cpp')], { status: 1 });
expect(includeCycleResult.output.includes('include cycle detected') || includeCycleResult.output.includes('include dependency cycle') || includeCycleResult.output.includes('source dependency cycle'), 'include cycle diagnostic absent');

// std.io is source-backed. The output must not inject the legacy runtime header.
const hello = path.join(GEN2, 'examples', 'hello.raz');
const helloCpp = path.join(WORK, 'hello.cpp');
run(CANDIDATE, [hello, '--emit-cpp', helloCpp], { status: 0 });
const helloText = fs.readFileSync(helloCpp, 'utf8');
expect(helloText.includes('#include "std/io/io_native.hpp"'), 'std.io bridge include missing');
expect(!helloText.includes('raz_runtime.hpp'), 'user program output still depends on legacy runtime');
const helloExe = path.join(WORK, 'hello');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', helloCpp, '-I', STDLIB, '-o', helloExe], { status: 0 });
const helloResult = run(helloExe, [], { status: 0 });
expect(helloResult.output.includes('Hello from Raz Gen2!'), 'std.io executable output mismatch');


// Native argument parsing must respect commas inside string literals and still
// resolve expression temporaries to declarations in generated C++.
write('native_helpers.hpp', `#pragma once
#include <cstdint>
#include <iostream>
#include <string>
inline void test_emit(const std::string& text) { std::cout << text; }
inline void test_emit_number(std::int64_t value) { std::cout << "native value=" << value << "\\n"; }
`);
const nativeArgs = write('native-args/native-args.raz', [
  'use "native_helpers.hpp";',
  'test_emit!("native,comma\\n");',
  'let number: i64 = 4 + 5;',
  'test_emit_number!(number + 3);',
  'return 0;',
  '',
].join('\n'));
const nativeArgsCpp = path.join(WORK, 'native-args-generated.cpp');
run(CANDIDATE, [nativeArgs, '--emit-cpp', nativeArgsCpp], { status: 0 });
const nativeArgsExe = path.join(WORK, 'native-args-case');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', nativeArgsCpp, '-I', STDLIB, '-o', nativeArgsExe], { status: 0 });
const nativeArgsResult = run(nativeArgsExe, [], { status: 0 });
expect(nativeArgsResult.output.includes('native,comma\n') && nativeArgsResult.output.includes('native value=12'),
  'native call argument splitting or temporary mapping failed');

// The RHS of || must not index an empty string when the left guard is true.
const guard = write('short-circuit-guard.raz', [
  'use std.text;',
  'let empty: string = "";',
  'if (length(empty) == 0 || empty[1] == 0) return 0;',
  'return 1;',
  '',
].join('\n'));
const guardCpp = path.join(WORK, 'short-circuit-guard.cpp');
run(CANDIDATE, [guard, '--emit-cpp', guardCpp], { status: 0 });
const guardExe = path.join(WORK, 'short-circuit-guard');
run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', guardCpp, '-I', STDLIB, '-o', guardExe], { status: 0 });
run(guardExe, [], { status: 0 });
const unwritableOutput = path.join(WORK, 'directory-that-does-not-exist', 'compiler.cpp');
const writeFailure = run(CANDIDATE, [hello, '--emit-cpp', unwritableOutput], { status: 1 });
expect(writeFailure.output.includes('razc: cannot write output:'), 'failed output write was not reported');
expect(!writeFailure.output.includes('razc: wrote '), 'compiler reported success after failed output write');

console.log('[gen2-resolver-fast] module resolution, lexical include handling, std.io writes, missing modules and cycles passed');
