#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <system_error>
#include <utility>
#include <vector>

#ifdef _WIN32
#include <process.h>
#else
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

namespace fs = std::filesystem;

namespace {
constexpr const char* kRazSourceToken = "__RAZ_SOURCE_CPP__";

struct Options {
    bool help = false;
    bool version = false;
    bool dryRun = false;
    bool emitCppOnly = false;
    bool keepCpp = false;
    bool verbose = false;
    bool explicitOutput = false;
    bool compileOnly = false;
    bool assemblyOnly = false;
    bool preprocessOnly = false;
    bool saveTemps = false;
    std::string input;
    std::string output;
    std::string cppOutput;
    std::string frontendOverride;
    std::vector<std::string> moduleRoots;
    std::vector<std::string> razDefinitions;
    std::vector<std::string> nativeArgs;
};

std::string envOr(const char* name, const std::string& fallback) {
    const char* value = std::getenv(name);
    return value && *value ? value : fallback;
}

bool startsWith(const std::string& value, const std::string& prefix) {
    return value.size() >= prefix.size() && value.compare(0, prefix.size(), prefix) == 0;
}

bool hasRazExtension(const std::string& value) {
    return fs::path(value).extension() == ".raz";
}

std::string shellQuote(const std::string& value) {
    if (value.empty()) return "''";
    const auto safe = [](unsigned char ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
               (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' ||
               ch == '.' || ch == '/' || ch == ':' || ch == '=' ||
               ch == ',' || ch == '+' || ch == '@' || ch == '%';
    };
    if (std::all_of(value.begin(), value.end(), [&](char ch) { return safe(static_cast<unsigned char>(ch)); })) {
        return value;
    }
    std::string quoted = "'";
    for (char ch : value) {
        if (ch == '\'') quoted += "'\\''";
        else quoted += ch;
    }
    quoted += '\'';
    return quoted;
}

std::string displayCommand(const std::vector<std::string>& args) {
    std::string result;
    for (const auto& arg : args) {
        if (!result.empty()) result += ' ';
        result += shellQuote(arg);
    }
    return result;
}

std::vector<std::string> splitCommand(const std::string& command) {
    std::vector<std::string> words;
    std::string current;
    char quote = '\0';
    bool escaped = false;
    bool started = false;
    for (char ch : command) {
        if (escaped) {
            current += ch;
            escaped = false;
            started = true;
            continue;
        }
        if (ch == '\\' && quote != '\'') {
            escaped = true;
            started = true;
            continue;
        }
        if (quote != '\0') {
            if (ch == quote) quote = '\0';
            else current += ch;
            started = true;
            continue;
        }
        if (ch == '\'' || ch == '"') {
            quote = ch;
            started = true;
        } else if (ch == ' ' || ch == '\t' || ch == '\n') {
            if (started) {
                words.push_back(current);
                current.clear();
                started = false;
            }
        } else {
            current += ch;
            started = true;
        }
    }
    if (escaped || quote != '\0') throw std::runtime_error("malformed quoting in CXX environment variable");
    if (started) words.push_back(current);
    return words;
}

fs::path absoluteFromCwd(const std::string& value) {
    std::error_code ec;
    fs::path path = fs::absolute(fs::path(value), ec);
    if (ec) throw std::runtime_error("cannot resolve path '" + value + "': " + ec.message());
    return path.lexically_normal();
}

bool isProjectRoot(const fs::path& candidate) {
    return fs::exists(candidate / "compiler" / "razc" / "src" / "driver" / "main.raz") &&
           fs::exists(candidate / "legacy" / "gen1" / "gen.json");
}

fs::path findProjectRoot(const char* argv0) {
    const char* fromEnv = std::getenv("RAZ_ROOT");
    if (fromEnv && *fromEnv) {
        fs::path root = absoluteFromCwd(fromEnv);
        if (isProjectRoot(root)) return root;
        throw std::runtime_error("RAZ_ROOT is not a Raz project root: " + root.string());
    }

    std::vector<fs::path> seeds;
    std::error_code ec;
    seeds.push_back(fs::current_path(ec));
    if (ec) ec.clear();
    fs::path executable = absoluteFromCwd(argv0);
    if (fs::is_regular_file(executable, ec)) executable = executable.parent_path();
    seeds.push_back(executable);

    for (auto seed : seeds) {
        for (int depth = 0; depth < 12 && !seed.empty(); ++depth) {
            if (isProjectRoot(seed)) return seed;
            const fs::path parent = seed.parent_path();
            if (parent == seed) break;
            seed = parent;
        }
    }
    throw std::runtime_error("could not locate the Raz project root; set RAZ_ROOT to the repository directory");
}

std::string frontendPath(const fs::path& root, const Options& options) {
    if (!options.frontendOverride.empty()) return absoluteFromCwd(options.frontendOverride).string();
    const char* fromEnv = std::getenv("RAZ_FRONTEND");
    if (fromEnv && *fromEnv) return absoluteFromCwd(fromEnv).string();
#ifdef _WIN32
    return (root / "compiler" / "razc" / "build" / "razc-candidate.exe").string();
#else
    return (root / "compiler" / "razc" / "build" / "razc-candidate").string();
#endif
}


bool isCIdentifier(const std::string& name) {
    if (name.empty()) return false;
    const auto first = static_cast<unsigned char>(name.front());
    if (!((first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z') || first == '_')) return false;
    for (unsigned char ch : name) {
        if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
              (ch >= '0' && ch <= '9') || ch == '_')) return false;
    }
    return true;
}

void updateRazDefinition(Options& options, const std::string& arg, bool define) {
    const std::size_t equal = arg.find('=');
    const std::string name = equal == std::string::npos ? arg : arg.substr(0, equal);
    if (!isCIdentifier(name)) throw std::runtime_error("invalid build-definition name in -D/-U: " + name);
    if (define && (name == "RAZ_TARGET_OS" || name == "RAZ_TARGET_ARCH" || name == "RAZ_TARGET_COMPILER")) {
        throw std::runtime_error(name + " is a reserved Raz target-information constant");
    }

    auto existing = std::find_if(options.razDefinitions.begin(), options.razDefinitions.end(),
        [&](const std::string& item) { return item.substr(0, item.find('=')) == name; });
    if (existing != options.razDefinitions.end()) options.razDefinitions.erase(existing);
    if (define) {
        const std::string value = equal == std::string::npos ? "true" : arg.substr(equal + 1);
        // Empty and non-literal replacements are legal GNU macros. The Gen2
        // frontend simply leaves them native-only instead of blocking the build.
        options.razDefinitions.push_back(name + "=" + value);
    }
}

bool nativeOptionConsumesNext(const std::string& arg) {
    static const std::set<std::string> options = {
        "-I", "-L", "-l", "-D", "-U", "-o", "-include", "-imacros",
        "-isystem", "-iquote", "-idirafter", "-isysroot", "-MF", "-MT",
        "-MQ", "-Xlinker", "-Xassembler", "-Xpreprocessor", "-B", "-x",
        "-std", "--sysroot", "--target", "-target", "-arch", "-framework",
        "-F", "-iframework", "-Xclang", "-Xclang", "-stdlib"
    };
    return options.find(arg) != options.end();
}

std::string requireValue(int& i, int argc, char** argv, const std::string& option) {
    if (i + 1 >= argc) throw std::runtime_error("missing argument after " + option);
    return argv[++i];
}

Options parseOptions(int argc, char** argv) {
    Options options;
    bool endOfOptions = false;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (!endOfOptions && (arg == "--help" || arg == "-h")) {
            options.help = true;
            return options;
        }
        if (!endOfOptions && (arg == "--version" || arg == "-V")) {
            options.version = true;
            return options;
        }
        if (!endOfOptions && (arg == "--")) {
            endOfOptions = true;
            continue;
        }
        if (!endOfOptions && (arg == "--dry-run" || arg == "-###")) {
            options.dryRun = true;
            continue;
        }
        if (!endOfOptions && (arg == "--module-path" || arg == "--std-path")) {
            options.moduleRoots.push_back(absoluteFromCwd(requireValue(i, argc, argv, arg)).string());
            continue;
        }
        if (!endOfOptions && (startsWith(arg, "--module-path=") || startsWith(arg, "--std-path="))) {
            options.moduleRoots.push_back(absoluteFromCwd(arg.substr(arg.find('=') + 1)).string());
            continue;
        }
        if (!endOfOptions && arg == "--frontend") {
            options.frontendOverride = requireValue(i, argc, argv, arg);
            continue;
        }
        if (!endOfOptions && arg == "--emit-cpp") {
            options.emitCppOnly = true;
            options.cppOutput = absoluteFromCwd(requireValue(i, argc, argv, arg)).string();
            continue;
        }
        if (!endOfOptions && arg == "--keep-cpp") {
            options.keepCpp = true;
            options.cppOutput = absoluteFromCwd(requireValue(i, argc, argv, arg)).string();
            continue;
        }

        if (!endOfOptions && arg == "-o") {
            if (i + 1 >= argc) throw std::runtime_error("missing argument after -o");
            options.explicitOutput = true;
            options.output = argv[i + 1];
            options.nativeArgs.push_back(arg);
            options.nativeArgs.push_back(argv[++i]);
            continue;
        }
        if (!endOfOptions && arg.size() > 2 && startsWith(arg, "-o") && arg[2] != '-') {
            options.explicitOutput = true;
            options.output = arg.substr(2);
            options.nativeArgs.push_back(arg);
            continue;
        }

        if (!endOfOptions && (arg == "-D" || arg == "-U")) {
            if (i + 1 >= argc) throw std::runtime_error("missing argument after " + arg);
            const std::string definition = argv[++i];
            updateRazDefinition(options, definition, arg == "-D");
            options.nativeArgs.push_back(arg);
            options.nativeArgs.push_back(definition);
            continue;
        }
        if (!endOfOptions && arg.size() > 2 && (startsWith(arg, "-D") || startsWith(arg, "-U"))) {
            updateRazDefinition(options, arg.substr(2), arg[1] == 'D');
            options.nativeArgs.push_back(arg);
            continue;
        }

        if (!endOfOptions && nativeOptionConsumesNext(arg)) {
            if (i + 1 >= argc) throw std::runtime_error("missing argument after " + arg);
            options.nativeArgs.push_back(arg);
            options.nativeArgs.push_back(argv[++i]);
            continue;
        }

        if (!endOfOptions && (arg == "-c")) options.compileOnly = true;
        if (!endOfOptions && (arg == "-S")) options.assemblyOnly = true;
        if (!endOfOptions && (arg == "-E")) options.preprocessOnly = true;
        if (!endOfOptions && arg == "-v") options.verbose = true;
        if (!endOfOptions && startsWith(arg, "-save-temps")) options.saveTemps = true;

        if (!endOfOptions && !arg.empty() && arg[0] == '-') {
            options.nativeArgs.push_back(arg);
            continue;
        }

        if (hasRazExtension(arg)) {
            if (!options.input.empty()) throw std::runtime_error("only one .raz input is supported per invocation");
            options.input = absoluteFromCwd(arg).string();
            options.nativeArgs.emplace_back(kRazSourceToken);
        } else {
            // Other native inputs (.cpp, .o, archives, and linker scripts) are
            // passed through unchanged, so mixed Raz/C++ links remain possible.
            options.nativeArgs.push_back(arg);
        }
    }

    if (options.input.empty()) throw std::runtime_error("no .raz input file was provided");
    if (options.emitCppOnly && options.keepCpp) throw std::runtime_error("use either --emit-cpp or --keep-cpp, not both");
    if (options.emitCppOnly && options.explicitOutput) throw std::runtime_error("--emit-cpp chooses its output path; do not combine it with -o");
    if (options.emitCppOnly && (options.compileOnly || options.assemblyOnly || options.preprocessOnly)) {
        throw std::runtime_error("--emit-cpp cannot be combined with -c, -S, or -E");
    }
    return options;
}

void printHelp() {
    std::cout <<
        "Raz compiler driver (Gen2 preview)\n\n"
        "Usage:\n"
        "  razc <input.raz> [GNU C++ options] [-o output]\n"
        "  razc <input.raz> -S -o output.s\n"
        "  razc <input.raz> -c -o output.o\n"
        "  razc <input.raz> -E -o output.i\n"
        "  razc <input.raz> --emit-cpp output.cpp\n"
        "\n"
        "GNU C++ options, including -march, -mtune, -O, -g, -I, -L, -l, -Wl,\n"
        "-pthread, -fPIC and -std, are passed to the selected C++ compiler.\n"
        "By default the native compiler is g++; override it with CXX.\n\n"
        "Raz-specific options:\n"
        "  --module-path DIR   Add a Raz module search root (repeatable)\n"
        "  --std-path DIR      Add a Raz standard-library search root\n"
        "  -DNAME=VALUE       Define a Raz build-time scalar and pass the macro to GNU C++\n"
        "  -UNAME             Undefine a prior -D for Raz and pass it to GNU C++\n"
        "  RAZ_TARGET_OS, RAZ_TARGET_ARCH, RAZ_TARGET_COMPILER are read-only target constants\n"
        "  --frontend PATH     Use a specific Gen2 C++-emitting compiler\n"
        "  --keep-cpp PATH     Keep generated C++ and continue native compilation\n"
        "  --emit-cpp PATH     Emit generated C++ only; do not invoke g++\n"
        "  --dry-run, -###     Print planned commands without executing them\n"
        "  -h, --help          Show this help\n"
        "  -V, --version       Show version\n\n"
        "The Gen2 frontend must be built separately; driver tests do not require it.\n";
}

int runProcess(const std::vector<std::string>& args) {
    if (args.empty()) return 0;
#ifdef _WIN32
    std::vector<const char*> argv;
    argv.reserve(args.size() + 1);
    for (const auto& arg : args) argv.push_back(arg.c_str());
    argv.push_back(nullptr);
    const intptr_t result = _spawnvp(_P_WAIT, args.front().c_str(), argv.data());
    if (result == -1) {
        std::cerr << "razc: cannot launch " << args.front() << "\n";
        return errno == 0 ? 127 : errno;
    }
    return static_cast<int>(result);
#else
    pid_t child = fork();
    if (child < 0) {
        std::cerr << "razc: fork failed\n";
        return 127;
    }
    if (child == 0) {
        std::vector<char*> argv;
        argv.reserve(args.size() + 1);
        for (const auto& arg : args) argv.push_back(const_cast<char*>(arg.c_str()));
        argv.push_back(nullptr);
        execvp(argv.front(), argv.data());
        std::cerr << "razc: cannot launch " << args.front() << ": " << std::strerror(errno) << "\n";
        _exit(errno == ENOENT ? 127 : 126);
    }
    int status = 0;
    while (waitpid(child, &status, 0) < 0) {
        if (errno == EINTR) continue;
        std::cerr << "razc: waitpid failed: " << std::strerror(errno) << "\n";
        return 127;
    }
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return 127;
#endif
}

struct TemporaryDirectory {
    fs::path path;
    bool preserve = false;
    TemporaryDirectory() = default;
    TemporaryDirectory(const TemporaryDirectory&) = delete;
    TemporaryDirectory& operator=(const TemporaryDirectory&) = delete;
    TemporaryDirectory(TemporaryDirectory&& other) noexcept
        : path(std::move(other.path)), preserve(other.preserve) {
        other.path.clear();
        other.preserve = true;
    }
    TemporaryDirectory& operator=(TemporaryDirectory&& other) noexcept {
        if (this == &other) return *this;
        if (!preserve && !path.empty()) {
            std::error_code ec;
            fs::remove_all(path, ec);
        }
        path = std::move(other.path);
        preserve = other.preserve;
        other.path.clear();
        other.preserve = true;
        return *this;
    }
    ~TemporaryDirectory() {
        if (!preserve && !path.empty()) {
            std::error_code ec;
            fs::remove_all(path, ec);
        }
    }
};

TemporaryDirectory makeTemporaryDirectory(bool preserve) {
    TemporaryDirectory temp;
    temp.preserve = preserve;
    const fs::path base = fs::temp_directory_path();
    const auto stamp = std::chrono::steady_clock::now().time_since_epoch().count();
    for (unsigned int attempt = 0; attempt < 100; ++attempt) {
        temp.path = base / ("razc-" + std::to_string(stamp) + "-" + std::to_string(attempt));
        std::error_code ec;
        if (fs::create_directory(temp.path, ec)) return temp;
        if (ec && ec != std::errc::file_exists) throw std::runtime_error("cannot create temporary directory: " + ec.message());
    }
    throw std::runtime_error("cannot allocate a unique temporary directory");
}

struct TargetInfo {
    std::string os = "unknown";
    std::string arch = "unknown";
    std::string compiler = "unknown";
};

bool hasPredefine(const std::string& predefines, const std::string& name) {
    const std::string needle = "#define " + name;
    std::size_t position = 0;
    while ((position = predefines.find(needle, position)) != std::string::npos) {
        const std::size_t after = position + needle.size();
        if (after == predefines.size() || predefines[after] == ' ' || predefines[after] == '\t' || predefines[after] == '\r' || predefines[after] == '\n') return true;
        position = after;
    }
    return false;
}

bool predefineHasValue(const std::string& predefines, const std::string& name, const std::string& value) {
    const std::string needle = "#define " + name + " " + value;
    std::size_t position = predefines.find(needle);
    if (position == std::string::npos) return false;
    const std::size_t after = position + needle.size();
    return after == predefines.size() || predefines[after] == '\n' || predefines[after] == '\r';
}

std::string queryPredefines(const Options& options) {
    const std::string cxx = envOr("CXX", "g++");
    auto command = splitCommand(cxx);
    if (command.empty()) return {};

    // Only forward options that can select the compiler target or ABI. Do not
    // forward output, source, user -D/-U, or linker options into the probe.
    for (std::size_t i = 0; i < options.nativeArgs.size(); ++i) {
        const std::string& arg = options.nativeArgs[i];
        if (startsWith(arg, "--target=") || startsWith(arg, "-target=") ||
            startsWith(arg, "--sysroot=") || startsWith(arg, "-march=") ||
            startsWith(arg, "-mtune=") || startsWith(arg, "-mcpu=") ||
            startsWith(arg, "-mabi=") || startsWith(arg, "-mfpu=") ||
            startsWith(arg, "-mfloat-abi=") || arg == "-m32" || arg == "-m64" ||
            arg == "-mthumb" || arg == "-mno-thumb" || arg == "-mx32") {
            command.push_back(arg);
        } else if (arg == "--target" || arg == "-target" || arg == "--sysroot" ||
                   arg == "-march" || arg == "-mtune" || arg == "-mcpu" ||
                   arg == "-mabi" || arg == "-mfpu" || arg == "-mfloat-abi") {
            command.push_back(arg);
            if (i + 1 < options.nativeArgs.size()) command.push_back(options.nativeArgs[++i]);
        }
    }
    command.insert(command.end(), {"-dM", "-E", "-x", "c++", "-"});

#ifdef _WIN32
    // The driver currently targets Unix/Linux toolchains. On other hosts,
    // retain a non-fatal unknown value rather than misreporting the host as target.
    (void)options;
    return {};
#else
    const std::string shellCommand = displayCommand(command) + " </dev/null 2>/dev/null";
    FILE* pipe = popen(shellCommand.c_str(), "r");
    if (!pipe) return {};
    std::string output;
    char buffer[4096];
    while (std::fgets(buffer, sizeof(buffer), pipe)) output += buffer;
    const int result = pclose(pipe);
    if (result != 0) return {};
    return output;
#endif
}

TargetInfo detectTargetInfo(const Options& options) {
    const std::string predefines = queryPredefines(options);
    TargetInfo target;
    if (predefines.empty()) return target;

    if (hasPredefine(predefines, "__linux__")) target.os = "linux";
    else if (hasPredefine(predefines, "__FreeBSD__")) target.os = "freebsd";
    else if (hasPredefine(predefines, "__APPLE__")) target.os = "darwin";
    else if (hasPredefine(predefines, "_WIN32")) target.os = "windows";
    else if (hasPredefine(predefines, "__unix__")) target.os = "unix";

    if (hasPredefine(predefines, "__clang__")) target.compiler = "clang";
    else if (hasPredefine(predefines, "__GNUC__")) target.compiler = "gcc";

    if (hasPredefine(predefines, "__x86_64__") || hasPredefine(predefines, "_M_X64")) target.arch = "x86_64";
    else if (hasPredefine(predefines, "__aarch64__") || hasPredefine(predefines, "_M_ARM64")) target.arch = "aarch64";
    else if (hasPredefine(predefines, "__i386__") || hasPredefine(predefines, "_M_IX86")) target.arch = "x86";
    else if (hasPredefine(predefines, "__arm__") || hasPredefine(predefines, "_M_ARM")) target.arch = "arm";
    else if (predefineHasValue(predefines, "__riscv_xlen", "64")) target.arch = "riscv64";
    else if (predefineHasValue(predefines, "__riscv_xlen", "32")) target.arch = "riscv32";
    else if (hasPredefine(predefines, "__powerpc64__")) target.arch = "ppc64";
    else if (hasPredefine(predefines, "__wasm32__")) target.arch = "wasm32";
    else if (hasPredefine(predefines, "__wasm64__")) target.arch = "wasm64";
    return target;
}

std::vector<std::string> makeFrontendCommand(
    const fs::path& root, const Options& options, const std::string& frontend,
    const fs::path& cppPath, const TargetInfo& target) {
    std::vector<std::string> command = {frontend, options.input, "--emit-cpp", cppPath.string(), "-L",
                                        (root / "library" / "raz").string()};
    for (const auto& moduleRoot : options.moduleRoots) {
        command.push_back("-L");
        command.push_back(moduleRoot);
    }
    command.insert(command.end(), {"--target-os", target.os, "--target-arch", target.arch,
                                   "--target-compiler", target.compiler});
    for (const auto& definition : options.razDefinitions) {
        command.push_back("--define");
        command.push_back(definition);
    }
    (void)root;
    return command;
}

std::vector<std::string> makeNativeCommand(
    const fs::path& root, const Options& options, const fs::path& cppPath) {
    const std::string cxx = envOr("CXX", "g++");
    auto command = splitCommand(cxx);
    if (command.empty()) throw std::runtime_error("CXX does not contain a compiler command");

    // The backend emits C++17. Place the default first so a later user-provided
    // -std=... takes precedence exactly as it does with GCC command lines.
    command.push_back("-std=c++17");
    command.push_back("-I");
    command.push_back(fs::path(options.input).parent_path().string());
    command.push_back("-I");
    command.push_back((root / "library" / "raz").string());
    for (const auto& moduleRoot : options.moduleRoots) {
        command.push_back("-I");
        command.push_back(moduleRoot);
    }

    for (const auto& arg : options.nativeArgs) {
        if (arg == kRazSourceToken) command.push_back(cppPath.string());
        else command.push_back(arg);
    }

    if (!options.explicitOutput && (options.compileOnly || options.assemblyOnly)) {
        const fs::path inputPath(options.input);
        const std::string suffix = options.compileOnly ? ".o" : ".s";
        command.push_back("-o");
        command.push_back((fs::current_path() / (inputPath.stem().string() + suffix)).string());
    }
    return command;
}

int execute(const Options& options, const fs::path& root) {
    if (!fs::is_regular_file(options.input)) throw std::runtime_error("input file does not exist: " + options.input);

    const std::string frontend = frontendPath(root, options);
    if (!options.dryRun && !fs::is_regular_file(frontend)) {
        throw std::runtime_error("Gen2 frontend is missing: " + frontend +
            "\nBuild it with: make build-gen2 (the bootstrap compile is intentionally separate from driver tests)");
    }

    const TemporaryDirectory temp = makeTemporaryDirectory(options.saveTemps);
    fs::path cppPath;
    if (options.emitCppOnly || options.keepCpp) cppPath = fs::path(options.cppOutput);
    else cppPath = temp.path / (fs::path(options.input).stem().string() + ".cpp");

    const TargetInfo target = detectTargetInfo(options);
    const auto frontendCommand = makeFrontendCommand(root, options, frontend, cppPath, target);
    if (options.dryRun) {
        std::cout << "Raz frontend: " << displayCommand(frontendCommand) << "\n";
        if (!options.emitCppOnly) {
            const auto nativeCommand = makeNativeCommand(root, options, cppPath);
            std::cout << "GNU C++: " << displayCommand(nativeCommand) << "\n";
        }
        return 0;
    }

    if (options.verbose) std::cerr << "[razc] frontend: " << displayCommand(frontendCommand) << "\n";
    const int frontendStatus = runProcess(frontendCommand);
    if (frontendStatus != 0) return frontendStatus;

    if (options.emitCppOnly) {
        std::cout << "razc: wrote C++ source " << cppPath.string() << "\n";
        return 0;
    }

    const auto nativeCommand = makeNativeCommand(root, options, cppPath);
    if (options.verbose) std::cerr << "[razc] native: " << displayCommand(nativeCommand) << "\n";
    const int nativeStatus = runProcess(nativeCommand);
    if (nativeStatus != 0) return nativeStatus;

    if (options.keepCpp) std::cout << "razc: kept generated C++ at " << cppPath.string() << "\n";
    if (options.saveTemps) std::cerr << "[razc] kept temporary directory: " << temp.path.string() << "\n";
    return 0;
}
} // namespace

int main(int argc, char** argv) {
    try {
        const Options options = parseOptions(argc, argv);
        if (options.help) {
            printHelp();
            return 0;
        }
        if (options.version) {
            std::cout << "razc driver 0.4.0 (Gen2 preview; GNU C++ toolchain)\n";
            return 0;
        }
        const fs::path root = findProjectRoot(argv[0]);
        return execute(options, root);
    } catch (const std::exception& error) {
        std::cerr << "razc: " << error.what() << "\n";
        return 2;
    }
}
