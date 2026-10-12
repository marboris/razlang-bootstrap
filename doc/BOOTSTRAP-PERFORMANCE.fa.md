# بهینه‌سازی زمان بیلد Bootstrap در Raz

## علت کندی

`npm run build:gen2` ابتدا Gen1 منجمد را اجرا می‌کند تا bundle زبان Raz را به RIR/C++ تبدیل کند. در این مرحله هنوز `g++` اجرا نشده است؛ بنابراین زیاد کردن threadهای GNU مشکل اصلی را حل نمی‌کند.

چند کپی پنهان در lowering کد ایجاد می‌شد:

- خواندن‌هایی مثل `state.tokens[state.pos]` ابتدا کل `List<Token>` را در متغیر موقت کپی می‌کردند.
- فراخوانی `length(s)` و `listLength(tokens)` در هر دور حلقه، آرگومان رشته/بردار را به‌صورت مقداری کپی می‌کرد.
- `findText` برای هر offset از `slice(s, i, i+n)` استفاده می‌کرد و زیررشتهٔ موقت می‌ساخت.

در lexer/parser این عملیات در حلقه‌های پرتکرار قرار داشتند و روی سورس کامپایلر به هزینه‌ای نزدیک به `O(n²)` می‌رسیدند.

## تغییرات اعمال‌شده

1. `findText` در سورس‌های Gen0/Gen1/Gen2 با مقایسهٔ مستقیم کاراکترها بازنویسی شد.
2. lowering خواندن index را، در مواردی که base یک lvalue و index بدون side effect است، به alias/reference تبدیل می‌کند تا کل رشته یا vector کپی نشود.
3. `length` و `listLength` در صورت دریافت lvalue با alias خوانده می‌شوند؛ فراخوانی با expression غیر-lvalue همچنان مسیر معمول را استفاده می‌کند.
4. همین اصلاح size/index در JavaScript seed کامپایلر Gen0 اعمال شد؛ وگرنه seed نسخهٔ تازهٔ Gen0 را با همان کد غیر بهینه تولید می‌کرد.
5. `build-gen1.mjs` زمان هر مرحله را گزارش می‌کند و timeout دارد. پیش‌فرض ساخت candidate روی `-O0` است تا optimizer زمان زیادی صرف بهینه‌سازی translation unit یکپارچهٔ کامپایلر نکند. برای آزمایش ساخت optimize‌شده می‌توان `RAZ_BUILD_OPT=-O2` تنظیم کرد.

## روش بازسازی candidateها

برای بازسازی زنجیره بدون بازنویسی باینری‌های تاریخی `generations/*/bin/`:

```sh
make bootstrap-candidates
```

این هدف Gen0 candidate را از JS seed می‌سازد، سپس همان candidate را برای ساخت Gen1 استفاده می‌کند و Gen1 candidate را برای ساخت Gen2 به‌کار می‌برد. candidateها در `generations/<gen>/build/razc-candidate` قرار می‌گیرند. باینری‌های frozen و checksumهای آن‌ها دست‌نخورده باقی می‌مانند؛ این هدف صرفاً candidate می‌سازد و freeze را جداگانه باید اجرا کرد.

برای ساخت Gen2 جداگانه با Gen1 candidate موجود:

```sh
RAZ_BOOTSTRAP_USE_CANDIDATES=1 npm run build:gen2
```

## اندازه‌گیری این اصلاح

در محیط بررسی این پروژه، بعد از اصلاح‌ها:

- اجرای Gen1 candidate روی bundle Gen1: `1.1 s`
- کامپایل C++ candidate با `g++ -O0`: `2.7 s`
- کامپایل bundle Gen2 با Gen1 candidate: `2.8 s`
- ساخت Gen2 native candidate با `g++ -O0`: `3.1 s`
- `make test`: پس از ساخت candidate واقعی Gen2، ۲۰ تست CTest موفق؛ کل تست‌ها حدود `2.05 s`

این زمان‌ها اندازه‌گیری محیط بررسی هستند، نه تضمین برای همهٔ سخت‌افزارها. تست یکپارچهٔ `compiler/razc/examples/hello.raz` نیز با درایور native، C++ تولیدشده و `g++` اجرا شد.

## کوتاه‌مدار بودن `&&` و `||` در bootstrap

هنگام ساخت candidate نسل 1، مشخص شد که lowerer نسل 0 عملوندهای `&&` و `||` را eager تولید می‌کرد. در helperهایی مثل `trim` این باعث می‌شد عبارتی نظیر `b > a && s[b - 1] == 32`، بخش `s[b - 1]` را حتی وقتی `b > a` نادرست بود ارزیابی کند. در رشتهٔ خالی، این به دسترسی نامعتبر و assertion در `std::string::operator[]` منجر می‌شد.

lowerer هر دو نسل 0 و 1 اکنون برای `&&` و `||` از label/branch در RIR استفاده می‌کند تا RHS فقط در صورت نیاز اجرا شود.

برای بازتولید این بررسی با assertionهای libstdc++ فعال:

```sh
RAZ_GLIBCXX_ASSERTIONS=1 make bootstrap-candidates
```

این حالت فقط candidate نسل 1 را با `-D_GLIBCXX_ASSERTIONS` می‌سازد؛ مرحلهٔ ساخت Gen2 سپس همان candidate assertion-enabled را اجرا می‌کند. در بررسی محلی، ساخت Gen1 با assertionها فعال موفق شد و از باینری frozen جدید Gen1 نیز Gen2 بدون crash ساخته شد. تست‌های native CTest حالا ۲۰ از ۲۰ مورد را می‌گذرانند؛ زمان کل دور اخیر حدود `2.05 s` بود.


## به‌روزرسانی باینری‌های frozen در 2026-10-11

پس از اصلاح کوتاه‌مدار، candidate تازهٔ Gen0 و Gen1 از سورس ساخته شد. باینری‌های `legacy/gen0/bin/razc` و `legacy/gen1/bin/razc` اکنون با checksumهای تازه freeze شده‌اند؛ Gen1 نسخهٔ نهایی `-O2` است و پیش از freeze با یک candidate دارای `_GLIBCXX_ASSERTIONS` اعتبارسنجی شد. سابقهٔ checksum قبلی/جدید در `gen.json` ثبت شده و `scripts/freeze.sh N --replace-frozen` هنگام ارتقای آگاهانه، rollback backup را زیر `generations/genN/build/previous-frozen/` نگه می‌دارد.

## Resolver Gen2

Resolver از اسکنر line-based ساده به اسکنر quote-aware تغییر کرده است. اسکنر comment markerها را فقط بیرون از string/character literal تفسیر می‌کند، leading/trailing block comment اطراف `use` را می‌پذیرد، importهای تکراری را deduplicate می‌کند و تشخیص cycle و ماژول گم‌شده را حفظ می‌کند. تست‌های native جدید این موارد را از مسیر درایور و frontend واقعی آزمایش می‌کنند.
