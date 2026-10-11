# Raz Gen2 — پیش‌نمونه‌ی توسعه

Gen2 در حال توسعه است و هنوز stable یا frozen نیست. در این milestone تمرکز روی دو پایه است: جدا کردن سورس به ماژول‌های مستقل‌تر و ساخت یک CLI که با Gen1 کامپایل می‌شود.

## Milestone فعلی: G2-007 — جداکردن کتابخانه‌ها، std.env و bootstrap سازگار

- سورس بر اساس نقش‌ها تقسیم شده است: مدل AST، lexer، parser، تحلیل معنایی، تولید RIR، مدیریت includeهای سورس و target مربوط به C++17.
- فایل `src/driver/main.raz` نقطه‌ی ورود CLI است و خودش نیز در سورس canonical از `use std.io;` استفاده می‌کند. فقط adapter موقت bootstrap این directive را برای کامپایلر منجمد Gen1 حذف می‌کند.
- وابستگی‌های native از طریق ماژول‌های Raz اعلام می‌شوند؛ backend فهرست مخفی از headerها تزریق نمی‌کند. `std.core` یک prelude زبانیِ ضمنی است که headerهای لازم برای نمایش `i64`، `string` و `List<T>` در C++ را مالک می‌شود؛ برنامه‌ی عادی لازم نیست `cstdint`، `string` یا `vector` را بشناسد.
- ورودی CLI مسیر فایل Raz است و مسیر includeهای متنی نسبت به همان فایل ورودی محاسبه می‌شود.
- قرارداد `use` عمداً بدون ابهام است: `use "cstdint";` هدر C++ را وارد می‌کند و `use std.io;` ماژول Raz را resolve می‌کند. نام bare مثل `use cstdint;` در parser رد می‌شود؛ هدر C++ باید داخل کوتیشن باشد و نام ماژول Raz باید dotted باشد و پیش از parsing resolve شود.
- Resolver در `src/source/modules.raz` و به زبان Raz پیاده‌سازی شده است؛ از قرارداد مسیر فایل استفاده می‌کند و `module.json` را نمی‌خواند. برای مثال `std.io` به `std/io/io.raz` یا `std/io.raz` در یکی از ریشه‌های جست‌وجو نگاشت می‌شود.
- در CLI داخلی candidate ریشه‌های اضافه با `-L <path>` یا `--module-path <path>` داده می‌شوند. درایور بیرونی GNU-like از `--module-path <path>` استفاده می‌کند؛ `-L` در آن معنای استاندارد GNU یعنی مسیر کتابخانه‌ی native را دارد. ماژول‌ها فقط یک بار گسترش می‌یابند و وابستگی‌های تو در تو و چرخه‌ها بررسی می‌شوند.
- `std.io` در سورس Raz APIهای `print`، `readFile`، `writeFile`، `argCount` و `argAt` را تعریف می‌کند؛ `writeFile` مقدار `bool` برمی‌گرداند تا شکست بازکردن یا نوشتن قابل تشخیص باشد. پیاده‌سازی مرز native سیستم‌عامل در `std/io/io_native.hpp` است. خروجی برنامه‌ای که `std.io` را وارد می‌کند به `raz_runtime.hpp` وابسته نیست. این header پل native متعلق به همان ماژول است، نه runtime سراسری کامپایلر.
- `std.env` از طریق `use std.env;` APIهای `getEnv`، `hasEnv`، `osName` و `architecture` را ارائه می‌کند. پیاده‌سازی native آن در `std/env/env_native.hpp` جداست؛ هسته‌ی compiler برای نام متغیرهای محیطی، سیستم‌عامل یا معماری شاخه‌ی اختصاصی ندارد.
- قرارداد startup ماژول‌ها عمومی است: یک ماژول می‌تواند `function raz_module_init_<name>() { ... }` تعریف کند. Core این hookها را پس از مقداردهی globalهای Raz و پیش از اجرای statementهای سطح فایل فراخوانی می‌کند؛ hook باید بدون پارامتر و با نوع بازگشت `void` باشد. این قرارداد در backend به `std.io` یا نام یک کتابخانه‌ی خاص وابسته نیست.
- آرگومان‌های فرایند از ABI عمومی `raz_internal_process` در entry point تولیدشده فراهم می‌شوند؛ `std.io` فقط این context را می‌خواند و دیگر نیازی به `std_io_set_cli` یا تشخیص ویژه در C++ emitter ندارد.
- resolver، گسترش `include` و تشخیص چرخه‌ها در خود سورس Raz اجرا می‌شوند. درایور native در `src/host/raz_driver.cpp` candidate را برای تولید C++ اجرا می‌کند و سپس flagهای GNU را به کامپایلر نهایی C++ می‌دهد.

## Build و تست native

تست‌های روزمره دیگر به JavaScript وابسته نیستند و برای اجرا نیاز به build کامپایلر Gen2 ندارند:

```sh
make
make test
```

CMake با Ninja (اگر نصب باشد) درایور `build/native/bin/razc` را می‌سازد و CTest بررسی می‌کند که CLI و انتقال گزینه‌های GNU درست کار کنند. اگر candidate Gen2 هنگام configure موجود باشد، smoke test انتهابه‌انتها نیز فعال می‌شود.

## ساخت candidate

```sh
make build-gen2
```

این دستور checksum باینری frozen Gen1 را بررسی می‌کند، bundle را از سورس ماژولار Gen2 می‌سازد و آن را با Gen1 کامپایل می‌کند. به‌دلیل نقص نوع‌دهی tempهای Gen1 برای local/field/list، یک repair pass محدود فقط روی C++ تولیدشده برای خود compiler اجرا می‌شود؛ سورس و باینری Gen1 و خروجی برنامه‌های کاربر دست‌کاری نمی‌شوند. سپس candidate بومی در `generations/gen2/build/razc-candidate` قرار می‌گیرد. candidate هنوز به `generations/gen2/bin/razc` منتقل یا freeze نمی‌شود.

## استفاده از candidate و درایور GNU-like

پس از ساخت candidate:

```sh
# درایور بومی را با CMake/Ninja بساز
make

# Raz -> C++ -> g++؛ تمام flagهای GNU به مرحله‌ی C++ منتقل می‌شوند
build/native/bin/razc generations/gen2/examples/hello.raz -O2 -g -march=native -o build/hello
./build/hello

# فقط C++ تولید کن
build/native/bin/razc generations/gen2/examples/hello.raz --emit-cpp build/hello.cpp

# یا دستورات دقیق را بدون اجرای مراحل ببین
build/native/bin/razc --dry-run generations/gen2/examples/hello.raz -O2 -g -march=native -o build/hello
```

`-march`، `-mtune`، `-O`، `-g`، `-I`، `-L`، `-l`، `-pthread`، `-fPIC`، `-Wl,...` و سایر گزینه‌های native به `g++` پاس داده می‌شوند. مسیر ماژول‌های Raz با `--module-path` و `--std-path` مشخص می‌شود؛ `-L` برای لینک native رزرو است. `CXX` کامپایلر مقصد را عوض می‌کند و با `-g -O0` می‌توان خروجی را با `gdb` دیباگ کرد.

`make build-gen2` یک مرحله‌ی bootstrap جدا و نسبتاً سنگین است: bundle ماژولار را assemble می‌کند، با Gen1 منجمد ترجمه می‌کند و candidate را با GNU C++ می‌سازد. اجرای `make test` این کار را خودکار انجام نمی‌دهد.

## ساختار سورس

- `src/model/`: مدل‌های مشترک AST و داده‌ها
- `src/core/`: lexer، parser، متن و RIR
- `src/source/`: expansion و تشخیص چرخه‌ی `include`
- `src/validation/`: تحلیل معنایی و نوع‌ها
- `src/targets/cpp17/`: مدل Backend، تحلیل نوع RIR و تبدیل به C++17
- `src/driver/`: CLI داخلی Core
- `src/source/modules.raz`: module resolution و گسترش include با خود Raz
- `src/host/raz_driver.cpp`: درایور native که گزینه‌های GNU را به کامپایلر C++ پاس می‌دهد
- `std/`: کتابخانه‌های استاندارد Raz و پل‌های native متعلق به همان ماژول؛ resolver از سورس `*.raz` استفاده می‌کند و `module.json` فقط metadata راهنماست.

## قرارداد راه‌اندازی ماژول‌ها

ماژول‌هایی که به راه‌اندازی نیاز دارند می‌توانند یک تابع رزروشده با این الگو تعریف کنند:

```raz
function raz_module_init_my_module() {
    // آماده‌سازی native یا ثبت منابع ماژول
}
```

نام باید با `raz_module_init_` شروع شود و پسوند داشته باشد؛ تابع هیچ پارامتری نمی‌گیرد و باید `void` برگرداند. ترتیب فعلی اجرای startup این است: مقداردهی متغیرهای سراسری Raz، اجرای hookهای ماژول به ترتیب قرارگرفتن تعریف‌هایشان در سورس resolveشده، سپس اجرای statementهای معمول سطح فایل. وابستگی‌های ماژول ابتدا resolve می‌شوند، بنابراین hook وابستگی معمولاً پیش از hook مصرف‌کننده اجرا می‌شود.

این قرارداد از نام خاصی مثل `std_io_set_cli` استفاده نمی‌کند. entry point تنها context عمومی فرایند (`argc`/`argv`) را مقداردهی می‌کند؛ کتابخانه‌ی نیازمند آرگومان‌ها این context را از ABI داخلی عمومی می‌خواند. به این ترتیب هسته نمی‌داند کدام کتابخانه آرگومان‌ها را مصرف می‌کند.

## قرارداد ماژول‌ها

`std.core` به‌صورت ضمنی پیش از سورس ورودی resolve می‌شود و وابستگی‌های لازم نوع‌های پایه را تأمین می‌کند. افزودن `use std.core;` در برنامه اختیاری و بی‌ضرر است؛ ماژول فقط یک بار وارد می‌شود. برای استفاده از FFI و فراخوانی `name!(...)`، خود ماژول کتابخانه باید header native موردنیازش را با `use "...";` اعلام کند.


```raz
use "cstdint"; // هدر مستقیم C++
use std.io;     // کتابخانه‌ی Raz از مسیر generations/gen2/std/io/io.raz

print("Hello from Raz");
return 0;
```

`module.json` صرفاً metadata برای مستندات و ابزارهای بعدی است؛ تغییر یا حذف آن روی کامپایل اثر ندارد. قرارداد فعلی lookup از روی نام ماژول و ریشه‌های جست‌وجو است، نه JSON. ماژول‌ها به‌صورت transitive گسترش می‌یابند، فقط یک بار اضافه می‌شوند و cycleها قبل از اجرا گزارش می‌شوند. نسخه‌ی فعلی هنوز caching و package lock ندارد.

## تست‌های native این milestone

```sh
make test
```

این تست‌ها از CTest استفاده می‌کنند و بدون candidate نیز اجرا می‌شوند؛ بنابراین برای تست CLI و عبور دادن flagها لازم نیست هر بار کامپایلر Gen2 دوباره ساخته شود. در صورتی که candidate از قبل موجود باشد، CMake یک تست یکپارچه‌ی Raz → C++ → GNU C++ نیز ثبت می‌کند.

## وضعیت

این نسخه‌ی اولیه برای تثبیت ساختار و قرارداد CLI است. مدیریت package پیشرفته، cache، macroها و متغیرهای سراسری زمان کامپایل هنوز پیاده‌سازی نشده‌اند. تولید C++ به‌وسیله‌ی `razc-candidate` انجام می‌شود؛ درایور بومی `build/native/bin/razc` گزینه‌های GNU را دریافت می‌کند و مرحله‌ی نهایی را با `g++` اجرا می‌کند. Gen1 در این مرحله فقط نقش compiler پایه را دارد و سورس آن نباید برای افزودن قابلیت‌های Gen2 تغییر کند.


## فراخوانی توابع Native در Gen2

برای صدا زدن تابعی که اعلان Raz ندارد و انتظار می‌رود از هدر native صریح وارد شود، از پسوند `!` استفاده می‌شود:

```raz
use "cstdint";

function nativeCount() -> i64 {
    return external_count!();
}
```

`name!(...)` امضای تابع را در Raz ثبت نمی‌کند. نام، تعداد آرگومان‌ها و سازگاری نوع‌های C++ در مرحله‌ی کامپایل native بررسی می‌شوند. مقدار بازگشتی این فراخوانی برای type checker ناشناخته است؛ بنابراین اگر در مقداردهی متغیر استفاده شود باید نوع متغیر صریح باشد. دستور `extern function` در Gen2 پشتیبانی نمی‌شود.


### کتابخانه‌ی `std.text`

توابع `length`، `slice` و `int_to_string` در Gen2 از نگاشت ثابت `raz::...` خارج شده‌اند. آن‌ها API معمول Raz در `std/text/text.raz` هستند و پیاده‌سازی native آن‌ها فقط با `use "std/text/text_native.hpp";` وارد می‌شود. مصرف‌کننده باید `use std.text;` را صریح اعلام کند. در مرحله‌ی bootstrap با Gen1، adapter موقت این import را حذف می‌کند چون Gen1 هنوز resolver ماژول‌های سورس‌محور را ندارد؛ این سازگارسازی در سورس canonical Gen2 اعمال نمی‌شود.


### کتابخانه‌ی `std.containers`

عملیات فهرست‌ها با `use std.containers;` و پیاده‌سازی native متعلق به همین ماژول فراهم می‌شوند. Backend دیگر `push`، `append` و `listLength` را به نام‌های `raz::list_*` تبدیل نمی‌کند. در این مرحله بررسی نوع این عملیات هنوز بخشی از semantics زبان است؛ انتقال پیاده‌سازی runtime به کتابخانه انجام شده، اما حذف کامل قواعد ویژه‌ی نوع‌دهی نیازمند generics و قراردادهای API کامل‌تر است.


### کتابخانه‌ی `std.env` و قرارداد bootstrap

`use std.env;` توابع `getEnv(name)`، `hasEnv(name)`، `osName()` و `architecture()` را در اختیار برنامه قرار می‌دهد. این API بر اساس C++ استاندارد برای محیط فرایند و macroهای پلتفرم پیاده‌سازی شده و وابستگی به runtime اختصاصی Raz ندارد.
این ماژول همچنین ثابت‌های سراسری `RAZ_OS_NAME` و `RAZ_ARCHITECTURE` را فراهم می‌کند. هر `const` سراسری با یک تابع initializer در RIR نمایش داده می‌شود و در C++ به‌صورت شیء واقعی `const` مقداردهی می‌شود؛ بنابراین دیگر در entry point بازنویسی نمی‌شود. این با ثابت‌های زمان کامپایل و macroها فرق دارد که هنوز در `NEXT` قرار دارند.

در bootstrap، Gen1 تابع `writeFile` را `void` می‌شناسد ولی نسخه‌ی Gen2 در `std.io` مقدار `bool` می‌دهد. برای جلوگیری از تغییر قرارداد زبان، adapter موقت ساخت فقط در ورودی bootstrap، نوشتن را با خواندن دوباره‌ی فایل بررسی می‌کند. سورس canonical Gen2 همچنان مسیر خطای `bool` را نگه می‌دارد. این fallback تا زمانی لازم است که bootstrap از طریق compiler نسل خودش انجام شود.

## مرجع صوری زبان

جدول کلیدواژه‌ها، عملگرها، نوع‌ها، معنا و نگاشت فعلی به C++17 در [`LANGUAGE-MAP.md`](LANGUAGE-MAP.md) نگهداری می‌شود. مواردی که هنوز فقط هدف طراحی‌اند، در جدول با وضعیت «پیاده‌سازی‌نشده/ناقص» مشخص شده‌اند.

