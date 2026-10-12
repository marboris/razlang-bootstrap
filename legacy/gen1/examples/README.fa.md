# مثال‌های Gen1

این پوشه متعلق به **زبان Gen1 (`L1`)** است. بعد از freeze شدن `legacy/gen1/bin/razc`، compiler صحیح برای این فایل‌ها **خود Gen1** است؛ نه `gen0`.

## Hello

`hello.raz` یک تست حداقلی از مسیر runtime است:

```sh
legacy/gen1/bin/razc
```

قرارداد فعلی bootstrap باینری ورودی را از `frontend/input.raz` می‌گیرد، بنابراین اجرای دستی نمونه با این wrapper انجام می‌شود:

```sh
cp legacy/gen1/examples/hello.raz legacy/gen1/build/example/frontend/input.raz
(cd legacy/gen1/build/example && ../../../bin/razc)
c++ -std=c++17 -I legacy/gen1/build/example/backend \
  legacy/gen1/build/example/backend/output.cpp \
  -o legacy/gen1/build/example/hello
legacy/gen1/build/example/hello
```

این فرمان‌ها نمونه‌ی دستی اجرای باینری تاریخی هستند؛ در پروژه‌ی فعلی suite تست Gen1 نگه‌داری نمی‌شود.

خروجی مورد انتظار:

```text
Hello, Raz Gen1!
```

این example عمداً از `main` کاربر استفاده نمی‌کند. entry توسط backend ساخته می‌شود.
