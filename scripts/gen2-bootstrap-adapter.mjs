// Temporary compatibility layer used only while frozen Gen1 compiles Gen2.
// Gen1's backend has a built-in mapping to raz::* functions. Gen2's normal
// compiler does not use this shim: its standard library declares native
// headers/modules explicitly and emitted user programs do not include it.
import { legacyRuntimeHeader } from './legacy-runtime.mjs';

const NATIVE_HEADERS = ['cstdint', 'cstddef', 'string', 'vector'];

export function gen1BootstrapCompatHeader() {
  return legacyRuntimeHeader();
}

export function adaptGen2SourceForGen1Bootstrap(bundle) {
  let adapted = bundle
    .replace(/^use std\.(?:io|text|containers);\r?$/gm, '')
    .replace(/^use "(cstdint|cstddef|string|vector)";\r?$/gm, 'use $1;');

  // Frozen Gen1 models writeFile as void, while Gen2's source std.io returns
  // bool. In the bootstrap-only copy, lower the checked write to write + readback.
  const checkedWrite = /    if \(!writeFile\(gOutputPath, gCpp\)\) \{\r?\n        print\("razc: cannot write output: " \+ gOutputPath\);\r?\n        return 1;\r?\n    \}/g;
  const matches = [...adapted.matchAll(checkedWrite)];
  if (matches.length > 1) {
    throw new Error('Gen2 bootstrap adapter found multiple checked output writes; update the compatibility shim explicitly');
  }
  if (matches.length === 1) {
    adapted = adapted.replace(checkedWrite,
      '    writeFile(gOutputPath, gCpp);\n    if (readFile(gOutputPath) != gCpp) {\n        print("razc: cannot write output: " + gOutputPath);\n        return 1;\n    }');
  }
  return adapted;
}

export function validateGen2BootstrapIncludes(cpp) {
  const includes = cpp.split(/\r?\n/).filter((line) => line.startsWith('#include'));
  for (const header of NATIVE_HEADERS) {
    const expected = `#include <${header}>`;
    if (!includes.includes(expected)) {
      throw new Error(`Gen2 compiler bootstrap source omitted explicit native dependency: ${expected}`);
    }
  }
  if (!includes.includes('#include "gen1_bootstrap_compat.hpp"')) {
    throw new Error('Gen2 bootstrap output omitted its temporary Gen1 compatibility adapter');
  }
  if (includes.some((line) => line.includes('iostream') || line.includes('fstream'))) {
    throw new Error('Gen2 compiler output unexpectedly includes bootstrap-only transitive headers');
  }
  return true;
}
