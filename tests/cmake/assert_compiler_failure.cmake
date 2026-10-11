if(NOT DEFINED FRONTEND OR NOT DEFINED SOURCE OR NOT DEFINED OUTPUT OR NOT DEFINED EXPECTED)
    message(FATAL_ERROR "FRONTEND, SOURCE, OUTPUT, and EXPECTED are required")
endif()
execute_process(
    COMMAND "${FRONTEND}" "${SOURCE}" --emit-cpp "${OUTPUT}"
    RESULT_VARIABLE result
    OUTPUT_VARIABLE stdout
    ERROR_VARIABLE stderr
)
if(result EQUAL 0)
    message(FATAL_ERROR "Expected compiler failure, but compilation succeeded")
endif()
set(combined "${stdout}\n${stderr}")
if(NOT combined MATCHES "${EXPECTED}")
    message(FATAL_ERROR "Expected diagnostic /${EXPECTED}/ not found. Result=${result}\nOutput:\n${combined}")
endif()
