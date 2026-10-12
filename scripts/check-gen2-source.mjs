#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN1 = path.join(ROOT, 'legacy', 'gen1');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const STDLIB = path.join(ROOT, 'library', 'raz');
const compilerEntry = fs.readFileSync(path.join(GEN2, 'compiler.raz'), 'utf8');
const sourceFiles = [...compilerEntry.matchAll(/^\s*include\s+"([^"\n]+)"\s*;/gm)].map((match) => match[1]);
if (sourceFiles.length === 0) throw new Error('compiler.raz must declare its implementation through include directives');
if (new Set(sourceFiles).size !== sourceFiles.length) throw new Error('compiler.raz must not include the same module more than once');
const source = sourceFiles.map((relative) => fs.readFileSync(path.join(GEN2, relative), 'utf8')).join('\n\n');
const resolver = fs.readFileSync(path.join(GEN2, 'src', 'source', 'modules.raz'), 'utf8');
const includes = fs.readFileSync(path.join(GEN2, 'src', 'source', 'includes.raz'), 'utf8');
const parser = fs.readFileSync(path.join(GEN2, 'src', 'core', 'parser.raz'), 'utf8');
const lexer = fs.readFileSync(path.join(GEN2, 'src', 'core', 'lexer.raz'), 'utf8');
const languageMap = fs.readFileSync(path.join(GEN2, 'LANGUAGE-MAP.md'), 'utf8');
const rirEmitter = fs.readFileSync(path.join(GEN2, 'src', 'core', 'rir.raz'), 'utf8');
const targetParser = fs.readFileSync(path.join(GEN2, 'src', 'targets', 'cpp17', 'rir_parser.raz'), 'utf8');
const launcher = fs.readFileSync(path.join(ROOT, 'scripts', 'raz.mjs'), 'utf8');
const stdIo = fs.readFileSync(path.join(STDLIB, 'std', 'io', 'io.raz'), 'utf8');
const stdText = fs.readFileSync(path.join(STDLIB, 'std', 'text', 'text.raz'), 'utf8');
const stdContainers = fs.readFileSync(path.join(STDLIB, 'std', 'containers', 'containers.raz'), 'utf8');
const stdEnv = fs.readFileSync(path.join(STDLIB, 'std', 'env', 'env.raz'), 'utf8');
const stdEnvNative = fs.readFileSync(path.join(STDLIB, 'std', 'env', 'env_native.hpp'), 'utf8');
const stdIoNative = fs.readFileSync(path.join(STDLIB, 'std', 'io', 'io_native.hpp'), 'utf8');
const targetTypes = fs.readFileSync(path.join(GEN2, 'src', 'targets', 'cpp17', 'types.raz'), 'utf8');
const targetEmitter = fs.readFileSync(path.join(GEN2, 'src', 'targets', 'cpp17', 'emitter.raz'), 'utf8');
const semantics = fs.readFileSync(path.join(GEN2, 'src', 'validation', 'semantics.raz'), 'utf8');
const helloExample = fs.readFileSync(path.join(GEN2, 'examples', 'hello.raz'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(GEN2, 'gen.json'), 'utf8'));
const gen1 = JSON.parse(fs.readFileSync(path.join(GEN1, 'gen.json'), 'utf8'));
for (const rel of sourceFiles) {
  if (!fs.existsSync(path.join(GEN2, rel))) throw new Error(`missing Gen2 include module: ${rel}`);
}

// Keep the language reference complete as new lexer keywords are introduced.
for (const match of lexer.matchAll(/if \(word == "([^"]+)"\) return (\d+);/g)) {
  const [, keyword, token] = match;
  if (!languageMap.includes(`| \`${keyword}\` | ${token} |`)) {
    throw new Error(`LANGUAGE-MAP.md is missing lexer keyword ${keyword} (token ${token})`);
  }
}
if (!languageMap.includes('rz_f_') || !languageMap.includes('rz_v_') || !languageMap.includes('rz_t_') || !languageMap.includes('rz_m_') || !languageMap.includes('## ۶. فهرست کامل keywordهای lexer')) {
  throw new Error('LANGUAGE-MAP.md must document readable C++ symbol prefixes and the complete keyword table');
}
if (meta.generation !== 2 || meta.status === 'frozen') throw new Error('Gen2 metadata must describe an unfrozen generation 2');
if (compilerEntry.length > 4096) throw new Error('compiler.raz must remain a small canonical include entry, not a generated monolithic bundle');
for (const relative of sourceFiles) {
  if (!compilerEntry.includes(`include \"${relative}\";`)) throw new Error(`compiler.raz is missing source include ${relative}`);
}
if (meta.source !== 'compiler/razc/src/' || meta.final_file !== 'compiler/razc/compiler.raz') throw new Error('Gen2 metadata paths do not match compiler/razc layout');
const declarationOwners = new Map();
for (const relative of sourceFiles) {
  const content = fs.readFileSync(path.join(GEN2, relative), 'utf8');
  for (const match of content.matchAll(/^(?:struct|function)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
    const owners = declarationOwners.get(match[1]) ?? [];
    owners.push(relative);
    declarationOwners.set(match[1], owners);
  }
}
const duplicateDeclarations = [...declarationOwners].filter(([, owners]) => owners.length > 1);
if (duplicateDeclarations.length) throw new Error(`included compiler declarations must be globally unique: ${duplicateDeclarations.map(([name, owners]) => `${name} (${owners.join(', ')})`).join('; ')}`);
if (gen1.status !== 'frozen') throw new Error('Gen2 bootstrap requires frozen Gen1 metadata');
if (/^function main\(\)/m.test(source)) throw new Error('Gen2 source must use top-level execution, not user-defined main');
for (const include of [
  'use \"cstdint\";', 'use \"cstddef\";', 'use \"string\";', 'use \"vector\";'
]) {
  if (!source.includes(include)) throw new Error(`missing explicit native dependency: ${include}`);
}
if (/^use (?:cstdint|cstddef|string|vector);$/m.test(source)) throw new Error('native C++ headers must be quoted in use directives');
if (/emitLine\(state, "#include <(?:cstdint|cstddef|string|vector)>"\)/.test(source)) {
  throw new Error('native includes must come from explicit use directives, not implicit backend lines');
}
if (!source.includes('function compileSourceAt(source: string, entryPath: string)')) throw new Error('entry-relative source include resolver is missing');
if (!fs.existsSync(path.join(ROOT, 'scripts', 'raz.mjs'))) throw new Error('outer Raz build driver is missing');
if (fs.existsSync(path.join(ROOT, 'scripts', 'module-resolver.mjs'))) throw new Error('module resolution must not live in a separate JavaScript program');
if (!fs.existsSync(path.join(ROOT, 'scripts', 'test-gen2-resolver-fast.mjs'))) throw new Error('fast resolver contract tests are missing');
if (!fs.existsSync(path.join(ROOT, 'scripts', 'test-gen2-io-native-fast.mjs'))) throw new Error('fast native std.io tests are missing');
if (/JSON\.parse|readFile\([^)]*module\.json/i.test(resolver)) throw new Error('Raz module resolver must not read JSON metadata');
if (!resolver.includes('function resolveRazModules(')) throw new Error('module resolution must be implemented in Raz');
if (resolver.includes('sourceWithPrelude') || /use\s+std\.core\s*;/.test(resolver)) throw new Error('std.core must not be injected as an implicit prelude');
if (!fs.existsSync(path.join(STDLIB, 'std', 'core', 'core.raz'))) throw new Error('explicit std.core module is missing');
if (!includes.includes('function normalizeIncludePath(') || !includes.includes('function isPathSeparator(')) throw new Error('include paths must be normalized before deduplication/cycle checks');
if (!includes.includes('charCodeAt(source, scan + 1) == 47') || !includes.includes('charCodeAt(source, scan + 1) == 42')) throw new Error('include expansion must ignore directive-like text in comments');
if (!includes.includes('let quote: i64 = charCodeAt(source, scan)')) throw new Error('include expansion must ignore directive-like text in string/character literals');
if (launcher.includes('resolveRazSource') || launcher.includes('module-resolver.mjs')) throw new Error('JavaScript launcher must not resolve Raz modules');
if (!helloExample.includes('use std.io;')) throw new Error('hello example must import std.io through the module system');
if (!stdIo.includes('function writeFile(path: string, value: string) -> bool')) throw new Error('std.io writeFile must report write failures');
if (!stdIoNative.includes('inline bool std_io_write_file(') || !stdIoNative.includes('output.flush();') || !stdIoNative.includes('return !output.fail();')) throw new Error('std.io native writes must report open/write/close failures');
if (!source.includes('razc: cannot write output:')) throw new Error('Gen2 driver must report output write failures');
if (/^\s*extern\s+function/m.test(stdIo)) throw new Error('std.io must not declare native functions with extern');
if (!stdIo.includes('std_io_print!(value);') || !stdIo.includes('std_io_read_file!(path)')) throw new Error('std.io must use native-call ! syntax');
if (targetEmitter.includes('usesCli(') || targetEmitter.includes('std_io_set_cli')) throw new Error('the C++ backend must not know std.io startup details');
if (!targetEmitter.includes('namespace raz_internal_process { int argc = 0; char** argv = nullptr; }')) throw new Error('generic process context ABI is missing');
if (!rirEmitter.includes('raz_module_init_') || !rirEmitter.includes('Phase 2: run any source module startup hooks')) throw new Error('module startup hooks must be scheduled by the compiler core, not target-specific code');
if (!(rirEmitter.indexOf('Phase 1: initialize mutable module globals') < rirEmitter.indexOf('Phase 2: run any source module startup hooks') && rirEmitter.indexOf('Phase 2: run any source module startup hooks') < rirEmitter.indexOf('Phase 3: execute ordinary top-level statements'))) throw new Error('module startup order must be globals, module hooks, then user statements');
if (targetParser.includes('usesCli(') || targetEmitter.includes('usesCli(') || targetEmitter.includes('std_io_set_cli')) throw new Error('C++ backend must not special-case std.io process startup');
if (semantics.includes('std_io_set_cli') || !semantics.includes('module initializer must be named raz_module_init_<name>')) throw new Error('module initializer signature must be validated generically');
if (!stdIoNative.includes('namespace raz_internal_process') || stdIoNative.includes('std_io_set_cli')) throw new Error('std.io must consume the generic process context without backend-specific startup');
if (!parser.includes('native call marker') || !rirEmitter.includes('native-call ')) throw new Error('native-call marker must flow from parser to RIR');
if (/f\.external|extern function|external: bool/.test(targetParser + rirEmitter + source)) throw new Error('Gen2 AST/RIR/backend must not preserve extern declarations');
if (!stdIo.includes('use \"std/io/io_native.hpp\";')) throw new Error('std.io module must explicitly import its native bridge');
if (!stdText.includes('use \"std/text/text_native.hpp\";') || !stdText.includes('std_text_length!(value)') || !stdText.includes('std_text_slice!(value, begin, end)')) throw new Error('std.text must own text native functions through explicit imports');
if (/raz::string_length|raz::string_slice|raz::int_to_string/.test(targetTypes)) throw new Error('std.text operations must not be hard-coded in the C++ target mapping');
if (/raz::list_append|raz::list_push|raz::list_length/.test(targetTypes)) throw new Error('std.containers operations must not be hard-coded in the C++ target mapping');
if (!stdContainers.includes('use \"std/containers/containers_native.hpp\";')) throw new Error('std.containers must explicitly import its native implementation');
if (!stdEnv.includes('use \"std/env/env_native.hpp\";') || !stdEnvNative.includes('std_env_get') || !stdEnvNative.includes('std_env_os_name')) throw new Error('std.env must own its native environment and platform API');
if (!stdEnv.includes('const RAZ_OS_NAME: string = osName();') || !stdEnv.includes('const RAZ_ARCHITECTURE: string = architecture();')) throw new Error('std.env platform metadata must be immutable Raz constants');
if (!source.includes('use std.containers;')) throw new Error('Gen2 compiler must import std.containers explicitly');
if (/if \(name == \"(?:length|slice|int_to_string)\"\)/.test(semantics)) throw new Error('text helpers must resolve as normal Raz library functions');
if (!source.includes('use std.text;')) throw new Error('Gen2 compiler must import std.text explicitly');
if (source.includes('use \"raz_runtime.hpp\";')) throw new Error('the legacy runtime header must not be a Gen2 source dependency');

if (!includes.includes('if (scan > 0) beforeOk = !isAlphaNum(charCodeAt(source, scan - 1));')) throw new Error('include scanner must guard preceding-character access explicitly');
if (!includes.includes('if (scan + 7 < length(source)) afterOk = !isAlphaNum(charCodeAt(source, scan + 7));')) throw new Error('include scanner must guard following-character access explicitly');
if (includes.includes('scan == 0 || !isAlphaNum(source[scan - 1])') || includes.includes('normalized != "" && normalized[length(normalized) - 1]') || includes.includes('listLength(segments) > 0 && segments[listLength(segments) - 1]')) throw new Error('include scanner still hides a potentially invalid index behind short-circuit syntax');
if (resolver.includes('while (dot >= 0 && name[dot]') || resolver.includes('while (b > a && isSpace(line[b - 1])')) throw new Error('module resolver still has a potentially negative string index in a loop guard');
if (targetParser.includes('while (b > a && (s[b - 1]')) throw new Error('RIR parser trim must not hide a negative string index in a loop guard');
if (!rirEmitter.includes('global-const ') || !rirEmitter.includes('function " + initName + "() -> " + ts.type')) throw new Error('const globals must have explicit RIR initializer functions');
if (!targetParser.includes('starts(line, "global-const ")') || !targetEmitter.includes('if (g.isConst) cpp17_emitLine(state, "const "')) throw new Error('C++ target must lower RIR const globals to const storage');
if (!semantics.includes('function names beginning with raz_global_init_ are reserved by the compiler')) throw new Error('generated global initializer function namespace must be reserved');
if (!rirEmitter.includes('if (x.op == "&&" || x.op == "||")') || !rirEmitter.includes('branch " + left + " ? " + rhsLabel') || !rirEmitter.includes(' = copy ')) throw new Error('logical operators must lower to short-circuit control flow in RIR');
if (!targetTypes.includes('function cppMangledName(prefix: string, name: string)') || !targetTypes.includes('return prefix + "_" + name') || !targetTypes.includes('function cppFunctionName(name: string)') || !targetTypes.includes('function cppVariableName(name: string)') || !targetTypes.includes('function cppStructName(name: string)') || !targetTypes.includes('function cppFieldName(name: string)')) throw new Error('C++ target must use short, readable identifiers by symbol category');
if (!targetTypes.includes('cppMangledName("rz_f", name)') || !targetTypes.includes('cppMangledName("rz_v", name)') || !targetTypes.includes('cppMangledName("rz_t", name)') || !targetTypes.includes('cppMangledName("rz_m", name)')) throw new Error('C++ target symbol categories must use rz_f/rz_v/rz_t/rz_m prefixes');
if (targetTypes.includes('int_to_string(name[i])') || targetTypes.includes('_n" + int_to_string(length(name))')) throw new Error('C++ target must not encode each identifier character as decimal digits');
if (targetTypes.includes('if (name == "main") return "raz_main"') || targetEmitter.includes('raz_main()')) throw new Error('main must not be special-cased as a user symbol in C++ output');
if (!semantics.includes('let target: string = "raz$local$" + int_to_string(nextSymbol)') || !semantics.includes('normalizeStatementNames')) throw new Error('local names must be normalized to unique symbols before flattened RIR emission');
if (!fs.readFileSync(path.join(ROOT, 'scripts', 'test-gen2-fast.mjs'), 'utf8').includes('duplicate-sibling-local.raz')) throw new Error('sibling-scope local collision regression test is missing');
if (!targetParser.includes('head == "load" || head == "copy" || head == "ref"') || !targetEmitter.includes('ins.opcode == "copy"')) throw new Error('structured RIR parser and C++ target must lower copy instructions');
if (!targetTypes.includes('function cppCallName(module: Ref<BackendModule>, name: string)')) throw new Error('C++ call naming must distinguish Raz definitions from C++ library APIs generically');
if (!targetEmitter.includes('static_cast<char>(')) throw new Error('character literals must lower from numeric code points without C++ multi-character literals');
if (!parser.includes('s.isTypeExplicit = true;') || !rirEmitter.includes('local-auto ') || !rirEmitter.includes('global-auto ') || !rirEmitter.includes('global-const-auto ')) throw new Error('omitted variable type annotation must be preserved in AST/RIR');
if (!targetParser.includes('global-const-auto ') || !targetParser.includes('global-auto ') || !targetTypes.includes('state.localAutos = [];') || !targetEmitter.includes('decltype(') || !targetEmitter.includes('const auto ')) throw new Error('C++ target must lower omitted variable types through auto-based storage');
if (!fs.readFileSync(path.join(ROOT, 'scripts', 'test-gen2-fast.mjs'), 'utf8').includes('type-elision.raz')) throw new Error('type-elision behavior regression test is missing');
if (!fs.readFileSync(path.join(ROOT, 'scripts', 'test-gen2-resolver-fast.mjs'), 'utf8').includes('empty[1] == 0')) throw new Error('short-circuit guard regression test is missing');
if (!fs.readFileSync(path.join(ROOT, 'scripts', 'test-gen2-fast.mjs'), 'utf8').includes('cpp-name-mangling.raz')) throw new Error('C++ keyword/name-mangling regression test is missing');
if (!fs.readFileSync(path.join(ROOT, 'scripts', 'test-gen2-fast.mjs'), 'utf8').includes('true C++ const global')) throw new Error('C++ const-storage regression test is missing');
if (fs.readFileSync(path.join(GEN2, 'src', 'core', 'lexer.raz'), 'utf8').includes('if (word == "extern")')) throw new Error('extern must not be a Gen2 keyword; use native-call ! syntax');
if (!source.includes('function runCompiler() -> i64')) throw new Error('Gen2 CLI function is missing');
if (!source.includes('use std.io;')) throw new Error('Gen2 compiler CLI must import std.io in canonical source');
if (!parser.includes('native C++ headers must be quoted in use directives')) throw new Error('Gen2 parser must reject ambiguous bare use directives');
if (rirEmitter.includes('use-bare') || targetParser.includes('use-bare ')) throw new Error('Gen2 RIR must not preserve ambiguous bare use directives');
if (!fs.readFileSync(path.join(GEN2, 'src', 'validation', 'semantics.raz'), 'utf8').includes('native call return type is unknown')) throw new Error('native calls without a type context must require an annotation');
if (!fs.readFileSync(path.join(GEN2, 'src', 'core', 'rir.raz'), 'utf8').includes('pass lvalues as lvalues')) throw new Error('native calls must preserve lvalue arguments for C++ references');
console.log('[gen2-source] modular layout, short-circuit RIR, C++ name mangling, immutable Raz metadata, native-call API, stdlib modules, bootstrap contract, and entry-relative includes passed');
