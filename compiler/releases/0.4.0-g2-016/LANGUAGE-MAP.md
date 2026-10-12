# Raz Gen2 — جدول مرجع زبان و نگاشت C++17

نسخه‌ی مرجع فعلی: Gen2 preview 0.4.0-g2-016. ستون «وضعیت» صریح می‌کند که آیا نگاشت در کد پیاده‌سازی شده یا صرفاً هدف طراحی است.

## ۱. واژه‌های کلیدی

| واژه | نحو / قید | معنا در Raz | نمایش فعلی در RIR | خروجی C++17 | وضعیت |
|---|---|---|---|---|---|
| `function` | `function f(p: T) -> R { ... }` | تعریف تابع | `function f(T p) -> R` | `R rz_f_f(...)` | پیاده‌سازی‌شده |
| `struct` | `struct S { field: T; }` | نوع مرکب با فیلد | `struct S`, `field T field` | `struct rz_t_S`؛ فیلد `rz_m_field` | پیاده‌سازی‌شده |
| `let` | `let x: T = e;` یا `let x = e;` | تعریف binding تغییرپذیر؛ وجود annotation در AST ثبت می‌شود | `local T x` یا `local-auto T x`؛ برای global نیز `global` یا `global-auto`، سپس `store` | شناسه‌ی `rz_v_x`؛ در حالت بدون annotation، C++ از `auto` storage استفاده می‌کند | storage مبتنی بر `auto` پیاده‌سازی شده؛ checker هنوز نوع داخلی را برای اعتبارسنجی/RIR تعیین می‌کند و semantics type-erasure کامل نشده است |
| `const` | `const x: T = e;` | مقدار سراسری غیرقابل‌تغییر پس از initializer | `global-const T x raz_global_init_x` + تابع initializer RIR | `const T rz_v_x = rz_f_raz_global_init_x();` | پیاده‌سازی‌شده برای ثابت‌های سراسری؛ compile-time constant هنوز هدف جداگانه است |
| `return` | `return;`, `return e;` | بازگشت از تابع | `return [value]` | `return [value];` | پیاده‌سازی‌شده |
| `if` | `if (c) { A }` | اجرای شرطی | `branch c ? L1 : L2` | `if (c) goto L1; else goto L2;` | پیاده‌سازی‌شده |
| `else` | `if (c) A else B` | شاخه‌ی جایگزین | label و `jump` جدا | برچسب‌ها و `goto` | پیاده‌سازی‌شده |
| `while` | `while (c) { A }` | حلقه‌ی شرطی | label سرحلقه و `branch` | `goto` و شرط تولیدشده | پیاده‌سازی‌شده |
| `true` | مقدار | مقدار بولی درست | `const bool true` | `true` | پیاده‌سازی‌شده |
| `false` | مقدار | مقدار بولی نادرست | `const bool false` | `false` | پیاده‌سازی‌شده |
| `new` | `new S()` | ساخت مقدار نوع | `new S` | `rz_t_S{}` | پیاده‌سازی اولیه؛ heap allocation عمومی نیست |
| `use` | `use "header";` یا `use std.mod;`؛ چند import ماژول می‌توانند در یک خط باشند | افزودن header خارجی یا واردکردن ماژول Raz | `use-quoted` یا سورس ماژول resolve‌شده | `#include <header>` / `#include "path"` برای headerهای صریح | پیاده‌سازی‌شده؛ importهای ماژولی deduplicate می‌شوند و خطاهای resolver مسیر/شماره‌خط دارند |
| `include` | `include "file.raz";` | گسترش فایل Raz قبل از parse | پیش از RIR حذف و گسترش می‌شود | نگاشت مستقیم ندارد | پیاده‌سازی‌شده |
| `unsafe` | `unsafe { ... }` | اجازه‌ی عملیات pointer محدودشده | wrapper/metadata معنایی | بلوک C++ معمولی، بدون runtime guard | پیاده‌سازی اولیه |
| `nullptr` | مقدار | اشاره‌گر تهی | `const char* nullptr` | `nullptr` | پیاده‌سازی اولیه |
| `extern` | — | بخشی از نحو Gen2 نیست؛ native call با `!` انجام می‌شود | ندارد | ندارد | حذف‌شده |

## ۲. عملگرها و ترتیب ارزیابی

| نحو | قید معنایی | اثر | RIR | C++17 | وضعیت |
|---|---|---|---|---|---|
| `a = b` | `b` قابل انتساب به نوع `a` باشد | تغییر مقدار binding | `store` / `store_ref` | انتساب | پیاده‌سازی‌شده |
| `a + b` | عددی؛ یا هر دو `string` | جمع یا الحاق متن | `add` | `+` | پیاده‌سازی‌شده |
| `a - b`, `a * b`, `a / b`, `a % b` | عددی | عملگر حسابی | `sub/mul/div/mod` | `- * / %` | پیاده‌سازی‌شده |
| `a == b`, `a != b` | نوع‌های قابل‌مقایسه | برابری / نابرابری | `eq/ne` | `==/!=` | پیاده‌سازی‌شده |
| `< <= > >=` | عددی یا نوع قابل‌مقایسه‌ی تأییدشده | مقایسه | `lt/le/gt/ge` | `< <= > >=` | پیاده‌سازی‌شده |
| `a && b` | هر دو `bool` | `b` فقط اگر `a == true` | `branch`؛ ارزیابی شرطی RHS | `if/goto` تولیدی | پیاده‌سازی و تست runtime با candidate تازه موفق |
| `a || b` | هر دو `bool` | `b` فقط اگر `a == false` | `branch`؛ ارزیابی شرطی RHS | `if/goto` تولیدی | پیاده‌سازی و تست runtime با candidate تازه موفق |
| `!a` | `bool`؛ یا قرارداد native-call در postfix | نفی بولی یا فراخوانی native با `name!(...)` | `not` یا native-call | `!a` یا فراخوانی نام native دست‌نخورده | پیاده‌سازی‌شده |
| `f(...)` | تابع Raz شناخته‌شده | فراخوانی تابع | `call` | `rz_f_f(...)` | پیاده‌سازی‌شده |
| `native!(...)` | هدر باید از طریق `use "..."` فراهم شده باشد | فراخوانی API خارجی بدون `extern` | native-call | `native(...)` با نام خارجی اصلی | پیاده‌سازی‌شده |
| `x.y` | فیلد موجود باشد | دسترسی به فیلد | `field` / `ref_field` | `.rz_m_y` | پیاده‌سازی‌شده |
| `xs[i]` | اندیس معتبر از نظر نوع `i64`/`char` | دسترسی اندیسی | `index` / `ref_index` | `[]` | پیاده‌سازی نوع؛ bounds check در runtime هنوز نیست |
| `->` | بعد از امضای تابع | تعیین نوع بازگشت | امضای RIR | نوع بازگشت C++ | پیاده‌سازی‌شده |
| `.` در `use std.io` | نام ماژول بخش‌بندی می‌شود | یافتن سورس کتابخانه‌ی Raz | resolver | فایل ماژول پس از گسترش | پیاده‌سازی‌شده |
| `print "Hello"` بدون پرانتز | فراخوانی سبک echo/print | هنوز grammar آن وجود ندارد؛ فعلاً `print("Hello")` | هنوز تعریف نشده | پیاده‌سازی‌نشده |
| `"Hello" . " Raz"` | الحاق متن با نقطه | فعلاً `.` عملگر field access است | هنوز تعریف نشده | پیاده‌سازی‌نشده |
| `.` برای الحاق رشته | هدف طراحی مطرح‌شده | الحاق متن/تبدیل مقدار | هنوز تعریف نشده | هنوز تعریف نشده | پیاده‌سازی‌نشده |

## ۲.۱ جداکننده‌ها و نحوهای واژگانی

| نشانه | کاربرد در Raz | نمایش/اثر در RIR | خروجی C++17 | وضعیت |
|---|---|---|---|---|
| `(` `)` | گروه‌بندی عبارت، پارامتر و آرگومان تابع، شرط `if/while` | AST expression/call/parameter list | `(...)`، call و شرط | پیاده‌سازی‌شده |
| `{` `}` | بدنه‌ی تابع، struct، if/else، while و unsafe | statement lists، `struct`، `function`، `branch` و label | `{...}` برای type/function، و `goto` برای control-flow | پیاده‌سازی‌شده |
| `;` | پایان statement و دستور use/include | معمولاً پیش از RIR حذف می‌شود | به‌عنوان terminator در C++ emitter | پیاده‌سازی‌شده |
| `:` | جداکردن نام از type در متغیر، پارامتر و فیلد | type در `local/global`, پارامتر یا field | type declaration در C++ | پیاده‌سازی‌شده |
| `,` | جداکننده‌ی پارامترها و آرگومان‌ها | فهرست‌ها | `,` | پیاده‌سازی‌شده |
| `.` | دسترسی به struct field یا جداسازی بخش‌های نام ماژول | `field` یا lookup ماژول | `.rz_m_x` برای field؛ در `use std.io` پیش از C++ resolution می‌شود | پیاده‌سازی‌شده؛ الحاق رشته نیست |
| `[` `]` | اندیس‌گذاری رشته/فهرست و lvalue اندیسی | `index` / `ref_index` | `value[index]` | پیاده‌سازی نوع؛ bounds check عمومی هنوز وجود ندارد |
| `->` | جداکننده‌ی return type از امضای تابع | نوع بازگشت در function record | نوع بازگشت C++، خود `->` حذف می‌شود | پیاده‌سازی‌شده |
| `&` | ارجاع به سبک C++، مانند `&string` | token/AST مشخصی ندارد | هیچ خروجی‌ای؛ فعلاً syntax پشتیبانی نمی‌شود | برنامه‌ریزی‌شده |
| `&&` | AND بولی با short-circuit | `branch` و label | شرط‌های `if/goto`؛ ارزیابی سمت راست فقط در صورت نیاز | پیاده‌سازی و تست اجرایی با candidate تازه موفق |
| `!` postfix | فراخوانی native، مانند `c_api!(x)` | `native-call` | `c_api(x)` با نام native اصلی | پیاده‌سازی‌شده |
| فضای خالی و کامنت‌ها | جداکردن tokenها و توضیحات `//...`, `/*...*/` | حذف‌شده از AST/RIR | خروجی ندارند | پیاده‌سازی‌شده |

## ۲.۲ قواعد هویت و نوع

| صورت Raz | قاعده‌ی فعلی | اثر C++ | وضعیت |
|---|---|---|---|
| `let x: T = e` | binding تغییرپذیر با type صریح | `T rz_v_x{}` سپس assignment در مسیر اجرا | پیاده‌سازی‌شده؛ initializer مستقیم هنوز در توسعه‌ی بعدی مطرح است |
| `let x = e` | نشانگر `isTypeExplicit=false` حفظ می‌شود؛ checker فعلاً نوع داخلی را برای اعتبارسنجی نگه می‌دارد | `local-auto` / `global-auto` با نوع initializer در RIR | C++ local: `auto M(x) = decltype(temp){};`؛ global: `auto M(x) = decltype(init_fn()){};`؛ const global: `const auto M(x) = init_fn();` |
| `function f(...)` بدون `-> T` | نوع بازگشت پیش‌فرض فعلی `void` است | تابع C++ از نوع `void` | پیاده‌سازی‌شده؛ inference بازگشت در هدف فعلی نیست |
| `Ref<T>` | ارجاع lvalue در مدل فعلی | `T&` | پیاده‌سازی اولیه؛ borrow/ownership safety تضمین نشده |
| `T*` داخل `unsafe` | pointer محدودشده | `T*` | پیاده‌سازی اولیه؛ فقط subset محدود پشتیبانی می‌شود |
| `&&` به معنی reference-to-reference | چنین معنایی ندارد | هیچ reference type جدیدی ایجاد نمی‌کند | پشتیبانی نمی‌شود؛ `&&` فعلاً عملگر AND بولی است |
| ترتیب مقداردهی سطح ماژول | ابتدا initializerهای global تغییرپذیر به ترتیب اعلان؛ سپس hookهای ماژول؛ سپس statementهای اجرایی سطح فایل به ترتیب متن | global storage + فازهای RIR مجزا | initializerهای متغیر در فاز راه‌اندازی اجرا می‌شوند؛ برای توالی side effectها از بدنه‌ی تابع یا statementهای اجرایی استفاده شود | قرارداد فعلی Gen2 |

## ۳. نوع‌ها و ABI خروجی

| نوع Raz | معنا | C++17 | RIR / محدودیت |
|---|---|---|---|
| `i64` | عدد صحیح دقیقاً ۶۴ بیتی | `raz_i64` با alias به `__INT64_TYPE__` از GCC/Clang و `static_assert(sizeof(...) == 8)` | `i64` |
| `f64` | ممیز شناور ۶۴ بیتی | `double` | `f64` |
| `bool` | بولی | `bool` | `bool` |
| `char` | کد کاراکتر محدود | `char` | فعلاً قرارداد بایت/کد کاراکتر ساده |
| `string` | متن | `std::string` | `string` |
| `List<T>` | فهرست پویا | `std::vector<cpp(T)>` | library/container operations؛ genericها هنوز کامل نیستند |
| `Ref<T>` | ارجاع قابل‌انتساب | `cpp(T)&` | مدل reference فعلی؛ ownership تضمین‌شده نیست |
| `S` | struct تعریف‌شده در Raz | `rz_t_S` | RIR `struct S` |
| `T*` | pointer محدود | `cpp(T)*` | تنها subset ایمنی‌سنجی‌شده؛ `unsafe` لازم است |
| نوع حذف‌شده | در Gen2 فعلی auto-inference عمومی برای نوع مبهم کامل نیست | هدف طراحی: `auto` یا `std::any` بسته به قرارداد آینده | باید پیش از تثبیت زبان تصمیم نهایی شود |

## ۴. کتابخانه‌ها و کشف ماژول‌ها

| عبارت | resolver | نیاز به config جداگانه | خروجی/اثر |
|---|---|---|---|
| `use std.core` صریح | resolver فقط در صورت درخواست کاربر آن را وارد می‌کند | بله | `std/core/core.raz` فقط headerهای پایهٔ نمایش `string` و `List<T>` را وارد می‌کند: `string`, `vector`؛ برای `i64` از نوع ۶۴ بیتی predefined توسط GNU-compatible C++ compiler استفاده می‌شود |
| `use "cstdint";` | ندارد؛ header صریح C++ | فقط برای نوشتن native bridge/headerهای C++ | `#include <cstdint>`؛ برنامه‌ی عادی Raz نیازی به آن ندارد |
| `use "path/header.hpp";` | ندارد؛ مسیر header صریح | برای FFI/native bridge | `#include "path/header.hpp"` |
| `use std.io;` | جست‌وجوی ریشه‌های source با نام dotted | خیر برای هر API؛ مسیرهای root از driver/config CLI می‌آیند | گسترش `std/io/io.raz` و headerهایی که خود ماژول وارد می‌کند |
| `use a.b;` | `a/b/b.raz` سپس `a/b.raz` داخل search roots | خیر برای هر ماژول؛ ولی search root باید معرفی شود | سورس ماژول به compilation unit افزوده می‌شود |
| ماژول تکراری | `seenModules` | خیر | فقط یک‌بار گسترش |
| چرخه‌ی ماژول | `activeModules` | خیر | خطای `module dependency cycle` |
| header استاندارد داخلی Raz | کتابخانه‌ی Raz مالک dependency است | خیر | کاربر فقط `use std.<module>;` می‌نویسد |

## ۵. قرارداد نام‌های C++

| نماد Raz | نام C++ | قاعده |
|---|---|---|
| تابع `f` | `rz_f_f` | پیشوند تابع `rz_f_` |
| متغیر `x` | `rz_v_x` | پیشوند متغیر `rz_v_` |
| نوع `S` | `rz_t_S` | پیشوند نوع `rz_t_` |
| فیلد `value` | `rz_m_value` | پیشوند عضو `rz_m_` |
| local تخت‌شده با شناسه‌ی 3 و نام `value` | `rz_v_3_value` | پیشوند متغیر + Symbol ID + نام منبع |
| فراخوانی `c_api!(...)` | `c_api(...)` | نام خارجی عمداً تغییر نمی‌کند |
| entry point C++ | `main(int, char**)` | wrapper ثابت میزبان؛ تابع Raz با `rz_f_main()` فراخوانی می‌شود |

نام‌ها deterministic و خوانا هستند. پیشوند دسته‌ی نماد سبب می‌شود identifierهای رزروشده‌ی C++، مانند `class`، به نام‌های معتبر مانند `rz_t_class` تبدیل شوند. نام‌های native که با `!` فراخوانی می‌شوند مستثنا هستند؛ آن‌ها باید دقیقاً با نام symbol موجود در header مقصد تطابق داشته باشند.

Localهایی که برای تخت‌کردن control-flow به شناسه‌ی داخلی نیاز دارند، از قرارداد `raz$local$ID$sourceName` استفاده می‌کنند؛ `$` در identifier عادی Raz مجاز نیست و بنابراین به‌عنوان جداکننده امن است. Backend این نام را به صورت `rz_v_ID_sourceName` تولید می‌کند. این روش از کدگذاری هر حرف به عدد جلوگیری می‌کند و در عین خوانایی، نام‌های local شاخه‌های خواهر را یکتا نگه می‌دارد.

## ۶. فهرست کامل keywordهای lexer

| Keyword | تولید Token | رفتار/قید | RIR / مرحله‌ی داخلی | خروجی C++17 |
|---|---:|---|---|---|
| `function` | 10 | تعریف تابع در سطح فایل | `FunctionDef` سپس `function` | `R rz_f_name(...)` |
| `struct` | 11 | تعریف struct در سطح فایل | `StructDef` سپس `struct` | `struct rz_t_name` |
| `let` | 12 | تعریف binding تغییرپذیر | `local` یا global و `store` | `rz_v_name`؛ نوع با قرارداد فعلی checker تعیین می‌شود |
| `return` | 13 | بازگشت با/بدون مقدار | `return` | `return ...;` |
| `if` | 14 | انتخاب شرطی | `branch` و labelها | `if (...) goto ...; else goto ...;` |
| `else` | 15 | شاخه‌ی جایگزین | label و `jump` | کنترل جریان `goto` |
| `while` | 16 | تکرار تا نادرست‌شدن شرط | head/body/end labels | کنترل جریان `goto` |
| `true` | 17 | literal بولی درست | `const bool true` | `true` |
| `false` | 18 | literal بولی نادرست | `const bool false` | `false` |
| `new` | 19 | ساخت مقدار struct | `new Type` | `rz_t_Type{}`؛ فعلاً allocation روی heap نیست |
| `use` | 46 | واردکردن header یا ماژول Raz | `use-quoted` یا module expansion | `#include` برای headerهای صریح؛ سورس Raz پیش از RIR ادغام می‌شود |
| `include` | 47 | گسترش فایل Raz نسبی | حذف/گسترش پیش از parse | خروجی مستقیم ندارد |
| `unsafe` | 48 | محدوده‌ی عملیات pointer مجاز | `unsafe` statement و شمارنده‌ی semantic | بلوک C++ معمولی؛ تضمین runtime ایجاد نمی‌کند |
| `nullptr` | 49 | literal pointer تهی؛ فقط در `unsafe` | `const char* nullptr` | `nullptr` |
| `const` | 51 | binding غیرقابل‌تغییر در سطح برنامه | `global-const` + initializer | `const T rz_v_name = M(raz_fn, initializer)();` |
| `define` | 52 | تعریف source define در سطح فایل | پیش‌پردازش توکن‌محور پیش از AST/RIR | تعریف حذف می‌شود؛ فراخوانی مستقیم define گسترش می‌یابد | پیاده‌سازی اولیه؛ بدون hygiene/source map کامل |
| `extern` | — | پشتیبانی نمی‌شود؛ `!` برای native call | ندارد | ندارد |

`define` یک keyword سطح منبع است که در مرحله‌ی pre-parse جمع‌آوری می‌شود؛ مجاز بودن آن به سطح فایل محدود است.

Keywordها حساس به حروف بزرگ/کوچک هستند. نام نوع‌های `i64`, `f64`, `bool`, `char`, `string`, `List<T>`, `Ref<T>` فعلاً keyword جدا نیستند؛ آن‌ها از مسیر type parser و semantic validator معنا می‌گیرند. `field` هم keyword نیست و صرفاً grammar فیلد struct از identifier در آن موقعیت استفاده می‌کند.

## ۷. نمادها/عملگرهای واژگانی کامل

| نماد | Token | معنا | RIR | C++17 / اثر |
|---|---:|---|---|---|
| `(` `)` | 20, 21 | گروه‌بندی، call و پارامترها | AST list/call | پرانتز C++ |
| `{` `}` | 22, 23 | بلوک و بدنه | statement lists | بدنه‌ی تابع/struct یا labels |
| `;` | 24 | پایان statement | حذف پس از parse | terminator تولیدی `;` |
| `:` | 25 | جداکننده‌ی نام/نوع | type field | type declaration در C++ |
| `,` | 26 | جداکننده‌ی آرگومان/فیلد | list separator | `,` |
| `.` | 27 | field access؛ در `use` بخش نام ماژول | `field` یا module name | `.rz_m_field`؛ نام ماژول از خروجی حذف می‌شود |
| `[` `]` | 28, 29 | literal لیست یا index | `list`, `index`, `ref_index` | initializer/indexing C++; bounds-check عمومی هنوز ندارد |
| `=` | 30 | انتساب یا initializer separator | `store`, `store_ref` | `=` |
| `+` | 31 | جمع؛ الحاق فقط برای دو string | `add` | `+` |
| `-` | 32 | تفریق/unary negation | `sub` / `neg` | `-` |
| `*` | 33 | ضرب و suffix نوع pointer | `mul` / type suffix | `*`؛ pointer type نیازمند `unsafe` است |
| `/` | 34 | تقسیم | `div` | `/` |
| `%` | 35 | باقیمانده | `mod` | `%` |
| `!` | 36 | unary NOT؛ postfix `name!(...)` فراخوانی native | `not` یا `native-call` | `!x` یا `name(...)` با نام خارجی اصلی |
| `==` `!=` | 37, 38 | برابری/نابرابری | `eq` / `ne` | `==` / `!=` |
| `<` `<=` | 39, 40 | مقایسه | `lt` / `le` | `<` / `<=` |
| `>` `>=` | 41, 42 | مقایسه/بستن generic type | `gt` / `ge`; type parser | `>` / `>=` یا خاتمه‌ی `List<T>` |
| `&&` | 43 | AND با short-circuit | branch به RHS فقط اگر چپ درست باشد | شرط کنترلی تولیدشده؛ ارزیابی eager ممنوع |
| `||` | 44 | OR با short-circuit | branch به RHS فقط اگر چپ نادرست باشد | شرط کنترلی تولیدشده؛ ارزیابی eager ممنوع |
| `->` | 45 | معرفی نوع بازگشت | return type در function record | در امضای C++ به نوع بازگشت معمولی تبدیل می‌شود |
| `//...` | — | کامنت تا پایان خط | حذف‌شده در lexer | خروجی ندارد |
| `/*...*/` | — | کامنت چندخطی | حذف‌شده در lexer | خروجی ندارد |
| `identifier` | 1 | نام متغیر/تابع/نوع/فیلد | متن نام همراه AST فعلی | `M(role, name)`، جز native call صریح |
| عدد | 2 | literal عددی | `const i64/f64` در بخش فعلی parser | literal C++ |
| string | 3 | literal متن | `const string` | `std::string(...)` |
| char | 4 | literal نویسه | `const char` | literal `char` |

## ۸. طراحی آینده (هنوز پیاده‌سازی نشده)

| قابلیت | قرارداد موردنظر | وضعیت واقعی فعلی | پیش‌نیاز/تبدیل C++ |
|---|---|---|---|
| type annotation حذف‌شده | `let x = e` و `const x = e` بدون annotation | **پیاده‌سازی اولیه‌شده برای storage متغیرها**؛ AST و RIR حفظ می‌کنند که annotation غایب است، checker هنوز نوع داخلی را برای اعتبارسنجی استخراج می‌کند | C++ local از `auto` + `decltype(temp)` و global از `auto` + `decltype(init_fn())` استفاده می‌کند تا اثر initializer به محل store اصلی محدود بماند. حذف inference از semantics و `auto` مستقیم با initializer هنوز باقی است؛ return type حذف‌شده‌ی تابع جداگانه طراحی می‌شود |
| defineهای سورس | `define twice(x) { x + x }` و فراخوانی مستقیم `twice(2)` | پیاده‌سازی اولیه‌شده با expansion توکن‌محور، پیش از parse؛ بدون hygiene و source map کامل | تعریف از خروجی حذف و عبارت گسترش‌یافته به RIR/C++ می‌رسد |
| compile-time constants | مقداردهی قابل ارزیابی در زمان کامپایل | `const` فعلی فقط storage تغییرناپذیر است و می‌تواند runtime initializer داشته باشد | evaluator محدود یا `constexpr` فقط برای عبارت‌های مجاز |
| generic function | parameterization نوعی و specialization | پیاده‌سازی نشده به‌طور کامل؛ برخی container operations هنوز قواعد خاص checker دارند | generic IR، type substitution و specialization C++ template/instantiation |
| package/cache | جست‌وجو، نسخه‌بندی، lockfile، cache | فقط source roots و dedup/cycle detection | compiler driver مستقل؛ Makefile کاربر خارج از compiler تولید نمی‌شود |
| bounds safety | بررسی index و pointer/reference rules | دسترسی index فعلاً bounds-check عمومی ندارد | bounds-aware RIR/runtime helper یا static proof |
| ownership/reference | borrow/ownership برای reference امن | `Ref<T>` به C++ reference تبدیل می‌شود؛ safety کامل تضمین نیست | ownership model در RIR و validator |
| LLVM IR | backend/target بعدی مبتنی بر LLVM واقعی | فعلاً RIR متنی داخلی و C++17 target | پس از تثبیت language semantics و ABI |
| self-host | Gen2 همان سورس خودش را به‌صورت قابل‌تکرار کامپایل کند | هنوز تأیید نشده؛ Gen1 bootstrap باقی است | stable candidate، reproducible tests، سپس جداکردن compiler package |


## ۹. Source directives و اطلاعات build (G2-012)

| صورت | نقش | زمان اثر | وضعیت |
|---|---|---|---|
| `define twice(x) { x + x }` | تعریف source define سطح فایل؛ Token 52 | پیش از parse و semantic analysis | پیاده‌سازی اولیه؛ token-aware expansion |
| `twice(4)` | فراخوانی مستقیم define شناخته‌شده | pre-parse expansion | پیاده‌سازی؛ اگر نام define با تابع تداخل کند، define غالب است |
| `@twice(4)` | نحو فراخوانی define نیست | — | پشتیبانی نمی‌شود |
| `-DNAME=VALUE` | مقدار سفارشی build-time؛ به C++ منتقل می‌شود و literal استفاده‌شده به Raz const تبدیل می‌شود | زمان کامپایل | پیاده‌سازی برای literalهای محدود |
| `-UNAME` | حذف تعریف سفارشی قبلی و انتقال به C++ | زمان کامپایل | پیاده‌سازی |
| `RAZ_TARGET_OS` | سیستم‌عامل target تشخیص‌داده‌شده از predefines کامپایلر C++ | build/compile time | فقط‌خواندنی؛ string constant در صورت استفاده |
| `RAZ_TARGET_ARCH` | معماری target تشخیص‌داده‌شده از predefines کامپایلر C++ | build/compile time | فقط‌خواندنی؛ string constant در صورت استفاده |
| `RAZ_TARGET_COMPILER` | `gcc`، `clang` یا `unknown` از predefines | build/compile time | فقط‌خواندنی؛ string constant در صورت استفاده |
| `getEnv("NAME")` | خواندن محیط فرایند | runtime | API جداگانه در `std.env` |
