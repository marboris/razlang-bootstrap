# Raz Gen2 — پیش‌نمونه‌ی توسعه

Gen2 در حال توسعه است و هنوز stable یا frozen نیست. در این milestone تمرکز روی دو پایه است: جدا کردن سورس به ماژول‌های مستقل‌تر و ساخت یک CLI که با Gen1 کامپایل می‌شود.

## Milestone فعلی: G2-001

- سورس بر اساس نقش‌ها تقسیم شده است: مدل AST، lexer، parser، تحلیل معنایی، تولید RIR، مدیریت includeهای سورس و target مربوط به C++17.
- فایل `src/driver/main.raz` نقطه‌ی ورود CLI است.
- وابستگی‌های native خود کامپایلر با `use` صریح اعلام می‌شوند؛ backend نباید headerهای پیش‌فرض را پنهانی اضافه کند.
- ورودی CLI مسیر فایل Raz است و مسیر includeهای متنی نسبت به همان فایل ورودی محاسبه می‌شود.
- در این مرحله خروجی CLI، فایل C++17 است. resolver کتابخانه‌های `use std.*` و ساخت مستقیم executable جزو milestoneهای بعدی هستند.

## ساخت

```sh
npm run build:gen2
```

این دستور checksum باینری frozen Gen1 را بررسی می‌کند، bundle را از سورس ماژولار Gen2 می‌سازد و آن را با Gen1 کامپایل می‌کند. به‌دلیل نقص نوع‌دهی tempهای Gen1 برای local/field/list، یک repair pass محدود فقط روی C++ تولیدشده برای خود compiler اجرا می‌شود؛ سورس و باینری Gen1 و خروجی برنامه‌های کاربر دست‌کاری نمی‌شوند. سپس candidate بومی در `generations/gen2/build/razc-candidate` قرار می‌گیرد. candidate هنوز به `generations/gen2/bin/razc` منتقل یا freeze نمی‌شود.

## استفاده از candidate

```sh
generations/gen2/build/razc-candidate --help
generations/gen2/build/razc-candidate examples/hello.raz --emit-cpp build/hello.cpp
c++ -std=c++17 build/hello.cpp -I runtime -o build/hello
./build/hello
```

این candidate با `-O0` ساخته می‌شود تا چرخه‌ی توسعه سریع بماند؛ برای build بهینه می‌توان `RAZ_BUILD_OPT=-O2 npm run build:gen2` اجرا کرد. `--emit-cpp` و `-o` مشخص می‌کنند C++ تولیدشده در کجا ذخیره شود. در صورت حذف آن‌ها، خروجی پیش‌فرض `<input>.cpp` است.

## ساختار سورس

- `src/model/`: مدل‌های مشترک AST و داده‌ها
- `src/core/`: lexer، parser، متن و RIR
- `src/source/`: expansion و تشخیص چرخه‌ی `include`
- `src/validation/`: تحلیل معنایی و نوع‌ها
- `src/targets/cpp17/`: مدل Backend، تحلیل نوع RIR و تبدیل به C++17
- `src/driver/`: CLI و تنظیمات فرایند کامپایل
- `std/`: جایگاه کتابخانه‌های استاندارد Raz؛ هنوز resolver آن فعال نشده است

## آزمون‌های این milestone

```sh
npm run check:gen2:source
npm run test:gen2:driver-fast
npm run test:gen2:fast
```

هر سه دستور پس از ساخت candidate در این milestone موفق شده‌اند. تست سریع خروجی C++ را نیز واقعاً کامپایل و اجرا می‌کند و مسیر `include` نسبی را بررسی می‌کند.

## وضعیت

این نسخه‌ی اولیه برای تثبیت ساختار و قرارداد CLI است. هنوز مدیریت واقعی package/module، macroها و متغیرهای سراسری زمان کامپایل، لایه‌ی target/CPU قابل تنظیم و تولید مستقیم binary از درون CLI پیاده‌سازی نشده‌اند. Gen1 در این مرحله فقط نقش compiler پایه را دارد و سورس آن نباید برای افزودن قابلیت‌های Gen2 تغییر کند.
