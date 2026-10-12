# Native day-to-day build/test path. If Ninja is installed it is preferred;
# GNU Make remains available through: make GENERATOR='Unix Makefiles'.
BUILD_DIR ?= build/native
BUILD_TYPE ?= Debug
GENERATOR ?= $(shell command -v ninja >/dev/null 2>&1 && echo Ninja || echo 'Unix Makefiles')
CMAKE ?= cmake
CXX ?= g++
NODE ?= node

.PHONY: all configure driver test test-native clean build-gen0 build-gen1 build-gen2 build-gen2-selfhost archive-gen2-version bundle-gen2 bootstrap-candidates help

all: driver

help:
	@printf '%s\n' \
	  'Native Raz workflow:' \
	  '  make                 Configure/build the native razc driver with CMake (Ninja when available)' \
	  '  make test            Run native CTest driver tests (does not build Gen2)' \
	  '  make build-gen2      Build a Gen2 candidate with the frozen Gen1 baseline' \
	  '  make build-gen2-selfhost Run two-stage Gen2 self-host; require identical stage-1/stage-2 C++ output' \
	  '  make archive-gen2-version VERSION=0.4.0-g2-015 Snapshot source+stdlib+binary, then promote candidate' \
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

build-gen0:
	$(NODE) scripts/build-native.mjs

build-gen1:
	$(NODE) scripts/build-gen1.mjs

build-gen2:
	$(NODE) scripts/build-gen2.mjs

build-gen2-selfhost:
	RAZ_BUILD_KIND=gen2-selfhost $(NODE) scripts/build-gen2.mjs --self-host

archive-gen2-version:
	@test -n "$(VERSION)" || (echo 'usage: make archive-gen2-version VERSION=0.4.0-g2-015' >&2; exit 2)
	$(NODE) scripts/archive-gen2-version.mjs $(VERSION)

# Gen1 bootstrap remains available; prefer the explicit Gen2 self-host target once the
# frozen Gen2 baseline can compile the canonical include-based source.
bootstrap-candidates: build-gen2

bundle-gen2:
	$(NODE) scripts/build-gen2.mjs --bundle-only

clean:
	$(CMAKE) -E rm -rf $(BUILD_DIR)
