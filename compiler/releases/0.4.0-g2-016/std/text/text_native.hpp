#pragma once

#include <algorithm>
#include <cstdint>
#include <string>

inline std::int64_t std_text_length(const std::string& value) {
    return static_cast<std::int64_t>(value.size());
}

inline std::string std_text_slice(const std::string& value, std::int64_t begin, std::int64_t end) {
    const auto first = static_cast<std::size_t>(begin < 0 ? 0 : begin);
    const auto last = static_cast<std::size_t>(end < begin ? begin : end);
    if (first >= value.size()) return {};
    return value.substr(first, std::min(last, value.size()) - first);
}

inline std::string std_text_int_to_string(std::int64_t value) {
    return std::to_string(value);
}
