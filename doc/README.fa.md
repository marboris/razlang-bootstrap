# کامپایلر Raz

Raz سورس زبان خود را تحلیل می‌کند، RIR می‌سازد و در Gen2 به C++17 تبدیل می‌کند. سپس GNU C++ (`g++`) خروجی را به اسمبلی، آبجکت یا باینری تبدیل می‌کند. مسیر روزمره‌ی build و تست بومی است: **CMake + Ninja (در صورت نصب) + CTest**.

## شروع سریع

نیازمندی‌ها: CMake 3.20+، یک کامپایلر C++17 (پیش‌فرض `g++`) و ترجیحاً Ninja. Node.js فقط برای ساخت نسل‌های bootstrap فعلی لازم است؛ تست‌های بومی و build درایور به آن وابسته نیستند.

```sh
make                 # ساخت درایور native: build/native/bin/razc
make test            # build و CTest؛ نیازی به ساخت Gen2 ندارد
make build-gen2      # ساخت candidate کامپایلر Gen2 با Gen1 frozen
```

اگر Ninja نصب نباشد، Makefile از Unix Makefiles استفاده می‌کند. برای انتخاب دستی:

```sh
make GENERATOR='Unix Makefiles'
```

## استفاده از razc

پس از ساخت candidate مربوط به Gen2:

```sh
build/native/bin/razc compiler/razc/examples/hello.raz -O2 -g -march=native -o build/native/hello
./build/native/hello
```

`razc` یک درایور C++ بومی است. گزینه‌های کامپایل بومی را تحلیل نمی‌کند یا بازنویسی نمی‌کند؛ آن‌ها را به کامپایلر C++ می‌سپارد. مثلاً `-march=native`، `-mtune=native`، `-O3`، `-g`، `-I`، `-L`، `-l`، `-pthread`، `-fPIC` و `-Wl,...` به `g++` منتقل می‌شوند. متغیر محیطی `CXX` کامپایلر نهایی را عوض می‌کند.

برای build-time definitions در G2-010، گزینه‌های `-D` و `-U` هم به GNU C++ منتقل می‌شوند. مقدارهای `-D` که literal معتبر Raz باشند (عدد، `true`/`false`، کاراکتر یا رشتهٔ کوتیشن‌دار) علاوه بر macro بومی، به‌صورت global `const` در سورس Raz هم قابل استفاده‌اند. `-DNAME` بدون مقدار در Raz برابر `true` و برای GNU C++ برابر macro مقدار `1` است. مقدار غیر literal یا خالی مانند `-DNAME=ON` یا `-DNAME=` فقط macro بومی است و به‌عنوان متغیر Raz تعریف نمی‌شود. این قابلیت globalهای build-time است، نه هنوز macro expansion، `constexpr` یا شرط‌کامپایل.

```sh
build/native/bin/razc app.raz -DRAZ_DEBUG -DRAZ_LEVEL=7 '-DRAZ_CHANNEL="nightly"' -O2 -march=native -o build/app
```

```sh
# فقط C++ تولیدشده را ذخیره کن
build/native/bin/razc compiler/razc/examples/hello.raz --emit-cpp build/native/hello.cpp

# اسمبلی تولید کن (مثل g++)
build/native/bin/razc compiler/razc/examples/hello.raz -S -g -o build/native/hello.s

# آبجکت بساز
build/native/bin/razc compiler/razc/examples/hello.raz -c -O2 -o build/native/hello.o

# مسیر جست‌وجوی ماژول Raz، جدا از -L بومی GNU
build/native/bin/razc app.raz --module-path ./vendor/raz -O2 -L ./lib -lmathx -o app

# مشاهده‌ی فرمان‌های دقیق بدون اجرای compiler frontend یا g++
build/native/bin/razc --dry-run compiler/razc/examples/hello.raz -O2 -g -march=native -o build/native/hello

# اشکال‌زدایی
build/native/bin/razc compiler/razc/examples/hello.raz -O0 -g -o build/native/hello
gdb --args build/native/hello
```

`-L` معنای استاندارد GNU را دارد: مسیر جست‌وجوی کتابخانه‌های native برای linker. برای ریشه‌ی ماژول‌های Raz از `--module-path` یا `--std-path` استفاده کنید. برای انتخاب candidate دیگر می‌توان `RAZ_FRONTEND=/path/to/razc-candidate` تنظیم کرد؛ `RAZ_ROOT` نیز ریشه‌ی مخزن را به‌صورت صریح مشخص می‌کند.

## تست‌ها

تست‌های روزمره با CTest اجرا می‌شوند و فقط رفتار درایور، parsing گزینه‌ها و انتقال flagها را بررسی می‌کنند. بنابراین حتی اگر `compiler/razc/build/razc-candidate` هنوز ساخته نشده باشد، تست‌ها قابل اجرا هستند:

```sh
make test
ctest --test-dir build/native --output-on-failure
```

اگر candidate Gen2 هنگام configure موجود باشد، CMake یک smoke test اختیاری اضافه می‌کند که مسیر Raz → C++ → `g++` را واقعاً اجرا می‌کند. تست‌های بومی عمداً به‌صورت ضمنی کامپایلر Gen2 را bootstrap نمی‌کنند؛ ساخت آن مرحله‌ای جداگانه و آشکار است.

## ماژول‌ها و تست‌های رگرسیون Gen2

Resolver در `compiler/razc/src/source/modules.raz` دستورهای `use dotted.name;` را به‌صورت بومی در Raz پردازش می‌کند. مسیر `test.message` در ریشهٔ جست‌وجو به `test/message.raz` یا `test/message/message.raz` نگاشت می‌شود. اسکنر resolver کامنت‌های `//` و `/* ... */` را نادیده می‌گیرد، اما markerهای کامنت داخل string و character literal یا quoteهای escapeشده را به‌عنوان کامنت نمی‌شناسد. importهای تکراری deduplicate می‌شوند؛ وابستگی چرخه‌ای و ماژول گم‌شده پیش از تولید C++ خطای صریح می‌دهند.

برای اجرای تست‌های یکپارچهٔ resolver و semantics، ابتدا candidate نسل 2 باید ساخته شده باشد:

```sh
make build-gen2
make test
```

وقتی candidate حاضر است، CTest علاوه بر تست‌های درایور، رشته‌های دارای `/*`، کامنت‌های قبل/بعد از import، import تکراری، ماژول گم‌شده، چرخهٔ وابستگی و guard کوتاه‌مدار `&&` را از مسیر واقعی `razc -> C++ -> g++ -> اجرا` بررسی می‌کند. بدون candidate، تست‌های بومی درایور همچنان مستقل و سریع اجرا می‌شوند.

## نسل‌های تاریخی

- `legacy/gen0/seed/`: JavaScript seed اولیه‌ی bootstrap.
- `legacy/gen0/`: compiler تاریخی نسل صفر.
- `legacy/gen1/`: source و compiler تاریخی نسل یک؛ با Gen0 ساخته می‌شود.
- `compiler/razc/`: نسل در حال توسعه؛ سورس ماژولار آن منبع اصلی کامپایلر فعلی است.
- `src/host/raz_driver.cpp`: درایور native برای ترجمه‌ی فایل Raz به C++ و اجرای GNU C++.
- `CMakeLists.txt` و `Makefile`: build و تست بومی.
- `scripts/build-gen1.mjs` و `scripts/build-gen2.mjs`: مسیر bootstrap نسل‌ها؛ این اسکریپت‌های JS بخشی از ساخت تاریخی‌اند، نه framework تست روزمره.

Gen0 و Gen1 تست‌سویۀ مستقل ندارند. فرمان‌های `make build-gen0` و `make build-gen1` فقط مسیرهای تاریخی build را اجرا می‌کنند. `scripts/freeze.sh` باینری candidate را به نسل موردنظر کپی و checksum آن را ثبت می‌کند؛ freeze دیگر تست‌ها را اجرا نمی‌کند.
