cmake_minimum_required(VERSION 3.20)
project(RazCompilerDriver VERSION 0.4.0 LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(razc src/host/raz_driver.cpp)
set_target_properties(razc PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
if(MSVC)
    target_compile_options(razc PRIVATE /W4)
else()
    target_compile_options(razc PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(BUILD_TESTING)
    add_test(NAME razc_help
        COMMAND $<TARGET_FILE:razc> --help)
    set_tests_properties(razc_help PROPERTIES
        PASS_REGULAR_EXPRESSION "GNU C\\+\\+ options")

    add_test(NAME razc_version
        COMMAND $<TARGET_FILE:razc> --version)
    set_tests_properties(razc_version PROPERTIES
        PASS_REGULAR_EXPRESSION "razc driver 0\\.4\\.0")

    # Dry-run tests validate command-line forwarding without requiring a built
    # Gen2 frontend. This keeps native driver iteration independent of bootstrap.
    add_test(NAME razc_forwards_cpu_optimization_and_debug_flags
        COMMAND $<TARGET_FILE:razc>
            --dry-run "${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz"
            -O2 -g -march=native -mtune=native -o "${CMAKE_BINARY_DIR}/raz-hello")
    set_tests_properties(razc_forwards_cpu_optimization_and_debug_flags PROPERTIES
        PASS_REGULAR_EXPRESSION "-O2.*-g.*-march=native.*-mtune=native")

    add_test(NAME razc_forwards_and_exposes_build_definitions
        COMMAND $<TARGET_FILE:razc>
            --dry-run "${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz"
            -DRAZ_BUILD_TEST=17 -march=native)
    set_tests_properties(razc_forwards_and_exposes_build_definitions PROPERTIES
        PASS_REGULAR_EXPRESSION "Raz frontend:.*--define RAZ_BUILD_TEST=17.*GNU C\\+\\+:.*-DRAZ_BUILD_TEST=17")

    add_test(NAME razc_forwards_gnu_linker_flags
        COMMAND $<TARGET_FILE:razc>
            --dry-run "${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz"
            -L "${CMAKE_BINARY_DIR}/fake-lib" -l raz_extra -Wl,--as-needed
            -o "${CMAKE_BINARY_DIR}/raz-hello")
    set_tests_properties(razc_forwards_gnu_linker_flags PROPERTIES
        PASS_REGULAR_EXPRESSION "-L.*fake-lib.*-l raz_extra.*-Wl,--as-needed")

    add_test(NAME razc_module_path_is_frontend_option
        COMMAND $<TARGET_FILE:razc>
            --dry-run "${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz"
            --module-path "${CMAKE_SOURCE_DIR}/library/raz" -march=x86-64)
    set_tests_properties(razc_module_path_is_frontend_option PROPERTIES
        PASS_REGULAR_EXPRESSION "Raz frontend:.*-L.*library/raz")


    # Native end-to-end driver test using a tiny C++ test double for the
    # Gen2 frontend. It validates process launching, temporary C++ emission,
    # real GNU C++ compilation/linking, and execution without rebuilding Raz.
    add_executable(razc_test_frontend tests/native/fake_frontend.cpp)
    set_target_properties(razc_test_frontend PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
    )
    if(WIN32)
        set(RAZ_FAKE_PIPELINE_OUTPUT "${CMAKE_BINARY_DIR}/raz-fake-pipeline.exe")
    else()
        set(RAZ_FAKE_PIPELINE_OUTPUT "${CMAKE_BINARY_DIR}/raz-fake-pipeline")
    endif()
    add_test(NAME razc_native_pipeline_fake_frontend_build
        COMMAND $<TARGET_FILE:razc>
            "${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz"
            -O0 -g -march=native -mtune=native -o "${RAZ_FAKE_PIPELINE_OUTPUT}")
    set_tests_properties(razc_native_pipeline_fake_frontend_build PROPERTIES
        ENVIRONMENT "RAZ_FRONTEND=$<TARGET_FILE:razc_test_frontend>")
    add_test(NAME razc_native_pipeline_fake_frontend_run
        COMMAND "${RAZ_FAKE_PIPELINE_OUTPUT}")
    set_tests_properties(razc_native_pipeline_fake_frontend_run PROPERTIES
        DEPENDS razc_native_pipeline_fake_frontend_build
        PASS_REGULAR_EXPRESSION "GNU pipeline works")

    # If the candidate already exists when CMake configures, enable a true
    # compiler->C++->GNU toolchain smoke test. It is deliberately optional:
    # building/testing the driver never bootstraps Gen2 by itself.
    if(WIN32)
        set(RAZ_GEN2_CANDIDATE "${CMAKE_SOURCE_DIR}/compiler/razc/build/razc-candidate.exe")
    else()
        set(RAZ_GEN2_CANDIDATE "${CMAKE_SOURCE_DIR}/compiler/razc/build/razc-candidate")
    endif()
    if(EXISTS "${RAZ_GEN2_CANDIDATE}")
        set(RAZ_INTEGRATION_OUTPUT "${CMAKE_BINARY_DIR}/raz-gen2-hello")
        add_test(NAME razc_gen2_cpp_and_gnu_smoke_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz"
                -O0 -g -o "${RAZ_INTEGRATION_OUTPUT}")
        add_test(NAME razc_gen2_cpp_and_gnu_smoke_run
            COMMAND "${RAZ_INTEGRATION_OUTPUT}")
        set_tests_properties(razc_gen2_cpp_and_gnu_smoke_run PROPERTIES
            DEPENDS razc_gen2_cpp_and_gnu_smoke_build)

        # G2-009: there is no implicit std.core prelude. A program with no
        # imports must generate header-free C++ and still compile; importing
        # std.core or a quoted C++ header must add only explicitly requested
        # headers / the dependencies owned by that module.
        # G2-010: command-line -D/-U definitions are available as baked Raz
        # global constants and remain forwarded to GNU C++ for native headers.
        set(RAZ_BUILD_DEFINITIONS_OUTPUT "${CMAKE_BINARY_DIR}/raz-build-definitions")
        add_test(NAME razc_build_definitions_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/build-definitions.raz"
                -DRAZ_FEATURE=false -DRAZ_FEATURE -DRAZ_LEVEL=7 -DRAZ_NEGATIVE=-4 "-DRAZ_LABEL=\"nightly\""
                -DRAZ_NATIVE_ONLY=enabled -DRAZ_EMPTY= -O0 -o "${RAZ_BUILD_DEFINITIONS_OUTPUT}")
        add_test(NAME razc_build_definitions_run
            COMMAND "${RAZ_BUILD_DEFINITIONS_OUTPUT}")
        set_tests_properties(razc_build_definitions_run PROPERTIES
            DEPENDS razc_build_definitions_build
            PASS_REGULAR_EXPRESSION "build-definitions-ok")

        set(RAZ_UNDEF_CPP "${CMAKE_BINARY_DIR}/raz-build-definition-undef.cpp")
        add_test(NAME razc_undef_removes_raz_definition_emit
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/no-implicit-core.raz"
                -DRAZ_UNUSED=1 -URAZ_UNUSED --emit-cpp "${RAZ_UNDEF_CPP}")
        add_test(NAME razc_undef_removes_raz_definition_contract
            COMMAND "${CMAKE_COMMAND}" -DCPP=${RAZ_UNDEF_CPP}
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_no_build_definition.cmake")
        set_tests_properties(razc_undef_removes_raz_definition_contract PROPERTIES
            DEPENDS razc_undef_removes_raz_definition_emit)

        set(RAZ_NO_CORE_CPP "${CMAKE_BINARY_DIR}/raz-no-implicit-core.cpp")
        set(RAZ_NO_CORE_BIN "${CMAKE_BINARY_DIR}/raz-no-implicit-core")
        add_test(NAME razc_no_implicit_core_emit
            COMMAND "${RAZ_GEN2_CANDIDATE}"
                "${CMAKE_SOURCE_DIR}/tests/fixtures/no-implicit-core.raz"
                --emit-cpp "${RAZ_NO_CORE_CPP}")
        add_test(NAME razc_no_implicit_core_include_contract
            COMMAND "${CMAKE_COMMAND}" -DCPP=${RAZ_NO_CORE_CPP}
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_no_includes.cmake")
        set_tests_properties(razc_no_implicit_core_include_contract PROPERTIES
            DEPENDS razc_no_implicit_core_emit)
        add_test(NAME razc_no_implicit_core_native_build
            COMMAND "${CMAKE_CXX_COMPILER}" -std=c++17 "${RAZ_NO_CORE_CPP}" -o "${RAZ_NO_CORE_BIN}")
        set_tests_properties(razc_no_implicit_core_native_build PROPERTIES
            DEPENDS razc_no_implicit_core_include_contract)
        add_test(NAME razc_no_implicit_core_native_run COMMAND "${RAZ_NO_CORE_BIN}")
        set_tests_properties(razc_no_implicit_core_native_run PROPERTIES
            DEPENDS razc_no_implicit_core_native_build)

        set(RAZ_EXPLICIT_CORE_CPP "${CMAKE_BINARY_DIR}/raz-explicit-core.cpp")
        set(RAZ_EXPLICIT_CORE_BIN "${CMAKE_BINARY_DIR}/raz-explicit-core")
        add_test(NAME razc_explicit_core_emit
            COMMAND "${RAZ_GEN2_CANDIDATE}"
                "${CMAKE_SOURCE_DIR}/tests/fixtures/explicit-core.raz"
                --emit-cpp "${RAZ_EXPLICIT_CORE_CPP}")
        add_test(NAME razc_explicit_core_include_contract
            COMMAND "${CMAKE_COMMAND}" -DCPP=${RAZ_EXPLICIT_CORE_CPP}
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_core_includes.cmake")
        set_tests_properties(razc_explicit_core_include_contract PROPERTIES
            DEPENDS razc_explicit_core_emit)
        add_test(NAME razc_explicit_core_native_build
            COMMAND "${CMAKE_CXX_COMPILER}" -std=c++17 "${RAZ_EXPLICIT_CORE_CPP}" -o "${RAZ_EXPLICIT_CORE_BIN}")
        set_tests_properties(razc_explicit_core_native_build PROPERTIES
            DEPENDS razc_explicit_core_include_contract)
        add_test(NAME razc_explicit_core_native_run COMMAND "${RAZ_EXPLICIT_CORE_BIN}")
        set_tests_properties(razc_explicit_core_native_run PROPERTIES
            DEPENDS razc_explicit_core_native_build)

        set(RAZ_EXPLICIT_HEADER_CPP "${CMAKE_BINARY_DIR}/raz-explicit-native-header.cpp")
        set(RAZ_EXPLICIT_HEADER_BIN "${CMAKE_BINARY_DIR}/raz-explicit-native-header")
        add_test(NAME razc_explicit_native_header_emit
            COMMAND "${RAZ_GEN2_CANDIDATE}"
                "${CMAKE_SOURCE_DIR}/tests/fixtures/explicit-native-header.raz"
                --emit-cpp "${RAZ_EXPLICIT_HEADER_CPP}")
        add_test(NAME razc_explicit_native_header_include_contract
            COMMAND "${CMAKE_COMMAND}" -DCPP=${RAZ_EXPLICIT_HEADER_CPP}
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_single_native_header.cmake")
        set_tests_properties(razc_explicit_native_header_include_contract PROPERTIES
            DEPENDS razc_explicit_native_header_emit)
        add_test(NAME razc_explicit_native_header_native_build
            COMMAND "${CMAKE_CXX_COMPILER}" -std=c++17 "${RAZ_EXPLICIT_HEADER_CPP}" -o "${RAZ_EXPLICIT_HEADER_BIN}")
        set_tests_properties(razc_explicit_native_header_native_build PROPERTIES
            DEPENDS razc_explicit_native_header_include_contract)
        add_test(NAME razc_explicit_native_header_native_run COMMAND "${RAZ_EXPLICIT_HEADER_BIN}")
        set_tests_properties(razc_explicit_native_header_native_run PROPERTIES
            DEPENDS razc_explicit_native_header_native_build)

        # Regression: generated Gen2 code must preserve short-circuit semantics.
        # _GLIBCXX_ASSERTIONS makes evaluating s[i - 1] for an empty string fail.
        set(RAZ_SHORT_CIRCUIT_OUTPUT "${CMAKE_BINARY_DIR}/raz-short-circuit")
        add_test(NAME razc_short_circuit_guard_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/short-circuit.raz"
                -D_GLIBCXX_ASSERTIONS -O0 -o "${RAZ_SHORT_CIRCUIT_OUTPUT}")
        add_test(NAME razc_short_circuit_guard_run
            COMMAND "${RAZ_SHORT_CIRCUIT_OUTPUT}")
        set_tests_properties(razc_short_circuit_guard_run PROPERTIES
            DEPENDS razc_short_circuit_guard_build
            PASS_REGULAR_EXPRESSION "short-circuit-ok")

        # Real module-resolution integration: comment markers in strings, leading
        # and trailing block comments, hidden imports inside comments, and de-duping.
        set(RAZ_MODULE_FIXTURE_ROOT "${CMAKE_SOURCE_DIR}/tests/fixtures/modules")
        set(RAZ_MODULE_STRING_OUTPUT "${CMAKE_BINARY_DIR}/raz-module-string-comment")
        add_test(NAME razc_module_string_comment_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-string-comment.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${RAZ_MODULE_STRING_OUTPUT}")
        add_test(NAME razc_module_string_comment_run
            COMMAND "${RAZ_MODULE_STRING_OUTPUT}")
        set_tests_properties(razc_module_string_comment_run PROPERTIES
            DEPENDS razc_module_string_comment_build
            PASS_REGULAR_EXPRESSION "module-loaded")

        set(RAZ_MODULE_COMMENTS_OUTPUT "${CMAKE_BINARY_DIR}/raz-module-comments")
        add_test(NAME razc_module_import_comments_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-import-comments.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${RAZ_MODULE_COMMENTS_OUTPUT}")
        add_test(NAME razc_module_import_comments_run
            COMMAND "${RAZ_MODULE_COMMENTS_OUTPUT}")
        set_tests_properties(razc_module_import_comments_run PROPERTIES
            DEPENDS razc_module_import_comments_build
            PASS_REGULAR_EXPRESSION "module-loaded")

        # Module sources themselves use the same scanner recursively.
        set(RAZ_MODULE_NESTED_OUTPUT "${CMAKE_BINARY_DIR}/raz-module-nested-comments")
        add_test(NAME razc_module_nested_comments_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-nested-comments.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${RAZ_MODULE_NESTED_OUTPUT}")
        add_test(NAME razc_module_nested_comments_run
            COMMAND "${RAZ_MODULE_NESTED_OUTPUT}")
        set_tests_properties(razc_module_nested_comments_run PROPERTIES
            DEPENDS razc_module_nested_comments_build
            PASS_REGULAR_EXPRESSION "module-loaded")

        # Multiple source-module imports are accepted on one directive line.
        set(RAZ_MODULE_MULTIPLE_OUTPUT "${CMAKE_BINARY_DIR}/raz-module-multiple-imports")
        add_test(NAME razc_module_multiple_imports_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-multiple-imports.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${RAZ_MODULE_MULTIPLE_OUTPUT}")
        add_test(NAME razc_module_multiple_imports_run
            COMMAND "${RAZ_MODULE_MULTIPLE_OUTPUT}")
        set_tests_properties(razc_module_multiple_imports_run PROPERTIES
            DEPENDS razc_module_multiple_imports_build
            PASS_REGULAR_EXPRESSION "module-loaded")

        # Expected diagnostics are checked by matching the resolver's own error.
        add_test(NAME razc_module_cycle_diagnostic
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-cycle.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${CMAKE_BINARY_DIR}/should-not-build-cycle")
        set_tests_properties(razc_module_cycle_diagnostic PROPERTIES
            PASS_REGULAR_EXPRESSION ":1: module dependency cycle involving cycle.a")
        add_test(NAME razc_module_missing_diagnostic
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-missing.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${CMAKE_BINARY_DIR}/should-not-build-missing")
        set_tests_properties(razc_module_missing_diagnostic PROPERTIES
            PASS_REGULAR_EXPRESSION ":2: cannot resolve module missing.module")

        add_test(NAME razc_module_unclosed_comment_diagnostic
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/module-unclosed-comment.raz"
                --module-path "${RAZ_MODULE_FIXTURE_ROOT}"
                -o "${CMAKE_BINARY_DIR}/should-not-build-unclosed-comment")
        set_tests_properties(razc_module_unclosed_comment_diagnostic PROPERTIES
            PASS_REGULAR_EXPRESSION ":2: unterminated block comment")


        # G2-012: the driver queries the selected C++ compiler's predefined target
        # macros and exposes read-only RAZ_TARGET_* constants to Raz only on use.
        set(RAZ_TARGET_INFO_OUTPUT "${CMAKE_BINARY_DIR}/raz-target-info")
        add_test(NAME razc_target_metadata_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/target-info.raz"
                -O0 -o "${RAZ_TARGET_INFO_OUTPUT}")
        add_test(NAME razc_target_metadata_run COMMAND "${RAZ_TARGET_INFO_OUTPUT}")
        set_tests_properties(razc_target_metadata_run PROPERTIES
            DEPENDS razc_target_metadata_build
            PASS_REGULAR_EXPRESSION "target-info-ok")
        add_test(NAME razc_rejects_reserved_target_override
            COMMAND "${CMAKE_COMMAND}"
                -DRAZC=$<TARGET_FILE:razc>
                -DSOURCE=${CMAKE_SOURCE_DIR}/compiler/razc/examples/hello.raz
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_driver_rejects_target_override.cmake")

        set(RAZ_UNUSED_BUILD_DEF_CPP "${CMAKE_BINARY_DIR}/raz-unused-build-definition.cpp")
        add_test(NAME razc_unused_string_build_definition_emit
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/no-implicit-core.raz"
                "-DRAZ_UNUSED_LABEL=\"unused\"" --emit-cpp "${RAZ_UNUSED_BUILD_DEF_CPP}")
        add_test(NAME razc_unused_string_build_definition_has_no_header
            COMMAND "${CMAKE_COMMAND}" -DCPP=${RAZ_UNUSED_BUILD_DEF_CPP}
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_no_includes.cmake")
        set_tests_properties(razc_unused_string_build_definition_has_no_header PROPERTIES
            DEPENDS razc_unused_string_build_definition_emit)

        # G2-011/012: token-aware source defines are expanded before build-definition
        # rewriting, parsing, and semantic checking. Direct calls use name(...),
        # and known define names shadow same-name function calls in this source.
        set(RAZ_MACRO_BASIC_OUTPUT "${CMAKE_BINARY_DIR}/raz-macro-basic")
        add_test(NAME razc_macro_basic_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/macros-basic.raz"
                -DRAZ_BASE=5 -O0 -o "${RAZ_MACRO_BASIC_OUTPUT}")
        add_test(NAME razc_macro_basic_run COMMAND "${RAZ_MACRO_BASIC_OUTPUT}")
        set_tests_properties(razc_macro_basic_run PROPERTIES
            DEPENDS razc_macro_basic_build
            PASS_REGULAR_EXPRESSION "macro-basic-ok")

        set(RAZ_MACRO_TOKEN_OUTPUT "${CMAKE_BINARY_DIR}/raz-macro-token-safety")
        add_test(NAME razc_macro_token_safety_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/tests/fixtures/macros-token-safety.raz"
                -O0 -o "${RAZ_MACRO_TOKEN_OUTPUT}")
        add_test(NAME razc_macro_token_safety_run COMMAND "${RAZ_MACRO_TOKEN_OUTPUT}")
        set_tests_properties(razc_macro_token_safety_run PROPERTIES
            DEPENDS razc_macro_token_safety_build
            PASS_REGULAR_EXPRESSION "macro-string-safe")

        add_test(NAME razc_unknown_function_is_not_treated_as_define
            COMMAND "${CMAKE_COMMAND}"
                -DFRONTEND=${RAZ_GEN2_CANDIDATE}
                -DSOURCE=${CMAKE_SOURCE_DIR}/tests/fixtures/macros-unknown.raz
                -DOUTPUT=${CMAKE_BINARY_DIR}/should-not-build-unknown-macro.cpp
                -DEXPECTED=unknown\ function\ does_not_exist
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_compiler_failure.cmake")
        add_test(NAME razc_macro_bad_arity_diagnostic
            COMMAND "${CMAKE_COMMAND}"
                -DFRONTEND=${RAZ_GEN2_CANDIDATE}
                -DSOURCE=${CMAKE_SOURCE_DIR}/tests/fixtures/macros-bad-arity.raz
                -DOUTPUT=${CMAKE_BINARY_DIR}/should-not-build-bad-arity.cpp
                -DEXPECTED=expects\ 2\ argument
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_compiler_failure.cmake")
        add_test(NAME razc_macro_duplicate_diagnostic
            COMMAND "${CMAKE_COMMAND}"
                -DFRONTEND=${RAZ_GEN2_CANDIDATE}
                -DSOURCE=${CMAKE_SOURCE_DIR}/tests/fixtures/macros-duplicate.raz
                -DOUTPUT=${CMAKE_BINARY_DIR}/should-not-build-duplicate.cpp
                -DEXPECTED=duplicate\ define
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_compiler_failure.cmake")
        add_test(NAME razc_macro_recursion_diagnostic
            COMMAND "${CMAKE_COMMAND}"
                -DFRONTEND=${RAZ_GEN2_CANDIDATE}
                -DSOURCE=${CMAKE_SOURCE_DIR}/tests/fixtures/macros-recursive.raz
                -DOUTPUT=${CMAKE_BINARY_DIR}/should-not-build-recursive.cpp
                -DEXPECTED=exceeded\ 32\ passes
                -P "${CMAKE_SOURCE_DIR}/tests/cmake/assert_compiler_failure.cmake")
    endif()
endif()
