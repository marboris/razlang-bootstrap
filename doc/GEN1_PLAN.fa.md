# برنامه‌ی توسعه‌ی Gen1

`gen0` ریشه‌ی bootstrap است. Gen1 فقط یک‌بار با Gen0 ساخته می‌شود؛ پس از freeze، Gen1 compiler عملیاتی برنامه‌های `L1` و سازنده‌ی `Gen2` است. Gen1 الزام ندارد سورس خودش (`S1`) را دوباره کامپایل کند.

## سیاست فعلی

این سند برنامه‌ی تاریخی Gen1 است. suite تست JavaScript نسل‌ها حذف شده است؛ Gen0 و Gen1 فقط در صورت نیاز با `make build-gen0` و `make build-gen1` بازسازی می‌شوند. تست‌های فعال مربوط به درایور native هستند و با `make test` اجرا می‌شوند؛ آن‌ها Gen2 را به‌طور خودکار bootstrap نمی‌کنند.

## M1 — top-level و entry داخلی

- فایل Raz می‌تواند دستور سطح فایل داشته باشد.
- `main` تابع کاربر نیست.
- frontend در RIR یک entry داخلی تولید می‌کند.
- تعریف `main` توسط کاربر خطا است.
- اگر فایل تا انتها برسد، entry مقدار `0` برمی‌گرداند.

## M2 — CLI برای برنامه‌ی تولیدشده

- target `cli` خروجی `int main(int argc, char** argv)` می‌دهد.
- `argCount() -> i64` و `argAt(i: i64) -> string` فراهم هستند.
- این runtime API برای **برنامه‌های L1** است؛ driver کامل خود compiler تا Gen2 باقی می‌ماند.

## M3 — `use` و `include`

- `use name;` → `#include <name>`
- `use "header";` → `#include "header"`
- `include "file.raz";` الحاق متنی قبل از parse است.
- include تکراری نادیده گرفته می‌شود و cycle با guard تشخیص داده می‌شود.

## M4 — safety boundary

- `unsafe {}` یک scope صریح است.
- `char*` و `nullptr` فقط داخل `unsafe` مجازند.
- مرز unsafe در RIR باقی می‌ماند تا backend آن را آگاهانه emit کند.

## M5 — ساخت و freeze Gen1

- `make build-gen1`، `S1` را با `gen0` می‌سازد.
- `scripts/freeze.sh 1` باینری candidate و checksum را ثبت می‌کند؛ مرحله‌ی freeze تست اجرا نمی‌کند.
- مثال‌های Gen1 برای provenance نگه داشته شده‌اند؛ اجرای تستی خودکار در چرخه‌ی فعلی وجود ندارد.
- self-compile شدن `S1` با Gen1 در workflow فعلی اجرا نمی‌شود و معیار پذیرش نیست.

## قرارداد خروجی Gen1

```text
Gen0
  │
  └── S1 → Gen1 binary
                 │
                 ├── S2 → Gen2
                 └── examples written in L1
```

اگر یک تغییر در Gen1 باعث شود S1 دیگر توسط Gen1 قابل کامپایل نباشد، **به‌خودی خود bug نیست**؛ فقط باید Gen1 همچنان بتواند برنامه‌های L1 و S2 را کامپایل کند و artifact آن معتبر باشد.
