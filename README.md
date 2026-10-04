# Raz Compiler Bootstrap

A small, data-oriented bootstrap compiler for the Raz language.

The project is intentionally structured so that the language frontend and semantic model can become self-hosted in Raz, while C++ remains only one possible native target.

## Pipeline

```text
Raz source
  -> Lexer
  -> Parser / AST
  -> Semantic analysis
  -> RIR-1
  -> RIR verification
  -> target backend
  -> native program
```

## Current stages

- **Stage-0** — `razc-stage0.mjs`: bootstrap compiler in Node.js/ESM. No JS classes are required by the compiler architecture.
- **Stage-1** — `stage1/compiler.raz`: frontend seed written in Raz and emitting RIR.
- **Stage-2** — `stage2/rir_backend.raz`: native RIR-to-C++ backend seed written in Raz and tested on the supported RIR subset.
- **Stage-3** — `stage3/rir_verify.raz`: RIR-1 verifier written in Raz.
- **Stage-4** — `stage4/host-driver.mjs`: temporary host bridge used while the native backend grows.

The current release is bootstrap-stable, but the final goal is complete self-hosting of the compiler and removal of the JavaScript host from normal compiler development.

## Tests

```bash
npm test
npm run test:stage2
npm run test:host
npm run test:targets
npm run bootstrap
```

`npm run check` runs the fast regression suites and target profiles. `npm run bootstrap` is kept as a separate reproducibility check because it builds native compiler generations.

## Targets

Target configuration is external to the language definition. Profiles are available for:

```text
cpp11.target.json
cpp14.target.json
cpp17.target.json
cpp20.target.json
cpp23.target.json
```

Use for example:

```bash
node razc-stage0.mjs compile tests/cases/arithmetic.raz \
  -o .build/arithmetic.cpp \
  --language raz.language.json \
  --target targets/cpp20.target.json
```

## Documentation

- `doc/ROADMAP.md` — English roadmap and complete project/file structure.
- `doc/rir.md` — short RIR-1 contract.
- `doc/README.fa.md` — short Persian project description.

## Source of truth

Source code, language/target specifications, tests, and documentation are version-controlled. Native binaries, generated C++, generated RIR snapshots, caches, and temporary test output are reproducible build artifacts and are intentionally ignored by Git.
