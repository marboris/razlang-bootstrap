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
const BACKEND = process.argv.includes('--backend');
const COMPILER = path.join(ROOT, 'src', 'bootstrap', 'seed.mjs');
const LANGUAGE = path.join(ROOT, 'config', 'language.json');
const TARGET = path.join(ROOT, 'config', 'targets', 'cpp17.json');
const RUNTIME = path.join(ROOT, 'runtime', 'raz_runtime.hpp');
const TMP = path.join(HERE, '.tmp');
const WORK = path.join(TMP, 'work');
fs.mkdirSync(TMP, { recursive: true });
for (const dir of ['frontend', 'backend', 'ir']) fs.mkdirSync(path.join(WORK, dir), { recursive: true });

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
  fs.copyFileSync(RUNTIME, path.join(TMP, 'raz_runtime.hpp'));
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

let FRONTEND_CACHE = null;

function buildFrontend() {
  if (FRONTEND_CACHE?.ok && fs.existsSync(FRONTEND_CACHE.bin)) return FRONTEND_CACHE;
  const frontendTmp = path.join(TMP, 'frontend-build');
  fs.mkdirSync(frontendTmp, { recursive: true });
  const cpp = path.join(frontendTmp, 'frontend.cpp');
  const bin = path.join(frontendTmp, process.platform === 'win32' ? 'frontend.exe' : 'frontend');
  fs.copyFileSync(RUNTIME, path.join(frontendTmp, 'raz_runtime.hpp'));
  const build = run(['compile', path.join(ROOT, 'src', 'frontend', 'compiler.raz'), '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
  if (build.status !== 0) return { ok: false, details: `frontend build failed:\n${build.stdout ?? ''}\n${build.stderr ?? ''}` };
  const cc = spawnSync('c++', ['-std=c++17', '-O3', cpp, '-o', bin], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (cc.status !== 0) return { ok: false, details: `native frontend build failed:\n${cc.stdout ?? ''}\n${cc.stderr ?? ''}` };
  FRONTEND_CACHE = { ok: true, bin, frontendTmp };
  return FRONTEND_CACHE;
}

function runFrontendInput(bin, sourcePath, expectedContains) {
  const input = path.join(WORK, 'frontend', 'input.raz');
  const output = path.join(WORK, 'frontend', 'output.rir');
  fs.copyFileSync(sourcePath, input);
  try { fs.rmSync(output); } catch {}
  const proc = spawnSync(bin, [], { cwd: WORK, encoding: 'utf8', timeout: BOOTSTRAP ? 90000 : 30000 });
  if (proc.status !== 0) return { ok: false, details: `frontend executable failed with status ${proc.status}\n${proc.stdout ?? ''}\n${proc.stderr ?? ''}` };
  if (!fs.existsSync(output)) return { ok: false, details: 'frontend did not produce frontend/output.rir' };
  const rir = fs.readFileSync(output, 'utf8');
  const missing = expectedContains.filter(x => !rir.includes(x));
  if (missing.length) return { ok: false, details: `RIR is missing: ${missing.join(', ')}\n${rir.slice(0, 8000)}` };
  return { ok: true, bytes: rir.length };
}

function runFrontendNegativeInput(bin, sourcePath, expectedContains) {
  const input = path.join(WORK, 'frontend', 'input.raz');
  fs.copyFileSync(sourcePath, input);
  const proc = spawnSync(bin, [], { cwd: WORK, encoding: 'utf8', timeout: 15000 });
  const all = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
  const missing = expectedContains.filter(x => !all.includes(x));
  if (proc.status === 0) return { ok: false, details: `expected frontend failure, got status 0\n${all}` };
  if (missing.length) return { ok: false, details: `frontend error is missing: ${missing.join(', ')}\n${all}` };
  return { ok: true };
}

function testFrontend() {
  if (BOOTSTRAP) console.log('[BOOTSTRAP] build native frontend');
  const built = buildFrontend();
  if (!built.ok) return built;
  const frontend = runFrontendInput(
    built.bin,
    path.join(HERE, MANIFEST.frontend.source),
    MANIFEST.frontend.contains
  );
  if (!frontend.ok) return { ok: false, details: `frontend test failed:\n${frontend.details}` };
  let selfBytes = 0;
  if (BOOTSTRAP) {
    console.log('[BOOTSTRAP] frontend self-parse');
    const self = runFrontendInput(
      built.bin,
      path.join(ROOT, 'src', 'frontend', 'compiler.raz'),
      MANIFEST.frontend.self_contains
    );
    if (!self.ok) return { ok: false, details: `frontend self-parse/test failed:\n${self.details}` };
    selfBytes = self.bytes;
  }
  const negative = runFrontendNegativeInput(
    built.bin,
    path.join(HERE, MANIFEST.frontend.negative_source),
    MANIFEST.frontend.negative_contains
  );
  if (!negative.ok) return { ok: false, details: `frontend semantic-negative test failed:\n${negative.details}` };
  return { ok: true, details: BOOTSTRAP ? `frontend RIR=${frontend.bytes} bytes; compiler self-RIR=${selfBytes} bytes` : `frontend RIR=${frontend.bytes} bytes` };
}

const frontend = testFrontend();
if (frontend.ok) {
  passed++;
  console.log(`[PASS] native-frontend (${frontend.details})`);
} else {
  failed++;
  console.log(`[FAIL] native-frontend`);
  console.log(frontend.details);
}

let VERIFIER_CACHE = null;

function getVerifier() {
  if (!VERIFIER_CACHE) VERIFIER_CACHE = buildVerifier();
  return VERIFIER_CACHE;
}

function testBackend() {
  if (BOOTSTRAP) console.log('[BOOTSTRAP] RIR backend chain');
  const built = buildFrontend();
  if (!built.ok) return built;

  const backendTmp = path.join(TMP, 'backend-build');
  fs.mkdirSync(backendTmp, { recursive: true });
  const backendCpp = path.join(backendTmp, 'cpp_backend.cpp');
  const backendBin = path.join(backendTmp, process.platform === 'win32' ? 'cpp_backend.exe' : 'cpp_backend');
  fs.copyFileSync(RUNTIME, path.join(backendTmp, 'raz_runtime.hpp'));

  const backendBuild = run([
    'compile',
    path.join(ROOT, 'src', 'backend', 'cpp_backend.raz'),
    '-o', backendCpp,
    '--language', LANGUAGE,
    '--target', TARGET
  ]);
  if (backendBuild.status !== 0) {
    return { ok: false, details: `RIR backend source build failed:\n${backendBuild.stdout ?? ''}\n${backendBuild.stderr ?? ''}` };
  }

  const ccBackend = spawnSync('c++', ['-std=c++17', '-O0', backendCpp, '-o', backendBin], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (ccBackend.status !== 0) {
    return { ok: false, details: `native backend build failed:\n${ccBackend.stdout ?? ''}\n${ccBackend.stderr ?? ''}` };
  }

  const source = path.join(HERE, MANIFEST.backend.source);
  const input = path.join(WORK, 'frontend', 'input.raz');
  const rirPath = path.join(WORK, 'backend', 'input.rir');
  const cppPath = path.join(WORK, 'backend', 'output.cpp');
  const binPath = path.join(WORK, 'backend', process.platform === 'win32' ? 'output.exe' : 'output');
  fs.copyFileSync(RUNTIME, path.join(WORK, 'backend', 'raz_runtime.hpp'));
  fs.copyFileSync(source, input);
  const frontend = spawnSync(built.bin, [], { cwd: WORK, encoding: 'utf8', timeout: 30000 });
  if (frontend.status !== 0 || !fs.existsSync(path.join(WORK, 'frontend', 'output.rir'))) {
    return { ok: false, details: `frontend could not produce RIR for backend input\n${frontend.stdout ?? ''}\n${frontend.stderr ?? ''}` };
  }
  fs.copyFileSync(path.join(WORK, 'frontend', 'output.rir'), rirPath);

  const verifier = getVerifier();
  if (!verifier.ok) return verifier;
  const verification = runVerifier(verifier.bin, fs.readFileSync(rirPath, 'utf8'));
  if (verification.proc.status !== 0 || !verification.report.includes('RIR-1 OK')) {
    return { ok: false, details: `RIR verifier rejected frontend output before backend:
${verification.report}
${verification.proc.stderr ?? ''}` };
  }

  const backendRun = spawnSync(backendBin, [], { cwd: WORK, encoding: 'utf8', timeout: 30000 });
  if (backendRun.status !== 0 || !fs.existsSync(cppPath)) {
    return { ok: false, details: `backend execution failed with status ${backendRun.status}\n${backendRun.stdout ?? ''}\n${backendRun.stderr ?? ''}` };
  }

  const native = spawnSync('c++', ['-std=c++17', '-O0', cppPath, '-o', binPath], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (native.status !== 0) {
    return { ok: false, details: `generated C++ failed to compile:\n${native.stdout ?? ''}\n${native.stderr ?? ''}` };
  }
  const program = spawnSync(binPath, [], { cwd: WORK, encoding: 'utf8', timeout: 30000 });
  if (program.status !== MANIFEST.backend.exit) {
    return { ok: false, details: `backend program exit ${program.status}, expected ${MANIFEST.backend.exit}` };
  }

  const rir = fs.readFileSync(rirPath, 'utf8');
  const cpp = fs.readFileSync(cppPath, 'utf8');
  const missingRir = MANIFEST.backend.rir_contains.filter(x => !rir.includes(x));
  const missingCpp = MANIFEST.backend.cpp_contains.filter(x => !cpp.includes(x));
  if (missingRir.length || missingCpp.length) {
    return { ok: false, details: `backend markers missing; RIR=${missingRir.join(', ')} C++=${missingCpp.join(', ')}` };
  }
  return { ok: true, details: `RIR=${rir.length} bytes; C++=${cpp.length} bytes; exit=${program.status}` };
}

const backend = BACKEND ? testBackend() : { ok: true, details: 'skipped (run npm run test:backend)' };
if (backend.ok) {
  passed++;
  console.log(`[PASS] raz-native-cpp-backend (${backend.details})`);
} else {
  failed++;
  console.log(`[FAIL] raz-native-cpp-backend`);
  console.log(backend.details);
}

function buildVerifier() {
  const verifierTmp = path.join(TMP, 'verifier-build');
  fs.mkdirSync(verifierTmp, { recursive: true });
  const cpp = path.join(verifierTmp, 'rir_verify.cpp');
  const bin = path.join(verifierTmp, process.platform === 'win32' ? 'rir_verify.exe' : 'rir_verify');
  fs.copyFileSync(RUNTIME, path.join(verifierTmp, 'raz_runtime.hpp'));
  const build = run(['compile', path.join(ROOT, 'src', 'ir', 'rir_verify.raz'), '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
  if (build.status !== 0) return { ok: false, details: `RIR verifier build failed:\n${build.stdout ?? ''}\n${build.stderr ?? ''}` };
  const cc = spawnSync('c++', ['-std=c++17', '-O0', cpp, '-o', bin], { cwd: verifierTmp, encoding: 'utf8', timeout: 30000 });
  if (cc.status !== 0) return { ok: false, details: `native RIR verifier build failed:\n${cc.stdout ?? ''}\n${cc.stderr ?? ''}` };
  return { ok: true, bin };
}

function runVerifier(bin, rir) {
  fs.writeFileSync(path.join(WORK, 'ir', 'input.rir'), rir, 'utf8');
  try { fs.rmSync(path.join(WORK, 'ir', 'verification.txt')); } catch {}
  const proc = spawnSync(bin, [], { cwd: WORK, encoding: 'utf8', timeout: 30000 });
  const reportPath = path.join(WORK, 'ir', 'verification.txt');
  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
  return { proc, report };
}

function testVerifier() {
  const built = getVerifier();
  if (!built.ok) return built;

  const valid = fs.readFileSync(path.join(HERE, 'cases/rir/valid.rir'), 'utf8');
  const validRun = runVerifier(built.bin, valid);
  if (validRun.proc.status !== 0 || !validRun.report.includes('RIR-1 OK')) {
    return { ok: false, details: `RIR verifier rejected valid RIR:
${validRun.report}
${validRun.proc.stderr ?? ''}` };
  }

  const validRef = fs.readFileSync(path.join(HERE, 'cases/rir/references.rir'), 'utf8');
  const refRun = runVerifier(built.bin, validRef);
  if (refRun.proc.status !== 0 || !refRun.report.includes('RIR-1 OK')) {
    return { ok: false, details: `RIR verifier rejected valid reference RIR:
${refRun.report}
${refRun.proc.stderr ?? ''}` };
  }

  const invalidLabel = fs.readFileSync(path.join(HERE, 'cases/rir/duplicate-label.rir'), 'utf8');
  const labelRun = runVerifier(built.bin, invalidLabel);
  if (labelRun.proc.status === 0 || !labelRun.report.includes('duplicate label')) {
    return { ok: false, details: `RIR verifier missed duplicate-label error:
${labelRun.report}` };
  }

  const invalidValue = fs.readFileSync(path.join(HERE, 'cases/rir/undefined-value.rir'), 'utf8');
  const valueRun = runVerifier(built.bin, invalidValue);
  if (valueRun.proc.status === 0 || !valueRun.report.includes('undefined value')) {
    return { ok: false, details: `RIR verifier missed undefined-value error:
${valueRun.report}` };
  }

  const invalidBranch = fs.readFileSync(path.join(HERE, 'cases/rir/bad-target.rir'), 'utf8');
  const branchRun = runVerifier(built.bin, invalidBranch);
  if (branchRun.proc.status === 0 || !branchRun.report.includes('control-flow target')) {
    return { ok: false, details: `RIR verifier missed invalid-branch-target error:
${branchRun.report}` };
  }

  return { ok: true, details: validRun.report.trim().replace(/\n/g, '; ') };
}

const verifier = testVerifier();
if (verifier.ok) {
  passed++;
  console.log(`[PASS] rir-verifier (${verifier.details})`);
} else {
  failed++;
  console.log(`[FAIL] rir-verifier`);
  console.log(verifier.details);
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
  const driver = path.join(ROOT, 'src', 'host', 'compiler.mjs');
  const source = path.join(HERE, 'cases/arithmetic.raz');
  const output = path.join(TMP, 'host-arithmetic.cpp');
  const p = spawnSync(process.execPath, [driver, 'compile', source, '-o', output, '--run'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  if (p.status !== 207) return { ok: false, details: `host driver exit=${p.status}\n${p.stdout ?? ''}\n${p.stderr ?? ''}` };
  if (!fs.existsSync(output)) return { ok: false, details: 'host driver did not produce C++' };
  return { ok: true, details: `native exit=${p.status}` };
}

function testHostSelfCompile() {
  const driver = path.join(ROOT, 'src', 'host', 'compiler.mjs');
  const output = path.join(TMP, 'host-self-compiler.cpp');
  const binary = path.join(TMP, process.platform === 'win32' ? 'host-self-compiler.exe' : 'host-self-compiler');
  console.log('[TRACE] host compiler start');
  const p = spawnSync(process.execPath, [driver, 'compile', path.join(ROOT, 'src', 'frontend', 'compiler.raz'), '-o', output], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 360000,
    env: { ...process.env, RAZ_FRONTEND_BIN: path.resolve(buildFrontend().bin) }
  });
  console.log('[TRACE] host compiler done status=' + p.status);
  if (p.status !== 0) return { ok: false, details: `host self-compile failed\n${p.stdout ?? ''}\n${p.stderr ?? ''}` };
  fs.copyFileSync(RUNTIME, path.join(TMP, 'raz_runtime.hpp'));
  console.log('[TRACE] native c++ start');
  const cc = spawnSync('c++', ['-std=c++17', '-O0', output, '-o', binary], { cwd: ROOT, encoding: 'utf8', timeout: 360000 });
  console.log('[TRACE] native c++ done status=' + cc.status);
  if (cc.status !== 0) return { ok: false, details: `native self-compiler build failed\n${cc.stdout ?? ''}\n${cc.stderr ?? ''}` };
  fs.copyFileSync(path.join(ROOT, 'src', 'frontend', 'compiler.raz'), path.join(WORK, 'frontend', 'input.raz'));
  console.log('[TRACE] native self run start');
  const self = spawnSync(binary, [], { cwd: WORK, encoding: 'utf8', timeout: 180000 });
  console.log('[TRACE] native self run done status=' + self.status);
  if (self.status !== 0) return { ok: false, details: `native self-compiler run failed with ${self.status}\n${self.stdout ?? ''}\n${self.stderr ?? ''}` };
  const produced = fs.readFileSync(path.join(WORK, 'frontend', 'output.rir'), 'utf8');
  const reference = fs.readFileSync(path.join(ROOT, '.build', 'host', 'work', 'backend', 'input.rir'), 'utf8');
  if (produced !== reference) return { ok: false, details: `self-compile RIR mismatch: generated=${produced.length} reference=${reference.length}` };
  return { ok: true, details: `self-RIR exact match (${produced.length} bytes)` };
}

if (HOST) {
  const host = testHostDriver();
  if (host.ok) { passed++; console.log(`[PASS] host-compiler (${host.details})`); }
  else { failed++; console.log('[FAIL] host-compiler'); console.log(host.details); }
}

if (BOOTSTRAP) {
  console.log('[TRACE] entering host self compile');
  const self = testHostSelfCompile();
  if (self.ok) { passed++; console.log(`[PASS] self-compile (${self.details})`); }
  else { failed++; console.log('[FAIL] self-compile'); console.log(self.details); }
}

console.log(`\npassed=${passed} failed=${failed}`);
process.exitCode = failed ? 1 : 0;
