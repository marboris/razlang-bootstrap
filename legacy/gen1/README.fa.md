# Gen1 — نسل تاریخی کامپایلر Raz

Gen1 یک نسل منجمد و تاریخی است که با Gen0 ساخته شده است. اکنون توسعه‌ی روزمره و تست‌ها روی درایور بومی Gen2 متمرکزند؛ Gen0 و Gen1 suite تست مستقل ندارند.

## نقش نسل

```text
Gen0 ──build──> Gen1 ──build Gen2──> Gen2
```

Gen1 سورس Raz خود را از `legacy/gen1/src/` و bundle قابل‌ساخت را از `legacy/gen1/final/compiler.raz` می‌گیرد. باینری منجمد در `legacy/gen1/bin/razc` و checksum آن در `legacy/gen1/bin/razc.sha256` است.

## بازسازی در صورت نیاز

این مرحله به‌صورت صریح اجرا می‌شود و بخشی از `make test` نیست:

```sh
make build-gen1
# برای ارتقای عمدی یک باینری که از قبل frozen شده است:
scripts/freeze.sh 1 --replace-frozen
```

`make build-gen1` candidate را در `legacy/gen1/build/razc-candidate` می‌سازد. اسکریپت freeze فقط artifact و checksum را ثبت می‌کند؛ تست خودکار Gen1 اجرا نمی‌کند و به‌صورت پیش‌فرض باینری frozen را بازنویسی نمی‌کند. گزینهٔ `--replace-frozen` برای ارتقای عمدی، checksum جدید را ثبت می‌کند و نسخهٔ قبلی را به‌عنوان rollback در `legacy/gen1/build/previous-frozen/` نگه می‌دارد.

## مثال‌ها

فایل‌های `examples/` برای نگهداری نمونه‌های سازگار با L1 هستند. Gen1 frozen یک قرارداد توسعه‌ی فعال ندارد؛ برای کامپایل برنامه‌های Gen2 باید از درایور `build/native/bin/razc` استفاده کرد. تست‌های پایه‌ی درایور با CMake/CTest به rebuild Gen1/Gen2 وابسته نیستند. اگر candidate نسل 2 از قبل ساخته شده باشد، CTest تست‌های integration اضافی برای resolver و مسیر کامل Raz → C++ → GNU C++ را هم اجرا می‌کند.
