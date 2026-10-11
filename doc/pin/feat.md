# Future Language Design Goals for Raz

## 1. Top-Level Code Execution

Raz is intended to be a scripting language. Executable code should be allowed at the top level of a source file, without requiring an explicit `main()` function.

For example:

```raz
function myAge(birthYear: i64) -> str {
    let yearsOld: i64 = currentYear() - birthYear;
    return yearsOld . (if yearsOld == 1 { " year" } else { " years" });
}

print("I am currently " . myAge(1995) . " old.");
```

The compiler should execute top-level statements in source order. A `main()` function may remain available for users who prefer an explicit entry point, but it should not be mandatory for scripts.

## 2. Flexible Function Call Syntax

Raz should support both parenthesized and parenthesis-free function calls, especially for output functions.

Both forms should be valid and have equivalent behavior:

```raz
print("Hello, Raz!");
print "Hello, Raz!";
```

String concatenation should work consistently in both forms:

```raz
print("I am currently " . myAge(1995) . " old.");
print "I am currently " . myAge(1995) . " old.";
```

The compiler should distinguish function-call syntax from surrounding expressions reliably, including nested calls, string literals, and chained concatenation.

## 3. Consistent Expression Semantics

Both call forms should follow the same type-checking, argument-evaluation, and error-reporting rules. Supporting parenthesis-free calls must not introduce ambiguity into expression parsing.

## 4. Implementation Considerations

- Define how top-level declarations and executable statements are processed and ordered.
- Determine how top-level code is translated to the generated C++ program.
- Specify parsing rules for parenthesis-free calls, including argument boundaries and operator precedence.
- Add compiler tests covering both syntax forms, nested calls, concatenation, and error cases.

These features should be treated as language design goals and verified against the current compiler before being considered implemented.