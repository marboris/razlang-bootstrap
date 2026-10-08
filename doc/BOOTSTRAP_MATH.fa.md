# مدل ریاضی مراحل اولیه‌ی کامپایلر Raz

**وضعیت:** پیش‌نویس ۰.۱
**مکمل:** `SPEC.fa.md` (پیش‌نویس ۰.۲)
**هدف:** تعریف دقیق مراحل کامپایلر، زنجیره‌ی نسل‌ها و شرط‌های درستی، با زبان ریاضی و مثال‌های عددی، تا توسعه‌دهندگان بتوانند هر مرحله را به‌صورت تابع، مجموعه و قاعده بخوانند و آزمون کنند.

## برچسب‌ها

- **[قطعی]**: تصمیم کاربر، یا نتیجه‌ی مستقیم تعریف‌ها.
- **[پیشنهاد]**: پیشنهاد نویسنده که هنوز تأیید نشده.
- **[اصلاح]**: نقطه‌ای که در `SPEC.fa.md` اصلاح شده است؛ توضیح در بخش ۵.۴.
- **[باز]**: نیازمند تصمیم.

---

## ۰. نمادنامه

| نماد | معنی |
|---|---|
| $\Sigma$ | الفبای ASCII (شامل فاصله، خط جدید) |
| $\Sigma^*$ | مجموعه‌ی همه‌ی رشته‌های روی $\Sigma$ |
| $\varepsilon$ | رشته‌ی تهی |
| $\mathcal{T}$ | مجموعه‌ی توکن‌ها |
| $\mathcal{T}^*$ | دنباله‌های متناهی از توکن‌ها |
| $\mathcal{F}$ | مجموعه‌ی همه‌ی فایل‌های ممکن |
| $\mathcal{A}$ | مجموعه‌ی درخت‌های نحوی (AST) |
| $\rightharpoonup$ | تابع جزئی (ممکن است برای بعضی ورودی‌ها تعریف نشود) |
| $\bot$ | خطای کامپایل (نتیجه‌ی تعریف‌نشده) |
| $L_n$ | زبان نسل $n$ (مجموعه‌ی برنامه‌های معتبر) |
| $F_n$ | مجموعه‌ی قابلیت‌های نسل $n$ |
| $\Delta_n$ | قابلیت‌های جدیدی که در نسل $n$ اضافه می‌شوند: $\Delta_n = F_n \setminus F_{n-1}$ |
| $C_n$ | کامپایلر نسل $n$ (تابع ورودی: سورس، خروجی: متن C++) |
| $gen_n$ | باینری نسل $n$ |
| $S_n$ | سورس کامپایلر نسل $n$ |
| $\mathrm{B}$ | تابع ساخت باینری از C++ با `c++` (قطعی فرض می‌شود) |
| $\llbracket P \rrbracket$ | معنای برنامه‌ی $P$ (رفتار آن) |

---

## ۱. پایه: زبان، کامپایلر و خطا

### ۱.۱ زبان به‌عنوان مجموعه

هر زبان برنامه‌نویسی $L \subseteq \Sigma^*$ است: مجموعه‌ی رشته‌هایی که برنامه‌ی معتبر هستند.

$$
L_n = \{\, P \in \Sigma^* \mid P \text{ یک برنامه‌ی معتبر در نسل } n \text{ است} \,\}
$$

### ۱.۲ کامپایلر به‌عنوان تابع جزئی

کامپایلر نسل $n$ یک تابع جزئی است:

$$
C_n : \Sigma^* \rightharpoonup \Sigma^*_{C++}
$$

- اگر $P \in L_n$ باشد و کامپایل موفق شود، $C_n(P)$ یک متن C++ است.
- اگر $P \notin L_n$ باشد، $C_n(P) = \bot$ (خطای کامپایل) و کد خطا همراه آن است.

این تعریف دو نکته را روشن می‌کند: کامپایلر ممکن است روی بعضی رشته‌ها تعریف نشده باشد، و خروجی همیشه متن است، نه باینری.

### ۱.۳ ساخت باینری

$$
\mathrm{B} : \Sigma^*_{C++} \rightharpoonup \mathcal{E}
$$

که $\mathcal{E}$ مجموعه‌ی باینری‌های اجرایی است. فرض می‌کنیم $\mathrm{B}$ **قطعی** است: همان متن ورودی و همان فلگ‌ها، همان باینری را می‌دهد. این فرض در بخش ۱۱ بررسی می‌شود.

### ۱.۴ معنای برنامه

معنای یک برنامه، رفتار آن است. برای برنامه‌ای با آرگومان‌های خط فرمان $a$ و ورودی‌های دیگر، معنا تابعی است:

$$
\llbracket P \rrbracket : \mathcal{A}rgs \to \mathcal{R}
$$

که $\mathcal{A}rgs$ مجموعه‌ی آرگومان‌ها و $\mathcal{R}$ مجموعه‌ی رفتارهای قابل مشاهده (خروجی روی stdout، کد خروج، تغییر فایل) است. در ادامه این معنا را با سمانتیک کوچک‌تری تعریف می‌کنیم.

---

## ۲. زنجیره‌ی نسل‌ها

### ۲.۱ فرمول اصلی [قطعی]

$$
\boxed{\; gen_n = \mathrm{B}\big(C_{n-1}(S_n)\big), \qquad C_n = \text{کامپایلری که از } gen_n \text{ ساخته می‌شود} \;}
$$

یعنی: **کامپایلر نسل $n-1$، سورس نسل $n$ را به C++ تبدیل می‌کند، و $\mathrm{B}$ آن را به باینری $gen_n$ تبدیل می‌کند.**

### ۲.۲ دنباله‌ی ساخت

$$
gen_0 \xrightarrow{\;C_0(S_1)\;} gen_1 \xrightarrow{\;C_1(S_2)\;} gen_2 \xrightarrow{\;C_2(S_3)\;} gen_3 \;\cdots
$$

و $gen_0$ یک seed خارجی (کد JavaScript فعلی) است که $C_0$ را تعریف می‌کند.

### ۲.۳ شرط‌های اولیه

برای هر $n \geq 1$:

1. $S_n$ باید به‌صورت برنامه‌ای معتبر در $C_{n-1}$ پذیرفته شود: $C_{n-1}(S_n) \neq \bot$.
2. $gen_n$ باید برنامه‌های نسل $n$ را بپذیرد، یعنی $L_n$ را پیاده‌سازی کند.

### ۲.۴ شرط درست بودن کافی برای زنجیره [اصلاح]

در پیش‌نویس ۰.۲ گفته شد $L_{n-1} \subseteq L_n$. این شرط **برای زنجیره لازم نیست** و در عمل هم برقرار نیست: مثلاً `new`، `List` و `Ref` در $L_0$ هستند ولی در $L_1$ حذف می‌شوند. آنچه واقعاً لازم است، این است که **فقط قابلیت‌هایی که $S_n$ استفاده می‌کند** در هر دو نسل باشند. این شرط در بخش ۴ تعریف شده است.

---

## ۳. نقطه‌ی ثابت

### ۳.۱ تعریف [قطعی]

برای $k \geq 1$، زوج $(C_k, C_{k+1})$ روی سورس $S_k$ **نقطه‌ی ثابت** دارد اگر:

$$
\boxed{\; C_k(S_k) = C_{k+1}(S_k) \;}
$$

تساوی به‌صورت بایت‌به‌بایت (یا هش برابر) سنجیده می‌شود.

### ۳.۲ چرا این شرط مهم است؟

- $C_k(S_k)$ یعنی: نسل $k$ ساخته‌شده با $C_{k-1}$، سورس نسل $k$ را کامپایل می‌کند.
- $C_{k+1}(S_k)$ یعنی: نسل $k+1$ ساخته‌شده با $C_k$، همان سورس را کامپایل می‌کند.

اگر این دو برابر باشند، نسل جدید همان ترجمه را انجام می‌دهد و کامپایلر "خودش را بازتولید" کرده است.

### ۳.۳ قضیه‌ی ۱: ثبات با تکرار [پیشنهاد، با اثبات]

**قضیه.** اگر $C_k(S_k) = C_{k+1}(S_k)$ و $\mathrm{B}$ قطعی باشد، آنگاه $gen_{k+1}$ و $\mathrm{B}(C_{k+1}(S_k))$ یکسان‌اند.

**اثبات.** طبق تعریف $gen_{k+1} = \mathrm{B}(C_k(S_{k+1}))$. اما این قضیه درباره‌ی $S_k$ است: $\mathrm{B}(C_k(S_k)) = \mathrm{B}(C_{k+1}(S_k))$ از تساوی ورودی‌ها و قطعی بودن $\mathrm{B}$ نتیجه می‌شود. ∎

### ۳.۴ قضیه‌ی ۲: محدودیت نقطه‌ی ثابت [پیشنهاد]

نقطه‌ی ثابت **لازم** است ولی **کافی برای درستی نیست**. یک کامپایلر می‌تواند خودش را بازتولید کند و در عین حال رفتار غلط داشته باشد (مقاله‌ی Thompson، *Reflections on Trusting Trust*). بنابراین باید علاوه بر نقطه‌ی ثابت، مجموعه‌ی آزمون $T_n$ هم پاس شود.

---

## ۴. قابلیت‌ها و شرط زنجیره [اصلاح]

### ۴.۱ مجموعه‌ی قابلیت‌ها

هر نسل $n$ مجموعه‌ی محدودی از قابلیت‌ها دارد:

$$
F_n = \{\, \phi \mid \phi \text{ یک قابلیت زبان در نسل } n \,\}
$$

نمونه‌ی قابلیت‌ها (از `SPEC.fa.md`): `function`، `let`، `->`، `if`، `while`، `return`، `include`، `use`، `i64`، `string`، `char*`، `unsafe`، `const`، `namespace`، `struct`، `for`.

و $\Delta_n = F_n \setminus F_{n-1}$ قابلیت‌های جدید همان نسل است.

### ۴.۲ تابع استفاده [قطعی]

یک درخت نحوی $a \in \mathcal{A}$ یک مجموعه‌ی قابلیت‌ها دارد:

$$
\mathrm{uses}(S) = \{\, \varphi(v) \mid v \in \mathrm{nodes}(\mathrm{parse}(S)) \,\}
$$

که $\varphi$ نگاشتی از نوع گره به قابلیت است. مثلاً گره‌ی `for` به قابلیت `for` و گره‌ی `let` به قابلیت `let` نگاشت می‌شود.

### ۴.۳ شرط زنجیره‌ی اصلاح‌شده [اصلاح]

$$
\boxed{\; \mathrm{uses}(S_n) \subseteq F_{n-1} \cap F_n \;}
$$

این شرط دو چیز را تضمین می‌کند:

1. $\mathrm{uses}(S_n) \subseteq F_{n-1}$: کامپایلر نسل $n-1$ می‌تواند $S_n$ را کامپایل کند.
2. $\mathrm{uses}(S_n) \subseteq F_n$: نسل $n$ معنای $S_n$ را می‌فهمد، پس نقطه‌ی ثابت $C_n(S_n) = C_{n+1}(S_n)$ معنا دارد.

**توجه:** شرط `uses` جایگزین شرط $L_{n-1} \subseteq L_n$ است. با این تغییر، حذف `new`، `List`، `Ref` و `main` مشکلی ایجاد نمی‌کند، به شرط اینکه $S_n$ آن‌ها را استفاده نکند.

### ۴.۴ مثال عددی: $S_1$ و $S_5$

فرض کنید:

$$
F_0 = \{\texttt{function}, \texttt{let}, \texttt{->}, \texttt{if}, \texttt{while}, \texttt{return}, \texttt{struct}, \texttt{new}, \texttt{List}, \texttt{Ref}, \texttt{print}\}
$$

$$
F_1 = \{\texttt{function}, \texttt{let}, \texttt{->}, \texttt{if}, \texttt{while}, \texttt{return}, \texttt{include}, \texttt{use}, \texttt{i64}, \texttt{string}, \texttt{void}, \texttt{unsafe}, \texttt{char*}\}
$$

$S_1$ فقط از `function`, `let`, `->`, `if`, `while`, `return`, `i64`, `print` استفاده می‌کند:

$$
\mathrm{uses}(S_1) = \{\texttt{function}, \texttt{let}, \texttt{->}, \texttt{if}, \texttt{while}, \texttt{return}, \texttt{i64}, \texttt{print}\}
$$

بررسی شرط:

$$
F_0 \cap F_1 = \{\texttt{function}, \texttt{let}, \texttt{->}, \texttt{if}, \texttt{while}, \texttt{return}\}
$$

پس $\mathrm{uses}(S_1) \not\subseteq F_0 \cap F_1$ چون `i64` و `print` در $F_0 \cap F_1$ نیستند. **این نشان می‌دهد که تعریف $F_0 \cap F_1$ باید دقیق‌تر شود:** `i64` در $F_0$ به‌صورت نوع داخلی وجود دارد، و `print` در $F_1$ به‌عنوان builtin هست. تعریف ما باید این را بپذیرد. این یعنی یک تصمیم دقیق‌تر لازم است: آیا `i64` و `print` باید به $F_0 \cap F_1$ اضافه شوند؟ پیشنهاد: **بله**؛ چون هر دو در هر دو نسل وجود دارند (در $F_1$ `i64` نوع پایه است و `print` تا وقتی حذف نشده، در $F_1$ هم هست). با این اصلاح:

$$
F_0 \cap F_1 \supseteq \{\texttt{i64}, \texttt{print}\} \implies \mathrm{uses}(S_1) \subseteq F_0 \cap F_1 \checkmark
$$

اما اگر `print` در $F_1$ حذف شود (مطابق SPEC، builtinها حذف می‌شوند)، شرط شکسته می‌شود. **پس یا `print` در $F_1$ می‌ماند، یا $S_1$ آن را استفاده نکند.** این تصمیم در بخش ۱۲ باز است.

**مثال $S_5$:** اگر $S_5$ فقط از `while` استفاده کند و `for` را نداشته باشد:

$$
\mathrm{uses}(S_5) \subseteq F_4 \cap F_5 \quad\text{و}\quad \texttt{for} \notin \mathrm{uses}(S_5)
$$

اما اگر $S_5$ به‌اشتباه `for` داشته باشد، داریم $\texttt{for} \in \mathrm{uses}(S_5)$ و $\texttt{for} \notin F_4$، پس شرط نقض می‌شود و کامپایلر نسل ۴ باید خطای `E0001` بدهد.

### ۴.۵ الگوریتم بررسی شرط [پیشنهاد]

```
ورودی : سورس S_n، مجموعه‌های F_{n-1}، F_n
خروجی : پذیرفته یا رد
1. T ← parse(S_n)
2. U ← { φ(v) | v ∈ nodes(T) }
3. اگر U ⊆ F_{n-1} ∩ F_n  → پذیرفته
4. در غیر این صورت         → رد، با گزارش U \ (F_{n-1} ∩ F_n)
```

این الگوریتم می‌تواند به‌صورت ابزار بررسی در مخزن اجرا شود.

---

## ۵. مدل خط لوله‌ی کامپایلر

کامپایلر ترکیبی از توابع است:

$$
C_n = \mathrm{Emit} \circ \mathrm{Lower} \circ \mathrm{Safe} \circ \mathrm{Type} \circ \mathrm{Names} \circ \mathrm{Hoist} \circ \mathrm{Parse} \circ \mathrm{Expand} \circ \mathrm{Lex}
$$

هر تابع به‌ترتیب از راست به چپ اعمال می‌شود. نوع خروجی هر مرحله، ورودی مرحله‌ی بعد است:

| مرحله | دامنه | برد |
|---|---|---|
| Lex | $\Sigma^*$ | $\mathcal{T}^*$ |
| Expand | $\mathcal{T}^*$ (با گراف include) | $\mathcal{T}^*$ |
| Parse | $\mathcal{T}^*$ | $\mathcal{A}$ |
| Hoist | $\mathcal{A}$ | $\mathcal{A}$ |
| Names | $\mathcal{A}$ | $\mathcal{A}^{\Gamma}$ (AST با جدول نام) |
| Type | $\mathcal{A}^{\Gamma}$ | $\mathcal{A}^{\Gamma,\tau}$ |
| Safe | $\mathcal{A}^{\Gamma,\tau}$ | $\mathcal{A}^{\Gamma,\tau}$ یا $\bot$ |
| Lower | $\mathcal{A}^{\Gamma,\tau}$ | RIR |
| Emit | RIR | $\Sigma^*_{C++}$ |

هر مرحله می‌تواند $\bot$ بدهد (خطا). ترکیب توابع جزئی است؛ اگر یکی $\bot$ بدهد، کل کامپایل $\bot$ است.

---

## ۶. مرحله‌ی ۱: Lex

### ۶.۱ تعریف با عبارت منظم [پیشنهاد]

هر نوع توکن یک زبان منظم است:

$$
\begin{aligned}
\mathrm{ID} &= [A\text{-}Za\text{-}z\_] \; [A\text{-}Za\text{-}z0\text{-}9\_]^* \\
\mathrm{INT} &= 0 \mid [1\text{-}9][0\text{-}9]^* \mid 0[xX][0\text{-}9A\text{-}Fa\text{-}f]^+ \\
\mathrm{STR} &= \texttt{"} \, (\text{کاراکتر غیر} \texttt{"} \mid \texttt{\textbackslash"})^* \, \texttt{"}
\end{aligned}
$$

### ۶.۲ قاعده‌ی بیشترین تطابق (maximal munch)

تابع `Lex` در هر گام طولانی‌ترین پیشوند ممکن را انتخاب می‌کند:

$$
\mathrm{Lex}(s) = \begin{cases} \varepsilon & s = \varepsilon \\ t \cdot \mathrm{Lex}(s') & s = p\,s' \text{ و } p \text{ طولانی‌ترین پیشوند با نوع } t \\ \bot & \text{اگر هیچ پیشوندی تطبیق نکند} \end{cases}
$$

### ۶.۳ مثال

ورودی:

```raz
let x: i64 = 12;
```

خروجی:

$$
\mathrm{Lex}(\texttt{let x: i64 = 12;}) = \langle \mathtt{KW}(\texttt{let}),\ \mathtt{ID}(x),\ \mathtt{COLON},\ \mathtt{KW}(\texttt{i64}),\ \mathtt{ASSIGN},\ \mathtt{INT}(12),\ \mathtt{SEMI} \rangle
$$

**نکته:** `i64` کلیدواژه است، پس قبل از `ID` تشخیص داده می‌شود. این قاعده در کد باید صریح باشد.

---

## ۷. مرحله‌ی ۲: Expand (الحاق متنی `include`)

### ۷.۱ گراف include [قطعی]

فایل‌های یک واحد کامپایل یک گراف جهت‌دار هستند:

$$
G = (V, E), \qquad V \subseteq \mathcal{F}, \qquad (f, g) \in E \iff f \text{ شامل } \texttt{include "g";} \text{ است}
$$

قواعد:

1. **گراف باید بی‌دور باشد** (DAG). اگر دور وجود داشته باشد، خطای `E0007`.
2. **هر فایل در هر واحد کامپایل حداکثر یک بار الحاق می‌شود.**

### ۷.۲ تعریف الحاق

اگر فایل $f$ به‌صورت زیر باشد:

$$
f = p_0 \; \langle\texttt{include } g_1\rangle \; p_1 \; \langle\texttt{include } g_2\rangle \cdots \langle\texttt{include } g_m\rangle \; p_m
$$

که $p_i$ قطعات متنی بدون include هستند، آنگاه:

$$
X(f, Z) = p_0 \cdot X(g_1, Z \cup \{f\}) \cdot p_1 \cdot X(g_2, Z \cup \{f\}) \cdots p_m
$$

با شرط‌های:
- اگر $g_i \in Z$، آنگاه چرخه است و $\bot$ (خطای `E0007`).
- اگر $g_i$ قبلاً در مجموعه‌ی الحاق‌شده‌ی واحد کامپایل بوده باشد (غیر از چرخه)، آن شاخه با هشدار حذف می‌شود.

### ۷.۳ پایان‌پذیری [قطعی]

چون $G$ محدود و بی‌دور است، بازگشت $X$ متناهی است. این پایان‌پذیری را با ترتیب توپولوژیک نشان می‌دهیم: اگر $G$ بی‌دور باشد، ترتیب توپولوژیک وجود دارد و هر فایل بعد از همه‌ی فایل‌های وابسته‌اش پردازش می‌شود.

### ۷.۴ مثال عددی

فایل‌ها: $A$ شامل $B$ و سپس $C$؛ $B$ شامل $C$.

$$
E = \{(A,B), (A,C), (B,C)\}
$$

گراف بی‌دور است. ترتیب توپولوژیک: $A, B, C$.

الحاق:

$$
X(A) = a_0 \cdot X(B) \cdot a_1 \cdot \underbrace{X(C)}_{\text{ابتدا در }B} \cdot \; a_2 \quad (\text{دومین ورود } C \text{ در } A \text{ حذف می‌شود})
$$

که $a_0$، $a_1$، $a_2$ متن‌های $A$ هستند. بنابراین $C$ یک بار و داخل $B$ الحاق می‌شود. هشدار: `include duplicate: C.raz`.

---

## ۸. مرحله‌ی ۳: Hoist (انتقال `use` به بالا)

### ۸.۱ تعریف [قطعی]

اگر توکن‌های الحاق‌شده را به‌صورت زیر بنویسیم:

$$
T = w_0 \; u_1 \; w_1 \; u_2 \; w_2 \cdots u_k \; w_k
$$

که $u_i$ دستورهای `use` هستند (به ترتیب ظهور) و $w_i$ بقیه‌ی توکن‌ها، آنگاه:

$$
\mathrm{Hoist}(T) = u_1 \cdot u_2 \cdots u_k \cdot w_0 \cdot w_1 \cdots w_k
$$

### ۸.۲ ویژگی‌ها

- **حفظ ترتیب:** ترتیب ظهور `use` ها حفظ می‌شود.
- **حفظ تکرار:** تکراری‌ها حذف نمی‌شوند؛ پس $\mathrm{Hoist}$ روی multiset تعریف می‌شود. [قطعی]
- **حفظ معنا:** جابه‌جایی `use` با بقیه‌ی توکن‌ها معنای برنامه را تغییر نمی‌دهد، چون `use` فقط نسبت به پیش‌پردازنده‌ی C++ اثر دارد.

### ۸.۳ مثال

$$
T = \langle \texttt{let}, x, \ldots, \texttt{use } \texttt{"a.hpp"}, \ldots, \texttt{use linux}, \ldots \rangle
$$

$$
\mathrm{Hoist}(T) = \langle \texttt{use "a.hpp"}, \texttt{use linux}, \texttt{let}, x, \ldots \rangle
$$

---

## ۹. مرحله‌ی ۴: Parse (تجزیه)

### ۹.۱ گرامر [پیشنهاد]

گرامر مستقل از متن، با سطوح تقدم، به‌صورت EBNF:

```
Program   ::= Item*
Item      ::= Decl | Stmt
Decl      ::= FuncDecl | StructDecl | NsDecl | UseDecl | LetDecl
Stmt      ::= LetDecl | Assign ';' | If | While | Return ';' | ExprStmt | UnsafeBlock
Expr      ::= Or
Or        ::= And  ( '||' And )*
And       ::= Cmp  ( '&&' Cmp )*
Cmp       ::= Add  ( ('=='|'!='|'<'|'>'|'<='|'>=') Add )?
Add       ::= Mul  ( ('+'|'-') Mul )*
Mul       ::= Unary ( ('*'|'/'|'%') Unary )*
Unary     ::= ('-'|'!') Unary | Primary
Primary   ::= INT | STR | ID | ID '(' Args? ')' | '(' Expr ')'
```

### ۹.۲ یکتایی تجزیه

گرامر با سطوح تقدم **بی‌ابهام** است: برای هر رشته‌ی توکنی حداکثر یک درخت اشتقاق وجود دارد. این خاصیت لازم است تا $\mathrm{Parse}$ تابع باشد، نه رابطه.

**قضیه (یکتایی).** اگر هر سطح فقط به سطح بعدی ارجاع دهد و هیچ قاعده‌ی چپ‌بازگشتی مستقیمی نداشته باشد (به‌جز شکل حلقه‌ای `*`)، گرامر بی‌ابهام است. ∎

### ۹.۳ مثال: `1 + 2 * 3`

درخت اشتقاق:

$$
\mathrm{Add}\big(\, \mathrm{Lit}(1),\; \texttt{+},\; \mathrm{Mul}(\mathrm{Lit}(2), \texttt{*}, \mathrm{Lit}(3)) \,\big)
$$

ضرب قبل از جمع اعمال می‌شود، زیرا `Mul` در سطح پایین‌تری از `Add` است.

به‌صورت نمادین:

$$
\mathrm{Parse}(\langle \texttt{INT}(1), \texttt{+}, \texttt{INT}(2), \texttt{*}, \texttt{INT}(3) \rangle) = \mathrm{Add}(1, +, \mathrm{Mul}(2, *, 3))
$$

---

## ۱۰. مرحله‌ی ۵: Names (حل نام)

### ۱۰.۱ محیط نام‌ها [قطعی]

یک محیط $\Gamma$ تابعی جزئی از نام به اعلان است:

$$
\Gamma : \mathrm{Name} \rightharpoonup \mathrm{Decl}
$$

محیط سطح فایل $\Gamma_0$ با همه‌ی اعلان‌های سطح فایل ساخته می‌شود.

### ۱۰.۲ شرط یکتایی [قطعی]

در فضای فایل، هر نام حداکثر یک بار اعلان می‌شود:

$$
\forall x \in \mathrm{names}(\text{file}) : |\{\, d \mid d \text{ اعلان } x \text{ در فضای فایل است} \,\}| \leq 1
$$

نقض این شرط خطای `E0005` است.

### ۱۰.۳ قواعد دامنه

- اعلان‌های سطح فایل (تابع، struct، global) در $\Gamma_0$ هستند و در همه‌ی توابع و `main` قابل‌دیدن‌اند.
- متغیرهای داخل بلوک فقط در همان بلوک قابل‌دیدن‌اند.
- نام `x::y` در namespace `x` جستجو می‌شود.

### ۱۰.۴ قاعده‌ی تعریف قبل از استفاده (global) [پیشنهاد]

برای متغیر سطح فایل $x$ با اعلان در موقعیت $p_x$ و استفاده در موقعیت $p_u$:

$$
\text{اگر } p_u < p_x \text{ و } x \text{ در سطح فایل است، آنگاه خطای } E0011
$$

این قاعده با ترتیب ظهور در فایل (پس از الحاق) تعیین می‌شود.

---

## ۱۱. مرحله‌ی ۶: Type (بررسی نوع)

### ۱۱.۱ مجموعه‌ی نوع‌ها

نسل ۱:

$$
\tau ::= \texttt{i64} \mid \texttt{void} \mid \texttt{string} \mid \texttt{char*}
$$

نسل ۳ به بعد اضافه می‌شود: $\texttt{i8}, \texttt{i16}, \ldots, \texttt{bool}, \texttt{f64}$ و تبدیل‌های صریح.

### ۱۱.۲ قضاوت نوع [قطعی]

قضاوت به‌شکل $\Gamma \vdash e : \tau$ می‌خواند: «در محیط $\Gamma$، عبارت $e$ نوع $\tau$ دارد».

### ۱۱.۳ قواعد نوع (نسل ۱)

**(T-Int)** عدد صحیح:

$$
\frac{}{\Gamma \vdash n : \texttt{i64}}
$$

**(T-Str)** رشته:

$$
\frac{}{\Gamma \vdash s : \texttt{string}}
$$

**(T-Var)** متغیر:

$$
\frac{\Gamma(x) = (\tau, \_)}{\Gamma \vdash x : \tau}
$$

**(T-Add)** جمع:

$$
\frac{\Gamma \vdash e_1 : \texttt{i64} \qquad \Gamma \vdash e_2 : \texttt{i64}}{\Gamma \vdash e_1 + e_2 : \texttt{i64}}
$$

**(T-Cmp)** مقایسه (خروجی عدد صحیح، مانند C):

$$
\frac{\Gamma \vdash e_1 : \texttt{i64} \qquad \Gamma \vdash e_2 : \texttt{i64}}{\Gamma \vdash e_1 \bowtie e_2 : \texttt{i64}}, \qquad \bowtie \in \{==, !=, <, >, <=, >=\}
$$

**(T-Let)** تعریف متغیر:

$$
\frac{\Gamma \vdash e : \tau}{\Gamma \vdash \texttt{let } x: \tau = e; \;\Rightarrow\; \Gamma[x \mapsto (\tau, \text{mut})]}
$$

**(T-Const)** تعریف ثابت:

$$
\frac{\Gamma \vdash e : \tau}{\Gamma \vdash \texttt{const } x: \tau = e; \;\Rightarrow\; \Gamma[x \mapsto (\tau, \text{const})]}
$$

**(T-Assign)** تخصیص:

$$
\frac{\Gamma(x) = (\tau, \text{mut}) \qquad \Gamma \vdash e : \tau}{\Gamma \vdash x = e;}
$$

اگر $\Gamma(x) = (\tau, \text{const})$، این قاعده قابل اعمال نیست و خطای `E0012` است.

**(T-Call)** فراخوانی تابع:

$$
\frac{\Gamma(f) = (\tau_1, \ldots, \tau_n) \to \tau \qquad \Gamma \vdash e_i : \tau_i \;(i=1..n)}{\Gamma \vdash f(e_1, \ldots, e_n) : \tau}
$$

**(T-If)** شرط: شرط عدد صحیح است (غیر صفر یعنی true، مانند C):

$$
\frac{\Gamma \vdash c : \texttt{i64} \qquad \Gamma \vdash S_1 \qquad \Gamma \vdash S_2}{\Gamma \vdash \texttt{if } (c) \; S_1 \; \texttt{else} \; S_2}
$$

### ۱۱.۴ مثال اشتقاق: `x + 1`

با $\Gamma = \{x \mapsto (\texttt{i64}, \text{mut})\}$:

$$
\frac{\dfrac{\Gamma(x) = (\texttt{i64},\_)}{\Gamma \vdash x : \texttt{i64}} \text{(T-Var)} \qquad \dfrac{}{\Gamma \vdash 1 : \texttt{i64}} \text{(T-Int)}}{\Gamma \vdash x + 1 : \texttt{i64}} \text{(T-Add)}
$$

### ۱۱.۵ مثال خطا: `const` و تخصیص

با $\Gamma = \{L \mapsto (\texttt{i64}, \text{const})\}$، قضاوت $\Gamma \vdash L = 5;$ قابل اشتقاق نیست، پس کامپایلر `E0012` می‌دهد.

---

## ۱۲. مرحله‌ی ۷: Safe (ایمنی)

### ۱۲.۱ متغیر وضعیت ایمنی [قطعی]

ایمنی با یک پرچم بلوک $u \in \{\text{safe}, \text{unsafe}\}$ بررسی می‌شود. در ابتدا $u = \text{safe}$. ورود به `unsafe { }` پرچم را به $\text{unsafe}$ تغییر می‌دهد.

### ۱۲.۲ قواعد

**(S-Ptr)** اشاره‌گر فقط در `unsafe`:

$$
\frac{u = \text{unsafe}}{u \vdash \text{عبارت اشاره‌گر}}
$$

اگر $u = \text{safe}$، خطای `E0009`.

**(S-Init)** مقدار اولیه‌ی اجباری:

$$
\frac{\text{let } x: \tau \text{ بدون } = e}{\text{خطای } E0010}
$$

**(S-Char)** `char*`:

$$
\frac{u = \text{unsafe}}{u \vdash \texttt{char*}}
$$

### ۱۲.۳ قضیه‌ی ایمنی (ادعا) [پیشنهاد]

**ادعا.** اگر $\mathrm{Safe}(P) \neq \bot$ و $P$ هیچ بلوک `unsafe` نداشته باشد، آنگاه $P$ هیچ دسترسی نامعتبر به حافظه‌ی اشاره‌گری ندارد.

**دلیل:** در کد امن، اشاره‌گری وجود ندارد که بتواند به حافظه‌ی نامعتبر اشاره کند؛ `string` و `struct` مالک حافظه‌ی خود هستند و کامپایلر در پایان scope آزاد می‌کند (RAII).

**توجه:** این ادعا برای سرریز عدد صحیح یا تقسیم بر صفر صدق نمی‌کند؛ آن‌ها رفتار تعریف‌نشده‌ی C++ هستند و در بخش ۱۲ باز مانده‌اند.

---

## ۱۳. معناشناسی globalها و اجرا

### ۱۳.۱ حالت (state)

حالت اجرا تابعی از نام به مقدار است:

$$
\sigma : \mathrm{Name} \rightharpoonup \mathrm{Value}
$$

حالت اولیه $\sigma_0$:
- برای هر global با تایپ $\tau$: $\sigma_0(x) = \mathrm{zero}(\tau)$ (صفر یا خالی).
- برای `argc` و `argAt`: از آرگومان‌های برنامه (بخش ۱۵).

### ۱۳.۲ اجرای دستورهای سطح فایل

دستورهای سطح فایل $s_1, s_2, \ldots, s_m$ به ترتیب اجرا می‌شوند:

$$
\llbracket s_1; \ldots; s_m \rrbracket(\sigma_0) = \sigma_m, \qquad \sigma_{i} = \llbracket s_i \rrbracket(\sigma_{i-1})
$$

این همان معنای ترتیب در `main` است.

### ۱۳.۳ دسترسی تابع به global

اگر تابع $f$ در لحظه‌ی $i$ فراخوانی شود، از حالت $\sigma_{i-1}$ می‌خواند. پس:

$$
\text{مقدار } x \text{ در تابع} = \sigma_{i-1}(x)
$$

**مثال:** اگر `count` مقدار اولیه‌ی `0` داشته باشد و تابع `bump()` قبل از مقداردهی فراخوانی شود، مقدار `0` را می‌بیند. اگر بعد از آن فراخوانی شود، مقدار مقداردهی‌شده را می‌بیند.

### ۱۳.۴ مثال عددی

```raz
let count: i64 = 5;        // σ1 = {count ↦ 5}
function bump() -> void { count = count + 1; }
bump();                    // σ2 = {count ↦ 6}
```

$$
\sigma_0 = \{\text{count} \mapsto 0\}, \quad \sigma_1 = \{\text{count} \mapsto 5\}, \quad \sigma_2 = \{\text{count} \mapsto 6\}
$$

---

## ۱۴. مرحله‌ی ۸: Lower و Emit (تولید C++)

### ۱۴.۱ تابع Lower

$$
K : \mathcal{A}^{\Gamma,\tau} \to \mathrm{RIR}
$$

نگاشت‌های اصلی:

$$
\begin{aligned}
K(\texttt{let } x: \tau = e) &= \texttt{decl}(x, \tau, K(e)) \\
K(e_1 + e_2) &= \texttt{add}(K(e_1), K(e_2)) \\
K(\text{دستورهای سطح فایل}) &\to \text{بدنه‌ی } \texttt{main} \\
K(\text{تعریف تابع}) &\to \text{تعریف در فضای فایل + prototype}
\end{aligned}
$$

### ۱۴.۲ تابع Emit

$$
\mathrm{Emit} : \mathrm{RIR} \to \Sigma^*_{C++}
$$

ترتیب خروجی:

$$
\mathrm{Emit}(R) = \underbrace{\text{use-ها}}_{\text{Hoist}} \cdot \underbrace{\text{prototype ها}}_{\text{فضای فایل}} \cdot \underbrace{\text{اعلان‌های global}}_{\text{فضای فایل}} \cdot \underbrace{\text{تعریف توابع}}_{\text{فضای فایل}} \cdot \underbrace{\texttt{int main(void) \{ دستورها; return 0; \}}}_{\text{بدنه‌ی main}}
$$

### ۱۴.۳ قضیه‌ی معناشناختی (اصل صحت) [پیشنهاد]

برای هر $P \in L_n$ که $\mathrm{Safe}(P) \neq \bot$:

$$
\llbracket P \rrbracket = \llbracket \mathrm{B}(\mathrm{Emit}(\mathrm{Lower}(P))) \rrbracket
$$

یعنی: **رفتار برنامه‌ی Raz با رفتار باینری ساخته‌شده از C++ یکسان است.** این یک **ادعای آزمون‌پذیر** است، نه اثبات کامل. برای آزمودن، مجموعه‌ی آزمون $T_n$ داریم.

---

## ۱۵. argv به‌عنوان حالت اولیه

### ۱۵.۱ مدل [قطعی]

آرگومان‌های خط فرمان $a = (a_0, a_1, \ldots, a_{k-1})$ هستند. حالت اولیه شامل:

$$
\sigma_0(\texttt{argc}) = k, \qquad \sigma_0(\texttt{argAt}) = \lambda i.\; a_i \;\;(\text{برای } 0 \le i < k)
$$

و $\texttt{argAt}(i) = \bot$ برای $i \geq k$.

### ۱۵.۲ اثر روی کامپایلر

در `gen_2` (یا نسلی که CLI دارد)، ورودی کامپایلر یعنی $a_1$ (مسیر فایل) از `argAt(1)` خوانده می‌شود:

$$
\texttt{input} = \texttt{argAt}(1) = a_1
$$

### ۱۵.۳ مثال

اجرای `razc-2 main.raz -o out.cpp`:

$$
a = (\texttt{razc-2}, \texttt{main.raz}, \texttt{-o}, \texttt{out.cpp}), \qquad \texttt{argc} = 4, \quad \texttt{argAt}(1) = \texttt{"main.raz"}
$$

---

## ۱۶. مثال کامل: از سورس تا C++

### ۱۶.۱ سورس

```raz
use linux;
let x: i64 = 1 + 2 * 3;
echo("ok");
```

### ۱۶.۲ گام‌ها

**گام ۱ (Lex):**

$$
\langle \mathtt{KW}(\texttt{use}), \mathtt{ID}(\texttt{linux}), \mathtt{SEMI}, \mathtt{KW}(\texttt{let}), \mathtt{ID}(x), \mathtt{COLON}, \mathtt{KW}(\texttt{i64}), \mathtt{ASSIGN}, \mathtt{INT}(1), \mathtt{PLUS}, \mathtt{INT}(2), \mathtt{STAR}, \mathtt{INT}(3), \mathtt{SEMI}, \ldots \rangle
$$

**گام ۲ (Expand):** فایلی include نشده، پس بدون تغییر.

**گام ۳ (Parse):** درخت:

$$
\mathrm{Use}(\texttt{linux}),\quad \mathrm{Let}(x, \texttt{i64}, \mathrm{Add}(1, \mathrm{Mul}(2,3))),\quad \mathrm{Call}(\texttt{echo}, \texttt{"ok"})
$$

**گام ۴ (Hoist):** `use` قبلاً در بالاست، تغییری نیست.

**گام ۵ (Names):** $\Gamma = \{x \mapsto (\texttt{i64}, \text{mut})\}$. `echo` از هدر runtime است و در $\Gamma$ از طریق `use` تعریف می‌شود.

**گام ۶ (Type):**

$$
\frac{\dfrac{}{\Gamma \vdash 1:\texttt{i64}} \quad \dfrac{\dfrac{}{\vdash 2:\texttt{i64}} \quad \dfrac{}{\vdash 3:\texttt{i64}}}{\vdash 2*3:\texttt{i64}}}{\Gamma \vdash 1 + 2*3 : \texttt{i64}}
$$

**گام ۷ (Safe):** هیچ اشاره‌گری و هیچ `let` بدون مقدار نیست. ✓

**گام ۸ (Lower و Emit):**

```cpp
#include <linux/...>
#include "raz_runtime.hpp"

int main(void) {
    std::int64_t x = 1 + 2 * 3;
    echo("ok");
    return 0;
}
```

**گام ۹ (معنا):** $\sigma_{\text{end}} = \{x \mapsto 7\}$ و خروجی `ok`.

---

## ۱۷. ابزارهای توسعه‌دهنده [پیشنهاد]

| ابزار | ورودی | خروجی | کاربرد |
|---|---|---|---|
| `uses` | $S_n$ | مجموعه‌ی قابلیت‌ها | بررسی شرط بخش ۴ |
| `check-chain` | $S_n$، $F_{n-1}$، $F_n$ | پذیرفته یا رد | گیت CI قبل از ساخت نسل |
| `fixpoint` | $k$ | `diff` یا `OK` | بررسی $C_k(S_k) = C_{k+1}(S_k)$ با هش |
| `graph` | ریشه‌ی پروژه | گراف include | کشف دور و ترتیب توپولوژیک |
| `trace` | $P$ | مرحله‌های Lex…Emit | اشکال‌زدایی و آموزش |

### ۱۷.۱ نمونه‌ی گیت CI

```sh
# گام ۱: بررسی شرط زنجیره
./tools/uses S_5.raz | ./tools/check-chain --prev F4 --cur F5

# گام ۲: ساخت نسل
./gen_4 S_5.raz -o gen5.cpp && c++ -std=c++17 -O2 gen5.cpp -o gen_5

# گام ۳: ساخت نسل بعد
./gen_5 S_6.raz -o gen6.cpp && c++ -std=c++17 -O2 gen6.cpp -o gen_6

# گام ۴: نقطه‌ی ثابت برای k = 5
./gen_5 S_5.raz -o A.cpp
./gen_6 S_5.raz -o B.cpp
diff A.cpp B.cpp && echo "fixpoint OK"
```

---

## ۱۸. فرض‌ها و محدودیت‌ها

1. **قطعی بودن $\mathrm{B}$**: کامپایلر `c++` با همان ورودی همان خروجی را می‌دهد. اگر نباشد، نقطه‌ی ثابت بی‌معنا است.
2. **رفتار تعریف‌نشده‌ی C++**: برنامه‌های Raz که سرریز علامت‌دار یا تقسیم بر صفر دارند، معنای تعریف‌شده ندارند تا تصمیم بخش ۱۲ گرفته شود.
3. **Trusting Trust**: نقطه‌ی ثابت درستی را ثابت نمی‌کند (بخش ۳.۴). کامپایلر آلوده‌ای هم می‌تواند خودش را بازتولید کند. راه‌حل: مقایسه با کامپایلر مستقل (مثل `tcc`) و آزمون‌های رفتاری $T_n$.
4. **صحت به‌صورت آزمون**: قضیه‌ی معناشناختی (بخش ۱۴.۳) یک ادعای آزمون‌پذیر است، نه اثبات رسمی.
5. **ایمنی**: ادعای بخش ۱۲.۳ فقط برای بخش امن زبان است و بر فرض درستی `Lower` و `Emit` و کامپایلر C++ استوار است.

---

## ۱۹. موارد باز مرتبط با این مدل

| # | موضوع | گزینه‌ها | پیشنهاد |
|---|---|---|---|
| ۱ | شرط زنجیره | $L_{n-1} \subseteq L_n$ یا $\mathrm{uses}(S_n) \subseteq F_{n-1}\cap F_n$ | دومی [اصلاح] |
| ۲ | `print` در $F_1$ | نگه‌داشتن یا حذف | نگه‌داشتن تا `S_1` بی‌نیاز شود |
| ۳ | `i64` در $F_0 \cap F_1$ | قرار گرفتن در هر دو | بله |
| ۴ | تابع با نام `main` در L_1 | خطا یا تغییر نام در خروجی | تغییر نام به `raz_main` در Emit |
| ۵ | نوع نتیجه‌ی مقایسه | `i64` (مانند C) یا `bool` | `i64` تا نسل ۳ |
| ۶ | تعریف `if` شرط | عدد صحیح غیرصفر یا `bool` | عدد صحیح تا نسل ۳ |
| ۷ | ترتیب تعریف global | خطا (E0011) یا مقدار صفر | خطا (E0011) |
| ۸ | مدل فایل‌های ورودی | فقط یک فایل یا گراف include | گراف include |

---

## ۲۰. جمع‌بندی

- کامپایلر یک **تابع جزئی** از متن Raz به متن C++ است.
- زنجیره‌ی نسل‌ها یک **دنباله‌ی ساخت** است: $gen_n = \mathrm{B}(C_{n-1}(S_n))$.
- شرط زنجیره به **مجموعه‌ی قابلیت‌های استفاده‌شده** تبدیل شد: $\mathrm{uses}(S_n) \subseteq F_{n-1} \cap F_n$. این شرط آزمون‌پذیر است.
- نقطه‌ی ثابت $C_k(S_k) = C_{k+1}(S_k)$ **لازم** است ولی **کافی** نیست؛ آزمون‌های رفتاری هم لازم‌اند.
- هر مرحله‌ی خط لوله (Lex، Expand، Hoist، Parse، Names، Type، Safe، Lower، Emit) یک تابع یا رابطه‌ی تعریف‌شده با ورودی و خروجی مشخص است.
