# Stage-1

Stage-1 نخستین frontend قابل اجراست که با خود Raz نوشته شده است.

مسیر فعلی:

`source → lexer → parser → AST → semantic analysis → RIR`

RIR در این milestone متنی و target-independent است تا خروجی compiler مستقیماً قابل مشاهده و تست باشد. state کامپایلر با `Ref<T>` و mutation صریح مدیریت می‌شود تا از کپی‌های بزرگ در bootstrap جلوگیری شود.

اجرای native compiler:

```bash
./stage1/compiler
cat stage1/output.rir
```

ورودی آزمایشی در `stage1/input.raz` قرار دارد.

گام بعدی: رسمی‌تر کردن قرارداد RIR و انتقال backend به خود Raz.
