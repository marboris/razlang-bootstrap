#pragma once
// Native boundary for std.env. This module only exposes process/environment
// information; importing it does not pull in the legacy Raz runtime.
#include <cstdlib>
#include <string>

inline std::string std_env_get(std::string name) {
    const char* value = std::getenv(name.c_str());
    return value == nullptr ? std::string{} : std::string(value);
}

inline bool std_env_has(std::string name) {
    return std::getenv(name.c_str()) != nullptr;
}

inline std::string std_env_os_name() {
#if defined(__linux__)
    return "linux";
#elif defined(__FreeBSD__)
    return "freebsd";
#elif defined(__APPLE__)
    return "darwin";
#elif defined(_WIN32)
    return "windows";
#elif defined(__unix__)
    return "unix";
#else
    return "unknown";
#endif
}

inline std::string std_env_architecture() {
#if defined(__x86_64__) || defined(_M_X64)
    return "x86_64";
#elif defined(__aarch64__) || defined(_M_ARM64)
    return "aarch64";
#elif defined(__i386__) || defined(_M_IX86)
    return "x86";
#elif defined(__arm__) || defined(_M_ARM)
    return "arm";
#elif defined(__riscv) && __riscv_xlen == 64
    return "riscv64";
#elif defined(__riscv) && __riscv_xlen == 32
    return "riscv32";
#else
    return "unknown";
#endif
}
