// Archived Gen0/Gen1 compatibility shim. The active compiler/razc tree does
// not contain or emit a global runtime header. Old bootstrap tools materialize
// this source into their temporary build directories only when needed.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function legacyRuntimeHeader() {
  return `#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>

namespace raz {
    inline int g_argc = 0;
    inline char** g_argv = nullptr;
    inline void set_cli(int argc, char** argv) { g_argc = argc; g_argv = argv; }
    inline std::int64_t arg_count() { return static_cast<std::int64_t>(g_argc); }
    inline std::string arg_at(std::int64_t index) {
        if (index < 0 || index >= g_argc || g_argv == nullptr || g_argv[index] == nullptr) return {};
        return std::string(g_argv[index]);
    }
    inline void print(const std::string& value) { std::cout << value << std::endl; }
    inline std::string read_file(const std::string& path) {
        std::ifstream file(path, std::ios::binary);
        if (!file) return {};
        return std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    }
    inline void write_file(const std::string& path, const std::string& value) {
        std::ofstream file(path, std::ios::binary); file << value;
    }
    inline std::int64_t string_length(const std::string& value) { return static_cast<std::int64_t>(value.size()); }
    inline std::string int_to_string(std::int64_t value) { return std::to_string(value); }
    inline std::string string_concat(const std::string& a, const std::string& b) { return a + b; }
    inline std::string string_slice(const std::string& value, std::int64_t begin, std::int64_t end) {
        const auto b = static_cast<std::size_t>(begin < 0 ? 0 : begin);
        const auto e = static_cast<std::size_t>(end < begin ? begin : end);
        if (b >= value.size()) return {};
        return value.substr(b, std::min(e, value.size()) - b);
    }
    template <typename T> inline std::vector<T> list_append(const std::vector<T>& xs, const T& value) {
        auto out = xs; out.push_back(value); return out;
    }
    template <typename T> inline void list_push(std::vector<T>& xs, const T& value) { xs.push_back(value); }
    template <typename T> inline std::int64_t list_length(const std::vector<T>& xs) {
        return static_cast<std::int64_t>(xs.size());
    }
} // namespace raz
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const destination = process.argv[2];
  if (!destination) {
    console.error('usage: node scripts/legacy-runtime.mjs <destination-header>');
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
  fs.writeFileSync(destination, legacyRuntimeHeader(), 'utf8');
}
