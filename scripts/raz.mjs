#!/usr/bin/env node
// Thin compatibility launcher for Gen2. Module parsing/resolution lives in Raz
// (compiler/razc/src/source/modules.raz); this script only launches razc and,
// for `build`, invokes the native C++ compiler with the same search roots.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN2 = path.join(ROOT, 'compiler', 'razc');
const STDLIB = path.join(ROOT, 'library', 'raz');
const CANDIDATE = path.join(GEN2, 'build', process.platform === 'win32' ? 'razc-candidate.exe' : 'razc-candidate');

function usage() {
  console.log(`Raz Gen2 preview launcher\n\nUsage:\n  raz emit-cpp <input.raz> -o <output.cpp> [-L <module-root> ...]\n  raz build <input.raz> -o <executable> [--emit-cpp <output.cpp>]\n      [-L <module-root> ...] [-I <native-include-root> ...] [--release] [--cpu <model>]\n\nModule resolution is performed by the Gen2 compiler in Raz.\nuse std.io resolves from the compiler's standard-library root; -L adds module roots.\nQuoted native headers, e.g. use "cstdint", are emitted as C++ includes.`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ''}${result.stderr ?? ''}` : '';
    throw new Error(`${command} exited with ${result.status}${detail}`);
  }
  return result;
}

function parseArgs(argv) {
  const action = argv[0];
  if (action === '--help' || action === '-h' || !action) return { help: true };
  if (action !== 'build' && action !== 'emit-cpp') throw new Error(`unknown command: ${action}`);
  const input = argv[1];
  if (!input || input.startsWith('-')) throw new Error('an input .raz file is required');
  const result = {
    action,
    input: path.resolve(process.cwd(), input),
    output: '',
    cppOutput: '',
    moduleRoots: [],
    includeRoots: [],
    release: false,
    cpu: 'generic',
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o') {
      if (++i >= argv.length) throw new Error('missing path after -o');
      result.output = path.resolve(process.cwd(), argv[i]);
    } else if (arg === '--emit-cpp') {
      if (++i >= argv.length) throw new Error('missing path after --emit-cpp');
      result.cppOutput = path.resolve(process.cwd(), argv[i]);
    } else if (arg === '-L' || arg === '--module-path' || arg === '--std-path') {
      if (++i >= argv.length) throw new Error(`missing path after ${arg}`);
      result.moduleRoots.push(path.resolve(process.cwd(), argv[i]));
    } else if (arg === '-I') {
      if (++i >= argv.length) throw new Error('missing path after -I');
      result.includeRoots.push(path.resolve(process.cwd(), argv[i]));
    } else if (arg === '--release') {
      result.release = true;
    } else if (arg === '--cpu') {
      if (++i >= argv.length) throw new Error('missing processor model after --cpu');
      result.cpu = argv[i];
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  if (!result.output) throw new Error('-o <path> is required');
  if (result.action === 'emit-cpp' && !result.output.endsWith('.cpp')) throw new Error('emit-cpp output should end with .cpp');
  if (result.action === 'build' && result.output.endsWith('.cpp')) throw new Error('build -o expects an executable path, not .cpp');
  if (!['generic', 'native'].includes(result.cpu) && !/^[A-Za-z0-9_-]+$/.test(result.cpu)) throw new Error(`invalid processor model: ${result.cpu}`);
  return result;
}

function main() {
  try {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) { usage(); return 0; }
    if (!fs.existsSync(CANDIDATE)) throw new Error(`Gen2 candidate is missing: ${CANDIDATE}. Run npm run build:gen2 first.`);
    if (!fs.existsSync(config.input)) throw new Error(`input file does not exist: ${config.input}`);

    const cpp = config.action === 'emit-cpp' ? config.output : (config.cppOutput || `${config.output}.cpp`);
    fs.mkdirSync(path.dirname(cpp), { recursive: true });
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    const compilerArgs = [config.input, '--emit-cpp', cpp, '-L', STDLIB];
    for (const root of config.moduleRoots) compilerArgs.push('-L', root);
    run(CANDIDATE, compilerArgs);
    if (config.action === 'emit-cpp') return 0;

    const cppArgs = ['-std=c++17', config.release ? '-O2' : '-O0'];
    if (config.cpu === 'native') cppArgs.push('-march=native');
    else if (config.cpu !== 'generic') cppArgs.push(`-march=${config.cpu}`);
    cppArgs.push(cpp, '-I', path.dirname(config.input), '-I', STDLIB);
    for (const root of config.moduleRoots) cppArgs.push('-I', root);
    for (const root of config.includeRoots) cppArgs.push('-I', root);
    cppArgs.push('-o', config.output);
    run(process.env.CXX || 'c++', cppArgs);
    fs.chmodSync(config.output, 0o755);
    console.log(`[raz] executable ready: ${config.output}`);
    if (!config.cppOutput) fs.rmSync(cpp, { force: true });
    return 0;
  } catch (error) {
    console.error(`[raz] ${error.message}`);
    return 1;
  }
}

process.exitCode = main();
