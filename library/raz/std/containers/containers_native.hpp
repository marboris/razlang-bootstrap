#pragma once

#include <cstdint>
#include <utility>
#include <vector>

template <typename T>
inline std::int64_t listLength(const std::vector<T>& values) {
    return static_cast<std::int64_t>(values.size());
}

template <typename T, typename U>
inline void push(std::vector<T>& values, U&& value) {
    values.push_back(std::forward<U>(value));
}

template <typename T, typename U>
inline std::vector<T> append(std::vector<T> values, U&& value) {
    values.push_back(std::forward<U>(value));
    return values;
}
