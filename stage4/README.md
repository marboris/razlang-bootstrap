# Stage-4: native frontend bootstrap

Stage-4 مرز مهم بین «compiler نوشته‌شده در Raz» و «زنجیره‌ی bootstrap» است.

زنجیره‌ی فعلی:

```text
Stage-0 (Node.js)
  -> Stage-1 frontend (Raz)
  -> RIR-1
  -> host backend (Node.js)
  -> C++17
  -> native compiler
```

در این milestone، Stage-1 به‌صورت native خودش `stage1/compiler.raz` را دوباره parse می‌کند. سپس یک rebuild مستقل همان frontend را از طریق host backend به C++ تبدیل می‌کند. RIR این دو نسل باید دقیقاً یکسان باشد.

```text
Stage-1(native) --compiler.raz--> RIR-A
host pipeline   --compiler.raz--> RIR-B

require: RIR-A == RIR-B
```

فرمان reproducible پروژه:

```bash
npm run bootstrap
```

گزارش در `.bootstrap/report.txt` ذخیره می‌شود.

این stage هنوز self-hosting کامل نیست، چون backend نهایی داخل host Node.js قرار دارد. milestone بعدی باید همین RIR backend را با خود Raz جایگزین کند تا مسیر native شود:

```text
Raz -> native frontend -> RIR -> native Raz backend -> C++ -> native
```
