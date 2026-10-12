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
- example داخل `legacy/gen1/examples/hello.raz`؛
- اجرای example با harness جاوااسکریپتی قدیمی (اکنون حذف‌شده).

## نتایج تاریخی suite قدیمی (اکنون حذف‌شده)

در زمان ثبت این snapshot، suite JavaScript زیر اجرا شده بود و نتایجش برای تاریخچه نگه داشته می‌شود؛ فرمان‌ها و harness مربوطه در workflow فعلی حذف شده‌اند و این اعداد وضعیت تست امروز را نشان نمی‌دهند. اکنون تست‌های فعال با `make test` و CTest، فقط درایور native را بدون نیاز به build Gen2 بررسی می‌کنند.

## وضعیت bootstrap/freeze

`gen0/bin/razc` با checksum ثبت‌شده منجمد است و منبع Gen1 با آن سازگار طراحی شده است.

این snapshot برای تاریخچه نگه داشته شده است. وضعیت واقعی artifact را از `legacy/gen1/gen.json`، وجود `legacy/gen1/bin/razc` و checksum بخوانید؛ بخش‌های مربوط به suite تست قدیمی در workflow فعلی اجرا نمی‌شوند.

این فایل snapshot تاریخی است؛ وضعیت freeze معتبر را از `legacy/gen1/gen.json` و checksum فعلی بخوانید.

## خروجی بعدی

در صورت نیاز به بازسازی تاریخی: `make build-gen1` و سپس `scripts/freeze.sh 1` (فقط در صورتی که قواعد pending اجازه دهند). این workflow تست Gen1 اجرا نمی‌کند.
