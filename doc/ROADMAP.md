# Raz Compiler — Roadmap and Project Structure

## Project goal

Raz is being developed as a self-hosting compiler project. The initial compiler is implemented in Node.js/ESM only as a bootstrap implementation. Its job is to establish the language semantics, an explicit intermediate representation (RIR), and a native backend path.

The long-term goal is that the compiler itself is written in Raz and that a native Raz compiler can rebuild the same compiler, eliminating the JavaScript bootstrap dependency for normal development.

The central pipeline is:

```text
Raz source
  -> lexer
  -> parser
  -> semantic analysis
  -> RIR
  -> RIR verification/passes
  -> target backend
  -> native program
```

RIR is the architectural boundary between the language/frontend and target-specific code generation. C++ is a backend target, not the definition of the language.

## Roadmap

## Current status

The current release is a stable bootstrap milestone. The regression suite and C++ target-profile smoke tests pass in the reference environment. Stage-1 can parse and lower its own compiler source to RIR, and two independently built native Stage-1 generations produce identical RIR.

The first architecture-hardening pass now makes the frontend syntax explicitly configurable through `raz.language.json`: declaration and statement keywords, expression keywords, punctuation, and unary/binary operator sets are language-spec data rather than parser literals. Assignment lowering also uses the RIR `store_ref` contract so nested member/index lvalues share one lowering path.

The full native self-hosting endpoint is intentionally still a roadmap item: Stage-2 currently covers the tested RIR subset, while Stage-4 contains a temporary Node.js host bridge for broader frontend/backend integration. This boundary is explicit so the project can replace the bridge with native Raz components without changing the language/frontend contract.


### Stage 0 — Bootstrap foundation

`razc-stage0.mjs` provides the initial compiler in Node.js. It contains the frontend, semantic checks, RIR lowering, a small optimization layer, and a C++17-oriented backend. Language and target configuration are loaded from external files.

### Stage 1 — Native Raz frontend

`stage1/compiler.raz` reimplements the frontend in Raz and emits RIR. This is the first component that demonstrates that Raz can describe and execute compiler logic itself.

### Stage 2 — Native Raz backend

`stage2/rir_backend.raz` is the beginning of a backend written in Raz. Its purpose is to remove the remaining dependency on a JavaScript backend for the native compilation path.

### Stage 3 — RIR contract

`stage3/rir_verify.raz` validates RIR-1. The verifier makes the interface between frontend and backend explicit and testable.

### Stage 4 — Bootstrap validation

The bootstrap scripts rebuild native compiler components and compare generated RIR across generations. The important criterion is semantic reproducibility, not merely successful text generation.

#
## Architecture invariants for the bootstrap

The bootstrap is developed around a small set of invariants.

1. **Language source of truth** — user-visible syntax and language semantics belong in the language specification, not in parser conditionals. Bootstrap defaults in `razc-stage0.mjs` exist only as recovery data for the initial seed.
2. **RIR as the contract** — frontend and backend communicate through RIR; target backends must not depend on AST details.
3. **Lvalues are references** — mutation of a name, field, or index is represented by reference formation plus `store_ref`, avoiding target-specific AST cases.
4. **Semantic failures happen before code generation** — constructor arguments, assignments, calls, returns, and control-flow conditions must be rejected in the frontend rather than delegated to the generated C++ compiler.
5. **Bootstrap proof is reproducibility plus independence** — equal output from two generations is necessary, while the final milestone additionally requires the generated Raz compiler to rebuild the compiler without the JavaScript implementation in the normal development path.

### Next bootstrap milestones

**B1 — complete frontend contract:** formalize lexical rules and diagnostics in the language specification, strengthen type checking and source locations, and make Stage-1 consume the same contract.

**B2 — complete RIR contract:** define the typed instruction set, operand constraints, CFG/terminator rules, calls, references, and data layout semantics; upgrade Stage-3 from structural validation to full RIR verification.

**B3 — native backend:** make Stage-2 consume the complete RIR contract and eliminate its string/heuristic type inference.

**B4 — self-hosting closure:** build the Raz compiler, including its backend path, from Raz source and compare the resulting compiler generations.

**B5 — language evolution layer:** only after B4 is stable, expand the language's type system, syntax, standard facilities, and diagnostics independently from the bootstrap mechanism.

## Final self-hosting milestone

The compiler should be maintained primarily as Raz source:

```text
Stage-0 JS
   -> native Raz compiler
   -> same Raz compiler source
   -> same RIR / equivalent native compiler
```

At that point the JavaScript implementation becomes historical bootstrap infrastructure rather than the implementation used for normal compiler development.

### Later compiler work

After self-hosting is stable, the project can grow the language and compiler independently: richer type systems, diagnostics, modules, generics, compile-time facilities, optimization passes, additional runtime facilities, and multiple target backends.

## Project structure

```text
razc-project/
├── razc-stage0.mjs
├── raz.language.json
├── raz_runtime.hpp
├── cpp17.target.json
├── package.json
├── targets/
│   ├── cpp11.target.json
│   ├── cpp14.target.json
│   ├── cpp17.target.json
│   ├── cpp20.target.json
│   └── cpp23.target.json
│
├── stage1/
│   ├── compiler.raz
│   ├── lexer.raz
│   └── README.md
│
├── stage2/
│   ├── rir_backend.raz
│   └── README.md
│
├── stage3/
│   ├── rir_verify.raz
│   └── README.md
│
├── stage4/
│   ├── host-driver.mjs
│   └── README.md
│
├── tests/
│   ├── run-tests.mjs
│   ├── manifest.json
│   ├── README.md
│   └── cases/
│       ├── *.raz
│       └── rir/*.rir
│
├── scripts/
│   ├── bootstrap.mjs
│   └── test-targets.mjs
│
└── doc/
    ├── README.fa.md
    ├── هدف-پروژه.md
    ├── rir.md
    └── ROADMAP.md
```

## File roles

- `razc-stage0.mjs`: bootstrap compiler and reusable compiler APIs.
- `raz.language.json`: external description of the currently supported language surface.
- `raz_runtime.hpp`: runtime support used by generated native programs.
- `cpp17.target.json`: compatibility target kept at the project root for the original command examples.
- `targets/*.target.json`: target profiles. They define compiler flags, type mappings, runtime linkage, builtins, and intrinsic lowering templates.
- `stage1/compiler.raz`: self-hosting frontend seed written in Raz.
- `stage1/lexer.raz`: early lexer component written in Raz.
- `stage2/rir_backend.raz`: Raz implementation of the RIR-to-C++ backend path.
- `stage3/rir_verify.raz`: RIR verifier written in Raz.
- `stage4/host-driver.mjs`: temporary bridge used while the native backend is being completed in Raz.
- `tests/run-tests.mjs`: deterministic compiler regression suite.
- `tests/cases/`: source and RIR fixtures used by the tests.
- `scripts/bootstrap.mjs`: reproducible native bootstrap workflow.
- `scripts/test-targets.mjs`: compiles and runs a small program against every configured C++ target profile.
- `doc/rir.md`: concise RIR contract documentation.
- `doc/README.fa.md` and `doc/هدف-پروژه.md`: short Persian project descriptions.
- `.gitignore`: excludes generated native binaries, generated C/C++/RIR artifacts, caches, and temporary test output.

## Target profiles

The target layer is intentionally separate from the language layer. Therefore multiple C++ standards can be represented as profiles without changing the frontend or RIR semantics:

```text
Raz language
    |
    v
   RIR
    |
    +--> cpp11.target.json
    +--> cpp14.target.json
    +--> cpp17.target.json
    +--> cpp20.target.json
    +--> cpp23.target.json
```

A future non-C++ backend can use the same RIR contract without changing the language frontend.

## Build artifacts and source of truth

Tracked files should describe the compiler and its tests. Native binaries, generated C++, generated RIR snapshots, caches, and temporary outputs are reproducible artifacts and should not be required in version control.

## References for study

- Compiler: https://en.wikipedia.org/wiki/Compiler
- Bootstrapping (compilers): https://en.wikipedia.org/wiki/Bootstrapping_(compilers)
- Self-hosting: https://en.wikipedia.org/wiki/Self-hosting
- Intermediate representation: https://en.wikipedia.org/wiki/Intermediate_representation
- LLVM: https://llvm.org/docs/
- MLIR: https://mlir.llvm.org/docs/

These references are starting points for compiler architecture, bootstrapping, intermediate representations, optimization, and extensible compiler infrastructure.
