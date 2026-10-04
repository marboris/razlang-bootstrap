# Stage-2

Stage-2 اولین backend بومی Raz در پروژه است که خودش با Raz نوشته شده است.

زنجیره‌ی این milestone:

`Raz source → Stage-1 → RIR → Stage-2 backend → C++17 → native`

در این milestone backend یک subset از RIR-1 را به C++17 پایین می‌آورد: ثابت‌ها، load/store، عملیات و مقایسه‌های عددی، unary منفی، call، return و control-flow با label/jump/branch.

Stage-0 فعلاً `stage2/rir_backend.raz` را به native compiler تبدیل می‌کند. این backend عمداً کوچک است؛ در milestone بعد باید قرارداد RIR رسمی‌تر، type lowering کامل‌تر و خود backend از داخل زنجیره‌ی bootstrap ساخته شود.
