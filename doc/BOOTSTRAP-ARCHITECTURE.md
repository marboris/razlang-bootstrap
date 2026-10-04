# Raz Bootstrap Architecture

این سند قرارداد مهندسی مسیر bootstrap را مشخص می‌کند. هدف این است که در مراحل بعدی بتوان syntax، type system، diagnostics و backend را توسعه داد بدون اینکه زنجیره‌ی bootstrap به جزئیات یک target یا یک پیاده‌سازی میزبان قفل شود.

## Source of truth

`raz.language.json` منبع اصلی semantics و syntax زبان است. در نسخه‌ی فعلی این فایل شامل نوع‌ها، generic type constructors، builtins، operatorها، unary operatorها و نقش‌های syntax است.

`razc-stage0.mjs` هنوز `DEFAULT_LANGUAGE` را به‌عنوان fallback bootstrap نگه می‌دارد. این داده‌ی fallback برای راه‌اندازی اولیه است و نباید به source of truth نهایی تبدیل شود.

## Syntax contract

رابطه‌ی frontend با syntax از طریق بخش `syntax` تعریف می‌شود:

```json
{
  "syntax": {
    "declarations": {
      "function": "function",
      "struct": "struct"
    },
    "statements": {
      "let": "let",
      "return": "return",
      "if": "if",
      "else": "else",
      "while": "while"
    },
    "expressions": {
      "new": "new",
      "true": "true",
      "false": "false"
    },
    "punctuation": {
      "semicolon": ";",
      "arrow": "->"
    }
  }
}
```

در نتیجه parser نباید برای انتخاب این tokenها به literalهای سخت‌کدشده متکی باشد. lexer از همین spec مجموعه‌ی keywordها و operatorها را derive می‌کند.

## RIR contract

RIR مرز رسمی frontend و backend است.

Lvalue ابتدا به reference تبدیل می‌شود:

```text
ref x
ref_field %r.f
ref_index %r[%i]
```

و mutation با یک operation عمومی انجام می‌شود:

```text
store_ref %r, %v
```

بنابراین backend لازم نیست برای `x.f = v`، `x[i] = v` و `x.a.b = v` مسیرهای AST-specific داشته باشد.

## Bootstrap proof

سه property باید جداگانه سنجیده شوند:

1. **Correctness** — frontend و backend روی semantics تعریف‌شده کار می‌کنند.
2. **Reproducibility** — دو generation یک artifact معادل تولید می‌کنند.
3. **Independence** — generation نهایی بتواند compiler را بدون JavaScript bootstrap بازسازی کند.

عبارت سوم معیار self-hosting نهایی است؛ صرفاً identical بودن RIR دو generation Stage-0 هنوز به‌تنهایی self-hosting نیست.

## Milestones

### B1 — Frontend contract

- syntax و lexical rules خارجی و قابل تنظیم شوند.
- diagnostics به یک مدل مستقل تبدیل شوند.
- type checking کامل‌تر شود.
- Stage-1 همان contract را مصرف کند.

### B2 — RIR contract

- instruction schema رسمی شود.
- type checking و operand validation به verifier منتقل شود.
- CFG و terminatorها formal شوند.
- reference semantics و call signatures دقیق شوند.

### B3 — Native backend

- Stage-2 از RIR typed استفاده کند، نه parse کردن string.
- همه‌ی mappingهای target از target profile بیایند.
- یک backend کامل Raz-native داشته باشیم.

### B4 — Self-hosting closure

- compiler با Raz build شود.
- compiler ساخته‌شده با Raz بتواند همان compiler را rebuild کند.
- JS فقط به‌عنوان historical/bootstrap infrastructure باقی بماند.

### B5 — Language evolution

پس از بسته شدن B4، توسعه‌ی syntax، type system، diagnostics، modules و امکانات سطح زبان از bootstrap mechanism مستقل می‌شود.
