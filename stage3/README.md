# Stage-3

Stage-3 قرارداد متنی RIR-1 را به یک artifact قابل بررسی تبدیل می‌کند.

`rir_verify.raz` با خود Raz نوشته شده و توسط Stage-0 به native compiler تبدیل می‌شود.
Verifier این invariantها را بررسی می‌کند:

- header باید `rir 1` باشد.
- function و `main` باید وجود داشته باشند.
- پارامترها و localهای هم‌نام مجاز نیستند.
- SSA value باید قبل از استفاده تعریف شده باشد.
- label نباید تکراری باشد.
- مقصدهای `jump` و `branch` باید وجود داشته باشند.
- instructionهای ناشناخته رد می‌شوند.

اجرا:

```bash
./stage3/rir_verify
cat stage3/verification.txt
```

ورودی آزمایشی: `stage3/input.rir`

این milestone هنوز type-check کامل RIR یا optimization را انجام نمی‌دهد؛ هدف فعلی تثبیت قرارداد مشترک بین Stage-1 و backendهای بعدی است.
