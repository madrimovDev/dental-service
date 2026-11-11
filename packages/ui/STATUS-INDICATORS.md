# Status / label indikatorlari — qachon qaysi (CLI-181)

## UI-0 yangilanishi — 6 ma'noli holat lug'ati

`StatusPill` varianti endi **ma'no** bo'yicha: `planned | confirmed | waiting | active | done | failed` (tokenlar `--st-<ma'no>-bg/fg`, light+dark kontrast `scripts/ui/contrast-check.ts` da). Eski nomlar map qilinadi: `info→planned`, `success→confirmed`, `warning→waiting`, `accent→active`, `neutral→done`, `danger→failed` (`data-status` — berilgan nom, `data-meaning` — yangi ma'no). Yangi kod faqat yangi nomlarni ishlatadi. Rang doim yorliq bilan.

Yangi: `PatientFlag` (to'rtburchak bemor belgisi: critical/attention/neutral/info) va `AlertBanner` (2 = diqqat `role=alert`, 3 = ma'lumot `role=status`; 1-daraja modal — `CriticalActionDialog`).

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
