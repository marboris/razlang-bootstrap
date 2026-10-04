# Tests

اجرای suite سریع:

```bash
npm test
```

برای اجرای تست سنگین self-parse خود compiler:

```bash
npm run test:bootstrap
```

Suite فعلی سه سطح را پوشش می‌دهد:

1. Stage-0: تست native برای arithmetic، control-flow، struct، generic List، short-circuit، string و Ref mutation.
2. Stage-1: ساخت compiler با Stage-0، اجرای frontend نوشته‌شده با Raz، self-parse خود compiler و semantic error.
3. Stage-2: Stage-1 یک source را به RIR تبدیل می‌کند؛ backend نوشته‌شده با Raz، RIR را به C++17 تبدیل می‌کند و C++ نهایی اجرا می‌شود.

هدف اصلی تست‌ها این است که هر stage بتواند stage بعدی را بسازد و semantics مهم با تغییر backend یا implementation از بین نرود.
