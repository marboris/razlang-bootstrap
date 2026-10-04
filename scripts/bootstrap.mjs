#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.bootstrap');
const STAGE0 = path.join(ROOT, 'razc-stage0.mjs');
const LANGUAGE = path.join(ROOT, 'raz.language.json');
const TARGET = path.join(ROOT, 'cpp17.target.json');
const SOURCE = path.join(ROOT, 'stage1', 'compiler.raz');
const RUNTIME = path.join(ROOT, 'raz_runtime.hpp');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

function run(cmd, args, opts = {}) {
  const timeout = opts.timeout ?? 120000;
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    timeout,
    env: opts.env ?? process.env,
    stdio: opts.stdio ?? 'inherit',
  });
  if (r.error) throw new Error(`${cmd} failed: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${r.status}\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  }
  return r;
}

function buildGeneration(label) {
  const dir = path.join(TMP, label);
  const stageDir = path.join(dir, 'stage1');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.copyFileSync(RUNTIME, path.join(stageDir, 'raz_runtime.hpp'));
  fs.copyFileSync(SOURCE, path.join(stageDir, 'input.raz'));
  const cpp = path.join(dir, 'compiler.cpp');
  const bin = path.join(dir, 'compiler');

  run(process.execPath, [STAGE0, 'compile', SOURCE, '-o', cpp, '--language', LANGUAGE, '--target', TARGET]);
  fs.copyFileSync(RUNTIME, path.join(dir, 'raz_runtime.hpp'));
  run('c++', ['-std=c++17', '-O2', cpp, '-o', bin]);
  run(bin, [], { cwd: dir, timeout: 60000 });

  const rir = fs.readFileSync(path.join(stageDir, 'output.rir'), 'utf8');
  fs.writeFileSync(path.join(dir, 'output.rir'), rir, 'utf8');
  return { cpp, bin, rir };
}

console.log('[bootstrap] 1/4 Stage-0 -> native Stage-1 (generation A)');
const a = buildGeneration('generation-a');
console.log('[bootstrap] 2/4 native Stage-1 -> compiler.raz -> RIR-A');
console.log('[bootstrap] 3/4 Stage-0 -> native Stage-1 (generation B)');
const b = buildGeneration('generation-b');
console.log('[bootstrap] 4/4 compare generated RIR');

if (a.rir !== b.rir) {
  throw new Error(`bootstrap mismatch: generation-a=${a.rir.length} generation-b=${b.rir.length}`);
}

const report = [
  'Raz bootstrap report',
  '=====================',
  `source: ${SOURCE}`,
  `RIR bytes: ${a.rir.length}`,
  'native generation A: OK',
  'native generation B: OK',
  'RIR exact match: OK',
].join('\n') + '\n';
fs.writeFileSync(path.join(TMP, 'report.txt'), report, 'utf8');
console.log(report.trim());
