# Gen1 — نسل اول عملیاتی Raz

## نقش این نسل

Gen1 یک compiler جدید است که یک‌بار توسط Gen0 ساخته می‌شود:

```text
Gen0 ──compile S1──> Gen1
```

بعد از freeze، Gen1 دیگر به Gen0 برای اجرای عادی وابسته نیست. دو کار رسمی Gen1 عبارت‌اند از:

```text
Gen1 ──compile S2──> Gen2
Gen1 ──compile program in L1──> executable
```

کامپایل دوباره‌ی `S1` با Gen1 الزامی نیست و ممکن است به‌دلیل breaking change عمداً ممکن نباشد.

## قابلیت‌های تحویل‌شده

- top-level execution بدون `main` کاربر؛
- global storage با initialization ترتیبی؛
- synthetic/internal entry در RIR؛
- `argCount()` و `argAt()` برای برنامه‌های CLI؛
- `use name;` و `use "header";`;
- `include "file.raz";` با duplicate guard و cycle detection؛
- `unsafe {}`؛
- `char*` و `nullptr` فقط داخل unsafe؛
- RIR-1 verifier برای globals و use declarations؛
- C++17 backend و runtime bridge.

## ساخت provenance

سورس Gen1 در `src/` با subset زبان Gen0 نوشته شده است. `final/compiler.raz` bundle قابل ساخت همین نسل است. compiler نهایی پس از acceptance باید در `bin/razc` قرار بگیرد و checksum آن در `bin/razc.sha256` ثبت شود.

## تست‌ها

`npm run test:gen1:fast` فقط تست‌های سریع frontend/RIR/backend را اجرا می‌کند. build سنگین Gen1 یک acceptance step جداگانه است.

پس از freeze، `npm run test:gen1:example` باید مثال `examples/hello.raz` را با **خود Gen1** کامپایل و اجرا کند.

## معیار تکمیل Gen1

1. fast suite سبز باشد.
2. `gen0/bin/razc` checksum معتبر داشته باشد.
3. `npm run build:gen1` یک candidate بسازد.
4. `scripts/freeze.sh 1` موفق شود.
5. exampleهای این پوشه با `generations/gen1/bin/razc` اجرا شوند.

خودکامپایل‌شدن `src/` با `bin/razc` معیار تکمیل نیست.
