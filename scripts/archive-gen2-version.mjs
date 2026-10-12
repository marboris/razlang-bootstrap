#!/usr/bin/env node
// Snapshot a finished Gen2 candidate before promoting it to compiler/razc/bin.
// The release is immutable: binary, checksum, canonical entry, flattened bootstrap
// input, compiler modules, and standard-library sources travel together.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const RELEASES = path.join(ROOT, 'compiler', 'releases');
const STDLIB = path.join(ROOT, 'library', 'raz');
const CANDIDATE = path.resolve(process.env.RAZ_GEN2_CANDIDATE ?? path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate'));
const ACTIVE_BIN = path.join(GEN2, 'bin', process.platform === 'win32' ? 'razc.exe' : 'razc');
const ACTIVE_SUM = path.join(GEN2, 'bin', 'razc.sha256');
const BUNDLE = path.join(GEN2, 'build', 'bootstrap', 'compiler.bundle.raz');

function fail(message) {
  console.error(`[archive-gen2] ${message}`);
  process.exit(2);
}

function runVersion(binary) {
  const result = spawnSync(binary, ['--version'], { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} --version exited ${result.status}: ${result.stderr ?? ''}`);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
}

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+-g2-\d+$/.test(version)) {
  fail('usage: node scripts/archive-gen2-version.mjs <semver-g2-NNN>, e.g. 0.4.0-g2-016');
}
const releaseDir = path.join(RELEASES, version);
if (fs.existsSync(releaseDir)) fail(`release already exists and is immutable: ${releaseDir}`);
if (!fs.existsSync(CANDIDATE)) fail(`candidate not found: ${CANDIDATE}; build the candidate first`);
if (!fs.existsSync(BUNDLE)) fail(`flattened bootstrap source not found: ${BUNDLE}; run make bundle-gen2 or a Gen2 build first`);
if (!fs.existsSync(path.join(GEN2, 'compiler.raz')) || !fs.existsSync(path.join(GEN2, 'src'))) {
  fail('canonical compiler entry or modular source tree is missing');
}

let candidateVersion;
try {
  candidateVersion = runVersion(CANDIDATE);
} catch (error) {
  fail(`candidate is not executable: ${error.message}`);
}
if (!candidateVersion.includes(version)) {
  fail(`candidate version mismatch; requested ${version}, got '${candidateVersion}'`);
}

// Never replace the active compiler unless the version it replaces already has
// a preserved release snapshot.
if (fs.existsSync(ACTIVE_BIN)) {
  let currentVersion = '';
  try { currentVersion = runVersion(ACTIVE_BIN); } catch { /* reported below */ }
  const found = currentVersion.match(/\d+\.\d+\.\d+-g2-\d+/)?.[0];
  if (!found || !fs.existsSync(path.join(RELEASES, found))) {
    fail(`refusing to replace active binary: current version '${currentVersion || 'unknown'}' has no release snapshot`);
  }
}

fs.mkdirSync(path.dirname(releaseDir), { recursive: true });
fs.mkdirSync(releaseDir, { recursive: false });
try {
  const releaseBin = path.join(releaseDir, 'razc');
  fs.copyFileSync(CANDIDATE, releaseBin);
  fs.chmodSync(releaseBin, 0o755);
  const sha = digest(releaseBin);
  fs.writeFileSync(path.join(releaseDir, 'razc.sha256'), `${sha}  razc\n`);

  fs.copyFileSync(path.join(GEN2, 'compiler.raz'), path.join(releaseDir, 'compiler.raz'));
  fs.copyFileSync(BUNDLE, path.join(releaseDir, 'compiler.bundle.raz'));
  copyTree(path.join(GEN2, 'src'), path.join(releaseDir, 'src'));
  copyTree(path.join(STDLIB, 'std'), path.join(releaseDir, 'std'));
  fs.copyFileSync(path.join(GEN2, 'LANGUAGE-MAP.md'), path.join(releaseDir, 'LANGUAGE-MAP.md'));
  const metadata = JSON.parse(fs.readFileSync(path.join(GEN2, 'gen.json'), 'utf8'));
  metadata.status = 'frozen-release-snapshot';
  metadata.release_version = version;
  metadata.compiled_by = process.env.RAZ_BUILD_KIND ?? 'candidate produced by the selected Gen2 build workflow';
  metadata.source = 'src/';
  metadata.final_file = 'compiler.raz';
  metadata.binary = 'razc';
  metadata.checksum = 'razc.sha256';
  metadata.build_dir = 'build/';
  fs.writeFileSync(path.join(releaseDir, 'gen.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  fs.writeFileSync(path.join(releaseDir, 'release.json'), `${JSON.stringify({
    version,
    generation: 2,
    status: 'frozen',
    compiler_version_output: candidateVersion,
    binary: 'razc',
    sha256: sha,
    canonical_entry: 'compiler.raz',
    flattened_bootstrap_source: 'compiler.bundle.raz',
    compiler_source_snapshot: 'src/',
    standard_library_snapshot: 'std/',
    created_at: new Date().toISOString(),
    build_kind: process.env.RAZ_BUILD_KIND ?? 'unspecified',
    note: 'Immutable release snapshot; preserve this directory after future compiler upgrades.'
  }, null, 2)}\n`);

} catch (error) {
  // A failed snapshot must never alter the active binary. Remove only the
  // incomplete new release directory; prior releases are never modified.
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fail(error.message);
}

// Promotion occurs only after the release source and binary snapshot are complete.
fs.copyFileSync(path.join(releaseDir, 'razc'), ACTIVE_BIN);
fs.chmodSync(ACTIVE_BIN, 0o755);
const activeSha = digest(ACTIVE_BIN);
fs.writeFileSync(ACTIVE_SUM, `${activeSha}  razc\n`);
const activeMetaPath = path.join(GEN2, 'gen.json');
const activeMeta = JSON.parse(fs.readFileSync(activeMetaPath, 'utf8'));
activeMeta.active_binary_version = version;
activeMeta.active_binary_sha256 = activeSha;
activeMeta.compiled_by = process.env.RAZ_BUILD_KIND ?? 'candidate produced by the selected Gen2 build workflow';
activeMeta.release_history ??= [];
activeMeta.release_history.push({ version, sha256: activeSha, release: `compiler/releases/${version}/` });
fs.writeFileSync(activeMetaPath, `${JSON.stringify(activeMeta, null, 2)}\n`);
console.log(`[archive-gen2] saved immutable ${version} under ${releaseDir}`);
console.log(`[archive-gen2] promoted ${version} to ${ACTIVE_BIN}`);
