# Native day-to-day build/test path. If Ninja is installed it is preferred;
# GNU Make remains available through: make GENERATOR='Unix Makefiles'.
BUILD_DIR ?= build/native
BUILD_TYPE ?= Debug
GENERATOR ?= $(shell command -v ninja >/dev/null 2>&1 && echo Ninja || echo 'Unix Makefiles')
CMAKE ?= cmake
CXX ?= g++
NODE ?= node

.PHONY: all configure driver test test-native test-gen2-deep test-gen2-fast test-gen2 test-all clean build-gen0 build-gen1 build-gen2 build-gen2-selfhost archive-gen2-version bundle-gen2 bootstrap-candidates help

all: driver

help:
	@printf '%s\n' \
	  'Native Raz workflow:' \
	  '  make                 Configure/build the native razc driver with CMake (Ninja when available)' \
	  '  make test            Run native CTest driver tests (does not build Gen2)' \
	  '  make test-gen2-fast  Run the Gen2 fast regression scripts against the current candidate' \
	  '  make test-gen2-deep  Compile deep language cases to C++, inspect generated C++, build with -O2 and run' \
	  '  make test-gen2       Run all Gen2 source, regression, native C++, and deep transpilation checks' \
	  '  make test-all        Run CTest, every Gen2 suite, and legacy frontend/backend regression tests' \
	  '  make build-gen2      Build a Gen2 candidate with the frozen Gen1 baseline' \
	  '  make build-gen2-selfhost Run staged Gen2 self-host; require a stable stage-2/stage-3 C++ fixed point' \
	  '  make archive-gen2-version VERSION=0.4.0-g2-016 Snapshot source+stdlib+binary, then promote candidate' \
	  '  make bootstrap-candidates Build the active Gen2 candidate with the frozen Gen1 compiler' \
	  '  make bundle-gen2     Assemble Gen2 source bundle only' \
	  '  make build-gen1      Rebuild the archived Gen1 candidate (legacy only)' \
	  '  make build-gen0      Rebuild the archived Gen0 native candidate (legacy only)' \
	  '  make clean           Remove the CMake/Ninja build directory'

configure:
	$(CMAKE) -S . -B $(BUILD_DIR) -G "$(GENERATOR)" -DCMAKE_CXX_COMPILER="$(CXX)" -DCMAKE_BUILD_TYPE=$(BUILD_TYPE) -DBUILD_TESTING=ON

driver: configure
	$(CMAKE) --build $(BUILD_DIR) --target razc --parallel

test: configure
	$(CMAKE) --build $(BUILD_DIR) --parallel
	ctest --test-dir $(BUILD_DIR) --output-on-failure

test-native: test

test-gen2-fast:
	$(NODE) scripts/check-gen2-source.mjs
	$(NODE) scripts/test-gen2-fast.mjs
	$(NODE) scripts/test-gen2-resolver-fast.mjs
	$(NODE) scripts/test-gen2-io-native-fast.mjs
	$(NODE) scripts/test-gen2-env-native-fast.mjs
	$(NODE) scripts/test-gen2-driver-fast.mjs
	$(NODE) scripts/test-gen2-bootstrap-contract.mjs

test-gen2-deep:
	$(NODE) test/gen2/run.mjs

test-gen2: test-gen2-fast test-gen2-deep

test-all: test
	$(MAKE) test-gen2
	$(NODE) tests/run-tests.mjs --backend

build-gen0:
	$(NODE) scripts/build-native.mjs

build-gen1:
	$(NODE) scripts/build-gen1.mjs

build-gen2:
	$(NODE) scripts/build-gen2.mjs

build-gen2-selfhost:
	RAZ_BUILD_KIND=gen2-selfhost $(NODE) scripts/build-gen2.mjs --self-host

archive-gen2-version:
	@test -n "$(VERSION)" || (echo 'usage: make archive-gen2-version VERSION=0.4.0-g2-016' >&2; exit 2)
	$(NODE) scripts/archive-gen2-version.mjs $(VERSION)

# Gen1 bootstrap remains available; prefer the explicit Gen2 self-host target once the
# frozen Gen2 baseline can compile the canonical include-based source.
bootstrap-candidates: build-gen2

bundle-gen2:
	$(NODE) scripts/build-gen2.mjs --bundle-only

clean:
	$(CMAKE) -E rm -rf $(BUILD_DIR)
