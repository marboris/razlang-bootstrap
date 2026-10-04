#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_TARGET,
  loadLanguage,
  loadTarget,
  createCppBackend,
} from '../razc-stage0.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE1_SOURCE = path.join(ROOT, 'stage1', 'compiler.raz');
const CACHE = path.join(ROOT, 'stage4', '.cache');

function fail(message) { throw new Error(message); }
function trim(s) { return s.trim(); }
function splitArgs(s) {
  const out = [];
  let start = 0, depth = 0, quote = null, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '<' || c === '(' || c === '[') depth++;
    else if (c === '>' || c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(trim(s.slice(start, i))); start = i + 1; }
  }
  const last = trim(s.slice(start));
  if (last) out.push(last);
  return out;
}
function baseType(t) {
  const i = t.indexOf('<');
  return i < 0 ? t : t.slice(0, i);
}
function typeArgs(t) {
  const i = t.indexOf('<');
  if (i < 0 || !t.endsWith('>')) return [];
  const raw = t.slice(i + 1, -1);
  return splitArgs(raw);
}
function normalizeRefValueType(t) {
  const a = typeArgs(t);
  return baseType(t) === 'Ref' && a.length === 1 ? a[0] : t;
}
function parseParamList(raw) {
  return splitArgs(raw).map(item => {
    const p = item.indexOf(' ');
    if (p < 0) fail(`bad parameter: ${item}`);
    return { type: item.slice(0, p), name: trim(item.slice(p + 1)) };
  });
}
function functionSignature(line) {
  const open = line.indexOf('(');
  const close = line.lastIndexOf(')');
  const arrow = line.lastIndexOf(' -> ');
  if (open < 0 || close < 0 || arrow < 0) fail(`bad function signature: ${line}`);
  return {
    name: trim(line.slice('function '.length, open)),
    params: parseParamList(line.slice(open + 1, close)),
    returnType: trim(line.slice(arrow + 4)),
  };
}
function decodeConst(type, raw) {
  if (type === 'string') {
    try { return JSON.parse(raw); } catch { return raw.replace(/^"|"$/g, ''); }
  }
  if (type === 'bool') return raw === 'true';
  if (type === 'i64') return Number(raw);
  if (type === 'f64') return Number(raw);
  if (type === 'char') return raw;
  return raw;
}

function parseRir(rir, language = DEFAULT_LANGUAGE) {
  const lines = rir.split(/\r?\n/);
  if (trim(lines[0] ?? '') !== 'rir 1') fail('unsupported or missing RIR header');

  const structs = [];
  const functions = [];
  let i = 1;
  while (i < lines.length) {
    const line = trim(lines[i]);
    if (!line) { i++; continue; }
    if (line.startsWith('struct ')) {
      const name = trim(line.slice(7));
      const fields = [];
      i++;
      while (i < lines.length && lines[i].startsWith('  field ')) {
        const f = trim(lines[i].slice(8));
        const p = f.indexOf(' ');
        if (p < 0) fail(`bad struct field: ${lines[i]}`);
        fields.push({ field: trim(f.slice(p + 1)), type: trim(f.slice(0, p)) });
        i++;
      }
      structs.push({ name, fields });
      continue;
    }
    if (line.startsWith('function ')) {
      const fn = functionSignature(line);
      const blocks = [];
      let block = { id: 'entry', label: 'entry', instructions: [] };
      blocks.push(block);
      i++;
      while (i < lines.length) {
        const raw = lines[i];
        const x = trim(raw);
        if (x === 'endfunction') { i++; break; }
        if (!x) { i++; continue; }
        if (x.endsWith(':') && !x.includes(' = ')) {
          const id = x.slice(0, -1);
          if (id === 'entry' && block.id === 'entry' && block.instructions.length === 0) { i++; continue; }
          block = { id, label: id, instructions: [] };
          blocks.push(block);
          i++;
          continue;
        }
        block.instructions.push(x);
        i++;
      }
      functions.push({ ...fn, blocks });
      continue;
    }
    i++;
  }

  const fnMap = new Map(functions.map(f => [f.name, f]));
  const structMap = new Map(structs.map(s => [s.name, new Map(s.fields.map(f => [f.field, f.type]))]));

  const builtinSpec = language.builtins ?? {};
  function builtinType(name, args) {
    const spec = builtinSpec[name];
    if (!spec) return null;
    if (name === 'append') return inferType(args[0]);
    if (name === 'push' || name === 'writeFile') return 'void';
    return spec.return ?? 'void';
  }

  function convertFunction(fn) {
    const vars = new Map(fn.params.map(p => [p.name, p.type]));
    const valueTypes = new Map();
    const valueAliases = new Map();
    const lvalueExprs = new Map();
    // First collect locals so list/new results can be recovered from stores.
    for (const b of fn.blocks) {
      for (const line of b.instructions) {
        if (line.startsWith('local ')) {
          const rest = line.slice(6);
          const p = rest.indexOf(' ');
          if (p > 0) vars.set(trim(rest.slice(p + 1)), trim(rest.slice(0, p)));
        }
      }
    }

    function inferType(v) {
      const x = trim(v);
      if (x.startsWith('%')) return valueTypes.get(x) ?? 'i64';
      if (x === 'true' || x === 'false') return 'bool';
      if (/^-?\d+$/.test(x)) return 'i64';
      return vars.get(x) ?? 'i64';
    }
    function valueAlias(v) {
      return valueAliases.get(v) ?? v;
    }
    function fieldType(base, field) {
      const bt = normalizeRefValueType(inferType(base));
      const fields = structMap.get(baseType(bt));
      return fields?.get(field) ?? 'i64';
    }
    function exprType(rhs, result) {
      if (rhs.startsWith('const ')) return trim(rhs.slice(6).split(/\s+/, 1)[0]);
      if (rhs.startsWith('load ')) return normalizeRefValueType(inferType(trim(rhs.slice(5))));
      if (rhs.startsWith('new ')) return trim(rhs.slice(4).split('(', 1)[0]);
      if (rhs.startsWith('field ')) {
        const z = trim(rhs.slice(6));
        const dot = z.indexOf('.');
        return dot < 0 ? 'i64' : fieldType(z.slice(0, dot), z.slice(dot + 1));
      }
      if (rhs.startsWith('index ')) {
        const z = trim(rhs.slice(6));
        const open = z.indexOf('[');
        if (open < 0) return 'i64';
        const bt = normalizeRefValueType(inferType(z.slice(0, open)));
        if (baseType(bt) === 'List') return typeArgs(bt)[0] ?? 'i64';
        if (bt === 'string') return 'i64';
        return 'i64';
      }
      if (rhs.startsWith('list(')) {
        const args = splitArgs(rhs.slice(5, -1));
        return args.length ? `List<${inferType(args[0])}>` : 'List<i64>';
      }
      if (rhs.startsWith('call ')) {
        const z = rhs.slice(5), open = z.indexOf('(');
        const name = trim(z.slice(0, open));
        const args = splitArgs(z.slice(open + 1, -1));
        const bi = builtinType(name, args);
        if (bi) return bi;
        return fnMap.get(name)?.returnType ?? 'i64';
      }
      const op = rhs.split(/\s+/, 1)[0];
      if (['eq','ne','lt','le','gt','ge','and','or','not'].includes(op)) return 'bool';
      if (op === 'add') {
        const args = splitArgs(trim(rhs.slice(4)));
        return inferType(args[0]) === 'string' && inferType(args[1]) === 'string' ? 'string' : (inferType(args[0]) || 'i64');
      }
      if (['sub','mul','div','mod','neg','pos'].includes(op)) {
        const rest = trim(rhs.slice(op.length));
        const args = splitArgs(rest);
        return inferType(args[0]) ?? 'i64';
      }
      return result ? valueTypes.get(result) ?? 'i64' : 'i64';
    }

    for (const block of fn.blocks) {
      for (const line of block.instructions) {
        if (line.startsWith('local ')) continue;
        const eq = line.indexOf(' = ');
        if (eq > 0 && line.startsWith('%')) {
          const result = trim(line.slice(0, eq));
          const rhs = trim(line.slice(eq + 3));
          if (rhs.startsWith('load ')) {
            const name = trim(rhs.slice(5));
            if (baseType(vars.get(name) ?? '') === 'Ref') valueAliases.set(result, name);
          }
          valueTypes.set(result, exprType(rhs, result));
        }
      }
    }
    // A textual list literal does not carry its generic element type. Recover it
    // from the typed destination on store; this keeps the RIR compact while the
    // backend receives a fully typed IR.
    for (const block of fn.blocks) {
      for (const line of block.instructions) {
        if (!line.startsWith('store ')) continue;
        const z = line.slice(6), comma = z.indexOf(',');
        if (comma <= 0) continue;
        const name = trim(z.slice(0, comma));
        const value = trim(z.slice(comma + 1));
        if (!value.startsWith('%')) continue;
        const declared = vars.get(name);
        if (!declared || declared === '') {
          const vt = valueTypes.get(value);
          if (vt) vars.set(name, vt);
        } else {
          valueTypes.set(value, normalizeRefValueType(declared));
        }
      }
    }
    for (const block of fn.blocks) {
      for (const line of block.instructions) {
        if (line.startsWith('field_set ')) {
          const z = line.slice(10), eq = z.indexOf(' = ');
          if (eq > 0) {
            const target = trim(z.slice(0, eq));
            const value = trim(z.slice(eq + 3));
            const dot = target.indexOf('.');
            if (dot > 0 && value.startsWith('%')) {
              const base = trim(target.slice(0, dot));
              const bt = normalizeRefValueType(vars.get(base) ?? valueTypes.get(base) ?? 'i64');
              const ft = structMap.get(baseType(bt))?.get(trim(target.slice(dot + 1)));
              if (ft) valueTypes.set(value, ft);
            }
          }
        }
      }
    }
    for (const [v, alias] of valueAliases) {
      if (vars.has(alias)) valueTypes.set(v, vars.get(alias));
    }

    const instructions = fn.blocks.map(block => ({
      ...block,
      instructions: block.instructions.map(line => rirLineToInstruction(line, vars, valueTypes, valueAliases, lvalueExprs, fnMap, structMap, builtinType))
    }));

    return {
      name: fn.name,
      params: fn.params,
      returnType: fn.returnType,
      blocks: instructions,
    };
  }

  function rirLineToInstruction(line, vars, valueTypes, aliases, lvalueExprs, fnMap, structMap, builtinType) {
    if (line.endsWith(':')) return { op: 'label', label: line.slice(0, -1) };
    if (line.startsWith('local ')) {
      const z = line.slice(6), p = z.indexOf(' ');
      const rawType = trim(z.slice(0, p));
      const name = trim(z.slice(p + 1));
      return { op: 'local', type: rawType || vars.get(name) || 'i64', name };
    }
    if (line === 'return') return { op: 'return', value: null, type: 'void' };
    if (line.startsWith('return ')) return { op: 'return', value: trim(line.slice(7)), type: 'auto' };
    if (line.startsWith('call ')) {
      const z = line.slice(5), open = z.indexOf('(');
      if (open < 0 || !z.endsWith(')')) fail(`malformed call: ${line}`);
      const callee = trim(z.slice(0, open));
      const args = splitArgs(z.slice(open + 1, -1));
      const sig = fnMap.get(callee) ?? null;
      const bi = builtinType(callee, args);
      const spec = language.builtins?.[callee] ?? null;
      const expected = j => bi ? spec?.params?.[j] : sig?.params?.[j]?.type;
      const callArg = (a, j) => {
        const e = expected(j) ?? '';
        return baseType(e) === 'Ref'
          ? a
          : (aliases.get(a) ?? a);
      };
      return bi ? { op: 'builtin', result: null, type: 'void', intrinsic: spec.intrinsic, args: args.map(callArg) }
                : { op: 'call', result: null, type: 'void', callee, args: args.map(callArg) };
    }
    if (line.startsWith('builtin ')) {
      const z = line.slice(8), open = z.indexOf('(');
      if (open < 0 || !z.endsWith(')')) fail(`malformed builtin: ${line}`);
      const intrinsic = trim(z.slice(0, open));
      const args = splitArgs(z.slice(open + 1, -1));
      return { op: 'builtin', result: null, type: 'void', intrinsic, args: args.map(a => aliases.get(a) ?? a) };
    }
    if (line.startsWith('jump ')) return { op: 'jump', target: trim(line.slice(5)) };
    if (line.startsWith('branch ')) {
      const z = line.slice(7), q = z.indexOf(' ? '), c = z.indexOf(' : ', q + 3);
      return { op: 'branch', cond: trim(z.slice(0, q)), then: trim(z.slice(q + 3, c)), else: trim(z.slice(c + 3)) };
    }
    if (line.startsWith('field_set ')) {
      const z = line.slice(10), eq = z.indexOf(' = '), target = trim(z.slice(0, eq)), dot = target.indexOf('.');
      return { op: 'field_set', baseName: trim(target.slice(0, dot)), field: trim(target.slice(dot + 1)), value: trim(z.slice(eq + 3)), type: fieldTypeFromName(target, vars, structMap) };
    }
    if (line.startsWith('index_set ')) {
      const z = line.slice(10), eq = z.indexOf(' = '), target = trim(z.slice(0, eq)), open = target.indexOf('[');
      return { op: 'index_set', baseName: trim(target.slice(0, open)), index: trim(target.slice(open + 1, -1)), value: trim(z.slice(eq + 3)), type: 'auto' };
    }
    if (line.startsWith('store ')) {
      const z = line.slice(6), c = z.indexOf(',');
      return { op: 'store_var', name: trim(z.slice(0, c)), value: trim(z.slice(c + 1)), type: vars.get(trim(z.slice(0, c))) ?? 'i64' };
    }
    const eq = line.indexOf(' = ');
    if (eq > 0 && line.startsWith('%')) {
      const result = trim(line.slice(0, eq));
      const rhs = trim(line.slice(eq + 3));
      if (rhs.startsWith('const ')) {
        const z = rhs.slice(6), p = z.indexOf(' '), type = trim(z.slice(0, p));
        return { op: 'const', result, type, value: decodeConst(type, trim(z.slice(p + 1))) };
      }
      if (rhs.startsWith('load ')) {
        const name = trim(rhs.slice(5));
        if (aliases.has(result)) return { op: 'load_ref', result, name, type: vars.get(name) ?? 'i64' };
        return { op: 'load_var', result, name, type: normalizeRefValueType(vars.get(name) ?? valueTypes.get(result) ?? 'i64') };
      }
      if (rhs.startsWith('ref ')) {
        const name = trim(rhs.slice(4));
        aliases.set(result, name);
        lvalueExprs.set(result, name);
        return { op: 'ref_var', result, name, type: vars.get(name) ?? 'Ref<i64>' };
      }
      if (rhs.startsWith('ref_field ')) {
        const z = trim(rhs.slice(10));
        const dot = z.indexOf('.');
        const base = trim(z.slice(0, dot));
        const field = trim(z.slice(dot + 1));
        const bt = normalizeRefValueType(valueTypes.get(base) ?? vars.get(base) ?? 'i64');
        const ft = structMap.get(baseType(bt))?.get(field) ?? 'i64';
        const place = lvalueExprs.get(base) ?? aliases.get(base) ?? base;
        lvalueExprs.set(result, `${place}.${field}`);
        aliases.set(result, `${place}.${field}`);
        return { op: 'ref_field', result, base, field, type: `Ref<${ft}>` };
      }
      if (rhs.startsWith('ref_index ')) {
        const z = trim(rhs.slice(10));
        const open = z.indexOf('[');
        const base = trim(z.slice(0, open));
        const index = trim(z.slice(open + 1, -1));
        const bt = normalizeRefValueType(valueTypes.get(base) ?? vars.get(base) ?? 'i64');
        const valueType = baseType(bt) === 'List' ? (typeArgs(bt)[0] ?? 'i64') : 'i64';
        const place = lvalueExprs.get(base) ?? aliases.get(base) ?? base;
        lvalueExprs.set(result, `${place}[${aliases.get(index) ?? index}]`);
        aliases.set(result, `${place}[${aliases.get(index) ?? index}]`);
        return { op: 'ref_index', result, base, index, type: `Ref<${valueType}>` };
      }
      if (rhs.startsWith('new ')) return { op: 'new', result, type: trim(rhs.slice(4)), args: [] };
      if (rhs.startsWith('field ')) {
        const z = trim(rhs.slice(6)), dot = z.indexOf('.');
        const base = trim(z.slice(0, dot));
        const bt = normalizeRefValueType(valueTypes.get(base) ?? vars.get(base) ?? 'i64');
        const ft = structMap.get(baseType(bt))?.get(trim(z.slice(dot + 1))) ?? 'i64';
        lvalueExprs.set(result, `${lvalueExprs.get(base) ?? aliases.get(base) ?? base}.${trim(z.slice(dot + 1))}`);
        return { op: 'field_get', result, base, field: trim(z.slice(dot + 1)), type: ft };
      }
      if (rhs.startsWith('index ')) {
        const z = trim(rhs.slice(6)), open = z.indexOf('[');
        const base = trim(z.slice(0, open));
        const index = trim(z.slice(open + 1, -1));
        const bt = normalizeRefValueType(valueTypes.get(base) ?? vars.get(base) ?? 'i64');
        lvalueExprs.set(result, `${lvalueExprs.get(base) ?? aliases.get(base) ?? base}[${aliases.get(index) ?? index}]`);
        return { op: 'index_get', result, base, index, type: baseType(bt) === 'List' ? (typeArgs(bt)[0] ?? 'i64') : 'i64' };
      }
      if (rhs.startsWith('list(')) {
        const args = splitArgs(rhs.slice(5, -1));
        const type = valueTypes.get(result) ?? (args.length ? `List<${valueTypes.get(args[0]) ?? 'i64'}>` : 'List<i64>');
        return { op: 'make_list', result, type, items: args };
      }
      if (rhs.startsWith('call ')) {
        const z = rhs.slice(5), open = z.indexOf('('), callee = trim(z.slice(0, open)), args = splitArgs(z.slice(open + 1, -1));
        const sig = fnMap.get(callee) ?? null;
        const bi = builtinType(callee, args);
        const spec = language.builtins?.[callee] ?? null;
        const expected = j => bi ? spec?.params?.[j] : sig?.params?.[j]?.type;
        const callArg = (a, j) => {
          const e = expected(j) ?? '';
          return baseType(e) === 'Ref'
            ? (lvalueExprs.get(a) ?? aliases.get(a) ?? a)
            : (aliases.get(a) ?? a);
        };
        if (bi) return { op: 'builtin', result: bi === 'void' ? null : result, type: bi, intrinsic: spec.intrinsic, args: args.map(callArg) };
        return { op: 'call', result: sig?.returnType === 'void' ? null : result, type: sig?.returnType ?? 'i64', callee, args: args.map(callArg) };
      }
      const op = rhs.split(/\s+/, 1)[0];
      const rest = trim(rhs.slice(op.length));
      const args = splitArgs(rest);
      if (['neg','not','pos'].includes(op)) return { op: 'unary', result, type: valueTypes.get(result) ?? 'i64', intrinsic: op, operand: args[0] };
      if (['add','sub','mul','div','mod','eq','ne','lt','le','gt','ge','and','or'].includes(op)) {
        return { op: 'binary', result, type: valueTypes.get(result) ?? 'i64', intrinsic: op, left: args[0], right: args[1] };
      }
      fail(`unsupported RIR instruction: ${line}`);
    }
    fail(`unsupported RIR line: ${line}`);
  }

  function fieldTypeFromName(z, vars, structMap) {
    const dot = z.indexOf('.');
    if (dot < 0) return 'i64';
    const base = trim(z.slice(0, dot));
    const bt = normalizeRefValueType(vars.get(base) ?? 'i64');
    return structMap.get(baseType(bt))?.get(trim(z.slice(dot + 1))) ?? 'i64';
  }

  return {
    kind: 'IRModule',
    structs,
    functions: functions.map(convertFunction),
  };
}

function buildStage1({ languagePath, targetPath, optimization = '-O3' } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const language = loadLanguage(languagePath);
  const target = loadTarget(targetPath);

  // The test harness may provide a previously built Stage-1 binary. This keeps
  // the bootstrap test deterministic and avoids rebuilding the same native
  // compiler in a child process after the suite already built it once.
  const externalBin = process.env.RAZ_STAGE1_BIN;
  if (externalBin && fs.existsSync(externalBin)) {
    return { language, target, bin: path.resolve(externalBin) };
  }
  const cpp = path.join(CACHE, 'stage1.cpp');
  const bin = path.join(CACHE, process.platform === 'win32' ? 'stage1.exe' : 'stage1');
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(CACHE, 'raz_runtime.hpp'));
  const p = spawnSync(process.execPath, [path.join(ROOT, 'razc-stage0.mjs'), 'compile', STAGE1_SOURCE, '-o', cpp, '--language', languagePath ?? path.join(ROOT, 'raz.language.json'), '--target', targetPath ?? path.join(ROOT, 'cpp17.target.json')], { cwd: ROOT, encoding: 'utf8' });
  if (p.status !== 0) fail(`Stage-1 bootstrap compile failed:\n${p.stdout}\n${p.stderr}`);
  const cc = spawnSync('c++', [optimization, '-std=c++17', cpp, '-o', bin], { cwd: ROOT, encoding: 'utf8' });
  if (cc.status !== 0) fail(`Stage-1 native build failed:\n${cc.stdout}\n${cc.stderr}`);
  return { language, target, bin };
}

function compileWithHostFrontend(sourcePath, outputPath, { run = false, languagePath, targetPath } = {}) {
  const { language, target, bin } = buildStage1({ languagePath, targetPath });
  const input = path.join(ROOT, 'stage1', 'input.raz');
  const rirPath = path.join(CACHE, 'input.rir');
  fs.copyFileSync(sourcePath, input);
  const stage = spawnSync(bin, [], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  if (stage.status !== 0) fail(`Stage-1 failed:\n${stage.stdout}\n${stage.stderr}`);
  const rir = fs.readFileSync(path.join(ROOT, 'stage1', 'output.rir'), 'utf8');
  fs.writeFileSync(rirPath, rir);
  const ir = parseRir(rir, language);
  const backend = createCppBackend(target, language);
  const cpp = backend.generate(ir);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, cpp, 'utf8');
  const runtimeDest = path.join(path.dirname(outputPath), 'raz_runtime.hpp');
  if (!fs.existsSync(runtimeDest)) fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), runtimeDest);
  if (run) {
    const binOut = outputPath.replace(/\.cpp$/i, '');
    const cc = spawnSync('c++', [...(target.flags ?? ['-std=c++17']), outputPath, '-o', binOut], { cwd: ROOT, encoding: 'utf8' });
    if (cc.status !== 0) fail(`generated C++ failed:\n${cc.stdout}\n${cc.stderr}`);
    const proc = spawnSync(path.resolve(binOut), [], { cwd: ROOT, encoding: 'utf8' });
    return { rir, cpp, status: proc.status };
  }
  return { rir, cpp, status: 0 };
}

function cli(argv) {
  const args = [...argv];
  if ((args[0] ?? '') === 'version') { console.log('razc-stage4 0.1.0'); return 0; }
  if (args[0] === 'compile') args.shift();
  const source = args.shift();
  if (!source) { console.error('usage: node stage4/host-driver.mjs compile <source.raz> -o <output.cpp> [--run]'); return 2; }
  let output = null, run = false, languagePath = path.join(ROOT, 'raz.language.json'), targetPath = path.join(ROOT, 'cpp17.target.json');
  while (args.length) {
    const a = args.shift();
    if (a === '-o' || a === '--output') output = args.shift();
    else if (a === '--run') run = true;
    else if (a === '--language') languagePath = args.shift();
    else if (a === '--target') targetPath = args.shift();
    else fail(`unknown argument ${a}`);
  }
  if (!output) fail('output is required');
  try {
    const result = compileWithHostFrontend(path.resolve(source), path.resolve(output), { run, languagePath, targetPath });
    console.log(`generated ${output}`);
    if (run) console.log(`program exit=${result.status}`);
    return result.status ?? 0;
  } catch (e) {
    console.error(`razc-stage4: ${e.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = cli(process.argv.slice(2));

export { parseRir, buildStage1, compileWithHostFrontend };
