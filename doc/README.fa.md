# کامپایلر Raz

هدف پروژه ساخت کامپایلری برای زبان Raz است که سورس را تحلیل کند، RIR مستقل از مقصد بسازد و در نهایت C++17 تولید و کامپایل کند. نسخه‌ی JavaScript در `generations/gen0/seed/` فقط ریشه‌ی bootstrap است. بعد از ساخته‌شدن هر نسل، آن باینری برای ساخت نسل بعدی استفاده می‌شود و نسل جدید برای کار روزمره از نسل قبلی مستقل است.

## وضعیت فعلی

JavaScript seed نسل صفر را می‌سازد. سپس `gen0` فقط سازنده‌ی Gen1 است: `gen0 → S1 → gen1`. بعد از freeze شدن Gen1، مسیر توسعه‌ی نسل بعد `gen1 → S2 → gen2` است و `gen0` دیگر compiler عملیاتی آن مسیر نیست. در Gen1، frontend، RIR verifier و backend بومی توسعه داده شده‌اند و سطح زبان شامل top-level بدون `main`، globals، `include`/`use`، CLI runtime و مرز `unsafe` است. self-compile شدن همان نسل شرط اعتبار نسل نیست.

`src/` در ریشه‌ی پروژه ابزارهای host/قدیمی و کدهای bootstrap است؛ **source of truth نسل‌ها `generations/` است**.

## ساختار

- `generations/gen0/seed/`: JavaScript seed یک‌باره‌ی bootstrap.
- `generations/gen0/`: compiler منجمد نسل صفر.
- `generations/gen1/`: source/final/examples/build نسل یک؛ این نسل با Gen0 ساخته می‌شود و سپس compiler نسل بعد است.
- `src/host/` و `scripts/`: orchestration و ابزارهای host؛ این‌ها عضو زبان نسل‌ها نیستند.
- `config/`: مشخصات زبان و targetها.
- `runtime/`: runtime مورد نیاز کد C++ تولیدشده.
- `tests/`: تست‌های رفتاری، منفی، RIR، bootstrap و backend.
- `.build/` و `tests/.tmp/`: خروجی‌های تولیدی؛ نباید ورودی یا سورس اصلی باشند.

## کامپایلر Native

برای ساخت یک باینری واحد که frontend و backend نوشته‌شده با Raz را در خود دارد:

```sh
npm run build:native
npm run self-host:native
npm run test:gen1:fast
npm run build:gen1
```

این فرمان bundle را با seed جاوااسکریپتی می‌سازد و باینری را در `.build/native/razc` قرار می‌دهد. باینری سورس را از `.build/native/work/frontend/input.raz` می‌خواند و C++ را در `.build/native/work/backend/output.cpp` می‌نویسد:

```sh
cp tests/cases/arithmetic.raz .build/native/work/frontend/input.raz
cd .build/native/work
../razc
c++ -std=c++17 backend/output.cpp -o backend/program
backend/program
```

فرمان `self-host:native` ابزار bootstrap قدیمی Gen0 را اعتبارسنجی می‌کند؛ این فرمان تعریف نسل‌های بعدی نیست. ساخت Gen1 با `npm run build:gen1` از `generations/gen0/bin/razc` استفاده می‌کند و نتیجه باید در `generations/gen1/bin/razc` freeze شود. پس از freeze، مثال‌های `generations/gen1/examples/` باید با خود Gen1 اجرا شوند. مقایسه‌ی دوباره‌ی Gen1 با خودش فقط یک check اختیاری reproducibility است و شرط تولید Gen2 نیست.

## اجرا

```sh
npm test
npm run test:backend
npm run test:host
npm run test:full
npm run bootstrap
npm run build:native
npm run check
```

تست‌ها در workspace موقت اجرا می‌شوند و نباید فایل‌های سورس را جایگزین کنند. برای bootstrap بومی به Node.js و کامپایلر C++17 مانند `c++` نیاز است.

## مسیر توسعه

1. تکمیل surface و pipeline Gen1 و نگه‌داشتن `gen0` کاملاً ثابت.
2. تست‌های سریع و deterministic بعد از هر تغییر؛ buildهای سنگین فقط در milestone ساخت نسل. Gen1 یک مسیر سریع مستقل (`npm run test:gen1:fast`) دارد.
3. `npm run build:gen1`، سپس `scripts/freeze.sh 1` و ثبت checksum Gen1.
4. بعد از freeze، `gen1` compiler عملیاتی نسل بعد است: `S2` و برنامه‌های L1 از جمله `generations/gen1/examples/` با `gen1` کامپایل می‌شوند.
5. self-compile شدن `S1` توسط `gen1` فقط یک آزمون اختیاری است و جزو acceptance نسل نیست.

در این مدل «مرغ و تخم‌مرغ» با یک seed کوچک حل می‌شود: JavaScript نخستین frontend بومی را می‌سازد؛ پس از آن هر نسل باید بتواند نسل بعدی را بسازد و خروجی‌ها با تست‌های مستقل سنجیده شوند.

## مطالعه

- [Compiler](https://en.wikipedia.org/wiki/Compiler)
- [Bootstrapping compilers](https://en.wikipedia.org/wiki/Bootstrapping_(compilers))
- [Self-hosting](https://en.wikipedia.org/wiki/Self-hosting)
- [Intermediate representation](https://en.wikipedia.org/wiki/Intermediate_representation)
- [LLVM documentation](https://llvm.org/docs/)
- [MLIR documentation](https://mlir.llvm.org/docs/)
- [Chicken or the egg](https://en.wikipedia.org/wiki/Chicken_or_the_egg)
