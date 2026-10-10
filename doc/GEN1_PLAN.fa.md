# برنامه‌ی توسعه‌ی Gen1

`gen0` ریشه‌ی bootstrap است. Gen1 فقط یک‌بار با Gen0 ساخته می‌شود؛ پس از freeze، Gen1 compiler عملیاتی برنامه‌های `L1` و سازنده‌ی `Gen2` است. Gen1 الزام ندارد سورس خودش (`S1`) را دوباره کامپایل کند.

## قاعده‌ی تست

تست‌های سریع و deterministic بعد از هر تغییر اجرا می‌شوند. build سنگین generation فقط هنگام acceptance/freeze همان generation اجرا می‌شود و پس از timeout یا موفقیت، به‌صورت تکراری اجرا نمی‌شود.

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

- `npm run test:gen1:fast` باید سبز باشد.
- `npm run build:gen1`، `S1` را با `gen0` می‌سازد.
- `scripts/freeze.sh 1` ابتدا candidate را با تست runtime/CLI می‌پذیرد، سپس باینری و checksum را ثبت می‌کند و وضعیت `gen.json` را از pending به `frozen` تغییر می‌دهد.
- بعد از freeze، `generations/gen1/examples/hello.raz` باید با **خود Gen1** کامپایل و اجرا شود.
- self-compile شدن `S1` با Gen1 فقط check اختیاری است و در acceptance معیار نیست.

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
