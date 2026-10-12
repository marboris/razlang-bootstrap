#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptGen2SourceForGen1Bootstrap, validateGen2BootstrapIncludes } from './gen2-bootstrap-adapter.mjs';

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const canonical = [
  'use std.io;',
  'use std.text;',
  'use std.containers;',
  'use "cstdint";',
  'use "cstddef";',
  'use "string";',
  'use "vector";',
  'return 0;',
  '',
].join('\n');
const adapted = adaptGen2SourceForGen1Bootstrap(canonical);
expect(!/^use std\.(?:io|text|containers);$/m.test(adapted), 'bootstrap adapter must remove source std modules for frozen Gen1');
for (const header of ['cstdint', 'cstddef', 'string', 'vector']) {
  expect(adapted.includes(`use ${header};`), `bootstrap adapter did not map use "${header}" to Gen1 syntax`);
  expect(!adapted.includes(`use "${header}";`), `bootstrap adapter left use "${header}" untranslated`);
}
expect(canonical.includes('use "cstdint";') && canonical.includes('use std.io;'), 'adapter unexpectedly requires mutating canonical Gen2 source');

const canonicalDriverWrite = [
  '    if (!writeFile(gOutputPath, gCpp)) {',
  '        print("razc: cannot write output: " + gOutputPath);',
  '        return 1;',
  '    }',
].join('\n');
const adaptedDriverWrite = adaptGen2SourceForGen1Bootstrap(canonicalDriverWrite);
expect(adaptedDriverWrite.includes('writeFile(gOutputPath, gCpp);'), 'bootstrap adapter must lower Gen2 checked writes to the Gen1 void API');
expect(adaptedDriverWrite.includes('if (readFile(gOutputPath) != gCpp)'), 'bootstrap output check must verify the write by reading it back');
expect(!adaptedDriverWrite.includes('!writeFile('), 'bootstrap input must not apply boolean negation to Gen1 void writeFile');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundledSource = fs.readFileSync(path.join(ROOT, 'compiler', 'razc', 'compiler.raz'), 'utf8');
if (bundledSource.includes('if (!writeFile(gOutputPath, gCpp))')) {
  const bootstrapBundle = adaptGen2SourceForGen1Bootstrap(bundledSource);
  expect(!bootstrapBundle.includes('!writeFile(gOutputPath, gCpp)'), 'actual Gen2 bundle must be adapted before frozen Gen1 sees it');
  expect(bootstrapBundle.includes('if (readFile(gOutputPath) != gCpp)'), 'actual Gen2 bundle must retain a bootstrap-safe output integrity check');
}

const validOutput = [
  '#include <cstdint>',
  '#include <cstddef>',
  '#include <string>',
  '#include <vector>',
  '#include "gen1_bootstrap_compat.hpp"',
  'int main() { return 0; }',
].join('\n');
expect(validateGen2BootstrapIncludes(validOutput), 'valid bootstrap includes should pass');
let missingFailed = false;
try {
  validateGen2BootstrapIncludes(validOutput.replace('#include <cstdint>\n', ''));
} catch (error) {
  missingFailed = String(error).includes('omitted explicit native dependency');
}
expect(missingFailed, 'missing explicit native dependency should be rejected');
let transitiveFailed = false;
try {
  validateGen2BootstrapIncludes(`${validOutput}\n#include <iostream>\n`);
} catch (error) {
  transitiveFailed = String(error).includes('bootstrap-only transitive headers');
}
expect(transitiveFailed, 'unexpected transitive runtime include should be rejected');

console.log('[gen2-bootstrap-contract] Gen1 syntax adapter and explicit include validation passed');
