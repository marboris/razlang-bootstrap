#pragma once
// Small native boundary for std.io. This is a module-owned implementation, not a
// compiler-wide runtime header; only importing std.io pulls it into generated C++.
#include <cstdint>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>

// Defined by the generic C++ program entry point emitted by any Raz target.
// The standard library reads process context; it does not initialize it itself.
namespace raz_internal_process {
extern int argc;
extern char** argv;
}

inline std::int64_t std_io_arg_count() {
    return static_cast<std::int64_t>(raz_internal_process::argc);
}

inline std::string std_io_arg_at(std::int64_t index) {
    if (index < 0 || index >= raz_internal_process::argc || raz_internal_process::argv == nullptr || raz_internal_process::argv[index] == nullptr) return {};
    return std::string(raz_internal_process::argv[index]);
}

inline void std_io_print(std::string value) {
    std::cout << value << std::endl;
}

inline std::string std_io_read_file(std::string path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) return {};
    return std::string(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
}

inline bool std_io_write_file(std::string path, std::string value) {
    std::ofstream output(path, std::ios::binary);
    if (!output) return false;
    output.write(value.data(), static_cast<std::streamsize>(value.size()));
    output.flush();
    if (!output) return false;
    output.close();
    return !output.fail();
}
