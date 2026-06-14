# Status / label indikatorlari — qachon qaysi (CLI-181)

`@dental/ui` da pill-shaklidagi indikatorlar uchun **uchta** vosita bor. Audit (CLI-177) "uch xil pill" ni nomuvofiqlik deb belgiladi — aslida ular **uch xil maqsad**. Bu hujjat tanlovni aniqlashtiradi (recurrence guard).

## Qoida

| Vosita | Qachon | Misol |
|---|---|---|
| **`StatusPill`** (`@dental/ui`) | **Semantik status** — cheklangan, ma'lum holatlar to'plami (success/warning/danger/info/accent/neutral). Token rang + dot. | yozilish holati, navbat bosqichi, to'lov holati |
| **`Tag`** (`@dental/ui`) | **Neytral yorliq** — semantikasiz erkin matn (rang/holat anglatmaydi). | bemor teglari, sug'urta nomi |
| **Mantine `Badge`** | **Qolgan hammasi** — dinamik/boolean rang kodlash (`isActive?teal:gray`), ikki-tomonlama yo'nalish (`outgoing?blue:gray`), sanoq (count), yoki `StatusPill` enum'iga sig'maydigan holatlar. | aktiv/nofaol, refund/charge, filial soni |

## Yangi kod uchun
- Status **ma'lum, cheklangan to'plam** bo'lsa → `StatusPill` (token-izchil + dot).
- Faqat yorliq → `Tag`.
- Dinamik yoki enum'ga sig'maydigan → `Badge`.

## Ma'lum cheklov (won't-fix — CLI-181)

Mavjud `Badge color="..."` status saytlari (~15) qisman **off-brand** ranglar ishlatadi: `teal`/`red` token (CLI-180 dan keyin), lekin `green`/`yellow`/`blue`/`gray` Mantine **default** palitralar — bu `--success` (amber emas, deeper green), `--warning` (**amber**, yellow emas), `--info` (**cyan**, blue emas) token'lariga **mos kelmaydi**.

**Nega tuzatilmadi (CLI-180 dan farqli):** CLI-180 red remap toza edi, chunki Mantine `red` slot = danger hue (nom = semantika). Bu yerda **nom ≠ semantika** (`yellow`≠amber, `blue`≠cyan) → 0-churn theme remap yo'q. Token yo'li = named custom colors (`colors.success/warning/info`) + ~15 call-site migration — bu Low-priority tidiness task uchun nomutanosib churn. Migration `StatusPill`'ga ham **lossy** (6-qiymatli enum boolean/dinamik mapping'larни qoplay olmaydi).

**Status:** deferred (kelajakda kerak bo'lsa alohida task — named token palette + call-site migration).
