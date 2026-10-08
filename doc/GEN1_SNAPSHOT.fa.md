# وضعیت Snapshot توسعه‌ی Gen1

**تاریخ snapshot:** 2026-10-08

این فایل وضعیت دقیق پروژه را در این نقطه ثبت می‌کند تا archive قابل بازتولید و قابل بررسی باشد.

## مدل نسل‌ها

```text
gen0 ── build S1 ──> gen1 ── build S2 ──> gen2 ── build S3 ──> ...
                         │
                         └── programs written in L1
```

فرمول ساخت:

```text
gen_n = B(C_(n-1)(S_n))
S_n ∈ L_(n-1)
uses(S_n) ⊆ F_(n-1)
```

self-compile شدن `S_n` توسط `gen_n` شرط freeze نیست.

## Gen1 تکمیل‌شده در سطح source

- top-level execution بدون `main` کاربر؛
- synthetic/internal entry در RIR؛
- globals و initialization ترتیبی؛
- `argCount()` و `argAt()`؛
- `use` و `include`؛
- duplicate include guard و include-cycle detection؛
- `unsafe`، `char*` و `nullptr` با diagnostics؛
- RIR verifier برای global/use؛
- C++17 backend و runtime bridge؛
- example داخل `generations/gen1/examples/hello.raz`؛
- تست اجرای example پس از freeze در `npm run test:gen1:example`.

## تست‌های انجام‌شده

```text
npm test
15 passed / 0 failed

npm run test:backend
15 passed / 0 failed

npm run test:gen1:fast
all fast checks passed
```

Fast suite example `hello.raz` را نیز از مسیر frontend → RIR → verifier → backend → C++ اجرا می‌کند.

## وضعیت bootstrap/freeze

`gen0/bin/razc` با checksum ثبت‌شده منجمد است و منبع Gen1 با آن سازگار طراحی شده است.

ساخت bundle Gen1 (`generations/gen1/final/compiler.raz`) آماده است، اما اجرای acceptance سنگین برای تولید `generations/gen1/bin/razc` در یک اجرای قبلی وارد timeout طولانی شد. طبق سیاست توسعه، این build سنگین تکرار نمی‌شود تا زمان milestone freeze.

بنابراین این archive یک **snapshot کامل source/docs/tests برای نقطه‌ی فعلی** است، اما هنوز ادعای freeze شدن باینری Gen1 را ندارد.

## خروجی بعدی

پس از آماده شدن acceptance bootstrap:

```text
npm run build:gen1
scripts/freeze.sh 1
npm run test:gen1:example
```

و سپس checksum Gen1 در `generations/gen1/bin/razc.sha256` ثبت می‌شود.
