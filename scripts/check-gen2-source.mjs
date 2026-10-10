#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN1 = path.join(ROOT, 'generations', 'gen1');
const GEN2 = path.join(ROOT, 'generations', 'gen2');
const source = fs.readFileSync(path.join(GEN2, 'final', 'compiler.raz'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(GEN2, 'gen.json'), 'utf8'));
const gen1 = JSON.parse(fs.readFileSync(path.join(GEN1, 'gen.json'), 'utf8'));
const expectedModules = [
  'src/model/ast.raz',
  'src/core/lexer.raz',
  'src/core/parser.raz',
  'src/core/text.raz',
  'src/source/includes.raz',
  'src/validation/semantics.raz',
  'src/core/rir.raz',
  'src/targets/cpp17/model.raz',
  'src/targets/cpp17/parser.raz',
  'src/targets/cpp17/types.raz',
  'src/targets/cpp17/emitter.raz',
  'src/driver/main.raz',
];
for (const rel of expectedModules) {
  if (!fs.existsSync(path.join(GEN2, rel))) throw new Error(`missing Gen2 module: ${rel}`);
}
if (meta.generation !== 2 || meta.status === 'frozen') throw new Error('Gen2 metadata must describe an unfrozen generation 2');
if (gen1.status !== 'frozen') throw new Error('Gen2 bootstrap requires frozen Gen1 metadata');
if (/^function main\(\)/m.test(source)) throw new Error('Gen2 source must use top-level execution, not user-defined main');
for (const include of [
  'use cstdint;', 'use cstddef;', 'use string;', 'use vector;', 'use "raz_runtime.hpp";'
]) {
  if (!source.includes(include)) throw new Error(`missing explicit native dependency: ${include}`);
}
if (/emitLine\(state, "#include <(?:cstdint|cstddef|string|vector)>"\)/.test(source)) {
  throw new Error('native includes must come from explicit use directives, not implicit backend lines');
}
if (!source.includes('function compileSourceAt(source: string, entryPath: string)')) throw new Error('entry-relative source include resolver is missing');
if (!source.includes('function runCompiler() -> i64')) throw new Error('Gen2 CLI function is missing');
console.log('[gen2-source] modular layout, explicit uses, Gen1 freeze contract, and entry-relative includes passed');
