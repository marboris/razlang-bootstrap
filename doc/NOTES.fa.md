> یادداشت تاریخی: بخش‌هایی از این فایل به suite جاوااسکریپتی قدیمی اشاره دارند که حذف شده است. مسیر فعال تست اکنون `make test` با CMake/CTest است و به build کامپایلر Gen2 وابسته نیست.

# یادداشت‌های توسعه‌ی Raz

## اصول کار
1. هیچ متدی در کد تعریف، توسعه یا استفاده نمی‌شود مگر اینکه قبلاً در داکیومنت (`SPEC.fa.md` یا `BOOTSTRAP_MATH.fa.md`) تعریف شده باشد.
2. نسل‌ها مثل نسل‌های انسان‌اند. هر نسل نسل بعد را می‌سازد و بعد از ساخت منجمد می‌شود. نسل منجمد compiler عملیاتی خودش است؛ نسل قبل فقط سازنده‌ی آن بوده است.
3. فرمول ساخت: `gen_n = B(C_{n-1}(S_n))` با شرط `uses(S_n) ⊆ F_{n-1}`. هیچ الزام `S_n ∈ L_n` وجود ندارد.
4. JavaScript فقط ریشه‌ی ساخت `gen_0` بود. بعد از freeze، اجرای compilerهای نسل‌ها به Node وابسته نیست؛ اسکریپت‌های Node فقط orchestration/build/test هستند.
5. باینری هر نسل با checksum ثبت می‌شود؛ تغییر آن باعث توقف ساخت می‌شود.

## ساختار پوشه‌های تاریخی (پیش از بازآرایی)

این درخت صرفاً یادداشت نسخه‌ی قدیمی است؛ پوشه‌ی `generations/` در ساختار فعال وجود ندارد. ساختار فعال اکنون `compiler/razc/`، `compiler/releases/`، `library/raz/` و `legacy/` را از هم جدا می‌کند.

```text
generations/
  gen0/                    نسل صفر (منجمد)
    seed/                  seed.mjs و stage0.mjs (ساخت اولیه با JavaScript، یک‌بار)
    src/                   سورس Raz همین نسل: frontend، backend، ir
    compiler/razc.raz     فایل نهایی: یک فایل تکی که کامپایلر این نسل از آن ساخته می‌شود
    bin/razc               باینری نسل
    bin/razc.sha256        checksum باینری
    build/                 فایل‌های موقت ساخت (در git نیست)
    gen.json               توصیف نسل
  gen1/                    نسل یک (منجمد؛ سازنده‌ی Gen2)
    src/  final/  bin/  build/  gen.json
src/
  host/                    درایور بومی C++ (ابزار، نه نسل)
config/                    تعریف زبان و target
runtime/                   هدر runtime
tests/                     fixtureها و تست‌های native؛ harness قدیمی JavaScript حذف شده است
scripts/                   اسکریپت‌های ساخت
```

قاعده‌ی مسیرهای داخل نمونه‌ی بالا فقط برای درخت تاریخی صدق می‌کند؛ در ساختار فعال، سورس اصلی کامپایلر در `compiler/razc/src/`، ورودی ماژولار در `compiler/razc/compiler.raz`، باینری فعال در `compiler/razc/bin/` و snapshot هر نسخه در `compiler/releases/<version>/` است.

## اسکریپت‌ها
- `make build-gen0`: ساخت candidate نسل صفر از seed و سورس Gen0؛ `bin/` منجمد دست‌نخورده می‌ماند.
- `make build-gen1`: ساخت candidate تاریخی Gen1 با Gen0.
- `make build-gen2`: bootstrap سنگین frontend Gen2 با Gen1 منجمد.
- `scripts/freeze.sh <N>`: کاندید نسل `N` را کپی، checksum را ثبت و `gen.json` را به `frozen` تغییر می‌دهد؛ این فرمان suite تست اجرا نمی‌کند. overwrite عادی ممنوع است؛ `--replace-pending` فقط برای نسل pending است و `--replace-frozen` برای به‌روزرسانی آگاهانهٔ باینری frozen، همراه با rollback backup در `build/` استفاده می‌شود.
- `scripts/bootstrap-gen.sh <N> <source.raz> <out>`: کامپایل سورس با باینری نسل `N` بدون Node.
  نمونه‌ی قدیمی bootstrap-gen برای اجرای compiler نسل مشخص، خارج از workflow تست فعلی است.

## وضعیت فعلی
- در 2026-10-11 باینری‌های frozen Gen0 و Gen1 بعد از اصلاح lowering/short-circuit به‌روزرسانی شدند. checksum فعلی و checksum قبلی در `gen.json` هر نسل ثبت شده‌اند.
- candidate تازهٔ Gen2 با Gen1 frozen جدید ساخته شده است. با حضور candidate، `make test` اکنون ۲۰ تست CTest را اجرا می‌کند؛ بدون candidate، تست‌های پایهٔ درایور همچنان سریع و مستقل هستند.
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
- suite تست JavaScript قدیمی در بازطراحی native حذف شد؛ تست‌های فعال با `make test` اجرا می‌شوند.
- bundle Gen1 در `legacy/gen1/final/compiler.raz` آماده است.
- پذیرش نهایی هنوز وابسته به ساخت باینری Gen1 با Gen0 و freeze است؛ بعد از freeze exampleهای L1 با خود Gen1 اجرا می‌شوند.
