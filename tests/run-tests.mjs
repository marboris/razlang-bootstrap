#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const BOOTSTRAP = process.argv.includes('--bootstrap');
const HOST = process.argv.includes('--host');
const LEGACY_STAGE2 = process.argv.includes('--stage2');
const FULL = BOOTSTRAP || HOST || LEGACY_STAGE2;
const COMPILER = path.join(ROOT, 'razc-stage0.mjs');
const LANGUAGE = path.join(ROOT, 'raz.language.json');
const TARGET = path.join(ROOT, 'cpp17.target.json');
const TMP = path.join(HERE, '.tmp');
fs.mkdirSync(TMP, { recursive: true });

function run(args) {
  return spawnSync(process.execPath, [COMPILER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000
  });
}

function compileCase(spec) {
  const source = path.join(HERE, spec.source);
  const base = path.join(TMP, spec.name);
  const cpp = `${base}.cpp`;
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(TMP, 'raz_runtime.hpp'));
  const language = spec.language ? path.join(HERE, spec.language) : LANGUAGE;
  const p = run(['compile', source, '-o', cpp, '--language', language, '--target', TARGET, '--emit-ir', '--run']);
  return { ...p, cpp, ir: `${p.stdout ?? ''}` };
}

function compileNegative(spec) {
  const source = path.join(HERE, spec.source);
  const cpp = path.join(TMP, `${spec.name}.cpp`);
  return run(['compile', source, '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
}

let passed = 0;
let failed = 0;

if (true) {
  for (const spec of MANIFEST.positive) {
    const result = compileCase(spec);
    const ok = result.status === spec.exit && result.stdout.includes('generated ');
    const missing = (spec.ir ?? []).filter(x => !result.stdout.includes(x));
    if (ok && missing.length === 0) {
      passed++;
      console.log(`[PASS] ${spec.name} (exit=${result.status})`);
    } else {
      failed++;
      console.log(`[FAIL] ${spec.name}`);
      console.log(`status=${result.status}`);
      console.log(`stdout=${result.stdout ?? ''}`);
      console.log(`stderr=${result.stderr ?? ''}`);
      if (missing.length) console.log(`missing IR markers: ${missing.join(', ')}`);
    }
  }
}

let STAGE1_CACHE = null;

function buildStage1() {
  if (STAGE1_CACHE?.ok && fs.existsSync(STAGE1_CACHE.bin)) return STAGE1_CACHE;
  const stageTmp = path.join(TMP, 'stage1');
  fs.mkdirSync(stageTmp, { recursive: true });
  const cpp = path.join(stageTmp, 'compiler.cpp');
  const bin = path.join(stageTmp, process.platform === 'win32' ? 'compiler.exe' : 'compiler');
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(stageTmp, 'raz_runtime.hpp'));
  const build = run(['compile', path.join(ROOT, 'stage1', 'compiler.raz'), '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
  if (build.status !== 0) return { ok: false, details: `Stage-1 build failed:\n${build.stdout ?? ''}\n${build.stderr ?? ''}` };
  const cc = spawnSync('c++', ['-std=c++17', '-O3', cpp, '-o', bin], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (cc.status !== 0) return { ok: false, details: `Stage-1 native build failed:\n${cc.stdout ?? ''}\n${cc.stderr ?? ''}` };
  STAGE1_CACHE = { ok: true, bin, stageTmp };
  return STAGE1_CACHE;
}

function runStage1Input(bin, sourcePath, expectedContains) {
  const input = path.join(ROOT, 'stage1', 'input.raz');
  const output = path.join(ROOT, 'stage1', 'output.rir');
  fs.copyFileSync(sourcePath, input);
  try { fs.rmSync(output); } catch {}
  const proc = spawnSync(bin, [], { cwd: ROOT, encoding: 'utf8', timeout: BOOTSTRAP ? 90000 : 30000 });
  if (proc.status !== 0) return { ok: false, details: `Stage-1 executable failed with status ${proc.status}\n${proc.stdout ?? ''}\n${proc.stderr ?? ''}` };
  if (!fs.existsSync(output)) return { ok: false, details: 'Stage-1 did not produce stage1/output.rir' };
  const rir = fs.readFileSync(output, 'utf8');
  const missing = expectedContains.filter(x => !rir.includes(x));
  if (missing.length) return { ok: false, details: `RIR is missing: ${missing.join(', ')}\n${rir.slice(0, 8000)}` };
  return { ok: true, bytes: rir.length };
}

function runStage1NegativeInput(bin, sourcePath, expectedContains) {
  const input = path.join(ROOT, 'stage1', 'input.raz');
  fs.copyFileSync(sourcePath, input);
  const proc = spawnSync(bin, [], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
  const all = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
  const missing = expectedContains.filter(x => !all.includes(x));
  if (proc.status === 0) return { ok: false, details: `expected Stage-1 failure, got status 0\n${all}` };
  if (missing.length) return { ok: false, details: `Stage-1 error is missing: ${missing.join(', ')}\n${all}` };
  return { ok: true };
}

function testStage1() {
  if (BOOTSTRAP) console.log('[BOOTSTRAP] build Stage-1');
  const built = buildStage1();
  if (!built.ok) return built;
  const frontend = runStage1Input(
    built.bin,
    path.join(HERE, MANIFEST.stage1.frontend_source),
    MANIFEST.stage1.frontend_contains
  );
  if (!frontend.ok) return { ok: false, details: `Stage-1 frontend test failed:\n${frontend.details}` };
  let selfBytes = 0;
  if (BOOTSTRAP) {
    console.log('[BOOTSTRAP] Stage-1 self-parse');
    const self = runStage1Input(
      built.bin,
      path.join(ROOT, 'stage1', 'compiler.raz'),
      MANIFEST.stage1.self_contains
    );
    if (!self.ok) return { ok: false, details: `Stage-1 self-parse/test failed:\n${self.details}` };
    selfBytes = self.bytes;
  }
  const negative = runStage1NegativeInput(
    built.bin,
    path.join(HERE, MANIFEST.stage1.negative_source),
    MANIFEST.stage1.negative_contains
  );
  if (!negative.ok) return { ok: false, details: `Stage-1 semantic-negative test failed:\n${negative.details}` };
  return { ok: true, details: BOOTSTRAP ? `frontend RIR=${frontend.bytes} bytes; compiler self-RIR=${selfBytes} bytes` : `frontend RIR=${frontend.bytes} bytes` };
}

const stage1 = testStage1();
if (stage1.ok) {
  passed++;
  console.log(`[PASS] stage1-native-frontend (${stage1.details})`);
} else {
  failed++;
  console.log(`[FAIL] stage1-native-frontend`);
  console.log(stage1.details);
}

let STAGE3_CACHE = null;

function getStage3() {
  if (!STAGE3_CACHE) STAGE3_CACHE = buildStage3();
  return STAGE3_CACHE;
}

function testStage2() {
  if (BOOTSTRAP) console.log('[BOOTSTRAP] Stage-2 chain');
  const built = buildStage1();
  if (!built.ok) return built;

  const stage2Tmp = path.join(TMP, 'stage2');
  fs.mkdirSync(stage2Tmp, { recursive: true });
  const backendCpp = path.join(stage2Tmp, 'rir_backend.cpp');
  const backendBin = path.join(stage2Tmp, process.platform === 'win32' ? 'rir_backend.exe' : 'rir_backend');
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(stage2Tmp, 'raz_runtime.hpp'));

  const stage2RirBuild = run([
    'compile',
    path.join(ROOT, 'stage2', 'rir_backend.raz'),
    '-o', backendCpp,
    '--language', LANGUAGE,
    '--target', TARGET
  ]);
  if (stage2RirBuild.status !== 0) {
    return { ok: false, details: `Stage-2 source build failed:\n${stage2RirBuild.stdout ?? ''}\n${stage2RirBuild.stderr ?? ''}` };
  }

  const ccBackend = spawnSync('c++', ['-std=c++17', '-O0', backendCpp, '-o', backendBin], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (ccBackend.status !== 0) {
    return { ok: false, details: `Stage-2 backend native build failed:\n${ccBackend.stdout ?? ''}\n${ccBackend.stderr ?? ''}` };
  }

  const source = path.join(HERE, MANIFEST.stage2.source);
  const input = path.join(ROOT, 'stage1', 'input.raz');
  const rirPath = path.join(ROOT, 'stage2', 'input.rir');
  const cppPath = path.join(ROOT, 'stage2', 'output.cpp');
  const binPath = path.join(ROOT, 'stage2', process.platform === 'win32' ? 'output.exe' : 'output');
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(ROOT, 'stage2', 'raz_runtime.hpp'));
  fs.copyFileSync(source, input);
  const frontend = spawnSync(built.bin, [], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (frontend.status !== 0 || !fs.existsSync(path.join(ROOT, 'stage1', 'output.rir'))) {
    return { ok: false, details: `Stage-1 could not produce RIR for Stage-2 input\n${frontend.stdout ?? ''}\n${frontend.stderr ?? ''}` };
  }
  fs.copyFileSync(path.join(ROOT, 'stage1', 'output.rir'), rirPath);

  const verifier = getStage3();
  if (!verifier.ok) return verifier;
  const verification = runStage3Rir(verifier.bin, fs.readFileSync(rirPath, 'utf8'));
  if (verification.proc.status !== 0 || !verification.report.includes('RIR-1 OK')) {
    return { ok: false, details: `Stage-3 rejected Stage-1 RIR before backend:
${verification.report}
${verification.proc.stderr ?? ''}` };
  }

  const backendRun = spawnSync(backendBin, [], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (backendRun.status !== 0 || !fs.existsSync(cppPath)) {
    return { ok: false, details: `Stage-2 backend execution failed with status ${backendRun.status}\n${backendRun.stdout ?? ''}\n${backendRun.stderr ?? ''}` };
  }

  const native = spawnSync('c++', ['-std=c++17', '-O0', cppPath, '-o', binPath], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (native.status !== 0) {
    return { ok: false, details: `Stage-2 generated C++ failed to compile:\n${native.stdout ?? ''}\n${native.stderr ?? ''}` };
  }
  const program = spawnSync(binPath, [], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (program.status !== MANIFEST.stage2.exit) {
    return { ok: false, details: `Stage-2 program exit ${program.status}, expected ${MANIFEST.stage2.exit}` };
  }

  const rir = fs.readFileSync(rirPath, 'utf8');
  const cpp = fs.readFileSync(cppPath, 'utf8');
  const missingRir = MANIFEST.stage2.rir_contains.filter(x => !rir.includes(x));
  const missingCpp = MANIFEST.stage2.cpp_contains.filter(x => !cpp.includes(x));
  if (missingRir.length || missingCpp.length) {
    return { ok: false, details: `Stage-2 markers missing; RIR=${missingRir.join(', ')} C++=${missingCpp.join(', ')}` };
  }
  return { ok: true, details: `RIR=${rir.length} bytes; C++=${cpp.length} bytes; exit=${program.status}` };
}

const stage2 = LEGACY_STAGE2 ? testStage2() : { ok: true, details: 'skipped (run npm run test:stage2 for legacy Stage-2 backend)' };
if (stage2.ok) {
  passed++;
  console.log(`[PASS] stage2-native-backend (${stage2.details})`);
} else {
  failed++;
  console.log(`[FAIL] stage2-native-backend`);
  console.log(stage2.details);
}

function buildStage3() {
  const stageTmp = path.join(TMP, 'stage3');
  fs.mkdirSync(stageTmp, { recursive: true });
  const cpp = path.join(stageTmp, 'rir_verify.cpp');
  const bin = path.join(stageTmp, process.platform === 'win32' ? 'rir_verify.exe' : 'rir_verify');
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(stageTmp, 'raz_runtime.hpp'));
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(ROOT, 'stage3', 'raz_runtime.hpp'));
  const build = run(['compile', path.join(ROOT, 'stage3', 'rir_verify.raz'), '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
  if (build.status !== 0) return { ok: false, details: `Stage-3 build failed:\n${build.stdout ?? ''}\n${build.stderr ?? ''}` };
  const cc = spawnSync('c++', ['-std=c++17', '-O0', cpp, '-o', bin], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (cc.status !== 0) return { ok: false, details: `Stage-3 native build failed:\n${cc.stdout ?? ''}\n${cc.stderr ?? ''}` };
  return { ok: true, bin };
}

function runStage3Rir(bin, rir) {
  fs.writeFileSync(path.join(ROOT, 'stage3', 'input.rir'), rir, 'utf8');
  try { fs.rmSync(path.join(ROOT, 'stage3', 'verification.txt')); } catch {}
  const proc = spawnSync(bin, [], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  const reportPath = path.join(ROOT, 'stage3', 'verification.txt');
  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
  return { proc, report };
}

function testStage3() {
  const built = getStage3();
  if (!built.ok) return built;

  const valid = fs.readFileSync(path.join(HERE, 'cases/rir/valid.rir'), 'utf8');
  const validRun = runStage3Rir(built.bin, valid);
  if (validRun.proc.status !== 0 || !validRun.report.includes('RIR-1 OK')) {
    return { ok: false, details: `Stage-3 rejected valid RIR:
${validRun.report}
${validRun.proc.stderr ?? ''}` };
  }

  const validRef = fs.readFileSync(path.join(HERE, 'cases/rir/references.rir'), 'utf8');
  const refRun = runStage3Rir(built.bin, validRef);
  if (refRun.proc.status !== 0 || !refRun.report.includes('RIR-1 OK')) {
    return { ok: false, details: `Stage-3 rejected valid reference RIR:
${refRun.report}
${refRun.proc.stderr ?? ''}` };
  }

  const invalidLabel = fs.readFileSync(path.join(HERE, 'cases/rir/duplicate-label.rir'), 'utf8');
  const labelRun = runStage3Rir(built.bin, invalidLabel);
  if (labelRun.proc.status === 0 || !labelRun.report.includes('duplicate label')) {
    return { ok: false, details: `Stage-3 missed duplicate-label error:
${labelRun.report}` };
  }

  const invalidValue = fs.readFileSync(path.join(HERE, 'cases/rir/undefined-value.rir'), 'utf8');
  const valueRun = runStage3Rir(built.bin, invalidValue);
  if (valueRun.proc.status === 0 || !valueRun.report.includes('undefined value')) {
    return { ok: false, details: `Stage-3 missed undefined-value error:
${valueRun.report}` };
  }

  const invalidBranch = fs.readFileSync(path.join(HERE, 'cases/rir/bad-target.rir'), 'utf8');
  const branchRun = runStage3Rir(built.bin, invalidBranch);
  if (branchRun.proc.status === 0 || !branchRun.report.includes('control-flow target')) {
    return { ok: false, details: `Stage-3 missed invalid-branch-target error:
${branchRun.report}` };
  }

  return { ok: true, details: validRun.report.trim().replace(/\n/g, '; ') };
}

const stage3 = testStage3();
if (stage3.ok) {
  passed++;
  console.log(`[PASS] stage3-rir-verifier (${stage3.details})`);
} else {
  failed++;
  console.log(`[FAIL] stage3-rir-verifier`);
  console.log(stage3.details);
}

for (const spec of MANIFEST.negative) {
  const result = compileNegative(spec);
  const allText = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const ok = result.status !== 0 && allText.includes(spec.contains);
  if (ok) {
    passed++;
    console.log(`[PASS] ${spec.name} (expected semantic failure)`);
  } else {
    failed++;
    console.log(`[FAIL] ${spec.name}`);
    console.log(allText.trim());
  }
}

function testHostDriver() {
  const driver = path.join(ROOT, 'stage4', 'host-driver.mjs');
  const source = path.join(HERE, 'cases/arithmetic.raz');
  const output = path.join(TMP, 'host-arithmetic.cpp');
  const p = spawnSync(process.execPath, [driver, 'compile', source, '-o', output, '--run'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  if (p.status !== 207) return { ok: false, details: `host driver exit=${p.status}\n${p.stdout ?? ''}\n${p.stderr ?? ''}` };
  if (!fs.existsSync(output)) return { ok: false, details: 'host driver did not produce C++' };
  return { ok: true, details: `native exit=${p.status}` };
}

function testHostSelfCompile() {
  const driver = path.join(ROOT, 'stage4', 'host-driver.mjs');
  const output = path.join(TMP, 'host-self-compiler.cpp');
  const binary = path.join(TMP, process.platform === 'win32' ? 'host-self-compiler.exe' : 'host-self-compiler');
  console.log('[TRACE] host-driver start');
  const p = spawnSync(process.execPath, [driver, 'compile', path.join(ROOT, 'stage1', 'compiler.raz'), '-o', output], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 360000,
    env: { ...process.env, RAZ_STAGE1_BIN: path.resolve(buildStage1().bin) }
  });
  console.log('[TRACE] host-driver done status=' + p.status);
  if (p.status !== 0) return { ok: false, details: `host self-compile failed\n${p.stdout ?? ''}\n${p.stderr ?? ''}` };
  fs.copyFileSync(path.join(ROOT, 'raz_runtime.hpp'), path.join(TMP, 'raz_runtime.hpp'));
  console.log('[TRACE] native c++ start');
  const cc = spawnSync('c++', ['-std=c++17', '-O3', output, '-o', binary], { cwd: ROOT, encoding: 'utf8', timeout: 360000 });
  console.log('[TRACE] native c++ done status=' + cc.status);
  if (cc.status !== 0) return { ok: false, details: `native self-compiler build failed\n${cc.stdout ?? ''}\n${cc.stderr ?? ''}` };
  fs.copyFileSync(path.join(ROOT, 'stage1', 'compiler.raz'), path.join(ROOT, 'stage1', 'input.raz'));
  console.log('[TRACE] native self run start');
  const self = spawnSync(binary, [], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  console.log('[TRACE] native self run done status=' + self.status);
  if (self.status !== 0) return { ok: false, details: `native self-compiler run failed with ${self.status}\n${self.stdout ?? ''}\n${self.stderr ?? ''}` };
  const produced = fs.readFileSync(path.join(ROOT, 'stage1', 'output.rir'), 'utf8');
  const reference = fs.readFileSync(path.join(ROOT, 'stage4', '.cache', 'input.rir'), 'utf8');
  if (produced !== reference) return { ok: false, details: `self-compile RIR mismatch: generated=${produced.length} reference=${reference.length}` };
  return { ok: true, details: `self-RIR exact match (${produced.length} bytes)` };
}

if (HOST) {
  const host = testHostDriver();
  if (host.ok) { passed++; console.log(`[PASS] stage4-host-driver (${host.details})`); }
  else { failed++; console.log('[FAIL] stage4-host-driver'); console.log(host.details); }
}

if (BOOTSTRAP) {
  console.log('[TRACE] entering host self compile');
  const self = testHostSelfCompile();
  if (self.ok) { passed++; console.log(`[PASS] stage4-self-compile (${self.details})`); }
  else { failed++; console.log('[FAIL] stage4-self-compile'); console.log(self.details); }
}

console.log(`\npassed=${passed} failed=${failed}`);
process.exitCode = failed ? 1 : 0;
