# Ma'lum test yiqilishlari (merge gate bazasi)

> `docs/ORCHESTRATION-GUIDE.md` §6 bo'yicha: to'liq API to'plamida quyidagilar yiqilishi **ma'lum**. Gate mezoni — bu ro'yxatdan tashqari yangi yiqilish yo'q va ro'yxatdagi har fayl **izolyatsiyada yashil**.
> Oxirgi tasdiq: 2026-11-11, P bosqichi 1 merge'i (`wf/p-stage1-l1`), lane bazasi, `996 pass / 14 fail` (14 tadan 1 tasi lane bazasida permission seed yo'qligidan — muhit, ro'yxatga kirmaydi).

## Sinflar
1. **`mock.module` fayllararo oqishi** — bitta bun jarayonida `license.test.ts`/`cli-387` modul mock'lari boshqa fayllarga oqadi (fingerprint/license). Izolyatsiyada yashil.
2. **Concurrent EXCLUDE poygasi** — to'liq yuk ostida `appointments-patient-overlap` concurrent testi poyga yutqazadi. Izolyatsiyada yashil.

## Ro'yxat (13)

| Fayl | Test |
|---|---|
| `src/lib/license.test.ts` | getFingerprint > returns consistent SHA-256 hash |
| `src/lib/license.test.ts` | getFingerprint > throws FINGERPRINT_UNAVAILABLE when both uuid and serial are empty (CLI-432) |
| `src/lib/license.test.ts` | getFingerprint > apparatni faqat BIR marta so'raydi (keshlanadi) |
| `src/lib/license.test.ts` | getFingerprint > xato keshlanmaydi — keyingi chaqiruv qayta uriniladi |
| `src/lib/license.test.ts` | writeLicense + readLicense > round-trips license data |
| `src/lib/license.test.ts` | invalidateLicense > deletes the cached .lic file so readLicense() returns null afterward |
| `src/lib/license.test.ts` | isLicenseValid — machine binding (CLI-410) > getActiveModules returns [] when the bound fingerprint does not match this machine |
| `src/lib/license.test.ts` | isLicenseValid — machine binding (CLI-410) > getActiveModules returns modules for a matching-fingerprint valid license |
| `src/lib/license.test.ts` | readAnchor + writeAnchor (CLI-437) > round-trips the same millisecond value through AES encryption |
| `src/lib/license.test.ts` | getActiveModules — anchor advance (CLI-437) > a valid license check advances the anchor forward (never backward) |
| `tests/integration/appointments-patient-overlap.test.ts` | CLI-471 patient-overlap EXCLUDE constraint > concurrent bir bemor turli doktor ayni slot → aynan 1 ok, 1 patient_busy (DB backstop) |
| `tests/integration/cli-387-license-heartbeat.test.ts` | CLI-387 — deactivated clinic gets blocked on next heartbeat > active license passes (200) -> Supervisor heartbeat says INVALID_KEY -> next request 403 LICENSE_NOT_FOUND |
| `tests/integration/cli-387-license-heartbeat.test.ts` | CLI-387 — deactivated clinic gets blocked on next heartbeat > transient network error during heartbeat does NOT invalidate the cached license (offline resilience) |

## P bosqichi 2 (2026-11-11) qo'shilganlari — `mock.module` oqishi sinfi, izolyatsiyada yashil

| Fayl | Test |
|---|---|
| `src/lib/license.test.ts` | grace cap + license state (P18) > getLicenseState: real .lic file -> grace; tampered signature -> none |
| `tests/integration/cli-358-module-gating.test.ts` | GET /api/branches (non-module route, Local Desktop mode, no license) → 403 LICENSE_NOT_FOUND (P18 global gate) |
| `tests/integration/cli-358-module-gating.test.ts` | GET /api/branches (…) → 403 (P18 global gate) while /api/auth stays open |
| `tests/integration/cli-358-module-gating.test.ts` | GET /api/treatment-plans (Local Desktop, no auth header, no license) → 403 LICENSE_NOT_FOUND (P18 global gate runs BEFORE auth) |

Sabab: `license-middleware.test.ts`/`license.test.ts` `./license.ts`ni `mock.module` bilan almashtiradi; bitta bun jarayonida `getLicenseState` mock'i boshqa fayllarga oqadi. Oxirgi gate: `1001 pass / 18 fail` (17 ta shu ro'yxat sinflari + 1 muhit).

## Muhit bilan bog'liq (ro'yxatga kirmaydi)
- `clinical.test.ts` `(unnamed)` hook — `diagnoses_code_unique (K02.1)`: lane bazasiga `seedDiagnoses` qo'llangan bo'lsa yiqiladi. Lane'ga **faqat `seedPermissions`**.
- `provisioning-tenant.test.ts` «har rol shabloni o'z permission to'plamini to'liq oladi» — lane bazasida `seedPermissions` ishlatilmagan bo'lsa yiqiladi (permission katalogi migratsiyada emas, API boot'da seed qilinadi). Lane tayyorlashda seed majburiy (qo'llanma §5.3).
- `bun run lint` (`biome check .`) — `apps/supervisor-api` dagi avvaldan mavjud `noNonNullAssertion`/`noExplicitAny` xatolari bilan exit 1. Gate'da faqat **tegilgan fayllar** biome'dan toza bo'lishi tekshiriladi (pre-commit hook shuni qiladi).
