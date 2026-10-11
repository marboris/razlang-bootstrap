#include <fstream>
#include <iostream>
#include <string>

// Native test double for the Gen2 frontend protocol. It emits a tiny C++
// program so CTest can exercise razc -> frontend process -> GNU C++ -> binary
// without needing to bootstrap or rebuild the Raz compiler.
int main(int argc, char** argv) {
    if (argc < 4 || std::string(argv[2]) != "--emit-cpp") {
        std::cerr << "fake frontend: expected <input.raz> --emit-cpp <output.cpp>\n";
        return 2;
    }

    std::ofstream output(argv[3], std::ios::binary);
    if (!output) {
        std::cerr << "fake frontend: cannot write generated C++ file\n";
        return 1;
    }
    output << R"CPP(#include <iostream>
int main() {
    std::cout << "GNU pipeline works\n";
    return 0;
}
)CPP";
    output.close();
    return output ? 0 : 1;
}
