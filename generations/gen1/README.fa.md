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
- includeهای C++ فقط از `use`های برنامه تولید می‌شوند؛ backend دیگر headerهای پایه یا runtime را به‌صورت ضمنی اضافه نمی‌کند. برای نمونه، `use cstdint;` به `<cstdint>` و `use "raz_runtime.hpp";` به header نقل‌قول‌دار تبدیل می‌شود؛
- راه‌اندازی CLI در `main` تولیدشده فقط وقتی اضافه می‌شود که برنامه `argCount()` یا `argAt()` را صدا بزند؛
- `include "file.raz";` با duplicate guard و cycle detection؛
- `unsafe {}`؛
- `char*` و `nullptr` فقط داخل unsafe؛
- RIR-1 verifier برای globals و use declarations؛
- C++17 backend و runtime bridge.

## ساخت provenance

سورس Gen1 در `src/` با subset زبان Gen0 نوشته شده است. `final/compiler.raz` bundle قابل ساخت همین نسل است. compiler نهایی پس از acceptance باید در `bin/razc` قرار بگیرد و checksum آن در `bin/razc.sha256` ثبت شود.

## قرارداد استفاده در Gen1

کامپایلر Gen1 در این نسل رابط command-line عمومی ندارد. ورودی را از `frontend/input.raz` می‌خواند و خروجی را در `backend/output.cpp` می‌نویسد؛ caller باید این پوشه‌ها را بسازد و برای C++ compiler مسیر headerهای درخواستی را فراهم کند. `use name;` به `#include <name>` و `use "header";` به `#include "header"` تبدیل می‌شود. استفاده از IO یا CLI به `use "raz_runtime.hpp";` نیاز دارد و runtime باید در مسیر include کامپایل C++ موجود باشد.

برای پذیرش candidate پیش از ثبت نهایی، می‌توان تست یکپارچه را با باینری build‌شده اجرا کرد:

```sh
RAZC=generations/gen1/build/razc-candidate npm run test:gen1:example
```

این تست مثال `hello` و انتقال آرگومان از CLI را با runtime واقعی کامپایل و اجرا می‌کند. رابط عمومی command-line، کش کتابخانه‌ها و کتابخانه‌های استاندارد Raz جزو هدف Gen2 هستند.

## تست‌ها

`npm run test:gen1:fast` فقط تست‌های سریع frontend/RIR/backend را اجرا می‌کند. build سنگین Gen1 یک acceptance step جداگانه است.

پس از freeze، `npm run test:gen1:example` باید مثال `examples/hello.raz` را با **خود Gen1** کامپایل و اجرا کند.

## معیار تکمیل Gen1

1. fast suite سبز باشد.
2. `gen0/bin/razc` checksum معتبر داشته باشد.
3. `npm run build:gen1` یک candidate بسازد.
4. candidate با `RAZC=generations/gen1/build/razc-candidate npm run test:gen1:example` پذیرفته شود.
5. `scripts/freeze.sh 1` موفق شود. این فرمان candidate را با تست runtime/CLI می‌پذیرد، باینری و checksum را ثبت می‌کند و `gen.json` را به وضعیت `frozen` تغییر می‌دهد. اگر artifact موقت در `bin/razc` وجود دارد، `scripts/freeze.sh 1 --replace-pending` فقط وقتی مجاز است که `gen.json` هنوز وضعیت pending داشته باشد.
6. exampleهای این پوشه با `generations/gen1/bin/razc` اجرا شوند.

خودکامپایل‌شدن `src/` با `bin/razc` معیار تکمیل نیست.
