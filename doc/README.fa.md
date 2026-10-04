# هدف پروژه

هدف این پروژه ساخت یک کامپایلر کوچک و قابل‌گسترش برای زبان Raz است که ابتدا با Node.js به‌عنوان **Stage-0** راه‌اندازی می‌شود و سپس خود کامپایلر به‌تدریج با زبان Raz نوشته و کامپایل می‌شود. مقصد اولیه C++17 است، اما منطق کامپایلر باید مستقل از backend و قابل انتقال به مقصدهای دیگر باشد.

اصل کلیدی پروژه **bootstrapping و self-hosting** است: نسخه‌ی اولیه فقط برای راه‌اندازی زنجیره است؛ در مراحل بعد، خود زبان باید بتواند کامپایلر خودش را بسازد و در نهایت آن را دوباره با خودش کامپایل کند.

برای مطالعه: [Compiler](https://en.wikipedia.org/wiki/Compiler)، [Bootstrapping (compilers)](https://en.wikipedia.org/wiki/Bootstrapping_(compilers))، [Self-hosting](https://en.wikipedia.org/wiki/Self-hosting)، [LLVM](https://llvm.org/)، [MLIR](https://mlir.llvm.org/).


## وضعیت معماری فعلی

در اولین دور سخت‌گیری معماری، syntax زبان از parser خارج شده و در `raz.language.json` قابل تنظیم است؛ همچنین assignmentهای روی lvalue به قرارداد عمومی `store_ref` در RIR تبدیل شده‌اند تا nested field/index به special-case backend وابسته نباشد.

ترتیب ادامه‌ی کار: تکمیل contract frontend و diagnostics، formal کردن RIR و verifier، کامل کردن backend بومی Raz و سپس بستن حلقه‌ی self-hosting واقعی.

برای جزئیات: `doc/BOOTSTRAP-ARCHITECTURE.md` و `doc/ROADMAP.md`.
