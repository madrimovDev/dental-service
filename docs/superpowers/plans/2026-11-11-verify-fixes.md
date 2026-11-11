# UI dan keyingi tekshiruv tuzatishlari — Implementation Plan

> Ijro: `docs/ORCHESTRATION-GUIDE.md`. Nuqsonlarning to'liq repro'si: `docs/qa/2026-11-11-post-ui-verification.json` (5 agent natijasi).

**Goal:** 2026-11-11 dagi real-brauzer/rol/oqim tekshiruvi topgan nuqsonlarni yopish.

## Lane fx-api — API to'g'riligi (T3, risky)
1. **FU-01:** parallel `POST /api/appointments` yutqazgani 500 → **409** (`doctor_busy`/`patient_busy`). Sabab: insert'ni o'rab olgan tx ichida 23P01 ushlanadi, lekin tx aborted → COMMIT xatosi. Yechim: insert'ni **savepoint** (`tx.transaction(...)` nested) ichida; xuddi shu naqsh **payroll runs** (davr overlap 23P01) va **services** dublikat `code` (23505 → 409 `service.code_taken`). Test: real HTTP parallel `Promise.all` (yangi `tests/integration/fx-concurrency-409.test.ts`).
2. **Provisioning owner** vaqtinchalik parol bilan kirganda `mustChangePassword:false` — provisioning'da yaratilgan owner'ga `must_change_password = true` (vaqtinchalik parolni vendor ham biladi). Test: `tests/integration/provisioning-activate.test.ts` ga qo'shimcha.
3. **FU-17:** filial bo'yicha availability (`getBranchAvailability`, FreeSlotsCard) jadvalsiz doktorlarni ham P10 fallback bilan qo'shsin (filial a'zosi bo'lgan doktorlar ro'yxatidan). Test: `p10-default-work-hours.test.ts`.

## Lane fx-rbac — rol/ekran bo'shliqlari (T3, risky)
1. Branch Manager «Xodim qo'shish» — rol ro'yxati bo'sh (`GET /api/roles` 403): yangi tor `GET /api/users/grantable-roles` (`user.invite`; faqat chaqiruvchi berishi mumkin bo'lgan rollar — `assertCanGrant` bilan bir xil qoida) → UsersSettingsScreen shu endpoint'dan.
2. Nav: «Sozlamalar»/«Filiallar» faqat sahifa ma'lumotini o'qiy oladigan rollarga (`tenant_settings.view` / `branch.view` + sahifa so'rovlari gate'langan); `BranchesSettingsScreen` `useUsers` faqat `user.view` bo'lsa.
3. 403 shovqinlari: `OnboardingChecklist` (`useTenantSettings` faqat ruxsat bo'lsa), `OwnerAlertsPanel` (`useBackupStatus` faqat ruxsat bo'lsa), `QueueBoard` (`useCheckInCandidates` faqat `queue.create`, `useServices` faqat `service.view`), bemor kartasi tablari (visit-notes faqat `medical_record.view`, appointments faqat `appointment.view`), Nurse `services` 403'lari.
4. Test: web `src/shell src/features/settings src/features/dashboard src/features/queue src/features/patients` (real permset fixture'lar), API `tests/integration/fx-grantable-roles.test.ts`.

## Lane fx-misc — UI nuqsonlari (T2)
1. `/expenses` `pageSize: 200` → server pagination (100) yoki oy bo'yicha so'rov; ro'yxat ishlaydi.
2. `/rx`, `/transactions` bo'sh va xato holatlari `StateView` sarlavha/tavsif/qayta urinish bilan.
3. ⌘K palette: ro'yxat chegaralangan balandlik + scroll, tanlangan element `scrollIntoView`.
4. Kalendar: `appointments.minuteShort`/`serviceShort` kalitlari (uz+ru), sana formatlash uz'da `Intl` fallback'siz (o'zbekcha oy/hafta kuni nomlari lug'ati `apps/web/src/lib/format.ts`), o'ng panel «Bugun» o'rniga tanlangan kun.
5. RU rejimida xom qiymatlar: obuna holati (`trial` → t()), valyuta ko'rinishi, **tizim rol nomlari** (`templateKey` bo'yicha t(), custom rollar o'z nomi bilan).
6. Ombor sarlavhasi «N ta tugayapti» `lowStock` bilan bir xil manbadan.
7. Chek modali: bemor tanlangan bo'lsa ismi (walk-in emas).
8. Yetishmayotgan i18n kaliti `patients.collect_payment` (va crawl topgan boshqalar — `grep` bilan).
Test: web tegishli feature papkalari + build.

## Lane fx-handoff — vizit → kassa (T3, risky — pul)
«Imzolash va kassaga yuborish» hozir kassaga hech narsa yubormaydi. Yechim: migratsiya **0054** `cashier_transactions.visit_note_id uuid NULL` (FK, unique partial — bitta vizit bir marta to'lanadi), `GET /api/cashier/pending-visits?branchId` (`cashier.view`) — bugungi imzolangan, to'lanmagan vizitlar (bemor, shifokor, xizmatlar narxi bilan); Kassa ekranida «Kutilayotgan vizitlar» bloki → tanlansa savat to'ldiriladi (narx qulflangan), to'lovda `visitNoteId` yuboriladi; registrator «Bugun» ekranida ham soni. Test: yangi `tests/integration/fx-visit-cashier-handoff.test.ts` (imzolangan vizit ro'yxatda, to'langandan keyin yo'q, ikkinchi to'lov 409, boshqa tenant yo'q), web `src/features/cashier`.
