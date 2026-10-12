#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, '../..');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const LIBRARY = path.join(ROOT, 'library', 'raz');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'manifest.json'), 'utf8'));
const CANDIDATE = path.resolve(process.env.RAZC ?? path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate'));
const WORK = path.join(GEN2, 'build', 'deep-test');
const CXX = process.env.CXX ?? 'g++';
const OPT = process.env.RAZ_TEST_OPT ?? '-O2';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    timeout: options.timeout ?? 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  return { ...result, output };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function runPositive(spec) {
  const source = path.join(TEST_DIR, spec.source);
  const cpp = path.join(WORK, `${spec.name}.cpp`);
  const exe = path.join(WORK, spec.name);
  const translate = run(CANDIDATE, [source, '--emit-cpp', cpp, '-L', LIBRARY]);
  ensure(translate.status === 0, `${spec.name}: Raz translation failed\n${translate.output}`);
  ensure(fs.existsSync(cpp), `${spec.name}: compiler reported success but emitted no C++`);
  const generated = fs.readFileSync(cpp, 'utf8');
  const missing = (spec.cppContains ?? []).filter((marker) => !generated.includes(marker));
  const unexpected = (spec.cppNotContains ?? []).filter((marker) => generated.includes(marker));
  ensure(!missing.length, `${spec.name}: C++ missing markers: ${missing.join(', ')}\n${generated.slice(0, 5000)}`);
  ensure(!unexpected.length, `${spec.name}: forbidden C++ markers: ${unexpected.join(', ')}`);
  ensure(!/\b(?:raz_fn|raz_v|raz_ty|raz_field)_n\d+(?:_\d+)+\b/.test(generated), `${spec.name}: old decimal-encoded names remain in generated C++`);
  const identifiers = generated.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const tooLong = identifiers.filter((name) => name.length > 72);
  ensure(!tooLong.length, `${spec.name}: unexpectedly long generated identifiers: ${[...new Set(tooLong)].slice(0, 8).join(', ')}`);

  const compileArgs = ['-std=c++17', OPT, cpp, '-I', TEST_DIR, '-I', LIBRARY, '-o', exe];
  const compile = run(CXX, compileArgs);
  ensure(compile.status === 0, `${spec.name}: generated C++ failed to compile with ${OPT}\n${compile.output}\nC++ path: ${cpp}`);
  const program = run(exe, []);
  ensure(program.status === spec.exit, `${spec.name}: generated executable returned ${program.status}, expected ${spec.exit}\n${program.output}\nC++ path: ${cpp}`);
  return { bytes: Buffer.byteLength(generated), lines: generated.split(/\r?\n/).length, exit: program.status };
}

function runNegative(spec) {
  const source = path.join(TEST_DIR, spec.source);
  const cpp = path.join(WORK, `negative-${spec.name}.cpp`);
  const result = run(CANDIDATE, [source, '--emit-cpp', cpp, '-L', LIBRARY]);
  ensure(result.status !== 0, `${spec.name}: expected Raz compilation failure but compiler returned success`);
  ensure(result.output.includes(spec.contains), `${spec.name}: diagnostic did not include '${spec.contains}'\n${result.output}`);
  ensure(!fs.existsSync(cpp), `${spec.name}: failed translation must not leave a fresh C++ output`);
  return result.output.trim().split(/\r?\n/).slice(-1)[0] ?? 'expected diagnostic';
}

if (!fs.existsSync(CANDIDATE)) {
  console.error(`[gen2-deep] candidate not found: ${CANDIDATE}`);
  console.error('[gen2-deep] run: make build-gen2-selfhost');
  process.exit(2);
}
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const version = run(CANDIDATE, ['--version']);
ensure(version.status === 0 && version.output.includes('0.4.0-g2-016'), `expected Gen2 0.4.0-g2-016 candidate\n${version.output}`);

let passed = 0;
let failed = 0;
const stats = [];
for (const spec of MANIFEST.cases) {
  try {
    const result = runPositive(spec);
    passed++;
    stats.push({ name: spec.name, ...result });
    console.log(`[PASS] ${spec.name}: generated C++ ${result.bytes} bytes/${result.lines} lines, native exit=${result.exit}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] ${spec.name}: ${error.message}`);
  }
}
for (const spec of MANIFEST.negative) {
  try {
    const diagnostic = runNegative(spec);
    passed++;
    console.log(`[PASS] negative/${spec.name}: ${diagnostic}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] negative/${spec.name}: ${error.message}`);
  }
}

const totalBytes = stats.reduce((sum, item) => sum + item.bytes, 0);
console.log(`[gen2-deep] ${passed}/${MANIFEST.cases.length + MANIFEST.negative.length} passed; generated C++ total=${totalBytes} bytes; C++ optimization=${OPT}`);
console.log(`[gen2-deep] inspectable generated C++: ${WORK}`);
process.exitCode = failed ? 1 : 0;
