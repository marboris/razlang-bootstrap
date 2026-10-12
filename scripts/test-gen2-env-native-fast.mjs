#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const STDLIB = path.join(ROOT, 'library', 'raz');
const WORK = path.join(GEN2, 'build', 'env-native-fast');
const CXX = process.env.CXX ?? 'c++';

function run(command, args, expected = 0) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== expected) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}, expected ${expected}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
const source = path.join(WORK, 'env-test.cpp');
const binary = path.join(WORK, process.platform === 'win32' ? 'env-test.exe' : 'env-test');
fs.writeFileSync(source, [
  '#include <cstdlib>',
  '#include <string>',
  '#include "std/env/env_native.hpp"',
  'int main() {',
  '  unsetenv("RAZ_GEN2_TEST_ENV_VAR");',
  '  if (std_env_has("RAZ_GEN2_TEST_ENV_VAR")) return 1;',
  '  if (!std_env_get("RAZ_GEN2_TEST_ENV_VAR").empty()) return 2;',
  '  setenv("RAZ_GEN2_TEST_ENV_VAR", "raz-ok", 1);',
  '  if (!std_env_has("RAZ_GEN2_TEST_ENV_VAR")) return 3;',
  '  if (std_env_get("RAZ_GEN2_TEST_ENV_VAR") != "raz-ok") return 4;',
  '  if (std_env_os_name().empty() || std_env_architecture().empty()) return 5;',
  '  return 0;',
  '}',
  '',
].join('\n'));
run(CXX, ['-std=c++17', '-O0', source, '-I', STDLIB, '-o', binary]);
run(binary, []);
const module = fs.readFileSync(path.join(STDLIB, 'std', 'env', 'env.raz'), 'utf8');
for (const api of ['getEnv', 'hasEnv', 'osName', 'architecture']) {
  if (!module.includes(`function ${api}(`)) throw new Error(`std.env is missing ${api}`);
}
console.log('[gen2-env-fast] environment lookup, existence checks, OS and architecture metadata passed');
