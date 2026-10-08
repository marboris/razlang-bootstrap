# مثال‌های Gen1

این پوشه متعلق به **زبان Gen1 (`L1`)** است. بعد از freeze شدن `generations/gen1/bin/razc`، compiler صحیح برای این فایل‌ها **خود Gen1** است؛ نه `gen0`.

## Hello

`hello.raz` یک تست حداقلی از مسیر runtime است:

```sh
generations/gen1/bin/razc
```

قرارداد فعلی bootstrap باینری ورودی را از `frontend/input.raz` می‌گیرد، بنابراین اجرای دستی نمونه با این wrapper انجام می‌شود:

```sh
cp generations/gen1/examples/hello.raz generations/gen1/build/example/frontend/input.raz
(cd generations/gen1/build/example && ../../../bin/razc)
c++ -std=c++17 -I generations/gen1/build/example/backend \
  generations/gen1/build/example/backend/output.cpp \
  -o generations/gen1/build/example/hello
generations/gen1/build/example/hello
```

یا پس از freeze از تست خودکار استفاده کنید:

```sh
npm run test:gen1:example
```

خروجی مورد انتظار:

```text
Hello, Raz Gen1!
```

این example عمداً از `main` کاربر استفاده نمی‌کند. entry توسط backend ساخته می‌شود.
