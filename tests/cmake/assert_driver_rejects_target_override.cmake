if(NOT DEFINED RAZC OR NOT DEFINED SOURCE)
    message(FATAL_ERROR "RAZC and SOURCE are required")
endif()
execute_process(
    COMMAND "${RAZC}" "${SOURCE}" --dry-run -DRAZ_TARGET_OS=spoofed
    RESULT_VARIABLE result
    OUTPUT_VARIABLE stdout
    ERROR_VARIABLE stderr
)
if(result EQUAL 0)
    message(FATAL_ERROR "Expected overriding RAZ_TARGET_OS to be rejected")
endif()
set(combined "${stdout}\n${stderr}")
if(NOT combined MATCHES "RAZ_TARGET_OS is a reserved Raz target-information constant")
    message(FATAL_ERROR "Expected reserved target diagnostic. Output:\n${combined}")
endif()
