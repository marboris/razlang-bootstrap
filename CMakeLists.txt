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
            --dry-run "${CMAKE_SOURCE_DIR}/generations/gen2/examples/hello.raz"
            -O2 -g -march=native -mtune=native -o "${CMAKE_BINARY_DIR}/raz-hello")
    set_tests_properties(razc_forwards_cpu_optimization_and_debug_flags PROPERTIES
        PASS_REGULAR_EXPRESSION "-O2.*-g.*-march=native.*-mtune=native")

    add_test(NAME razc_forwards_gnu_linker_flags
        COMMAND $<TARGET_FILE:razc>
            --dry-run "${CMAKE_SOURCE_DIR}/generations/gen2/examples/hello.raz"
            -L "${CMAKE_BINARY_DIR}/fake-lib" -l raz_extra -Wl,--as-needed
            -o "${CMAKE_BINARY_DIR}/raz-hello")
    set_tests_properties(razc_forwards_gnu_linker_flags PROPERTIES
        PASS_REGULAR_EXPRESSION "-L.*fake-lib.*-l raz_extra.*-Wl,--as-needed")

    add_test(NAME razc_module_path_is_frontend_option
        COMMAND $<TARGET_FILE:razc>
            --dry-run "${CMAKE_SOURCE_DIR}/generations/gen2/examples/hello.raz"
            --module-path "${CMAKE_SOURCE_DIR}/generations/gen2/std" -march=x86-64)
    set_tests_properties(razc_module_path_is_frontend_option PROPERTIES
        PASS_REGULAR_EXPRESSION "Raz frontend:.*-L.*generations/gen2/std")


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
            "${CMAKE_SOURCE_DIR}/generations/gen2/examples/hello.raz"
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
        set(RAZ_GEN2_CANDIDATE "${CMAKE_SOURCE_DIR}/generations/gen2/build/razc-candidate.exe")
    else()
        set(RAZ_GEN2_CANDIDATE "${CMAKE_SOURCE_DIR}/generations/gen2/build/razc-candidate")
    endif()
    if(EXISTS "${RAZ_GEN2_CANDIDATE}")
        set(RAZ_INTEGRATION_OUTPUT "${CMAKE_BINARY_DIR}/raz-gen2-hello")
        add_test(NAME razc_gen2_cpp_and_gnu_smoke_build
            COMMAND $<TARGET_FILE:razc>
                "${CMAKE_SOURCE_DIR}/generations/gen2/examples/hello.raz"
                -O0 -g -o "${RAZ_INTEGRATION_OUTPUT}")
        add_test(NAME razc_gen2_cpp_and_gnu_smoke_run
            COMMAND "${RAZ_INTEGRATION_OUTPUT}")
        set_tests_properties(razc_gen2_cpp_and_gnu_smoke_run PROPERTIES
            DEPENDS razc_gen2_cpp_and_gnu_smoke_build)
    endif()
endif()
