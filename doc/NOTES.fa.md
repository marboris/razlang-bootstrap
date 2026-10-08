# یادداشت‌های توسعه‌ی Raz

## اصول کار
1. هیچ متدی در کد تعریف، توسعه یا استفاده نمی‌شود مگر اینکه قبلاً در داکیومنت (`SPEC.fa.md` یا `BOOTSTRAP_MATH.fa.md`) تعریف شده باشد.
2. نسل‌ها مثل نسل‌های انسان‌اند. هر نسل نسل بعد را می‌سازد و بعد از ساخت منجمد می‌شود.
3. فرمول ساخت: `gen_n = C_{n-1}(S_n)` با شرط `uses(S_n) ⊆ F_{n-1} ∩ F_n`.
4. JavaScript فقط برای ساخت `gen_0` اولیه بود. از این به بعد زنجیره بدون Node اجرا می‌شود.
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
  gen1/                    نسل یک (برنامه‌ریزی‌شده، هنوز سورس ندارد)
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
- `scripts/freeze.sh <N>`: کاندید نسل `N` را به `bin/` منجمد می‌کند و checksum می‌نویسد. اگر `bin/razc` از قبل باشد، رد می‌کند.
- `scripts/bootstrap-gen.sh <N> <source.raz> <out>`: کامپایل سورس با باینری نسل `N` بدون Node.
  مثال: `scripts/bootstrap-gen.sh 0 tests/cases/arithmetic.raz out`

## وضعیت فعلی
- `gen0` بازسازی شد و باینری آن بایت‌به‌بایت با نسخه‌ی قبلی یکسان است (`fea705b4…`).
- `npm run test:full`: ۱۷ تست، همه پاس. self-compile با RIR یکسان (۱۷۴۶۸۷ بایت).
- `scripts/bootstrap-gen.sh 0`: بدون Node، `arithmetic.raz` کد خروج `207` داد.

## محدودیت‌های `gen0` که در `gen1` باید رفع شوند
- ورودی فایل ثابت است (`frontend/input.raz`) و `argv` ندارد.
- `main` برای `gen0` اجباری است.

## تصمیم‌های باز قبل از نوشتن `gen1`
1. شکل `argv`: `argc` و `argAt(i)` (پیشنهاد) یا `args: List<string>`.
2. `print` در `F_1`: نگه‌داشتن یا حذف.
3. نام `main` در `L_1`: تغییر نام در خروجی به `raz_main` (پیشنهاد).
4. `include "x";` بدون پرانتز (پیشنهاد).
5. تعریف `if` و نتیجه‌ی مقایسه: `i64` تا نسل ۳ (پیشنهاد).
6. ترتیب تعریف global: خطای `E0011` (پیشنهاد).

## قدم بعدی
- تأیید تصمیم‌های باز بالا.
- نوشتن سورس `gen1` در `generations/gen1/src/` به زبان `L_0`.
- ساخت `gen1` با `scripts/bootstrap-gen.sh 0 ...` و قرار دادن باینری در `generations/gen1/bin/`.
