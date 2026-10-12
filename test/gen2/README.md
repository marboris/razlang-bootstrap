# Gen2 emitted-C++ tests

These tests validate Raz-to-C++ translation, not just the runtime result of a Raz program.

## Run

```sh
make test-gen2-deep
# Use Clang instead of the default C++ compiler:
CXX=clang++ make test-gen2-deep
# Override the downstream optimization level:
RAZ_TEST_OPT=-O0 make test-gen2-deep
```

The harness uses `compiler/razc/build/razc-candidate` by default. To test the promoted compiler:

```sh
RAZC=compiler/razc/bin/razc make test-gen2-deep
```

## What each positive case checks

For every `.raz` case the harness:

1. asks Gen2 to emit C++ without running the Raz program itself;
2. checks required C++ fragments and rejects old decimal-encoded identifiers or unexpectedly long names;
3. compiles the emitted C++ with C++17 and the chosen optimization level;
4. runs the native executable and checks its exit status as a semantic smoke check.

The cases cover arithmetic/control flow, short-circuit evaluation, structs and references, module/library use, containers, globals, local scopes, native C++ calls, `define` macros, the currently supported `char*` subset, and primitive type lowering including character literals. Negative cases verify that type mismatches, unresolved modules and currently unsupported non-`char*` pointer types fail during Raz compilation rather than creating a fresh C++ output.

The C++ marker assertions are intentional: they verify that the backend emits the expected target constructs and ABI names. Executable outcomes are a secondary check, not the sole acceptance criterion. Generated artifacts remain available under `compiler/razc/build/deep-test/` for manual inspection.
