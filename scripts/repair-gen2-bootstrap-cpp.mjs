#!/usr/bin/env node
// Repair known Gen1 backend inference gaps only for the native bootstrap artifact of Gen2.
// User-program C++ emitted by Gen2 is not passed through this routine.
import fs from 'node:fs';
import path from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/repair-gen2-bootstrap-cpp.mjs <input.cpp> <output.cpp>');
  process.exit(2);
}

const text = fs.readFileSync(input, 'utf8');
const lines = text.split(/\r?\n/);
const functionReturns = new Map();
const structFields = new Map();
const globalTypes = new Map();

const functionSignature = /^(.+?)\s+([A-Za-z_]\w*)\((.*)\)(?:;| \{)$/;
const typeNameDecl = /^\s*(.+?)\s+([A-Za-z_]\w*)\{\};$/;
const structStart = /^struct\s+([A-Za-z_]\w*)\s*\{$/;

let currentStruct = null;
let inFunction = false;
for (const line of lines) {
  if (currentStruct) {
    if (/^};\s*$/.test(line)) { currentStruct = null; continue; }
    const m = line.match(typeNameDecl);
    if (m) structFields.get(currentStruct).set(m[2], m[1].trim());
    continue;
  }
  const sm = line.match(structStart);
  if (sm) { currentStruct = sm[1]; structFields.set(currentStruct, new Map()); continue; }
  const fm = line.match(functionSignature);
  if (fm) {
    const returnType = fm[1].trim();
    const name = fm[2];
    functionReturns.set(name, returnType);
    if (line.endsWith(' {')) inFunction = true;
    else inFunction = false;
    continue;
  }
  if (!inFunction) {
    const gm = line.match(/^([^\s].+?)\s+([A-Za-z_]\w*)\{\};$/);
    if (gm) globalTypes.set(gm[2], gm[1].trim());
  }
  if (line === '}') inFunction = false;
}

function splitTopLevel(expr, operator) {
  let depth = 0, quote = false, escape = false;
  for (let i = 0; i <= expr.length - operator.length; i++) {
    const c = expr[i];
    if (quote) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') { quote = true; continue; }
    if (c === '(' || c === '[' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '>') depth--;
    if (depth === 0 && expr.slice(i, i + operator.length) === operator) return [expr.slice(0, i).trim(), expr.slice(i + operator.length).trim()];
  }
  return null;
}

function stripReference(type) {
  return type.endsWith('&') ? type.slice(0, -1).trim() : type;
}

function inferExpression(rawExpr, vars, depth = 0) {
  if (depth > 12) return null;
  const expr = rawExpr.trim().replace(/^\(+|\)+$/g, '').trim();
  if (!expr) return null;
  if (vars.has(expr)) return stripReference(vars.get(expr));
  if (globalTypes.has(expr)) return stripReference(globalTypes.get(expr));
  if (/^std::string\s*\(/.test(expr)) return 'std::string';
  if (/^std::vector\s*<.*>\s*\{\}/.test(expr)) {
    const m = expr.match(/^(std::vector\s*<.*>)\s*\{\}/);
    return m?.[1]?.replace(/\s+/g, ' ');
  }
  if (/^(?:true|false)$/.test(expr)) return 'bool';
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return expr.includes('.') ? 'double' : 'std::int64_t';
  if (expr === 'nullptr') return 'std::nullptr_t';
  const construct = expr.match(/^([A-Za-z_]\w*)\s*\{\}$/);
  if (construct) return construct[1];

  for (const op of [' == ', ' != ', ' <= ', ' >= ', ' < ', ' > ', ' && ', ' || ']) {
    const pair = splitTopLevel(expr, op);
    if (pair) return 'bool';
  }
  const plus = splitTopLevel(expr, ' + ');
  if (plus) {
    const l = inferExpression(plus[0], vars, depth + 1);
    const r = inferExpression(plus[1], vars, depth + 1);
    if (l === 'std::string' || r === 'std::string') return 'std::string';
    if (l && l.startsWith('std::vector<')) return l;
    if (r && r.startsWith('std::vector<')) return r;
    if (l === 'double' || r === 'double') return 'double';
    return l ?? r;
  }

  const fieldAccess = expr.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)$/);
  if (fieldAccess) {
    const baseExpr = fieldAccess[1];
    const field = fieldAccess[2];
    const baseType = inferExpression(baseExpr, vars, depth + 1);
    const fieldMap = structFields.get(stripReference(baseType ?? ''));
    if (fieldMap?.has(field)) return fieldMap.get(field);
  }

  const indexMatch = expr.match(/^(.+)\[([^\]]+)\]$/);
  if (indexMatch) {
    const baseType = inferExpression(indexMatch[1], vars, depth + 1);
    if (baseType === 'std::string') return 'char';
    const vectorMatch = baseType?.match(/^std::vector\s*<(.+)>$/);
    if (vectorMatch) return vectorMatch[1].trim();
  }

  const call = expr.match(/^([A-Za-z_:][A-Za-z0-9_:]*)\s*\((.*)\)$/);
  if (call) {
    const name = call[1];
    if (name === 'raz::arg_at' || name === 'raz::read_file' || name === 'raz::string_slice' || name === 'raz::string_concat' || name === 'raz::int_to_string') return 'std::string';
    if (name === 'raz::string_length' || name === 'raz::arg_count' || name === 'raz::list_length') return 'std::int64_t';
    if (name === 'raz::list_append') {
      const args = call[2].split(',').map((v) => v.trim());
      return args.length ? inferExpression(args[0], vars, depth + 1) : null;
    }
    const ret = functionReturns.get(name);
    if (ret && ret !== 'void') return stripReference(ret);
  }
  return null;
}

let correctedTemps = 0;
let correctedFunctions = 0;
let inStruct = false;
let functionStart = -1;
let functionName = '';
let functionLines = [];
const outputLines = [];

function repairFunction(block, name) {
  const vars = new Map(globalTypes);
  const header = block[0].match(/^(.+?)\s+([A-Za-z_]\w*)\((.*)\) \{$/);
  if (header) {
    for (const rawParam of header[3].split(',').map((x) => x.trim()).filter(Boolean)) {
      const p = rawParam.match(/^(.+?)\s+([A-Za-z_]\w*)$/);
      if (p) vars.set(p[2], p[1].trim());
    }
  }
  for (const line of block) {
    const decl = line.match(/^\s{4}(.+?)\s+([A-Za-z_]\w*)\{\};$/);
    if (decl) vars.set(decl[2], decl[1].trim());
  }

  // Preserve aliases to large reference parameters in bootstrap C++.
  // Gen1 may lower `state.field` through a temporary copy of the entire
  // ParserState even though `state` is a C++ reference. Keep this repair
  // confined to the temporary bootstrap artifact.
  const referenceBindings = new Map();
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const line of block) {
      const alias = line.match(/^\s{4}(tt\d+)\s*=\s*([A-Za-z_]\w*)\s*;$/);
      if (!alias) continue;
      const [, lhs, rhs] = alias;
      const sourceType = vars.get(rhs);
      if (!sourceType || !sourceType.endsWith('&')) continue;
      if (referenceBindings.get(lhs) !== rhs || vars.get(lhs) !== sourceType) {
        referenceBindings.set(lhs, rhs);
        vars.set(lhs, sourceType);
        changed = true;
      }
    }
    if (!changed) break;
  }

  let localChanges = 0;
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const line of block) {
      const a = line.match(/^\s{4}(tt\d+)\s*=\s*(.*?)\s*;$/);
      if (!a) continue;
      const [, lhs, rhs] = a;
      const current = vars.get(lhs);
      const inferred = inferExpression(rhs, vars);
      if (!inferred || inferred === current || inferred === 'char' || inferred === 'std::nullptr_t') continue;
      // Only repair generated temporaries, leaving user/source locals and parameters unchanged.
      if (/^tt\d+$/.test(lhs)) {
        if (current === 'std::int64_t' || current === 'bool' || current === 'double' || current === undefined) {
          if (inferred !== 'std::int64_t' && inferred !== 'void') {
            vars.set(lhs, inferred);
            changed = true;
            localChanges++;
          }
        }
      }
    }
    if (!changed) break;
  }

  const repaired = block.map((line) => {
    // A value assignment into a reference alias would copy the full struct;
    // the alias declaration below now binds directly to the original ref.
    const assignment = line.match(/^\s{4}(tt\d+)\s*=\s*([A-Za-z_]\w*)\s*;$/);
    if (assignment && referenceBindings.get(assignment[1]) === assignment[2]) return null;

    const decl = line.match(/^(\s{4})(.+?)\s+(tt\d+)\{\};$/);
    if (!decl) return line;
    const [, indent, oldType, temp] = decl;
    const newType = vars.get(temp);
    if (newType && newType !== oldType.trim() && /^tt\d+$/.test(temp)) {
      if (newType.endsWith('&')) {
        const source = referenceBindings.get(temp);
        if (!source) return line; // Never emit an uninitialized C++ reference.
        correctedTemps++;
        return `${indent}${newType} ${temp} = ${source};`;
      }
      correctedTemps++;
      return `${indent}${newType} ${temp}{};`;
    }
    return line;
  }).filter((line) => line !== null);
  if (localChanges) correctedFunctions++;
  return repaired;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (inStruct) {
    outputLines.push(line);
    if (/^};\s*$/.test(line)) inStruct = false;
    continue;
  }
  if (structStart.test(line)) { inStruct = true; outputLines.push(line); continue; }
  const def = line.match(/^(.+?)\s+([A-Za-z_]\w*)\((.*)\) \{$/);
  if (def) {
    if (functionStart >= 0) outputLines.push(...repairFunction(functionLines, functionName));
    functionStart = i;
    functionName = def[2];
    functionLines = [line];
    continue;
  }
  if (functionStart >= 0) {
    functionLines.push(line);
    if (line === '}') {
      outputLines.push(...repairFunction(functionLines, functionName));
      functionStart = -1;
      functionName = '';
      functionLines = [];
    }
  } else {
    outputLines.push(line);
  }
}
if (functionStart >= 0) outputLines.push(...repairFunction(functionLines, functionName));
fs.writeFileSync(output, outputLines.join('\n'), 'utf8');
console.log(`[gen2-bootstrap-repair] corrected ${correctedTemps} temporary declarations across ${correctedFunctions} functions`);
