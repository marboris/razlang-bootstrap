# RIR

RIR (Raz Intermediate Representation) نمایش میانی مستقل از target در پروژه است.
Frontend باید syntax و semantics را به RIR تبدیل کند؛ backend فقط RIR و target profile را می‌بیند.

## RIR-1 فعلی

یک module با header زیر شروع می‌شود:

```text
rir 1
```

ساختار پایه:

```text
rir 1
function add(i64 x, i64 y) -> i64
entry:
    %t0 = load x
    %t1 = load y
    %t2 = add %t0, %t1
    return %t2
endfunction
```

عملیات فعلی شامل constant، local/load/store، arithmetic و comparison، unary، call، field/index، list، return و control-flow است.

Stage-3 یک verifier نوشته‌شده با خود Raz دارد که invariantهای ساختاری RIR-1 را بررسی می‌کند. این verifier هنوز جای type checker یا optimizer را نمی‌گیرد؛ هدف آن این است که RIR به یک قرارداد قابل تست بین frontend و backend تبدیل شود.


## Reference operations

`ref x`, `ref_field %r.f` و `ref_index %r[%i]` یک lvalue قابل عبور به پارامتر `Ref<T>` می‌سازند. این عملیات مقدار جدید تولید نمی‌کنند؛ backend باید آن‌ها را به یک reference مناسب target lower کند.
