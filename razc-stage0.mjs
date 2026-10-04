#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/*
 * Raz Stage-0 Compiler
 *
 * Design goals:
 *   source -> tokens -> AST -> typed AST -> linear IR -> passes -> backend
 *
 * This file is deliberately data-oriented and functional: no JS classes, no
 * inheritance, and no C++ runtime implementation hidden inside the compiler.
 *
 * Language semantics come from a language spec JSON file.
 * Target details come from a target profile JSON file.
 *
 * The default specs at the bottom are only bootstrap fallbacks. They can be
 * replaced with --language and --target, which is the important part for
 * self-hosting and extension.
 */

const VERSION = '0.2.0-stage0';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function point(source, line = 1, column = 1) {
  return { source, line, column };
}

function compilerError(message, p = point('<unknown>', 1, 1)) {
  const err = new Error(`${message} at ${p.source}:${p.line}:${p.column}`);
  err.isCompilerError = true;
  err.location = p;
  return err;
}

function fail(message, tokenOrPoint) {
  if (tokenOrPoint?.source !== undefined) {
    throw compilerError(message, tokenOrPoint);
  }
  throw compilerError(message, tokenOrPoint ?? point('<unknown>'));
}

// ---------------------------------------------------------------------------
// Language specification
// ---------------------------------------------------------------------------

const DEFAULT_LANGUAGE = {
  name: 'Raz',
  version: '0.2.0',
  entry: 'main',
  lexer: {
    keywords: [
      'function', 'struct', 'let', 'return', 'if', 'else', 'while',
      'true', 'false', 'new'
    ],
    operators: [
      '==', '!=', '<=', '>=', '&&', '||', '->',
      '+', '-', '*', '/', '%', '<', '>', '!', '=', '.', ',', ':', ';',
      '(', ')', '{', '}', '[', ']'
    ]
  },
  types: {
    void: { kind: 'void' },
    i64: { kind: 'integer', bits: 64, signed: true },
    f64: { kind: 'float', bits: 64 },
    bool: { kind: 'boolean' },
    string: { kind: 'string' },
  },
  operators: {
    '||': { precedence: 10, family: 'logical', result: 'bool', intrinsic: 'or', shortCircuit: true },
    '&&': { precedence: 20, family: 'logical', result: 'bool', intrinsic: 'and', shortCircuit: true },
    '==': { precedence: 30, family: 'compare', result: 'bool', intrinsic: 'eq' },
    '!=': { precedence: 30, family: 'compare', result: 'bool', intrinsic: 'ne' },
    '<':  { precedence: 40, family: 'compare', result: 'bool', intrinsic: 'lt' },
    '<=': { precedence: 40, family: 'compare', result: 'bool', intrinsic: 'le' },
    '>':  { precedence: 40, family: 'compare', result: 'bool', intrinsic: 'gt' },
    '>=': { precedence: 40, family: 'compare', result: 'bool', intrinsic: 'ge' },
    '+':  { precedence: 50, family: 'arithmetic', intrinsic: 'add', overloads: [{ left: 'string', right: 'string', result: 'string', intrinsic: 'string_concat' }] },
    '-':  { precedence: 50, family: 'arithmetic', intrinsic: 'sub' },
    '*':  { precedence: 60, family: 'arithmetic', intrinsic: 'mul' },
    '/':  { precedence: 60, family: 'arithmetic', intrinsic: 'div' },
    '%':  { precedence: 60, family: 'arithmetic', intrinsic: 'mod' },
  },
  unaryOperators: {
    '-': { intrinsic: 'neg' },
    '!': { intrinsic: 'not' },
    '+': { identity: true }
  },
  typeConstructors: {
    List: { kind: 'sequence', arity: 1 },
    Ref: { kind: 'reference', arity: 1 }
  },
  syntax: {
    declarations: { function: 'function', struct: 'struct' },
    statements: { let: 'let', return: 'return', if: 'if', else: 'else', while: 'while' },
    expressions: { new: 'new', true: 'true', false: 'false' },
    punctuation: {
      openParen: '(', closeParen: ')', openBrace: '{', closeBrace: '}',
      openBracket: '[', closeBracket: ']', openGeneric: '<', closeGeneric: '>',
      comma: ',', colon: ':', semicolon: ';', assign: '=', arrow: '->', member: '.'
    }
  },
  builtins: {
    print: {
      params: ['string'], return: 'void', effect: 'io', intrinsic: 'print'
    },
    readFile: {
      params: ['string'], return: 'string', effect: 'io', intrinsic: 'read_file'
    },
    writeFile: {
      params: ['string', 'string'], return: 'void', effect: 'io', intrinsic: 'write_file'
    },
    length: {
      params: ['string'], return: 'i64', effect: 'pure', intrinsic: 'string_length'
    },
    slice: {
      params: ['string', 'i64', 'i64'], return: 'string', effect: 'pure', intrinsic: 'string_slice'
    },
    append: {
      params: ['List<$T>', '$T'], return: 'List<$T>', effect: 'pure', intrinsic: 'list_append', generic: true
    },
    push: {
      params: ['Ref<List<$T>>', '$T'], return: 'void', effect: 'mutation', intrinsic: 'list_push', generic: true
    },
    listLength: {
      params: ['List<$T>'], return: 'i64', effect: 'pure', intrinsic: 'list_length', generic: true
    }
  }
};

const DEFAULT_TARGET = {
  name: 'cpp17',
  compiler: 'c++',
  flags: ['-std=c++17', '-O0'],
  runtime: {
    include: 'raz_runtime.hpp'
  },
  typeConstructors: {
    List: { template: 'std::vector<{T}>' },
    Ref: { template: '{T}&' }
  },
  types: {
    void: 'void',
    i64: 'std::int64_t',
    f64: 'double',
    bool: 'bool',
    string: 'std::string'
  },
  builtins: {
    print: 'raz::print',
    read_file: 'raz::read_file',
    write_file: 'raz::write_file',
    string_length: 'raz::string_length',
    string_slice: 'raz::string_slice',
    list_append: 'raz::list_append',
    list_length: 'raz::list_length'
  },
  intrinsics: {
    add: '(({a}) + ({b}))',
    sub: '(({a}) - ({b}))',
    mul: '(({a}) * ({b}))',
    div: '(({a}) / ({b}))',
    mod: '(({a}) % ({b}))',
    eq: '(({a}) == ({b}))',
    ne: '(({a}) != ({b}))',
    lt: '(({a}) < ({b}))',
    le: '(({a}) <= ({b}))',
    gt: '(({a}) > ({b}))',
    ge: '(({a}) >= ({b}))',
    and: '(({a}) && ({b}))',
    or: '(({a}) || ({b}))',
    neg: '(-({a}))',
    not: '(!({a}))'
  }
};

function mergeSpec(base, override) {
  if (!override || typeof override !== 'object') return structuredClone(base);
  const out = structuredClone(base);
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
        merge(a[k], v);
      } else {
        a[k] = v;
      }
    }
  };
  merge(out, override);
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw compilerError(`cannot read JSON spec ${file}: ${e.message}`, point(file, 1, 1));
  }
}

function normalizeLanguageSpec(language) {
  const out = structuredClone(language);
  const syntax = out.syntax ?? {};
  const syntaxKeywords = [
    ...Object.values(syntax.declarations ?? {}),
    ...Object.values(syntax.statements ?? {}),
    ...Object.values(syntax.expressions ?? {})
  ];
  const syntaxOperators = [
    ...Object.values(syntax.punctuation ?? {}),
    ...Object.keys(out.operators ?? {}),
    ...Object.keys(out.unaryOperators ?? {})
  ];
  out.lexer ??= {};
  out.lexer.keywords = [...new Set(syntaxKeywords)].filter(Boolean);
  out.lexer.operators = [...new Set(syntaxOperators)].filter(Boolean);
  return out;
}

function loadLanguage(file) {
  return normalizeLanguageSpec(file ? mergeSpec(DEFAULT_LANGUAGE, readJson(file)) : DEFAULT_LANGUAGE);
}

function loadTarget(file) {
  return file ? mergeSpec(DEFAULT_TARGET, readJson(file)) : structuredClone(DEFAULT_TARGET);
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

function createLexer(language) {
  const keywordSet = new Set(language.lexer.keywords ?? []);
  const operators = [...(language.lexer.operators ?? [])].sort((a, b) => b.length - a.length);

  return function lex(text, sourceName = '<source>') {
    const tokens = [];
    let i = 0;
    let line = 1;
    let column = 1;

    const peek = (n = 0) => text[i + n] ?? '';
    const advance = () => {
      const ch = text[i++] ?? '';
      if (ch === '\n') { line += 1; column = 1; }
      else { column += 1; }
      return ch;
    };
    const add = (kind, value, l, c) => tokens.push({ kind, value, source: sourceName, line: l, column: c });

    while (i < text.length) {
      const ch = peek();
      if (/\s/.test(ch)) { advance(); continue; }

      if (ch === '/' && peek(1) === '/') {
        while (i < text.length && peek() !== '\n') advance();
        continue;
      }
      if (ch === '/' && peek(1) === '*') {
        const sp = point(sourceName, line, column);
        advance(); advance();
        let closed = false;
        while (i < text.length) {
          if (peek() === '*' && peek(1) === '/') { advance(); advance(); closed = true; break; }
          advance();
        }
        if (!closed) fail('unterminated block comment', sp);
        continue;
      }

      const l = line, c = column;
      if (ch === '"') {
        advance();
        let value = '';
        let closed = false;
        while (i < text.length) {
          const x = peek();
          if (x === '"') { advance(); closed = true; break; }
          if (x === '\\') {
            advance();
            const e = advance();
            const map = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', '0': '\0' };
            value += map[e] ?? e;
          } else {
            value += advance();
          }
        }
        if (!closed) fail('unterminated string literal', point(sourceName, l, c));
        add('string', value, l, c);
        continue;
      }

      if (ch === "'") {
        advance();
        let value;
        if (peek() === '\\') {
          advance();
          const e = advance();
          value = ({ n: '\n', r: '\r', t: '\t', "'": "'", '\\': '\\' })[e] ?? e;
        } else {
          value = advance();
        }
        if (peek() !== "'") fail('character literal must contain one character', point(sourceName, l, c));
        advance();
        add('char', value, l, c);
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        let v = advance();
        while (/[A-Za-z0-9_]/.test(peek())) v += advance();
        add(keywordSet.has(v) ? v : 'identifier', v, l, c);
        continue;
      }

      if (/[0-9]/.test(ch)) {
        let v = advance();
        while (/[0-9]/.test(peek())) v += advance();
        if (peek() === '.' && /[0-9]/.test(peek(1))) {
          v += advance();
          while (/[0-9]/.test(peek())) v += advance();
          add('float', v, l, c);
        } else {
          add('integer', v, l, c);
        }
        continue;
      }

      let matched = null;
      for (const op of operators) {
        if (text.startsWith(op, i)) { matched = op; break; }
      }
      if (matched) {
        for (const _ of matched) advance();
        add(matched, matched, l, c);
        continue;
      }

      fail(`unexpected character ${JSON.stringify(ch)}`, point(sourceName, l, c));
    }

    tokens.push({ kind: 'EOF', value: '', source: sourceName, line, column });
    return tokens;
  };
}

// ---------------------------------------------------------------------------
// AST factories
// ---------------------------------------------------------------------------

function node(kind, loc, fields = {}) { return { kind, ...fields, loc }; }

const AST = {
  program: (loc, declarations) => node('Program', loc, { declarations }),
  function: (loc, name, params, returnType, body) => node('Function', loc, { name, params, returnType, body }),
  parameter: (loc, name, type) => ({ kind: 'Parameter', name, type, loc }),
  struct: (loc, name, fields) => node('Struct', loc, { name, fields }),
  field: (loc, name, type) => ({ kind: 'Field', name, type, loc }),
  block: (loc, statements) => node('Block', loc, { statements }),
  let: (loc, name, type, init) => node('Let', loc, { name, type, init }),
  return: (loc, value) => node('Return', loc, { value }),
  if: (loc, test, thenBranch, elseBranch) => node('If', loc, { test, thenBranch, elseBranch }),
  while: (loc, test, body) => node('While', loc, { test, body }),
  exprStmt: (loc, expr) => node('ExprStmt', loc, { expr }),
  assign: (loc, target, value) => node('Assign', loc, { target, value }),
  name: (loc, value) => node('Name', loc, { value }),
  literal: (loc, type, value) => node('Literal', loc, { type, value }),
  binary: (loc, op, left, right) => node('Binary', loc, { op, left, right }),
  unary: (loc, op, operand) => node('Unary', loc, { op, operand }),
  call: (loc, callee, args) => node('Call', loc, { callee, args }),
  member: (loc, base, name) => node('Member', loc, { base, name }),
  index: (loc, base, index) => node('Index', loc, { base, index }),
  new: (loc, type, args) => node('New', loc, { type, args }),
  list: (loc, items) => node('ListLiteral', loc, { items }),
  typed: (loc, type, expr) => node('TypedExpr', loc, { type, expr })
};

function createParser(language) {
  const binaryPrec = Object.fromEntries(
    Object.entries(language.operators ?? {}).map(([op, spec]) => [op, spec.precedence])
  );
  const syntax = language.syntax ?? {};
  const declarations = syntax.declarations ?? {};
  const statements = syntax.statements ?? {};
  const expressions = syntax.expressions ?? {};
  const punctuation = syntax.punctuation ?? {};
  const syntaxValue = (section, key, fallback) => section[key] ?? fallback;
  const K = {
    function: syntaxValue(declarations, 'function', 'function'),
    struct: syntaxValue(declarations, 'struct', 'struct'),
    let: syntaxValue(statements, 'let', 'let'),
    return: syntaxValue(statements, 'return', 'return'),
    if: syntaxValue(statements, 'if', 'if'),
    else: syntaxValue(statements, 'else', 'else'),
    while: syntaxValue(statements, 'while', 'while'),
    new: syntaxValue(expressions, 'new', 'new'),
    true: syntaxValue(expressions, 'true', 'true'),
    false: syntaxValue(expressions, 'false', 'false')
  };
  const P = {
    openParen: syntaxValue(punctuation, 'openParen', '('),
    closeParen: syntaxValue(punctuation, 'closeParen', ')'),
    openBrace: syntaxValue(punctuation, 'openBrace', '{'),
    closeBrace: syntaxValue(punctuation, 'closeBrace', '}'),
    openBracket: syntaxValue(punctuation, 'openBracket', '['),
    closeBracket: syntaxValue(punctuation, 'closeBracket', ']'),
    openGeneric: syntaxValue(punctuation, 'openGeneric', '<'),
    closeGeneric: syntaxValue(punctuation, 'closeGeneric', '>'),
    comma: syntaxValue(punctuation, 'comma', ','),
    colon: syntaxValue(punctuation, 'colon', ':'),
    semicolon: syntaxValue(punctuation, 'semicolon', ';'),
    assign: syntaxValue(punctuation, 'assign', '='),
    arrow: syntaxValue(punctuation, 'arrow', '->'),
    member: syntaxValue(punctuation, 'member', '.')
  };

  return function parse(tokens) {
    let i = 0;
    const cur = () => tokens[i];
    const take = (kind) => {
      const t = cur();
      if (t.kind !== kind) fail(`expected ${kind}, got ${t.kind}`, t);
      i += 1;
      return t;
    };
    const maybe = (kind) => cur().kind === kind ? (i++, true) : false;
    const loc = t => point(t.source, t.line, t.column);

    function parseType() {
      const first = take('identifier');
      let type = { kind: 'NamedType', name: first.value, args: [] };
      if (maybe(P.openGeneric)) {
        type.args.push(parseType());
        while (maybe(P.comma)) type.args.push(parseType());
        take(P.closeGeneric);
      }
      return type;
    }

    function parseBlock() {
      const t = take(P.openBrace);
      const statements = [];
      while (cur().kind !== P.closeBrace && cur().kind !== 'EOF') statements.push(parseStatement());
      take(P.closeBrace);
      return AST.block(loc(t), statements);
    }

    function parseControlledBody() {
      if (cur().kind === P.openBrace) return parseBlock();
      const statement = parseStatement();
      return AST.block(statement.loc, [statement]);
    }

    function parseIfStatement() {
      const t = take(K.if);
      take(P.openParen);
      const test = parseExpression();
      take(P.closeParen);
      const thenBranch = parseControlledBody();
      let elseBranch = null;
      if (maybe(K.else)) {
        if (cur().kind === K.if) {
          const nested = parseIfStatement();
          elseBranch = AST.block(nested.loc, [nested]);
        } else {
          elseBranch = parseControlledBody();
        }
      }
      return AST.if(loc(t), test, thenBranch, elseBranch);
    }

    function parseStatement() {
      const t = cur();
      if (maybe(K.let)) {
        const name = take('identifier');
        let type = null;
        if (maybe(P.colon)) type = parseType();
        take(P.assign);
        const init = parseExpression();
        take(P.semicolon);
        return AST.let(loc(t), name.value, type, init);
      }
      if (maybe(K.return)) {
        const value = cur().kind === P.semicolon ? null : parseExpression();
        take(P.semicolon);
        return AST.return(loc(t), value);
      }
      if (cur().kind === K.if) return parseIfStatement();
      if (maybe(K.while)) {
        take(P.openParen);
        const test = parseExpression();
        take(P.closeParen);
        return AST.while(loc(t), test, parseControlledBody());
      }

      const expr = parseExpression();
      if (maybe(P.assign)) {
        const value = parseExpression();
        take(P.semicolon);
        return AST.assign(loc(t), expr, value);
      }
      take(P.semicolon);
      return AST.exprStmt(loc(t), expr);
    }

    function parsePrimary() {
      const t = cur();
      if (maybe('integer')) return AST.literal(loc(t), 'integer', Number.parseInt(t.value, 10));
      if (maybe('float')) return AST.literal(loc(t), 'float', Number.parseFloat(t.value));
      if (maybe('string')) return AST.literal(loc(t), 'string', t.value);
      if (maybe('char')) return AST.literal(loc(t), 'char', t.value.charCodeAt(0));
      if (maybe(K.true)) return AST.literal(loc(t), 'bool', true);
      if (maybe(K.false)) return AST.literal(loc(t), 'bool', false);
      if (maybe('identifier')) {
        let expr = AST.name(loc(t), t.value);
        if (cur().kind === '::') fail('qualified names are not in Stage-0 syntax yet', cur());
        return parsePostfix(expr);
      }
      if (maybe(K.new)) {
        const type = parseType();
        take(P.openParen);
        const args = [];
        if (cur().kind !== P.closeParen) {
          args.push(parseExpression());
          while (maybe(P.comma)) args.push(parseExpression());
        }
        take(P.closeParen);
        return parsePostfix(AST.new(loc(t), type, args));
      }
      if (maybe(P.openParen)) {
        const expr = parseExpression();
        take(P.closeParen);
        return parsePostfix(expr);
      }
      if (maybe(P.openBracket)) {
        const items = [];
        if (cur().kind !== P.closeBracket) {
          items.push(parseExpression());
          while (maybe(P.comma)) items.push(parseExpression());
        }
        take(P.closeBracket);
        return parsePostfix(AST.list(loc(t), items));
      }
      fail(`expected expression, got ${t.kind}`, t);
    }

    function parsePostfix(expr) {
      while (true) {
        if (maybe(P.openParen)) {
          const args = [];
          if (cur().kind !== P.closeParen) {
            args.push(parseExpression());
            while (maybe(P.comma)) args.push(parseExpression());
          }
          take(P.closeParen);
          expr = AST.call(expr.loc, expr, args);
          continue;
        }
        if (maybe(P.member)) {
          const member = take('identifier');
          expr = AST.member(expr.loc, expr, member.value);
          continue;
        }
        if (maybe(P.openBracket)) {
          const index = parseExpression();
          take(P.closeBracket);
          expr = AST.index(expr.loc, expr, index);
          continue;
        }
        return expr;
      }
    }

    function parseUnary() {
      const t = cur();
      if (Object.prototype.hasOwnProperty.call(language.unaryOperators ?? {}, t.kind)) {
        i += 1;
        return AST.unary(loc(t), t.kind, parseUnary());
      }
      return parsePrimary();
    }

    function parseExpression(minPrec = 0) {
      let left = parseUnary();
      while (Object.prototype.hasOwnProperty.call(binaryPrec, cur().kind) && binaryPrec[cur().kind] >= minPrec) {
        const op = take(cur().kind);
        const p = binaryPrec[op.kind];
        const right = parseExpression(p + 1);
        left = AST.binary(loc(op), op.kind, left, right);
      }
      return left;
    }

    function parseFunction() {
      const start = take(K.function);
      const name = take('identifier');
      take(P.openParen);
      const params = [];
      if (cur().kind !== P.closeParen) {
        while (true) {
          const p = take('identifier');
          take(P.colon);
          params.push(AST.parameter(loc(p), p.value, parseType()));
          if (!maybe(P.comma)) break;
        }
      }
      take(P.closeParen);
      let returnType = { kind: 'NamedType', name: 'void', args: [] };
      if (maybe(P.arrow)) returnType = parseType();
      return AST.function(loc(start), name.value, params, returnType, parseBlock());
    }

    function parseStruct() {
      const start = take(K.struct);
      const name = take('identifier');
      take(P.openBrace);
      const fields = [];
      while (cur().kind !== P.closeBrace) {
        const f = take('identifier');
        take(P.colon);
        fields.push(AST.field(loc(f), f.value, parseType()));
        take(P.semicolon);
      }
      take(P.closeBrace);
      return AST.struct(loc(start), name.value, fields);
    }

    function parseProgram() {
      const declarations = [];
      const start = cur();
      while (cur().kind !== 'EOF') {
        if (cur().kind === K.function) declarations.push(parseFunction());
        else if (cur().kind === K.struct) declarations.push(parseStruct());
        else fail(`expected top-level declaration, got ${cur().kind}`, cur());
      }
      return AST.program(loc(start), declarations);
    }

    return parseProgram();
  };
}

// ---------------------------------------------------------------------------
// Type utilities
// ---------------------------------------------------------------------------

function typeName(type) {
  if (!type) return '<unknown>';
  if (typeof type === 'string') return type;
  if (type.kind === 'NamedType') {
    return type.args?.length ? `${type.name}<${type.args.map(typeName).join(',')}>` : type.name;
  }
  return type.name ?? '<type>';
}

function typeEquals(a, b) { return typeName(a) === typeName(b); }

function baseType(t) {
  const n = typeName(t);
  const m = /^([^<]+)</.exec(n);
  return m ? m[1] : n;
}

function typeArgs(t) {
  const n = typeName(t);
  const p = n.indexOf('<');
  if (p < 0) return [];
  return n.slice(p + 1, -1).split(',').map(s => s.trim()).filter(Boolean);
}

function isIntegerSpec(language, t) { return language.types[t]?.kind === 'integer'; }
function isFloatSpec(language, t) { return language.types[t]?.kind === 'float'; }
function isNumeric(language, t) { return isIntegerSpec(language, t) || isFloatSpec(language, t); }
function genericTypeSpec(language, t) { return language.typeConstructors?.[baseType(t)] ?? null; }
function isGenericType(language, t, kind = null) {
  const spec = genericTypeSpec(language, t);
  return !!spec && (kind == null || spec.kind === kind);
}
function operatorResolution(language, op, leftType, rightType) {
  const spec = language.operators?.[op];
  if (!spec) return null;
  for (const overload of spec.overloads ?? []) {
    if (overload.left === leftType && overload.right === rightType) return { ...spec, ...overload };
  }
  return spec;
}

function substituteTypeVars(t, vars) {
  if (!t) return t;
  const n = typeName(t);
  if (n.startsWith('$')) return vars[n] ?? n;
  if (n.includes('<')) {
    const b = baseType(n);
    return `${b}<${typeArgs(n).map(x => substituteTypeVars(x, vars)).join(',')}>`;
  }
  return n;
}

function matchTypePattern(pattern, actual, vars) {
  const p = typeName(pattern);
  const a = typeName(actual);
  if (baseType(p) === 'Ref' && typeArgs(p).length === 1) {
    return matchTypePattern(typeArgs(p)[0], a, vars);
  }
  if (p.startsWith('$')) {
    if (vars[p] && vars[p] !== a) return false;
    vars[p] = a;
    return true;
  }
  if (p.includes('<')) {
    if (baseType(p) !== baseType(a)) return false;
    const pa = typeArgs(p), aa = typeArgs(a);
    if (pa.length !== aa.length) return false;
    return pa.every((x, i) => matchTypePattern(x, aa[i], vars));
  }
  return p === a;
}

function normalizeType(type, aliases = {}) {
  if (!type) return null;
  const n = typeName(type);
  if (aliases[n]) return aliases[n];
  if (n.includes('<')) {
    const b = baseType(n);
    return `${aliases[b] ?? b}<${typeArgs(n).map(x => aliases[x] ?? x).join(',')}>`;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Semantic analysis -> typed program
// ---------------------------------------------------------------------------

function createAnalyzer(language) {
  return function analyze(program) {
    const structs = new Map();
    const functions = new Map();
    const aliases = Object.fromEntries(Object.entries(language.aliases ?? {}));

    function parameterValueType(t) {
      const n = normalizeType(t, aliases);
      return baseType(n) === 'Ref' ? typeArgs(n)[0] : n;
    }

    for (const d of program.declarations) {
      if (d.kind === 'Struct') {
        if (structs.has(d.name)) fail(`duplicate struct ${d.name}`, d.loc);
        const fields = new Map();
        for (const f of d.fields) {
          if (fields.has(f.name)) fail(`duplicate field ${d.name}.${f.name}`, f.loc);
          const ft = normalizeType(f.type, aliases);
          validateType(ft, f.loc, false);
          fields.set(f.name, ft);
        }
        structs.set(d.name, fields);
      }
    }

    for (const d of program.declarations) {
      if (d.kind !== 'Function') continue;
      if (functions.has(d.name)) fail(`duplicate function ${d.name}`, d.loc);
      const params = d.params.map(p => normalizeType(p.type, aliases));
      params.forEach((t, idx) => validateType(t, d.params[idx].loc, false));
      const ret = normalizeType(d.returnType, aliases);
      validateType(ret, d.loc, true);
      functions.set(d.name, { params, returnType: ret, node: d, builtin: false });
    }

    for (const [name, spec] of Object.entries(language.builtins ?? {})) {
      if (functions.has(name)) continue;
      const params = (spec.params ?? []).map(x => normalizeType(x, aliases));
      const ret = normalizeType(spec.return ?? 'void', aliases);
      if (!spec.generic) {
        params.forEach(t => validateType(t, point('<language-spec>', 1, 1), false));
        validateType(ret, point('<language-spec>', 1, 1), true);
      }
      functions.set(name, { params, returnType: ret, node: null, builtin: true, builtinSpec: spec });
    }

    const typedFunctions = new Map();

    for (const d of program.declarations) {
      if (d.kind !== 'Function') continue;
      const scope = new Map();
      for (let j = 0; j < d.params.length; j++) scope.set(d.params[j].name, parameterValueType(d.params[j].type));
      const typedBody = analyzeBlock(d.body, scope, functions, structs, d, null);
      const ret = normalizeType(d.returnType, aliases);
      if (ret !== 'void' && !guaranteesReturn(typedBody)) fail(`function ${d.name} may finish without returning ${ret}`, d.loc);
      typedFunctions.set(d.name, { ...functions.get(d.name), node: { ...d, typedBody } });
    }

    const entry = language.entry ?? 'main';
    if (!functions.has(entry) || functions.get(entry).builtin) {
      fail(`entry function ${entry}() is required`, program.loc);
    }

    return { program, structs, functions, typedFunctions, aliases };

    function validateType(t, loc, allowVoid) {
      if (!t) fail('missing type', loc);
      if (language.types[t]) {
        if (t === 'void' && !allowVoid) fail('void is not allowed here', loc);
        return;
      }
      const b = baseType(t);
      if (structs.has(b)) return;
      const constructor = language.typeConstructors?.[b];
      if (constructor && typeArgs(t).length === constructor.arity) {
        for (const arg of typeArgs(t)) validateType(arg, loc, false);
        return;
      }
      fail(`unknown type ${t}`, loc);
    }

    function assignable(expected, actual) {
      if (baseType(expected) === 'Ref') return typeArgs(expected).length === 1 && typeEquals(typeArgs(expected)[0], actual);
      if (expected === actual) return true;
      if (isNumeric(language, expected) && isNumeric(language, actual)) {
        const e = language.types[expected];
        const a = language.types[actual];
        return (a.bits ?? 0) <= (e.bits ?? 0) && (!!e.signed === !!a.signed || !e.signed);
      }
      return false;
    }

    function lookup(scope, name, loc) {
      if (scope.has(name)) return scope.get(name);
      fail(`unknown name ${name}`, loc);
    }

    function sequenceTypeName() {
      const found = Object.entries(language.typeConstructors ?? {}).find(([, spec]) => spec.kind === 'sequence');
      return found?.[0] ?? null;
    }

    function inferCollectionLiteral(expr, scope) {
      if (expr.items.length === 0) fail('empty sequence literal requires an expected type', expr.loc);
      const values = expr.items.map(x => inferExpr(x, scope));
      let t = values[0].type;
      for (const v of values.slice(1)) {
        if (!typeEquals(t, v.type)) {
          if (isNumeric(language, t) && isNumeric(language, v.type)) {
            t = (language.types[v.type].bits ?? 0) > (language.types[t].bits ?? 0) ? v.type : t;
          } else {
            fail(`incompatible list element types ${t} and ${v.type}`, expr.loc);
          }
        }
      }
      const ctor = sequenceTypeName();
      if (!ctor) fail('the language defines no sequence type constructor', expr.loc);
      return { ...expr, items: values.map(v => v.node), type: `${ctor}<${t}>` };
    }

    function inferExpr(expr, scope, expected = null) {
      switch (expr.kind) {
        case 'Literal': {
          const type = expr.type === 'integer' ? 'i64' : expr.type === 'float' ? 'f64' : expr.type === 'bool' ? 'bool' : expr.type;
          return { node: { ...expr, type }, type };
        }
        case 'Name': {
          const type = lookup(scope, expr.value, expr.loc);
          return { node: { ...expr, type }, type };
        }
        case 'ListLiteral': {
          if (expected && isGenericType(language, expected, 'sequence')) {
            const et = typeArgs(expected)[0];
            const items = expr.items.map(x => {
              const r = inferExpr(x, scope, et);
              if (!assignable(et, r.type)) fail(`cannot put ${r.type} into ${expected}`, x.loc);
              return r.node;
            });
            return { node: { ...expr, items, type: expected }, type: expected };
          }
          return inferCollectionLiteral(expr, scope);
        }
        case 'New': {
          const t = normalizeType(expr.type, aliases);
          validateType(t, expr.loc, false);
          const args = expr.args.map(x => inferExpr(x, scope));
          if (structs.has(baseType(t))) {
            const fields = [...structs.get(baseType(t)).entries()];
            if (args.length !== 0 && args.length !== fields.length) fail(`new ${t} expects zero args or one argument per field`, expr.loc);
            if (args.length) {
              for (let j = 0; j < args.length; j++) {
                const expectedField = fields[j][1];
                if (!assignable(expectedField, args[j].type)) {
                  fail(`new ${t} field ${fields[j][0]} expects ${expectedField}, got ${args[j].type}`, expr.args[j].loc);
                }
              }
            }
          } else if (baseType(t) === 'List') {
            if (args.length) fail('List construction takes no constructor arguments in Stage-0', expr.loc);
          }
          return { node: { ...expr, type: t, args: args.map(x => x.node) }, type: t };
        }
        case 'Unary': {
          const v = inferExpr(expr.operand, scope);
          if (expr.op === '!') {
            if (v.type !== 'bool') fail('! requires bool', expr.loc);
            return { node: { ...expr, operand: v.node, type: 'bool' }, type: 'bool' };
          }
          if (!isNumeric(language, v.type)) fail(`${expr.op} requires numeric operand`, expr.loc);
          return { node: { ...expr, operand: v.node, type: v.type }, type: v.type };
        }
        case 'Binary': {
          const rawSpec = language.operators[expr.op];
          if (!rawSpec) fail(`operator ${expr.op} is not defined by the language`, expr.loc);
          const a = inferExpr(expr.left, scope);
          const b = inferExpr(expr.right, scope);
          const opSpec = operatorResolution(language, expr.op, a.type, b.type);
          let t;
          if (opSpec.family === 'logical') {
            if (a.type !== 'bool' || b.type !== 'bool') fail(`${expr.op} requires bool operands`, expr.loc);
            t = 'bool';
          } else if (opSpec.family === 'compare') {
            if (a.type !== b.type && !(isNumeric(language, a.type) && isNumeric(language, b.type))) {
              fail(`cannot compare ${a.type} and ${b.type}`, expr.loc);
            }
            t = opSpec.result ?? 'bool';
          } else if (opSpec.family === 'arithmetic') {
            if (opSpec.result) t = opSpec.result;
            else if (expr.op === '+' && a.type === 'string' && b.type === 'string') t = 'string';
            else {
              if (!isNumeric(language, a.type) || !isNumeric(language, b.type)) fail(`${expr.op} requires numeric operands`, expr.loc);
              t = (language.types[a.type].bits ?? 0) >= (language.types[b.type].bits ?? 0) ? a.type : b.type;
            }
          } else {
            fail(`unsupported operator family ${opSpec.family}`, expr.loc);
          }
          return { node: { ...expr, left: a.node, right: b.node, type: t }, type: t };
        }
        case 'Call': {
          const callee = expr.callee.kind === 'Name' ? expr.callee.value : null;
          if (!callee) fail('Stage-0 calls require a direct function name', expr.callee.loc);
          const sig = functions.get(callee);
          if (!sig) fail(`unknown function ${callee}`, expr.callee.loc);
          if (expr.args.length !== sig.params.length) fail(`function ${callee} expects ${sig.params.length} args, got ${expr.args.length}`, expr.loc);
          const args = [];
          const genericVars = {};
          for (let j = 0; j < expr.args.length; j++) {
            const r = inferExpr(expr.args[j], scope, null);
            const pattern = sig.params[j];
            if (baseType(pattern) === 'Ref' && !['Name', 'Member', 'Index'].includes(expr.args[j].kind)) {
              fail(`argument ${j + 1} to reference parameter must be an lvalue`, expr.args[j].loc);
            }
            if (sig.builtin && sig.builtinSpec?.generic) {
              if (!matchTypePattern(pattern, r.type, genericVars)) {
                fail(`argument ${j + 1}: type ${r.type} does not match ${pattern}`, expr.args[j].loc);
              }
              const expected = substituteTypeVars(pattern, genericVars);
              if (!assignable(expected, r.type)) fail(`argument ${j + 1}: cannot pass ${r.type} to ${expected}`, expr.args[j].loc);
            } else if (!assignable(pattern, r.type)) {
              fail(`argument ${j + 1}: cannot pass ${r.type} to ${pattern}`, expr.args[j].loc);
            }
            args.push(r.node);
          }
          const resultType = sig.builtin && sig.builtinSpec?.generic
            ? substituteTypeVars(sig.returnType, genericVars)
            : sig.returnType;
          return { node: { ...expr, callee: { ...expr.callee, type: `fn<${sig.params.join(',')}->${sig.returnType}>` }, args, type: resultType, builtin: sig.builtin, builtinSpec: sig.builtinSpec }, type: resultType };
        }
        case 'Member': {
          const b = inferExpr(expr.base, scope);
          const bt = baseType(b.type);
          if (!structs.has(bt)) fail(`type ${b.type} has no fields`, expr.loc);
          const f = structs.get(bt).get(expr.name);
          if (!f) fail(`${bt} has no field ${expr.name}`, expr.loc);
          return { node: { ...expr, base: b.node, type: f }, type: f };
        }
        case 'Index': {
          const b = inferExpr(expr.base, scope);
          const idx = inferExpr(expr.index, scope, 'i64');
          if (!assignable('i64', idx.type)) fail('index must be i64', expr.index.loc);
          if (isGenericType(language, b.type, 'sequence')) {
            const et = typeArgs(b.type)[0];
            return { node: { ...expr, base: b.node, index: idx.node, type: et }, type: et };
          }
          if (b.type === 'string') return { node: { ...expr, base: b.node, index: idx.node, type: 'i64' }, type: 'i64' };
          fail(`type ${b.type} is not indexable`, expr.loc);
        }
        default:
          fail(`unsupported expression ${expr.kind}`, expr.loc);
      }
    }

    function guaranteesReturn(block) {
      for (const s of block.statements) {
        if (s.kind === 'Return') return true;
        if (s.kind === 'If' && s.elseBranch && guaranteesReturn(s.thenBranch) && guaranteesReturn(s.elseBranch)) return true;
      }
      return false;
    }

    function analyzeBlock(block, scope, fnMap, structMap, fnNode, expectedReturn) {
      const out = [];
      for (const s of block.statements) {
        if (s.kind === 'Let') {
          if (scope.has(s.name)) fail(`variable ${s.name} already defined`, s.loc);
          const declared = s.type ? normalizeType(s.type, aliases) : null;
          if (declared) validateType(declared, s.loc, false);
          const r = inferExpr(s.init, scope, declared);
          const actual = declared ?? r.type;
          if (!assignable(actual, r.type)) fail(`cannot initialize ${actual} with ${r.type}`, s.loc);
          scope.set(s.name, actual);
          out.push({ ...s, type: actual, init: r.node });
        } else if (s.kind === 'Return') {
          const r = s.value ? inferExpr(s.value, scope, normalizeType(fnNode.returnType, aliases)) : { node: null, type: 'void' };
          const expected = normalizeType(fnNode.returnType, aliases);
          if (!assignable(expected, r.type)) fail(`returning ${r.type} from function returning ${expected}`, s.loc);
          out.push({ ...s, value: r.node, type: r.type });
        } else if (s.kind === 'ExprStmt') {
          const r = inferExpr(s.expr, scope);
          out.push({ ...s, expr: r.node, type: r.type });
        } else if (s.kind === 'Assign') {
          const target = inferExpr(s.target, scope);
          if (!['Name', 'Member', 'Index'].includes(target.node.kind)) fail('assignment target must be a name, member, or index', s.target.loc);
          const r = inferExpr(s.value, scope, target.type);
          if (!assignable(target.type, r.type)) fail(`cannot assign ${r.type} to ${target.type}`, s.value.loc);
          out.push({ ...s, target: target.node, value: r.node, type: target.type });
        } else if (s.kind === 'If') {
          const t = inferExpr(s.test, scope);
          if (t.type !== 'bool') fail('if condition must be bool', s.test.loc);
          const thenScope = new Map(scope);
          const elseScope = new Map(scope);
          const tb = analyzeBlock(s.thenBranch, thenScope, fnMap, structMap, fnNode, expectedReturn);
          const eb = s.elseBranch ? analyzeBlock(s.elseBranch, elseScope, fnMap, structMap, fnNode, expectedReturn) : null;
          out.push({ ...s, test: t.node, thenBranch: tb, elseBranch: eb });
        } else if (s.kind === 'While') {
          const t = inferExpr(s.test, scope);
          if (t.type !== 'bool') fail('while condition must be bool', s.test.loc);
          const bodyScope = new Map(scope);
          const body = analyzeBlock(s.body, bodyScope, fnMap, structMap, fnNode, expectedReturn);
          out.push({ ...s, test: t.node, body });
        } else {
          fail(`unsupported statement ${s.kind}`, s.loc);
        }
      }
      return AST.block(block.loc, out);
    }
  };
}

// ---------------------------------------------------------------------------
// Lowering AST -> target-independent IR
// ---------------------------------------------------------------------------

function createIRBuilder(language) {
  let nextValue = 0;
  let nextBlock = 0;
  const functions = [];

  const value = hint => `%v${++nextValue}${hint ? `_${hint}` : ''}`;
  const blockId = () => `b${++nextBlock}`;

  function lowerProgram(typed) {
    nextValue = 0;
    nextBlock = 0;
    const out = {
      kind: 'IRModule',
      structs: [],
      functions: []
    };
    for (const [name, fields] of typed.structs.entries()) {
      out.structs.push({ name, fields: [...fields.entries()].map(([field, type]) => ({ field, type })) });
    }
    for (const fn of typed.typedFunctions.values()) out.functions.push(lowerFunction(fn, typed));
    return out;
  }

  function lowerFunction(fn, typed) {
    const blocks = [];
    const entry = { id: blockId(), instructions: [], terminated: false };
    blocks.push(entry);
    let current = entry;
    const locals = new Map();

    for (let i = 0; i < fn.params.length; i++) {
      locals.set(fn.node.params[i].name, { kind: 'param', name: fn.node.params[i].name, type: fn.params[i] });
    }

    function fresh(kind = 'tmp') { return value(kind); }
    function emit(op, fields = {}) {
      if (current.terminated) throw new Error('internal: emit after terminator');
      const ins = { op, ...fields };
      current.instructions.push(ins);
      return ins;
    }
    function terminate(op, fields = {}) {
      emit(op, fields);
      current.terminated = true;
    }
    function newBlock(label = '') {
      const b = { id: blockId(), label, instructions: [], terminated: false };
      blocks.push(b);
      return b;
    }
    function switchBlock(b) { current = b; }

    function lowerShortCircuit(expr) {
      const left = lowerExpr(expr.left);
      const resultName = `__logic_${++nextValue}`;
      emit('local', { name: resultName, type: 'bool' });
      const rhsBlock = newBlock(expr.op === '&&' ? 'and.rhs' : 'or.rhs');
      const shortBlock = newBlock(expr.op === '&&' ? 'and.short' : 'or.short');
      const joinBlock = newBlock('logic.join');
      terminate('branch', expr.op === '&&' ? { cond: left, then: rhsBlock.id, else: shortBlock.id } : { cond: left, then: shortBlock.id, else: rhsBlock.id });

      switchBlock(rhsBlock);
      const right = lowerExpr(expr.right);
      emit('store_var', { name: resultName, value: right, type: 'bool' });
      if (!current.terminated) terminate('jump', { target: joinBlock.id });

      switchBlock(shortBlock);
      const shortValue = fresh('logic');
      emit('const', { result: shortValue, type: 'bool', value: expr.op === '&&' ? false : true });
      emit('store_var', { name: resultName, value: shortValue, type: 'bool' });
      if (!current.terminated) terminate('jump', { target: joinBlock.id });

      switchBlock(joinBlock);
      const result = fresh('logic');
      emit('load_var', { result, name: resultName, type: 'bool' });
      return result;
    }

    function lowerPlace(expr) {
      if (expr.kind === 'Name') {
        const r = fresh('ref');
        emit('ref_var', { result: r, name: expr.value, type: expr.type });
        return r;
      }
      if (expr.kind === 'Member') {
        const base = lowerPlace(expr.base);
        const r = fresh('ref');
        emit('ref_field', { result: r, base, field: expr.name, type: expr.type });
        return r;
      }
      if (expr.kind === 'Index') {
        const base = lowerPlace(expr.base);
        const index = lowerExpr(expr.index);
        const r = fresh('ref');
        emit('ref_index', { result: r, base, index, type: expr.type });
        return r;
      }
      throw new Error(`internal: expected lvalue, got ${expr.kind}`);
    }

    function lowerExpr(expr) {
      switch (expr.kind) {
        case 'Literal': {
          const r = fresh('const');
          emit('const', { result: r, type: expr.type, value: expr.value });
          return r;
        }
        case 'Name': {
          const place = locals.get(expr.value);
          if (!place) throw new Error(`internal: missing local ${expr.value}`);
          if (place.kind === 'param' && baseType(place.type) === 'Ref') {
            const r = fresh('ref');
            emit('ref_var', { result: r, name: expr.value, type: place.type });
            return r;
          }
          const r = fresh('load');
          emit('load_var', { result: r, name: expr.value, type: place.type });
          return r;
        }
        case 'ListLiteral': {
          const r = fresh('list');
          emit('make_list', { result: r, type: expr.type, items: expr.items.map(lowerExpr) });
          return r;
        }
        case 'New': {
          const r = fresh('new');
          emit('new', { result: r, type: expr.type, args: expr.args.map(lowerExpr) });
          return r;
        }
        case 'Unary': {
          const a = lowerExpr(expr.operand);
          const r = fresh('un');
          const spec = language.unaryOperators?.[expr.op] ?? {};
          if (spec.identity) return a;
          const intrinsic = spec.intrinsic;
          emit('unary', { result: r, type: expr.type, intrinsic, operand: a });
          return r;
        }
        case 'Binary': {
          const opSpec = operatorResolution(language, expr.op, expr.left.type, expr.right.type);
          if (opSpec?.shortCircuit) return lowerShortCircuit(expr);
          const a = lowerExpr(expr.left);
          const b = lowerExpr(expr.right);
          const r = fresh('bin');
          const intrinsic = opSpec?.intrinsic;
          if (!intrinsic) throw new Error(`internal: operator ${expr.op} has no intrinsic mapping`);
          emit('binary', { result: r, type: expr.type, intrinsic, left: a, right: b });
          return r;
        }
        case 'Call': {
          const callee = expr.callee.value;
          const signature = typed.functions.get(callee);
          const args = expr.args.map((arg, i) => {
            const expected = signature?.params?.[i];
            if (expected && baseType(expected) === 'Ref') {
              return lowerPlace(arg);
            }
            return lowerExpr(arg);
          });
          if (expr.builtin) {
            const r = expr.type === 'void' ? null : fresh('call');
            emit('builtin', { result: r, type: expr.type, intrinsic: expr.builtinSpec?.intrinsic ?? callee, args });
            return r;
          }
          const r = expr.type === 'void' ? null : fresh('call');
          emit('call', { result: r, type: expr.type, callee, args });
          return r;
        }
        case 'Member': {
          const base = lowerExpr(expr.base);
          const r = fresh('field');
          emit('field_get', { result: r, type: expr.type, base, field: expr.name });
          return r;
        }
        case 'Index': {
          const base = lowerExpr(expr.base);
          const index = lowerExpr(expr.index);
          const r = fresh('index');
          emit('index_get', { result: r, type: expr.type, base, index });
          return r;
        }
        default: throw new Error(`internal: cannot lower expr ${expr.kind}`);
      }
    }

    function store(target, src) {
      if (target.kind === 'Name') {
        const place = locals.get(target.value);
        if (!place) throw new Error(`internal: assignment to unknown local ${target.value}`);
        emit('store_var', { name: target.value, value: src, type: target.type });
        return;
      }
      const ref = lowerPlace(target);
      emit('store_ref', { ref, value: src, type: target.type });
    }

    function lowerBlock(block) {
      for (const s of block.statements) {
        lowerStmt(s);
        if (current.terminated) break;
      }
    }

    function lowerStmt(s) {
      if (s.kind === 'Let') {
        const type = s.type ?? s.init.type;
        const r = lowerExpr(s.init);
        locals.set(s.name, { kind: 'local', type });
        emit('local', { name: s.name, type });
        emit('store_var', { name: s.name, value: r, type });
        return;
      }
      if (s.kind === 'ExprStmt') { lowerExpr(s.expr); return; }
      if (s.kind === 'Assign') { const v = lowerExpr(s.value); store(s.target, v); return; }
      if (s.kind === 'Return') {
        const v = s.value ? lowerExpr(s.value) : null;
        terminate('return', { value: v, type: s.type });
        return;
      }
      if (s.kind === 'If') {
        const cond = lowerExpr(s.test);
        const thenB = newBlock('if.then');
        const elseB = s.elseBranch ? newBlock('if.else') : null;
        const joinB = newBlock('if.join');
        terminate('branch', { cond, then: thenB.id, else: elseB?.id ?? joinB.id });
        switchBlock(thenB);
        lowerBlock(s.thenBranch);
        if (!current.terminated) terminate('jump', { target: joinB.id });
        if (elseB) {
          switchBlock(elseB);
          lowerBlock(s.elseBranch);
          if (!current.terminated) terminate('jump', { target: joinB.id });
        }
        switchBlock(joinB);
        return;
      }
      if (s.kind === 'While') {
        const head = newBlock('while.head');
        const body = newBlock('while.body');
        const done = newBlock('while.done');
        if (!current.terminated) terminate('jump', { target: head.id });
        switchBlock(head);
        const cond = lowerExpr(s.test);
        terminate('branch', { cond, then: body.id, else: done.id });
        switchBlock(body);
        lowerBlock(s.body);
        if (!current.terminated) terminate('jump', { target: head.id });
        switchBlock(done);
        return;
      }
      throw new Error(`internal: unsupported stmt ${s.kind}`);
    }

    lowerBlock(fn.node.typedBody);
    if (!current.terminated) {
      if (fn.returnType === 'void') terminate('return', { value: null, type: 'void' });
      else terminate('return_default', { type: fn.returnType });
    }

    return {
      name: fn.node.name,
      params: fn.params.map((type, i) => ({ name: fn.node.params[i].name, type })),
      returnType: fn.returnType,
      blocks
    };
  }

  return { lowerProgram };
}

// ---------------------------------------------------------------------------
// IR passes
// ---------------------------------------------------------------------------

function createPasses(language) {
  function constantFold(module) {
    const pureOps = new Set(['add', 'sub', 'mul', 'div', 'mod', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'and', 'or', 'neg', 'not']);
    const consts = new Map();
    const evalBinary = (op, a, b) => {
      switch (op) {
        case 'add': return a + b; case 'sub': return a - b; case 'mul': return a * b;
        case 'div': return a / b; case 'mod': return a % b; case 'eq': return a === b;
        case 'ne': return a !== b; case 'lt': return a < b; case 'le': return a <= b;
        case 'gt': return a > b; case 'ge': return a >= b; case 'and': return a && b; case 'or': return a || b;
      }
      return undefined;
    };
    for (const fn of module.functions) {
      const next = [];
      for (const block of fn.blocks) {
        const ins = [];
        for (const x of block.instructions) {
          if (x.op === 'const') consts.set(x.result, x.value);
          if (x.op === 'binary' && pureOps.has(x.intrinsic) && consts.has(x.left) && consts.has(x.right)) {
            const a = consts.get(x.left), b = consts.get(x.right);
            const v = evalBinary(x.intrinsic, a, b);
            if ((v !== undefined && (typeof v === 'boolean' || Number.isFinite(v)))) {
              const y = { op: 'const', result: x.result, type: x.type, value: v };
              consts.set(x.result, v);
              ins.push(y);
              continue;
            }
          }
          if (x.op === 'unary' && consts.has(x.operand)) {
            const a = consts.get(x.operand);
            let v;
            if (x.intrinsic === 'neg') v = -a;
            else if (x.intrinsic === 'not') v = !a;
            if (v !== undefined) {
              const y = { op: 'const', result: x.result, type: x.type, value: v };
              consts.set(x.result, v);
              ins.push(y);
              continue;
            }
          }
          ins.push(x);
        }
        next.push({ ...block, instructions: ins });
      }
      fn.blocks = next;
    }
    return module;
  }

  function removeUnreachableBlocks(module) {
    for (const fn of module.functions) {
      const byId = new Map(fn.blocks.map(b => [b.id, b]));
      const reachable = new Set();
      const visit = id => {
        if (reachable.has(id)) return;
        reachable.add(id);
        const b = byId.get(id);
        if (!b) return;
        const t = b.instructions.at(-1);
        if (!t) return;
        if (t.op === 'jump') visit(t.target);
        else if (t.op === 'branch') { visit(t.then); visit(t.else); }
      };
      if (fn.blocks[0]) visit(fn.blocks[0].id);
      fn.blocks = fn.blocks.filter(b => reachable.has(b.id));
    }
    return module;
  }

  return { constantFold, removeUnreachableBlocks };
}

// ---------------------------------------------------------------------------
// C++ backend: consumes only IR + target profile, not AST.
// ---------------------------------------------------------------------------

function createCppBackend(target, language) {
  const lines = [];
  let valueAliases = new Map();
  const emit = s => lines.push(s);
  const cppType = t => {
    const n = typeName(t);
    if (target.types[n]) return target.types[n];
    const generic = target.typeConstructors?.[baseType(n)];
    if (generic?.template) return generic.template.replace('{T}', cppType(typeArgs(n)[0] ?? 'void'));
    return n;
  };
  const cppString = s => JSON.stringify(String(s));
  const sanitize = s => s.replace(/[^A-Za-z0-9_]/g, '_');
  const val = s => valueAliases.get(s) ?? sanitize(s);
  const entryName = language.entry ?? 'main';
  const cppFunctionName = name => name === entryName ? '__raz_entry' : sanitize(name);

  function intrinsicExpr(intrinsic, a, b = null) {
    const template = target.intrinsics?.[intrinsic];
    if (!template) throw compilerError(`target ${target.name} has no intrinsic lowering for ${intrinsic}`, point('<target-spec>', 1, 1));
    return template.replaceAll('{a}', a).replaceAll('{b}', b ?? '');
  }

  function collectDeclarations(fn) {
    const out = new Map();
    for (const block of fn.blocks) {
      for (const x of block.instructions) {
        if (x.op === 'local') out.set(x.name, cppType(x.type));
        if (x.result && !['ref_var', 'ref_field', 'ref_index', 'load_ref'].includes(x.op)) out.set(val(x.result), cppType(x.type));
      }
    }
    return out;
  }

  function emitInstruction(x) {
    switch (x.op) {
      case 'const': {
        const rhs = x.type === 'string' ? `std::string(${cppString(x.value)})` : x.type === 'bool' ? (x.value ? 'true' : 'false') : String(x.value);
        emit(`    ${val(x.result)} = ${rhs};`);
        return;
      }
      case 'local': {
        return;
      }
      case 'store_var': {
        emit(`    ${sanitize(x.name)} = ${val(x.value)};`);
        return;
      }
      case 'load_var': {
        emit(`    ${val(x.result)} = ${sanitize(x.name)};`);
        return;
      }
      case 'load_ref': {
        valueAliases.set(x.result, sanitize(x.name));
        return;
      }
      case 'ref_var': {
        valueAliases.set(x.result, sanitize(x.name));
        return;
      }
      case 'ref_field': {
        valueAliases.set(x.result, `${val(x.base)}.${sanitize(x.field)}`);
        return;
      }
      case 'ref_index': {
        valueAliases.set(x.result, `${val(x.base)}[${val(x.index)}]`);
        return;
      }
      case 'store_ref': {
        emit(`    ${val(x.ref)} = ${val(x.value)};`);
        return;
      }
      case 'binary': {
        emit(`    ${val(x.result)} = ${intrinsicExpr(x.intrinsic, val(x.left), val(x.right))};`);
        return;
      }
      case 'call_intrinsic': {
        if (x.intrinsic === 'string_concat') {
          emit(`    ${val(x.result)} = ${val(x.args[0])} + ${val(x.args[1])};`);
          return;
        }
        throw compilerError(`unknown call intrinsic ${x.intrinsic}`, point('<ir>', 1, 1));
      }
      case 'unary': {
        emit(`    ${val(x.result)} = ${intrinsicExpr(x.intrinsic, val(x.operand))};`);
        return;
      }
      case 'builtin': {
        const callee = target.builtins?.[x.intrinsic];
        if (!callee) throw compilerError(`target has no builtin mapping for ${x.intrinsic}`, point('<target-spec>', 1, 1));
        const call = `${callee}(${x.args.map(val).join(', ')})`;
        if (x.result) emit(`    ${val(x.result)} = ${call};`);
        else emit(`    ${call};`);
        return;
      }
      case 'call': {
        const call = `${cppFunctionName(x.callee)}(${x.args.map(val).join(', ')})`;
        if (x.result) emit(`    ${val(x.result)} = ${call};`);
        else emit(`    ${call};`);
        return;
      }
      case 'new': {
        if (target.typeConstructors?.[baseType(x.type)]) emit(`    ${val(x.result)} = ${cppType(x.type)}{};`);
        else if (x.args.length === 0) emit(`    ${val(x.result)} = ${cppType(x.type)}{};`);
        else emit(`    ${val(x.result)} = ${cppType(x.type)}{${x.args.map(val).join(', ')}};`);
        return;
      }
      case 'make_list': {
        emit(`    ${val(x.result)} = ${cppType(x.type)}{${x.items.map(val).join(', ')}};`);
        return;
      }
      case 'field_get': {
        emit(`    ${val(x.result)} = ${val(x.base)}.${sanitize(x.field)};`);
        return;
      }
      case 'field_set': {
        emit(`    ${sanitize(x.baseName)}.${sanitize(x.field)} = ${val(x.value)};`);
        return;
      }
      case 'index_get': {
        emit(`    ${val(x.result)} = ${val(x.base)}[static_cast<std::size_t>(${val(x.index)})];`);
        return;
      }
      case 'index_set': {
        emit(`    ${sanitize(x.baseName)}[static_cast<std::size_t>(${val(x.index)})] = ${val(x.value)};`);
        return;
      }
      case 'return': {
        emit(x.value ? `    return ${val(x.value)};` : '    return;');
        return;
      }
      case 'return_default': {
        emit(`    return ${cppType(x.type)}{};`);
        return;
      }
      case 'jump': emit(`    goto ${x.target};`); return;
      case 'branch': emit(`    if (${val(x.cond)}) goto ${x.then}; else goto ${x.else};`); return;
      default: throw compilerError(`C++ backend cannot lower IR op ${x.op}`, point('<ir>', 1, 1));
    }
  }

  function generate(module) {
    lines.length = 0;
    const include = target.runtime?.include;
    emit('#include <cstdint>');
    emit('#include <cstddef>');
    emit('#include <string>');
    emit('#include <vector>');
    if (include) emit(`#include "${include}"`);
    emit('');

    for (const s of module.structs) {
      emit(`struct ${sanitize(s.name)} {`);
      for (const f of s.fields) emit(`    ${cppType(f.type)} ${sanitize(f.field)}{};`);
      emit('};');
      emit('');
    }

    for (const fn of module.functions) {
      valueAliases = new Map();
      const params = fn.params.map(p => `${cppType(p.type)} ${sanitize(p.name)}`).join(', ');
      emit(`${cppType(fn.returnType)} ${cppFunctionName(fn.name)}(${params});`);
    }
    emit('');

    for (const fn of module.functions) {
      valueAliases = new Map();
      const params = fn.params.map(p => `${cppType(p.type)} ${sanitize(p.name)}`).join(', ');
      emit(`${cppType(fn.returnType)} ${cppFunctionName(fn.name)}(${params}) {`);
      const declarations = collectDeclarations(fn);
      for (const [name, cpp] of declarations) emit(`    ${cpp} ${name}{};`);
      if (declarations.size) emit('');
      for (const block of fn.blocks) {
        emit(`${block.id}:;`);
        for (const ins of block.instructions) emitInstruction(ins);
      }
      emit('}');
      emit('');
    }

    const entry = entryName;
    const entryFn = module.functions.find(f => f.name === entry);
    if (!entryFn) throw compilerError(`entry function ${entry} not found`, point('<ir>', 1, 1));
    emit('int main() {');
    if (entryFn.returnType === 'void') emit(`    ${cppFunctionName(entry)}();`); else emit(`    return static_cast<int>(${cppFunctionName(entry)}());`);
    emit('}');
    return lines.join('\n') + '\n';
  }

  return { generate };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function compileSource({ sourceText, sourceName = '<source>', language = DEFAULT_LANGUAGE, target = DEFAULT_TARGET, dumpIr = false }) {
  language = normalizeLanguageSpec(language);
  const lex = createLexer(language);
  const parse = createParser(language);
  const analyze = createAnalyzer(language);
  const irBuilder = createIRBuilder(language);
  const passes = createPasses(language);
  const backend = createCppBackend(target, language);

  const tokens = lex(sourceText, sourceName);
  const ast = parse(tokens);
  const typed = analyze(ast);
  let ir = irBuilder.lowerProgram(typed);
  ir = passes.constantFold(ir);
  ir = passes.removeUnreachableBlocks(ir);
  const cpp = backend.generate(ir);
  return { tokens, ast, typed, ir, cpp, dumpIr: dumpIr ? formatIr(ir) : null };
}

function formatIr(module) {
  const out = [];
  for (const s of module.structs) {
    out.push(`struct ${s.name}`);
    for (const f of s.fields) out.push(`  field ${f.type} ${f.field}`);
  }
  for (const fn of module.functions) {
    out.push(`function ${fn.name}(${fn.params.map(p => `${p.name}:${p.type}`).join(', ')}) -> ${fn.returnType}`);
    for (const b of fn.blocks) {
      out.push(`${b.id}:`);
      for (const x of b.instructions) out.push('  ' + formatInstruction(x));
    }
  }
  return out.join('\n');
}

function formatInstruction(x) {
  switch (x.op) {
    case 'const': return `${x.result} = const ${x.type} ${JSON.stringify(x.value)}`;
    case 'local': return `local ${x.type} ${x.name}`;
    case 'store_var': return `store ${x.name}, ${x.value}`;
    case 'load_var': return `${x.result} = load ${x.name} : ${x.type}`;
    case 'ref_var': return `${x.result} = ref ${x.name} : ${x.type}`;
    case 'ref_field': return `${x.result} = ref_field ${x.base}.${x.field} : ${x.type}`;
    case 'ref_index': return `${x.result} = ref_index ${x.base}[${x.index}] : ${x.type}`;
    case 'store_ref': return `store_ref ${x.ref}, ${x.value}`;
    case 'binary': return `${x.result} = ${x.intrinsic} ${x.left}, ${x.right} : ${x.type}`;
    case 'unary': return `${x.result} = ${x.intrinsic} ${x.operand} : ${x.type}`;
    case 'call_intrinsic': return `${x.result} = intrinsic ${x.intrinsic}(${x.args.join(', ')}) : ${x.type}`;
    case 'builtin': return `${x.result ?? '_'} = builtin ${x.intrinsic}(${x.args.join(', ')}) : ${x.type}`;
    case 'call': return `${x.result ?? '_'} = call ${x.callee}(${x.args.join(', ')}) : ${x.type}`;
    case 'new': return `${x.result} = new ${x.type}(${x.args.join(', ')})`;
    case 'make_list': return `${x.result} = list<${x.type}>(${x.items.join(', ')})`;
    case 'field_get': return `${x.result} = field ${x.base}.${x.field} : ${x.type}`;
    case 'field_set': return `field_set ${x.baseName}.${x.field} = ${x.value}`;
    case 'index_get': return `${x.result} = index ${x.base}[${x.index}] : ${x.type}`;
    case 'index_set': return `index_set ${x.baseName}[${x.index}] = ${x.value}`;
    case 'return': return `return ${x.value ?? ''}`;
    case 'return_default': return `return_default ${x.type}`;
    case 'jump': return `jump ${x.target}`;
    case 'branch': return `branch ${x.cond} ? ${x.then} : ${x.else}`;
    default: return JSON.stringify(x);
  }
}

function parseCli(argv) {
  const args = [...argv];
  const opts = { command: 'compile', source: null, output: null, language: null, target: null, emitIr: false, run: false, cc: null };
  if (args[0] && !args[0].startsWith('-')) opts.command = args.shift();
  while (args.length) {
    const a = args.shift();
    if (a === '--language') opts.language = args.shift();
    else if (a === '--target') opts.target = args.shift();
    else if (a === '-o' || a === '--output') opts.output = args.shift();
    else if (a === '--emit-ir') opts.emitIr = true;
    else if (a === '--run') opts.run = true;
    else if (a === '--cc') opts.cc = args.shift();
    else if (!opts.source) opts.source = a;
    else fail(`unknown argument ${a}`, point('<cli>', 1, 1));
  }
  return opts;
}

function compileFile(sourcePath, outputPath, languagePath, targetPath) {
  const language = loadLanguage(languagePath);
  const target = loadTarget(targetPath);
  const text = fs.readFileSync(sourcePath, 'utf8');
  const result = compileSource({ sourceText: text, sourceName: path.resolve(sourcePath), language, target });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, result.cpp, 'utf8');
  return result;
}

function compileBinary(cppPath, binaryPath, target, ccOverride = null) {
  const compiler = ccOverride ?? target.compiler ?? 'c++';
  const args = [...(target.flags ?? []), cppPath, '-o', binaryPath];
  const proc = spawnSync(compiler, args, { encoding: 'utf8' });
  if (proc.status !== 0) {
    process.stderr.write(proc.stdout ?? '');
    process.stderr.write(proc.stderr ?? '');
    throw compilerError(`native compiler failed with exit code ${proc.status}`, point(cppPath, 1, 1));
  }
}

function main(argv) {
  const opts = parseCli(argv);
  if (opts.command === 'version') {
    console.log(VERSION);
    return 0;
  }
  if (!opts.source) {
    console.error('usage: node razc-stage0.mjs compile <source.raz> -o <output.cpp> [--language file] [--target file] [--emit-ir] [--run]');
    return 2;
  }

  try {
    const language = loadLanguage(opts.language);
    const target = loadTarget(opts.target);
    const sourceText = fs.readFileSync(opts.source, 'utf8');
    const result = compileSource({ sourceText, sourceName: path.resolve(opts.source), language, target, dumpIr: opts.emitIr });

    if (opts.emitIr) console.log(result.dumpIr);
    if (opts.command === 'ir') return 0;

    const output = opts.output ?? `${opts.source}.cpp`;
    fs.writeFileSync(output, result.cpp, 'utf8');
    console.log(`generated ${output}`);

    if (opts.run) {
      const binary = output.replace(/\.cpp$/i, '') + (process.platform === 'win32' ? '.exe' : '');
      compileBinary(path.resolve(output), path.resolve(binary), target, opts.cc);
      const proc = spawnSync(path.resolve(binary), [], { stdio: 'inherit' });
      if (proc.status !== 0) return proc.status ?? 1;
    }
    return 0;
  } catch (e) {
    console.error(`razc: error: ${e.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}

export {
  DEFAULT_LANGUAGE,
  DEFAULT_TARGET,
  loadLanguage,
  loadTarget,
  compileSource,
  formatIr,
  createLexer,
  createParser,
  createAnalyzer,
  createIRBuilder,
  createPasses,
  createCppBackend
};
