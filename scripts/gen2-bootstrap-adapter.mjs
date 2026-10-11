// Temporary compatibility layer used only while frozen Gen1 compiles Gen2.
// Gen2's canonical source requires quoted native headers (use "cstdint"),
// while Gen1 uses bare native names to emit angle-bracket C++ includes.
const NATIVE_HEADERS = ['cstdint', 'cstddef', 'string', 'vector'];

export function adaptGen2SourceForGen1Bootstrap(bundle) {
  let adapted = bundle
    .replace(/^use std\.(?:io|text|containers);\r?$/gm, '')
    .replace(/^use "(cstdint|cstddef|string|vector)";\r?$/gm, 'use $1;');

  // Frozen Gen1 models writeFile as void, while Gen2's source std.io module
  // returns bool. Preserve the canonical Gen2 failure path, but lower this one
  // call to a write + read-back check in the temporary Gen1 bootstrap input.
  // This remains a compatibility shim only; Gen2 source continues to use the
  // bool-returning std.io.writeFile API.
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
  if (!includes.includes('#include "raz_runtime.hpp"')) {
    throw new Error('Gen2 compiler bootstrap source omitted explicit native dependency: #include "raz_runtime.hpp"');
  }
  if (includes.some((line) => line.includes('iostream') || line.includes('fstream'))) {
    throw new Error('Gen2 compiler output unexpectedly includes runtime transitive headers');
  }
  return true;
}
