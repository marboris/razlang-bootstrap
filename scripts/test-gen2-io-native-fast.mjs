#!/usr/bin/env node
// Fast isolated check for std.io's native file-write contract. This does not
// build or run the Gen2 compiler, so it remains useful while bootstrap is blocked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADER_DIR = path.join(ROOT, 'library', 'raz', 'std', 'io');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'raz-gen2-io-fast-'));

function run(command, args, expectedStatus = 0) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000 });
  if (result.error) throw result.error;
  if (result.status !== expectedStatus) {
    throw new Error(`${command} ${args.join(' ')}: expected exit ${expectedStatus}, got ${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return result;
}

try {
  const source = path.join(WORK, 'write-check.cpp');
  const binary = path.join(WORK, 'write-check');
  fs.writeFileSync(source, String.raw`#include "io_native.hpp"
#include <string>
namespace raz_internal_process { int argc = 0; char** argv = nullptr; }
int main(int argc, char** argv) {
    raz_internal_process::argc = argc;
    raz_internal_process::argv = argv;
    if (argc != 3) return 2;
    if (std_io_arg_count() != 3) return 3;
    if (std_io_arg_at(1) != std::string(argv[1])) return 4;
    if (!std_io_write_file(std::string(argv[1]), std::string("raz-native-write-ok"))) return 10;
    if (std_io_write_file(std::string(argv[2]), std::string("should-fail"))) return 11;
    return 0;
}
`);
  run(process.env.CXX ?? 'c++', ['-std=c++17', '-O0', source, '-I', HEADER_DIR, '-o', binary]);
  const writtenFile = path.join(WORK, 'written.txt');
  const missingDirectoryFile = path.join(WORK, 'no-such-directory', 'output.txt');
  run(binary, [writtenFile, missingDirectoryFile]);
  if (fs.readFileSync(writtenFile, 'utf8') !== 'raz-native-write-ok') {
    throw new Error('std_io_write_file wrote unexpected contents');
  }
  console.log('[gen2-io-fast] generic process arguments and native file-write success/failure passed');
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
}
