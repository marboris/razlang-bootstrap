#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const WORK = path.join(GEN2, 'build', 'fast-check');
const CANDIDATE = process.env.RAZC ?? path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');
const STD_ROOT = path.join(ROOT, 'library', 'raz');
const RAZ_DRIVER = path.join(ROOT, 'scripts', 'raz.mjs');
const cppMangle = (prefix, name) => `${prefix}_${name}`;
const cppVariable = (name) => {
  const local = /^raz\$local\$(\d+)\$(.+)$/.exec(name);
  return local ? `rz_v_${local[1]}_${local[2]}` : cppMangle('rz_v', name);
};
const cppFunction = (name) => cppMangle('rz_f', name);
const cppType = (name) => cppMangle('rz_t', name);
const cppField = (name) => cppMangle('rz_m', name);

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

function compileGenerated(cpp, exe, includePaths = []) {
  const args = ['-std=c++17', '-O0', cpp, '-I', STD_ROOT];
  for (const includePath of includePaths) args.push('-I', includePath);
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
if (!version.output.includes('razc Gen2 preview 0.4.0-g2-016')) throw new Error('CLI --version output mismatch');
run(CANDIDATE, ['--help'], { status: 0 });
run(CANDIDATE, [], { status: 2 });

const simple = writeSource('simple.raz', 'return 7;\n');
const simpleCpp = path.join(WORK, 'simple.cpp');
run(CANDIDATE, [simple, '--emit-cpp', simpleCpp], { status: 0 });
const simpleText = fs.readFileSync(simpleCpp, 'utf8');
const includes = simpleText.split(/\r?\n/).filter((line) => line.startsWith('#include'));
if (includes.length !== 0) {
  throw new Error(`a Raz program without imports must not receive implicit C++ headers; emitted includes: ${includes.join(', ')}`);
}
const simpleExe = path.join(WORK, 'simple');
compileGenerated(simpleCpp, simpleExe);
run(simpleExe, [], { status: 7 });

// A missing type annotation is preserved through RIR and represented by C++
// auto-based storage. Runtime initializer evaluation still occurs at the store
// site for locals/mutable globals; const globals use their initializer function.
const typeElision = writeSource('type-elision.raz', [
  'use "string";',
  'let globalMessage = "Raz";',
  'const constantMessage = "Const";',
  'function inferredBindingsRun() -> i64 {',
  '  let localMessage = "hello";',
  '  let answer = 40 + 2;',
  '  if (localMessage == "hello" && answer == 42) return 0;',
  '  return 1;',
  '}',
  'if (globalMessage == "Raz" && constantMessage == "Const") return inferredBindingsRun();',
  'return 2;',
  '',
].join('\n'));
const typeElisionCpp = path.join(WORK, 'type-elision.cpp');
run(CANDIDATE, [typeElision, '--emit-cpp', typeElisionCpp], { status: 0 });
const typeElisionText = fs.readFileSync(typeElisionCpp, 'utf8');
const globalInitName = cppFunction('raz_global_init_globalMessage');
const constInitName = cppFunction('raz_global_init_constantMessage');
if (!typeElisionText.includes(`auto ${cppVariable('globalMessage')} = decltype(${globalInitName}()){};`)) {
  throw new Error('untyped mutable global must use auto-based C++ storage with unevaluated initializer type');
}
if (!typeElisionText.includes(`const auto ${cppVariable('constantMessage')} = ${constInitName}();`)) {
  throw new Error('untyped const global must use C++ const auto');
}
const localName = cppVariable('raz$local$0$localMessage');
if (!new RegExp(String.raw`auto ${localName} = decltype\(tt\d+\)\{\};`).test(typeElisionText)) {
  throw new Error('untyped local must use auto-based storage without moving initializer side effects');
}
const typeElisionExe = path.join(WORK, 'type-elision');
compileGenerated(typeElisionCpp, typeElisionExe);
run(typeElisionExe, [], { status: 0 });

// C++ keywords and the host entry name are valid Raz names because every Raz
// symbol is mangled by category before it reaches C++.
const names = writeSource('cpp-name-mangling.raz', [
  'struct class { switch: i64; }',
  'function template(class: i64) -> i64 { let auto: i64 = class + 1; return auto; }',
  'let main: i64 = 41;',
  'let object: class = new class();',
  'object.switch = template(main);',
  'return object.switch - 42;',
  '',
].join('\n'));
const namesCpp = path.join(WORK, 'cpp-name-mangling.cpp');
run(CANDIDATE, [names, '--emit-cpp', namesCpp], { status: 0 });
const namesText = fs.readFileSync(namesCpp, 'utf8');
for (const required of [cppType('class'), cppField('switch'), cppFunction('template'), cppVariable('main'), cppFunction('main')]) {
  if (!namesText.includes(required)) throw new Error(`C++ mangling omitted ${required}`);
}
if (namesText.includes('struct class') || namesText.includes('raz_main()') || namesText.includes('raz_fn_main')) throw new Error('source spelling or main special-case leaked through mangling');
if (/\b(?:class|template|switch|auto)\b/.test(namesText.replace(/\"[^\"]*\"/g, ''))) throw new Error('Raz identifiers leaked into generated C++ tokens');
const namesExe = path.join(WORK, 'cpp-name-mangling');
compileGenerated(namesCpp, namesExe);
run(namesExe, [], { status: 0 });

// Same-spelled locals in sibling branches are normalized to distinct compiler
// symbols because RIR control-flow is flattened before C++ emission.
const duplicateSiblingLocal = writeSource('duplicate-sibling-local.raz', [
  'function choose(flag: bool) -> i64 {',
  '  if (flag) { let value: i64 = 1; } else { let value: i64 = 2; }',
  '  return 0;',
  '}',
  'return choose(true);',
  '',
].join('\n'));
const duplicateSiblingCpp = path.join(WORK, 'duplicate-sibling-local.cpp');
run(CANDIDATE, [duplicateSiblingLocal, '--emit-cpp', duplicateSiblingCpp], { status: 0 });
const duplicateSiblingText = fs.readFileSync(duplicateSiblingCpp, 'utf8');
for (const localSymbol of [cppVariable('raz$local$0$value'), cppVariable('raz$local$1$value')]) {
  if (!duplicateSiblingText.includes(localSymbol)) throw new Error(`sibling local was not normalized to unique C++ symbol ${localSymbol}`);
}
const duplicateSiblingExe = path.join(WORK, 'duplicate-sibling-local');
compileGenerated(duplicateSiblingCpp, duplicateSiblingExe);
run(duplicateSiblingExe, [], { status: 0 });

// Bare native names are ambiguous and must be rejected; C++ headers are quoted.
const bareNativeUse = writeSource('bare-native-use.raz', 'use cstdint;\nreturn 0;\n');
const bareNativeResult = run(CANDIDATE, [bareNativeUse, '--emit-cpp', path.join(WORK, 'bare-native-use.cpp')], { status: 1 });
if (!bareNativeResult.output.includes('native C++ headers must be quoted in use directives')) {
  throw new Error('bare native use should be rejected with a quote-contract diagnostic');
}

const hello = path.join(ROOT, 'compiler', 'razc', 'examples', 'hello.raz');
const helloCpp = path.join(WORK, 'hello.cpp');
const emittedHello = run(process.execPath, [RAZ_DRIVER, 'emit-cpp', hello, '-o', helloCpp], { status: 0 });
if (!emittedHello.output.includes('razc: wrote')) throw new Error('CLI did not report output path');
const helloExe = path.join(WORK, 'hello');
compileGenerated(helloCpp, helloExe);
const helloRun = run(helloExe, [], { status: 0 });
if (!(helloRun.stdout ?? '').includes('Hello from Raz Gen2!')) throw new Error('hello output mismatch');

const main = writeSource('include-case/main.raz', 'use \"cstdint\";\ninclude \"part.raz\";\nreturn answer();\n');
writeSource('include-case/part.raz', 'function answer() -> i64 { return 42; }\n');
const includeCpp = path.join(WORK, 'include-case.cpp');
run(process.execPath, [RAZ_DRIVER, 'emit-cpp', main, '-o', includeCpp], { status: 0 });
const includeExe = path.join(WORK, 'include-case-bin');
compileGenerated(includeCpp, includeExe);
run(includeExe, [], { status: 42 });


// Native calls use ! and require no extern declaration. The native C++ compiler
// resolves symbol names and signatures against the explicitly included header.
const nativeHeader = writeSource('native/native_api.hpp', [
  '#pragma once',
  '#include <cstdint>',
  'inline std::int64_t native_add(std::int64_t a, std::int64_t b) { return a + b; }',
  'inline bool native_true() { return true; }',
  'inline void native_increment(std::int64_t& value) { ++value; }',
  '',
].join('\n'));
const nativeSource = writeSource('native-call.raz', [
  'use "cstdint";',
  'use "native/native_api.hpp";',
  'function nativeResult() -> i64 { return native_add!(20, 22); }',
  'let n: i64 = 41;',
  'native_increment!(n);',
  'if (native_true!()) return n + nativeResult() - 84;',
  'return 1;',
  '',
].join('\n'));
const nativeCpp = path.join(WORK, 'native-call.cpp');
run(CANDIDATE, [nativeSource, '--emit-cpp', nativeCpp], { status: 0 });
const nativeText = fs.readFileSync(nativeCpp, 'utf8');
if (nativeText.includes('extern function') || !nativeText.includes('native_add(')) throw new Error('native-call syntax was not emitted directly');
const nativeExe = path.join(WORK, 'native-call-bin');
compileGenerated(nativeCpp, nativeExe, [WORK]);
run(nativeExe, [], { status: 0 });
const missingNative = writeSource('native-missing.raz', 'use "cstdint";\nreturn missing_native_symbol!();\n');
const missingNativeCpp = path.join(WORK, 'native-missing.cpp');
run(CANDIDATE, [missingNative, '--emit-cpp', missingNativeCpp], { status: 0 });
const missingNativeBuild = run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', missingNativeCpp, '-I', STD_ROOT, '-o', path.join(WORK, 'native-missing-bin')], { status: 1 });
if (!missingNativeBuild.output.includes('missing_native_symbol')) throw new Error('missing native symbol should fail in C++ compilation');

// Raz module resolution: dotted names, nested dependencies, and deduplication.
const moduleRoot = path.join(WORK, 'modules');
writeSource('modules/demo/math/math.raz', 'use \"cstdint\";\nfunction answer() -> i64 { return 42; }\n');
writeSource('modules/demo/wrapper/wrapper.raz', 'use demo.math;\nfunction wrapped() -> i64 { return answer(); }\n');
const moduleMain = writeSource('module-case.raz', 'use demo.wrapper;\nuse demo.math;\nreturn wrapped();\n');
const moduleCpp = path.join(WORK, 'module-case.cpp');
run(process.execPath, [RAZ_DRIVER, 'emit-cpp', moduleMain, '-L', moduleRoot, '-o', moduleCpp], { status: 0 });
const moduleText = fs.readFileSync(moduleCpp, 'utf8');
if ((moduleText.match(new RegExp(`raz_i64 ${cppFunction('answer')}\\(\\) \\{`, 'g')) ?? []).length !== 1) throw new Error('module was duplicated or not resolved once');
const moduleExe = path.join(WORK, 'module-case-bin');
compileGenerated(moduleCpp, moduleExe);
run(moduleExe, [], { status: 42 });

// std.io must be resolved from Raz source and must not depend on raz_runtime.hpp.
const helloText = fs.readFileSync(helloCpp, 'utf8');
if (helloText.includes('raz_runtime.hpp') || !helloText.includes('std/io/io_native.hpp')) throw new Error('std.io output still depends on raz_runtime.hpp or omitted its module bridge');

// Process arguments are provided by a generic target ABI, not a std.io-specific backend hook.
const processCase = writeSource('process-context.raz', [
  'use std.io;',
  'function raz_module_init_process_test() { print("module-init-ran"); }',
  'if (argCount() < 2) return 1;',
  'if (argAt(1) != "probe") return 2;',
  'return 0;',
  '',
].join('\n'));
const processCpp = path.join(WORK, 'process-context.cpp');
run(CANDIDATE, [processCase, '--emit-cpp', processCpp], { status: 0 });
const processText = fs.readFileSync(processCpp, 'utf8');
if (processText.includes('std_io_set_cli') || !processText.includes('raz_internal_process::argc = argc;')) {
  throw new Error('backend still uses std.io-specific process startup');
}
if (!processText.includes(`${cppFunction('raz_module_init_process_test')}();`)) throw new Error('generic module initializer was not called by the generated entry point');
const processExe = path.join(WORK, 'process-context');
compileGenerated(processCpp, processExe);
const processRun = run(processExe, ['probe'], { status: 0 });
if (!(processRun.stdout ?? '').includes('module-init-ran')) throw new Error('module initialization hook did not run');

const unresolved = writeSource('unresolved.raz', 'use missing.module;\nreturn 0;\n');
const unresolvedResult = run(process.execPath, [RAZ_DRIVER, 'emit-cpp', unresolved, '-o', path.join(WORK, 'unresolved.cpp')], { status: 1 });
if (!unresolvedResult.output.includes('cannot resolve module missing.module')) throw new Error('missing-module diagnostic not emitted');

const cyclicRoot = path.join(WORK, 'cyclic-modules');
writeSource('cyclic-modules/cycle/a/a.raz', 'use cycle.b;\nfunction cycleA() -> i64 { return 1; }\n');
writeSource('cyclic-modules/cycle/b/b.raz', 'use cycle.a;\nfunction cycleB() -> i64 { return 2; }\n');
const cyclic = writeSource('cyclic.raz', 'use cycle.a;\nreturn 0;\n');
const cycleResult = run(process.execPath, [RAZ_DRIVER, 'emit-cpp', cyclic, '-L', cyclicRoot, '-o', path.join(WORK, 'cyclic.cpp')], { status: 1 });
if (!cycleResult.output.includes('module dependency cycle')) throw new Error('module-cycle diagnostic not emitted');

// std.text is a normal Raz module and owns the text helpers formerly mapped to raz::.
const textCase = writeSource('text-case.raz', [
  'use "cstdint";',
  'use std.text;',
  'let word: string = "Raz";',
  'if (length(word) == 3 && slice(word, 0, 3) == "Raz" && int_to_string(42) == "42") return 0;',
  'return 1;',
  '',
].join('\n'));
const textCpp = path.join(WORK, 'text-case.cpp');
run(process.execPath, [RAZ_DRIVER, 'emit-cpp', textCase, '-o', textCpp], { status: 0 });
const textOutput = fs.readFileSync(textCpp, 'utf8');
if (!textOutput.includes('std/text/text_native.hpp') || /raz::string_length|raz::string_slice|raz::int_to_string/.test(textOutput)) throw new Error('std.text helpers were not resolved as a source library');
const textExe = path.join(WORK, 'text-case-bin');
compileGenerated(textCpp, textExe);
run(textExe, [], { status: 0 });

// Process environment and platform information are ordinary std.env APIs.
const envCase = writeSource('env-case.raz', [
  'use "string";',
  'use std.env;',
  'if (!hasEnv("PATH")) return 1;',
  'if (getEnv("PATH") == "") return 2;',
  'if (osName() == "" || architecture() == "") return 3;',
  'if (RAZ_OS_NAME == "" || RAZ_ARCHITECTURE == "") return 4;',
  'return 0;',
  '',
].join('\n'));
const envCpp = path.join(WORK, 'env-case.cpp');
run(process.execPath, [RAZ_DRIVER, 'emit-cpp', envCase, '-o', envCpp], { status: 0 });
const envOutput = fs.readFileSync(envCpp, 'utf8');
if (!envOutput.includes('std/env/env_native.hpp') || envOutput.includes('raz_runtime.hpp')) {
  throw new Error('std.env must use its own native header and remain independent from raz_runtime.hpp');
}
for (const constant of ['RAZ_OS_NAME', 'RAZ_ARCHITECTURE']) {
  const declaration = new RegExp(`const std::string ${cppVariable(constant)} = ${cppFunction(`raz_global_init_${constant}`)}\\(\\);`);
  if (!declaration.test(envOutput)) throw new Error(`${constant} must be emitted as a true C++ const global with an initializer`);
}
const envExe = path.join(WORK, 'env-case-bin');
compileGenerated(envCpp, envExe);
run(envExe, [], { status: 0 });

// List operations are provided by the explicitly imported std.containers module,
// not by hard-coded raz:: mappings in the C++ backend.
const containersCase = writeSource('containers-case.raz', [
  'use std.containers;',
  'function containerBehavior() -> i64 {',
  '  let values: List<i64> = [];',
  '  push(values, 10);',
  '  let next: List<i64> = append(values, 32);',
  '  if (listLength(values) == 1 && listLength(next) == 2 && next[1] == 32) return 0;',
  '  return 1;',
  '}',
  'return containerBehavior();',
  '',
].join('\n'));
const containersCpp = path.join(WORK, 'containers-case.cpp');
run(process.execPath, [RAZ_DRIVER, 'emit-cpp', containersCase, '-o', containersCpp], { status: 0 });
const containersOutput = fs.readFileSync(containersCpp, 'utf8');
if (!containersOutput.includes('std/containers/containers_native.hpp') || /raz::list_(?:append|push|length)/.test(containersOutput)) {
  throw new Error('std.containers was not used as an explicit library');
}
const containersExe = path.join(WORK, 'containers-case-bin');
compileGenerated(containersCpp, containersExe);
run(containersExe, [], { status: 0 });

// The outer build driver compiles Raz directly into an executable without raz_runtime.hpp.
const driverExe = path.join(WORK, 'driver-built-hello');
run(process.execPath, [RAZ_DRIVER, 'build', hello, '-o', driverExe], { status: 0 });
const driverRun = run(driverExe, [], { status: 0 });
if (!(driverRun.stdout ?? '').includes('Hello from Raz Gen2!')) throw new Error('direct executable build output mismatch');

const unknown = run(CANDIDATE, [simple, '--unknown-option'], { status: 2 });
if (!unknown.output.includes('unknown argument')) throw new Error('unknown option diagnostic missing');
const missingOut = run(CANDIDATE, [simple, '--emit-cpp'], { status: 2 });
if (!missingOut.output.includes('missing path')) throw new Error('missing output path diagnostic missing');

console.log('[gen2-fast] CLI, native headers, module resolver, std.io, C++ output, relative includes, and diagnostics passed');
