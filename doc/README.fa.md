# کامپایلر Raz

هدف پروژه ساخت کامپایلری برای زبان Raz است که سورس را تحلیل کند، RIR مستقل از مقصد بسازد و در نهایت C++17 تولید و کامپایل کند. نسخه‌ی JavaScript در `src/bootstrap/seed.mjs` پیاده‌سازی مرجع و ابزار bootstrap فعلی است؛ هدف نهایی این است که کامپایلر بومیِ نوشته‌شده با Raz بتواند خودش همین زنجیره را اجرا کند.

## وضعیت فعلی

Seed جاوااسکریپتی Raz را مستقیم تا C++17 کامپایل می‌کند و bootstrap باینری‌های native را هم می‌سازد. در مسیر host، فرانت‌اند Raz در `src/frontend/compiler.raz` به باینری بومی تبدیل می‌شود و RIR می‌سازد؛ سپس backend نوشته‌شده با Raz آن RIR را به C++ تبدیل می‌کند. self-compile فرانت‌اند RIR یکسان تولید می‌کند، اما orchestration، ساخت ابزارها و CLI هنوز در Node است؛ هنوز یک باینری مستقل که از ورودی Raz تا C++ را به‌تنهایی انجام دهد نداریم.

`src/backend/cpp_backend.raz` backend مسیر اصلی host و باینری standalone است. `src/ir/rir_verify.raz` قرارداد متنی RIR را بررسی می‌کند.

## ساختار

- `src/bootstrap/seed.mjs`: lexer، parser، تحلیل نوع، IR، passهای ساده و backend اولیه‌ی C++17 در JavaScript.
- `src/frontend/`: فرانت‌اند اصلی Raz و نمونه‌های مرجع/آزمایشی.
- `src/ir/`: قالب RIR و verifier نوشته‌شده با Raz.
- `src/backend/`: backend RIR به C++ نوشته‌شده با Raz.
- `src/host/`: driver فعلی Node.js که frontend بومی و backend بومی Raz را می‌سازد و به هم وصل می‌کند.
- `config/`: مشخصات زبان و targetها.
- `runtime/`: runtime مورد نیاز کد C++ تولیدشده.
- `tests/`: تست‌های رفتاری، منفی، RIR، bootstrap و backend.
- `.build/` و `tests/.tmp/`: خروجی‌های تولیدی؛ نباید ورودی یا سورس اصلی باشند.

## کامپایلر Native

برای ساخت یک باینری واحد که frontend و backend نوشته‌شده با Raz را در خود دارد:

```sh
npm run build:native
npm run self-host:native
```

این فرمان bundle را با seed جاوااسکریپتی می‌سازد و باینری را در `.build/native/razc` قرار می‌دهد. باینری سورس را از `.build/native/work/frontend/input.raz` می‌خواند و C++ را در `.build/native/work/backend/output.cpp` می‌نویسد:

```sh
cp tests/cases/arithmetic.raz .build/native/work/frontend/input.raz
cd .build/native/work
../razc
c++ -std=c++17 backend/output.cpp -o backend/program
backend/program
```

فرمان `self-host:native` همین زنجیره را اجرا می‌کند: باینری generation 0 سورس compiler را می‌خواند و C++ می‌سازد؛ آن C++ به generation 1 کامپایل می‌شود و نسل جدید باید همان خروجی C++ را دوباره بسازد. باینری generation 1 در `.build/native/razc-generation-1` قرار می‌گیرد.

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

1. کامل‌کردن پوشش RIR در backend؛ تست‌ها اکنون compiler را با backend Raz می‌سازند و self-RIR را دقیق مقایسه می‌کنند.
2. انتقال orchestration، CLI و مدیریت فایل‌ها به Raz تا یک executable فرانت‌اند و backend را بدون Node اجرا کند.
3. ساخت آن executable با seed، سپس ساخت دوباره‌ی خودش و مقایسه‌ی C++، رفتار و RIR در هر نسل.
4. بعد از پایدارشدن bootstrap مستقل، توسعه‌ی قابلیت‌های زبان، diagnostics، ماژول‌ها و optimizationها.

در این مدل «مرغ و تخم‌مرغ» با یک seed کوچک حل می‌شود: JavaScript نخستین frontend بومی را می‌سازد؛ پس از آن هر نسل باید بتواند نسل بعدی را بسازد و خروجی‌ها با تست‌های مستقل سنجیده شوند.

## مطالعه

- [Compiler](https://en.wikipedia.org/wiki/Compiler)
- [Bootstrapping compilers](https://en.wikipedia.org/wiki/Bootstrapping_(compilers))
- [Self-hosting](https://en.wikipedia.org/wiki/Self-hosting)
- [Intermediate representation](https://en.wikipedia.org/wiki/Intermediate_representation)
- [LLVM documentation](https://llvm.org/docs/)
- [MLIR documentation](https://mlir.llvm.org/docs/)
- [Chicken or the egg](https://en.wikipedia.org/wiki/Chicken_or_the_egg)
