# Gen1 — نسل تاریخی کامپایلر Raz

Gen1 یک نسل منجمد و تاریخی است که با Gen0 ساخته شده است. اکنون توسعه‌ی روزمره و تست‌ها روی درایور بومی Gen2 متمرکزند؛ Gen0 و Gen1 suite تست مستقل ندارند.

## نقش نسل

```text
Gen0 ──build──> Gen1 ──build Gen2──> Gen2
```

Gen1 سورس Raz خود را از `generations/gen1/src/` و bundle قابل‌ساخت را از `generations/gen1/final/compiler.raz` می‌گیرد. باینری منجمد در `generations/gen1/bin/razc` و checksum آن در `generations/gen1/bin/razc.sha256` است.

## بازسازی در صورت نیاز

این مرحله به‌صورت صریح اجرا می‌شود و بخشی از `make test` نیست:

```sh
make build-gen1
scripts/freeze.sh 1 --replace-pending   # فقط اگر gen.json هنوز وضعیت pending داشته باشد
```

`make build-gen1` candidate را در `generations/gen1/build/razc-candidate` می‌سازد. اسکریپت freeze فقط artifact و checksum را ثبت می‌کند؛ تست خودکار Gen1 اجرا نمی‌کند و باینری freeze‌شده را بدون مجوز بازنویسی نمی‌کند.

## مثال‌ها

فایل‌های `examples/` برای نگهداری نمونه‌های سازگار با L1 هستند. Gen1 frozen یک قرارداد توسعه‌ی فعال ندارد؛ برای کامپایل برنامه‌های Gen2 باید از درایور `build/native/bin/razc` استفاده کرد. تست‌های روزمره‌ی درایور با CMake/CTest اجرا می‌شوند و به rebuild Gen1/Gen2 وابسته نیستند.
