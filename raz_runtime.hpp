#pragma once
#include <cstdint>
#include <cstddef>
#include <algorithm>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace raz {
inline void print(const std::string& s) { std::cout << s << std::endl; }
inline std::string read_file(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return {};
    return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}
inline void write_file(const std::string& path, const std::string& value) {
    std::ofstream f(path, std::ios::binary);
    f << value;
}
inline std::int64_t string_length(const std::string& s) {
    return static_cast<std::int64_t>(s.size());
}
inline std::string int_to_string(std::int64_t value) { return std::to_string(value); }
inline std::string string_concat(const std::string& a, const std::string& b) { return a + b; }
inline std::string string_slice(const std::string& s, std::int64_t begin, std::int64_t end) {
    const auto b = static_cast<std::size_t>(begin < 0 ? 0 : begin);
    const auto e = static_cast<std::size_t>(end < begin ? begin : end);
    if (b >= s.size()) return {};
    return s.substr(b, std::min(e, s.size()) - b);
}
template <typename T> inline std::vector<T> list_append(const std::vector<T>& xs, const T& value) {
    auto out = xs;
    out.push_back(value);
    return out;
}
template <typename T> inline void list_push(std::vector<T>& xs, const T& value) { xs.push_back(value); }
template <typename T> inline std::int64_t list_length(const std::vector<T>& xs) { return static_cast<std::int64_t>(xs.size()); }
}
