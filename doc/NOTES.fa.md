# یادداشت‌های توسعه‌ی Raz

## اصول کار
1. هیچ متدی در کد تعریف، توسعه یا استفاده نمی‌شود مگر اینکه قبلاً در داکیومنت (`SPEC.fa.md` یا `BOOTSTRAP_MATH.fa.md`) تعریف شده باشد.
2. نسل‌ها مثل نسل‌های انسان‌اند. هر نسل نسل بعد را می‌سازد و بعد از ساخت منجمد می‌شود. نسل منجمد compiler عملیاتی خودش است؛ نسل قبل فقط سازنده‌ی آن بوده است.
3. فرمول ساخت: `gen_n = B(C_{n-1}(S_n))` با شرط `uses(S_n) ⊆ F_{n-1}`. هیچ الزام `S_n ∈ L_n` وجود ندارد.
4. JavaScript فقط ریشه‌ی ساخت `gen_0` بود. بعد از freeze، اجرای compilerهای نسل‌ها به Node وابسته نیست؛ اسکریپت‌های Node فقط orchestration/build/test هستند.
5. باینری هر نسل با checksum ثبت می‌شود؛ تغییر آن باعث توقف ساخت می‌شود.

## ساختار پوشه‌ها

```
generations/
  gen0/                    نسل صفر (منجمد)
    seed/                  seed.mjs و stage0.mjs (ساخت اولیه با JavaScript، یک‌بار)
    src/                   سورس Raz همین نسل: frontend، backend، ir
    final/compiler.raz     فایل نهایی: یک فایل تکی که کامپایلر این نسل از آن ساخته می‌شود
    bin/razc               باینری نسل
    bin/razc.sha256        checksum باینری
    build/                 فایل‌های موقت ساخت (در git نیست)
    gen.json               توصیف نسل
  gen1/                    نسل یک (در حال توسعه؛ سازنده‌ی Gen2 پس از freeze)
    src/  final/  bin/  build/  gen.json
src/
  host/                    درایور Node (ابزار، نه نسل)
config/                    تعریف زبان و target
runtime/                   هدر runtime
tests/                     تست‌ها
scripts/                   اسکریپت‌های ساخت
```

قاعده‌ی هر نسل: سورس در `src/`، فایل نهایی در `final/`، باینری در `bin/`، و فایل‌های موقت در `build/`.

## اسکریپت‌ها
- `npm run build:native`: ساخت کاندید `gen0` از seed جاوااسکریپتی در `generations/gen0/build/razc-candidate`. `bin/` دست‌نخورده می‌ماند.
- `npm run self-host:native`: کاندید را با خودش بازسازی می‌کند و بررسی می‌کند خروجی C++ یکسان است. نتیجه در `build/` می‌ماند.
- `scripts/freeze.sh <N>`: کاندید نسل `N` را می‌پذیرد، باینری و checksum را ثبت می‌کند و `gen.json` را به `frozen` تغییر می‌دهد. برای Gen1 قبل از freeze تست runtime/CLI اجرا می‌شود. اگر `bin/razc` از قبل باشد، فقط با `--replace-pending` و metadata در وضعیت pending جایگزین می‌شود.
- `scripts/bootstrap-gen.sh <N> <source.raz> <out>`: کامپایل سورس با باینری نسل `N` بدون Node.
  مثال: `scripts/bootstrap-gen.sh 0 tests/cases/arithmetic.raz out`

## وضعیت فعلی
- `gen0` بازسازی شد و باینری آن بایت‌به‌بایت با نسخه‌ی قبلی یکسان است (`fea705b4…`).
- baseline اولیه‌ی پروژه پیش از شروع Gen1: تست‌های سریع ۱۵ مورد مثبت/منفی و baseline bootstrap/self-host طبق snapshot اولیه پاس شده بودند؛ تست‌های سنگین در طول توسعه‌ی Gen1 تکرار نمی‌شوند.
- `scripts/bootstrap-gen.sh 0`: بدون Node، `arithmetic.raz` کد خروج `207` داد.

## محدودیت‌های `gen0` که در `gen1` باید رفع شوند
- ورودی فایل ثابت است (`frontend/input.raz`) و `argv` ندارد.
- `main` برای `gen0` اجباری است.

## تصمیم‌های تثبیت‌شده‌ی Gen1
1. شکل CLI: `argCount() -> i64` و `argAt(i: i64) -> string`.
2. `main` تابع کاربر نیست؛ backend یک entry داخلی `raz_main` و سپس `int main(int argc, char** argv)` تولید می‌کند.
3. `include "x";` شکل قطعی Gen1 است؛ `include(...)` فعلاً نیست.
4. `use` در سطح فایل است و به `#include` منتقل می‌شود.
5. مقایسه‌ها `bool` تولید می‌کنند و شرط `if/while` باید `bool` باشد.
6. globalها storage سراسری دارند و مقداردهی آن‌ها به‌ترتیب متن در entry انجام می‌شود.
7. `char*` و `nullptr` فقط داخل `unsafe` مجازند.
8. driver خود compiler Gen1 هنوز bootstrap-contract ثابت دارد؛ orchestration CLI کامل compiler برای Gen2 است.

## وضعیت توسعه‌ی Gen1
- M1 تکمیل: top-level بدون `main` کاربر و entry داخلی در RIR.
- M2 تکمیل: CLI runtime bridge با `argCount`/`argAt` و C++ `main(argc, argv)`.
- M3 تکمیل: `use`/`include`، duplicate include guard و cycle detection.
- M4 تکمیل: `unsafe`، `char*`/`nullptr` و global storage در RIR/backend.
- RIR verifier Gen1 با `use-*` و `global` هم‌تراز شده است.
- `gen0` منجمد و تغییرناپذیر باقی مانده است.
- `npm run test:gen1:fast` به‌عنوان suite سریع Gen1 اضافه شده است.
- bundle Gen1 در `generations/gen1/final/compiler.raz` آماده است.
- پذیرش نهایی هنوز وابسته به ساخت باینری Gen1 با Gen0 و freeze است؛ بعد از freeze exampleهای L1 با خود Gen1 اجرا می‌شوند.
