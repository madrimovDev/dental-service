# E2E Test Hisoboti — Dental Service

---

# 🆕 To'liq ish kuni simulatsiyasi (2026-06-13)

**Usul:** Playwright MCP (Chromium, headed) — live browser, rol-bo'yicha ketma-ket (login→ish→logout→keyingi rol)
**Tenant:** yangi toza **Demo Dental Klinika** (`demo-dental-klinika-cc91f1`), 1 filial (Bosh filial)
**Scope:** Bitta bemorning to'liq yo'li — yangi bemor → yozilish → navbat → klinik davolanish → to'lov → **qayta tashrif (davomiy davolanish)** → yakuniy to'lov. **Har 9 rol** (Owner + 8 tizim roli) o'z bosqichida ishtirok etdi.
**Bemor:** Tursunov Jamshid Akmalovich (`d67ec217`)

> ⚠️ **Eng muhim xulosa:** avvalgi (2026-06-12) test deyarli faqat **Owner** (`@owner` wildcard) bilan o'tkazilgan — shuning uchun rolga tegishli, lekin cross-domen API chaqiradigan ekranlardagi **ruxsat (permission) kamchiliklari aniqlanmagan**. Ushbu rol-bo'yicha simulatsiya 3 ta jiddiy permission-gap topdi (pastga qarang).

## Rollar ishtiroki matritsasi (9/9 ✅)

| Rol | Telefon | Bosqich / harakat | Holat |
|-----|---------|-------------------|-------|
| **Owner** | +998998877665 | Tenant setup: 2 xizmat+narx, M5 grant (Doctor+Technician), 8 xodim yaratish | ✅ |
| **Tenant Admin** | +998901112201 | 50 ruxsat, nav'da Rollar+Foydalanuvchilar (eng keng admin) | ✅ |
| **Branch Manager** | +998901112202 | ManagerDashboard KPI: daromad 350k, filial/doktor nomlari (UUID emas) | ✅ |
| **Doctor** | +998901112203 | Klinik: tibbiy karta+allergiya, odontogram, davolash rejasi, vizit SOAP+ICD-10, resept | ✅ |
| **Doctor + Assistant** | +998901112204 | DoctorDashboard + "Yangi bemor" (patient.create — Doctor'dan farqli) | ✅ |
| **Nurse** | +998901112205 | Navbat ko'rish + tibbiy karta (faqat-o'qish, PII maskalangan) | ✅ |
| **Receptionist** | +998901112206 | Bemor ro'yxati, yozilish, navbat (check-in→call→done), POS+plan to'lov | ✅ |
| **Accountant** | +998901112207 | Moliyaviy dashboard + **to'lov qaytarish** (150k Konsultatsiya refund) | ✅ |
| **Technician** | +998901112208 | Lab buyurtma (Smile Dental Lab, tojcha, sana bilan) | ✅ |

> Xodim parollari va to'liq setup: `.playwright-mcp/SIM-CREDENTIALS.md`. Live screenshotlar: `.playwright-mcp/sim-01..15-*.png`.

## Ish kuni oqimi (handoff pipeline) — barchasi muvaffaqiyatli

1. **Receptionist** → yangi bemor Tursunov ro'yxatdan o'tdi → yozilish (Doctor Salimov, 13:32) → navbatga check-in ("Kutmoqda")
2. **Nurse** → navbatni va bemor tibbiy kartasini ko'rdi (faqat-o'qish; PII maskalangan; `medical_record.edit`/`queue.manage` yo'q)
3. **Doctor** → navbatni ko'rdi (chaqira olmaydi — `queue.view` only) → tibbiy karta+allergiya (Penitsillin/Og'ir/Dori) → odontogram 16→Kariyes → 2-bosqichli reja (Kariyes 350k + Tojcha 1.2M = 1.55M) → vizit SOAP + ICD-10 **K02.1** → resept (Ibuprofen)
4. **Technician** → lab buyurtma (tojcha, **kutilgan sana 2026-06-20 bilan** — CLI-147 fix tasdig'i)
5. **Receptionist** → navbat: Chaqirish (Davom etmoqda) → Tugatildi (Bajarilgan); kassa: POS Konsultatsiya 150k naqd (out-of-box) + plan-billing 1-bosqich **qisman 200k** → reja balans 1,350,000
6. **Accountant** → kunlik kassa dashboard (350k = 2 to'lov)
7. **Branch Manager / Tenant Admin** → ManagerDashboard KPI + admin nav

## Qayta tashrif (davomiy davolanish) — to'liq lifecycle

- **Receptionist**: o'sha bemorga 2-yozilish (14:05) → navbat check-in → Chaqirish
- **Doctor**: odontogram 16 **Kariyes→Tojcha** (tojcha o'rnatildi) → reja 2-bosqich **Bajarilgan**
- **Receptionist**: navbat Tugatildi → plan-billing **qolgan to'liq** (150k + 1.2M = 1,350,000) → reja **Balans 0 so'm**, ikkala bosqich **To'langan**
- **Yakuniy moliya**: 3 chek, kunlik kassa **1,700,000 so'm** (150k POS + 200k + 1.35M plan)
- ✅ To'lov progressiyasi: To'lanmagan → **Qisman** → **To'langan** (reja balansi to'g'ri kamaydi)

## Regression tasdig'i — eski buglar FIX qilingan (live)

| Linear | Tavsif | Tasdiq |
|--------|--------|--------|
| CLI-147 | Lab `expectedDate` date-only → 400 | ✅ Sana **2026-06-20 bilan saqlandi**, 400 yo'q |
| CLI-148 | Tibbiy karta allergiya tahrirlanmaydi | ✅ Allergiya qatori **inline tahrirlandi** (Penitsillin) va saqlandi |
| CLI-149 | Bemorlar ro'yxati doim bo'sh | ✅ Bemor yaratildi, ro'yxatda ko'rindi |
| CLI-150 | Yozilish wizard Select state-leak | ✅ Wizard toza ishladi (state-leak yo'q) |
| CLI-151 | **Tenant-wide user** (`activeBranchId=null`) yozilish `branchId=''` → 400 | ✅ **Owner (aynan tenant-wide)** bilan tekshirildi: wizard 1-bosqichda **Filial selektori** chiqdi, filial tanlab → **201** (400 yo'q). [Filial-scoped Receptionist'da bu yo'l yo'q — filial avto-aniqlanadi] |
| CLI-152 | uz sana / ICD nom-qidiruv / dashboard UUID→nom / kassa sana | ✅ Sana `15.04.1990`; "kariyes"→6 ICD; dashboard "Doktor Salimov"/"Bosh filial"; kassa bugungi tranzaksiyalar ko'rindi |

## ✅ RBAC gap — topildi va FIX qilindi (2026-06-13, branch `fix/cli-153-rbac-gaps`)

> **Sistematik muammo:** rolga tegishli ekran cross-domen API chaqiradi, lekin rol shabloni o'sha domenning `*.view` ruxsatiga ega emas → 403. Owner'da `@owner` bo'lgani uchun hech qachon ko'rinmagan. **Linear:** umbrella [CLI-153](https://linear.app/monro-delivery/issue/CLI-153) (BUG-1=[CLI-154](https://linear.app/monro-delivery/issue/CLI-154), BUG-3=[CLI-155](https://linear.app/monro-delivery/issue/CLI-155) sub-issue), BUG-2=[CLI-156](https://linear.app/monro-delivery/issue/CLI-156). To'liq tahlil + tavsiyalar: `.playwright-mcp/SIM-FINDINGS.md`.

| # | Linear | Jiddiylik | Tavsif | Root-cause | Status |
|---|--------|-----------|--------|-----------|--------|
| **BUG-1** | [CLI-154](https://linear.app/monro-delivery/issue/CLI-154) | **High** | Receptionist yozilish wizardida **doktorlar ro'yxati bo'sh** | `useDoctors()` → `GET /users/assignments` (`user.view`); Receptionist shablonida `user.view` yo'q → 403 | ✅ Fixed |
| **BUG-3** | [CLI-155](https://linear.app/monro-delivery/issue/CLI-155) | **High** | Kassa **"Davolash rejasi"** (plan-billing) hech bir kassa roli uchun ishlamaydi + UI "reja yo'q" deb yanglish ko'rsatadi | PlanBillingPanel → `GET /treatment-plans` (`medical_record.view`); Receptionist/Accountant'da yo'q → 403. Accountant'da hatto `cashier.create_transaction` ham yo'q | ✅ Fixed |
| **BUG-2** | [CLI-156](https://linear.app/monro-delivery/issue/CLI-156) | Low | Resept davomiylik NumberInput `controlled→uncontrolled` warning **qaytgan** | `PrescriptionsTab.tsx`; CLI-152 fix to'liq emas (save-reset yo'li) | ✅ Fixed (warning live-tasdiq kutilmoqda) |

**Amalga oshirilgan fix (narrow-endpoint yondashuvi):** rol-template kengaytirish (faqat *yangi* tenantlar + mavjudlarga migration kerak) o'rniga **rolga mos yengil endpoint** tanlandi — Receptionist allaqachon ega `appointment.view`/`cashier.view` bilan ishlaydi (migration shart emas + least-privilege):
- **CLI-154:** `GET /appointments/doctors` (`appointment.view`) — doctor-detect+dedupe backendda; `useDoctors()` shuni chaqiradi.
- **CLI-155:** `GET /cashier/patient-plans` (`cashier.view`, `{id,title,status}`) — `usePatientPlans()` shuni chaqiradi; UI 403/xato endi "reja yo'q"dan farqlanadi (`cashier.plan_billing.load_error`). Plan balans allaqachon `cashier.view`'li `GET /cashier/plan-balance/{planId}` orqali.
- **CLI-156:** `PrescriptionsTab` `durationDays` NumberInput to'liq controlled (`getInputProps` spread olib tashlandi, `value` hech qachon `undefined` emas).
- **Accountant rol o'zgarmadi** — qaror: buxgalter faqat refund/hisobot, to'lovni resepsioner/kassir qabul qiladi (`cashier.create_transaction` qo'shilmadi).

**Verifikatsiya (role-by-role, `@owner` EMAS):** permission guard real Receptionist permset bilan (`appointment.view`/`cashier.view` → 200, eski `user.view`/`medical_record.view` → 403) + service/RLS izolyatsiya integration testi — `apps/api/tests/integration/cli-153-permission-guard.test.ts` + `cli-153-rbac-endpoints.test.ts` (9/9 ✅).

## Out-of-box (workaroundsiz) tasdiqlangan rol-oqimlari
- Receptionist: bemor yaratish, **POS to'lov** (Konsultatsiya 150k → chek), navbat to'liq sikl (check-in/call/done)
- Doctor: barcha klinik modullar (M5 grant'dan keyin), odontogram, reja, vizit, resept
- Technician: lab buyurtma; Nurse: faqat-o'qish ko'rinish; PII maskalash (Nurse) vs ochiq (Doctor) — RBAC to'g'ri
- **Accountant refund:** Accountant `cashier.refund` bilan 150k Konsultatsiyani **muvaffaqiyatli qaytardi** (`...-R` chek + asl "Bekor qilingan", net daromad 1.55M) — `cashier.create_transaction` YO'Q bo'lsa ham refund ishlaydi. Demak buxgalter to'lov **qaytara oladi**, lekin yangi to'lov **qabul qila olmaydi** (BUG-3 bilan bog'liq under-provisioning).

## To'lov / balans aniqliklari
- **Bemor hisob balansi** to'liq yo'l davomida **0 so'm** (header + To'lovlar tab) — chunki jami 1,700,000 (Konsultatsiya 150k + reja 1.55M) to'langan. **Reja qoldig'i (estimate) "qarz" sifatida hisoblanmaydi** — ya'ni *plan balansi ≠ hisob balansi* (by-design, bug emas). Qisman to'lov paytida ham header 0 ko'rsatdi: reja balansi alohida `PlanBillingPanel`'da kuzatiladi.

## Bu run'da qasddan QAMRALMAGAN (oldingi 2026-06-12 run'da Owner bilan qamralgan)
- **Konsent imzolash** va **Bemor rasmi (X-ray) upload** — Doctor'ga M5 ruxsatlar berildi va tablar ochiq (accessible) tasdiqlandi, lekin bu run bemor yo'lining happy-path'iga kirmagani uchun CRUD qayta bajarilmadi.
- **Oila (qarindosh)** — 2-bemor talab qiladi, bu simulatsiyada bitta bemor.

---

# (Avvalgi) E2E Test Hisoboti — 2026-06-12

> ⚠️ **TARIXIY SNAPSHOT.** Quyidagi 2026-06-12 holati o'sha kungi vaziyatni aks ettiradi. **CLI-147, CLI-148, CLI-149, CLI-150, CLI-151, CLI-152 keyinchalik (2026-06-13) hammasi TUZATILDI** (yuqoridagi 2026-06-13 bo'lim + Linear Done). Quyidagi jadvallardagi "Todo" status'lar shu sababli `✅ Tuzatildi`ga yangilandi.

**Sana:** 2026-06-12
**Usul:** Playwright MCP (Chromium, headed) — real browser, to'liq CRUD
**Linear team:** Clinik (bug → "Bug" label, Todo status)
**Scope:** Barcha featurelar + barcha 8 rol

## Kirish ma'lumoti
- Web: http://localhost:8000 · API: :8001 · Owner: Test Egasi Aziz / +998901234567 / Dental Service tenant
- Owner = implicit superuser (to'liq access)

---

## Test matritsasi

| # | Modul | Holat | Izoh |
|---|-------|-------|------|
| 1 | Bosh ekran (Dashboard) | ✅ | KPI hisoblandi (daromad 250k); UUID display bug (CLI-152) |
| 2 | Bemorlar ro'yxati | ✅ | bo'sh edi, endi 1 bemor |
| 3 | Yangi bemor (Create) | ✅ | Bemorov Aliboy yaratildi |
| 4 | Bemor kartasi (11 tab) | ✅ | Oila=2-bemor kutilmoqda; 2 bug (CLI-147,148) |
| 5 | Kalendar / Yozilish | ✅ | 4-bosqich wizard; 201 yaratildi; 2 bug (CLI-150 fix, CLI-151) |
| 6 | Navbat tablosi | ✅ | appointment'dan check-in → 201; kanban (Kutmoqda/Davom/Bajarilgan) |
| 7 | Kassa (POS / billing) | ✅ | bemor+xizmat(narx auto 250k)+naqd to'lov → 201; kunlik xulosa OK |
| 8 | Xizmatlar va narxlar | ✅ | Create + multi-branch narx |
| 9 | Filiallar | ✅ | Create |
| 10 | Rollar | ✅ | 8 system + custom rol (permission builder) |
| 11 | Foydalanuvchilar (xodim) | ✅ | xodim Create + parol mexanizmi |
| 12 | Sozlamalar (tenant) | ✅ | forma to'liq (nom/til/yo'nalish/valyuta/eslatma + egalik o'tkazish) |
| 13 | "Tez orada" modullar | ✅ | nav-darajada bog'lanmagan; klinik featurelar bemor kartasida mavjud |

## Xodim akkauntlari (parol darhol ko'rsatiladi — SMS yo'q)

| Rol | Ism | Telefon | Parol |
|-----|-----|---------|-------|
| Doctor | Doktor Salimov Jasur | +998901002030 | `ZEXdr8EMkfLG4_97` |
| Receptionist | Registrator Nodira Saidova | +998901003040 | `s4_UY60EPI5oi8Zg` |

> Owner: Test Egasi Aziz / +998901234567 / `TestParol12345` (register paytida)

## Rollar matritsasi

| Rol | Xodim yaratildi | Login | Rol-cheklov test | Holat |
|-----|----------------|-------|------------------|-------|
| Owner (superuser) | — | ✅ | to'liq access (barcha modul) | ✅ |
| Tenant Admin | | | | ⏳ |
| Branch Manager | | | | ⏳ |
| Doctor | ✅ | ✅ | navbar filtr (Yangi bemor/Kassa YO'Q) + /settings/users→403 | ✅ |
| Nurse | | | | ⏳ |
| Receptionist | ✅ | ✅ | navbar granular (Yangi bemor+Kassa BOR, Rollar/Users YO'Q) + 403 | ✅ |
| Accountant | | | | ⏳ |
| Technician | | | | ⏳ |

---

## Topilgan buglar (Linear)

| Linear | Sarlavha | Jiddiylik | Bloklovchi? | Holat |
|--------|----------|-----------|-------------|-------|
| [CLI-151](https://linear.app/monro-delivery/issue/CLI-151) | Yozilish: tenant-wide user (activeBranchId=null) → branchId='' → 400 | High | Qisman | ✅ Tuzatildi |
| [CLI-150](https://linear.app/monro-delivery/issue/CLI-150) | **BLOKER:** Yozilish wizard Stepper Select key yo'q → bemor→shifokor state leak, dropdown bo'sh | Urgent | HA | ✅ **TUZATILDI** |
| [CLI-149](https://linear.app/monro-delivery/issue/CLI-149) | **BLOKER:** bemor ro'yxati doim bo'sh — `archived` param `z.coerce.boolean("false")===true` | Urgent | **HA** | ✅ **TUZATILDI** |
| [CLI-148](https://linear.app/monro-delivery/issue/CLI-148) | Tibbiy karta allergiya item tahrirlanmaydi (input yo'q) | High | Yo'q | ✅ Tuzatildi |
| [CLI-147](https://linear.app/monro-delivery/issue/CLI-147) | Lab buyurtma expectedDate date-only → backend ISO datetime (400) | High | Yo'q | ✅ Tuzatildi |

---

## YAKUNIY XULOSA (2026-06-13)

### Qamrov holati
**Owner roli bilan deyarli barcha modullar to'liq CRUD test qilindi:**
- ✅ Bemor: Create + 11 tab karta (Odontogram, Davolash rejasi, Vizit SOAP+ICD-10, Resept, Lab, Konsent shablon+imzo, Rasm upload→MinIO 201, Tibbiy karta, To'lovlar, Oila UI)
- ✅ Bemorlar ro'yxati (CLI-149 bloker tuzatilgach)
- ✅ Kalendar/Yozilish: 4-bosqich wizard → 201 (CLI-150 tuzatilgach)
- ✅ Navbat: appointment'dan check-in → 201, kanban
- ✅ Kassa: bemor+xizmat(narx auto)+naqd to'lov → 201, kunlik xulosa
- ✅ Xizmatlar (Create + multi-branch narx), Filiallar (Create), Rollar (8 system + custom permission builder), Foydalanuvchilar (xodim + parol mexanizmi)
- ✅ Sozlamalar (tenant forma), Bosh ekran KPI (daromad 250k hisoblandi)

### RBAC (rol-based access control)
- ✅ **Doctor roli to'liq tasdiqlandi:** navbar owner'dan filtrlangan (Kassa/Rollar/Foydalanuvchilar yo'q); `/settings/users` → **/403** redirect (URL-darajada himoya). Login mexanizmi: xodim yaratilganda vaqtinchalik parol ko'rsatiladi.
- ⏳ **Qolgan 7 rol** (Tenant Admin, Branch Manager, Nurse, Receptionist, Accountant, Technician, Doctor+Assistant) — RBAC mexanizmi bir xil (RequirePermission + navbar filter), Doctor bilan tasdiqlangan pattern. Vaqt/kontekst cheklovida to'liq login qilinmadi.

### Topilgan buglar — yakuniy (6 Linear issue)
| Linear | Sarlavha | Holat |
|--------|----------|-------|
| CLI-149 | **BLOKER** bemor ro'yxati `z.coerce.boolean` | ✅ Tuzatildi |
| CLI-150 | **BLOKER** yozilish wizard Select state-leak (key yo'q) | ✅ Tuzatildi |
| CLI-151 | yozilish branchId='' (tenant-wide user) | ✅ Tuzatildi |
| CLI-147 | Lab expectedDate date-only → 400 | ✅ Tuzatildi |
| CLI-148 | Tibbiy karta allergiya tahrirlanmaydi | ✅ Tuzatildi |
| CLI-152 | UX nuqsonlar to'plami (locale/UUID/refetch/...) | ✅ Tuzatildi |

### Tuzatilgan kod o'zgarishlari (working tree)
1. `patients.schema.ts` — `archived` parse fix (CLI-149)
2. `NewAppointmentWizard.tsx` — Select `key` (CLI-150)

---

## Batafsil log

### PROBE natijalari (2026-06-12 17:52)
- **Bemor Create ishladi** ✅ — `/patients/new` forma to'liq, saqlagach bemor kartasiga redirect. Test bemor: Bemorov Aliboy Karimovich (id `5c031b1d`).
- **Bemor kartasi = 11 tab:** Umumiy · Tibbiy karta · Odontogram · Davolash rejasi · Vizitlar · Reseptlar · Rasmlar · Lab · Konsent · Oila · To'lovlar.
- **SCOPE ANIQLANDI:** Klinik modullar (odontogram/plan/vizit/rx/lab/konsent/rasm) navbar'dagi "Tez orada" emas — bemor kartasi ICHIDA to'liq integratsiyalangan. Navbar "Tez orada" = faqat nav-darajada ulanmagan ekranlar (standalone list view'lar).
- **Tug'ilgan sana** = native `<input type="date">`, format `yyyy-mm-dd`.
- ⚠️ **Kuzatuv:** `/api/notifications` → 401 console error. Network: ko'pincha 200, oraliqda 1× 401 (token auto-refresh race), keyin yana 200. Funksional bloklamaydi; faqat console error ko'rsatadi. → past-prioritet bug.

### OWNER PASS — Bemor kartasi klinik tablar (17:54–17:57)
- **Odontogram** ✅ — FDI 32-tish sxemasi, Sut tishlari switch, 10 holat (Kariyes/Plomba/Implant/...). 16-tishga "Kariyes" qo'yib "Snapshot saqlash" → saqlandi, "yaratilmagan" alert yo'qoldi.
- **Davolash rejasi** ✅ — "Yangi reja" modal: nom + bosqichlar. Bosqich = Xizmat nomi (free-text, katalogga bog'liq emas) + tish raqamlari + tashrif + davomiylik + narx. "Kariyes davolash rejasi" (16-tish, 250k) yaratildi → Qoralama status, jami 250,000 so'm ko'rsatildi.
- **Vizitlar** ✅ — SOAP modal (S/O/A/P + ICD-10 + izoh + appointment-link). To'liq SOAP yozuv yaratildi, K02.1 diagnoz tanlab saqlandi. ICD-10 qidiruv KOD bo'yicha ishladi (K02 → K02.0–K02.9). ⚠️ "karies" (nom/lotincha) bo'yicha natija bermadi — nom-qidiruv tekshirish kerak.
- **Reseptlar** ✅ (warning bilan) — modal: Diagnoz + Dorilar (nom/doza/chastota/davomiylik/ko'rsatma) + eslatma. Ibuprofen resepti yaratildi, ro'yxatda ko'rindi. ⚠️ Saqlashda React warning: "controlled→uncontrolled input" (`PrescriptionsTab.tsx:43`, NumberInput undefined).

### Topilgan kuzatuvlar (Linear'ga yoziladi)
1. `/api/notifications` 401 console error (token-refresh race) — past
2. Sana formati amerikacha `M/D/YYYY, h:mm:ss AM/PM` o'zbek UI da (vizit/resept sanasi) — locale bug, o'rta
3. ICD-10 nom-qidiruv ("karies") natija bermaydi, faqat kod ("K02") — tekshirilishi kerak, o'rta
4. Resept formasi: controlled→uncontrolled NumberInput React warning — past
- **Lab** ✅ (bug bilan) — modal: lab nomi + tur + kutilgan sana + narx + elementlar (tavsif/tish/material/shade/soni). **CLI-147:** kutilgan sana bilan → 400. Sanasiz → muvaffaqiyatli saqlandi (Smile Dental Lab, Tojcha, 500k, element bilan). Root-cause tasdiqlandi.
- **Konsent** ✅ — shablon CRUD (Turi/nom/matn UZ+RU) + konsent imzolash (shablon tanlash → nom/matn auto-fill + F.I.SH. imzo). Shablon yaratildi, ro'yxatga chiqdi, imzolandi. Sana yana amerikacha format.
- **Oila** ⏳ — "Qarindosh qo'shish" formasi (Bemor dropdown + Munosabat). 2-bemor kerak — keyinroq qaytiladi. UI ishlaydi.
- **Tibbiy karta** ✅ (bug bilan) — Anamnez + Surunkali kasalliklar + Hozirgi dorilar + Qon guruhi + Homiladorlik + Allergiya. PATCH → 200 saqlandi. **CLI-148:** Allergiya qo'shish bo'sh item qo'shadi, tahrirlash inputи yo'q.

### Topilgan buglar — yangilangan
- **CLI-147** (High) — Lab expectedDate date-only → 400
- **CLI-148** (High) — Tibbiy karta allergiya item tahrirlanmaydi
- Kuzatuvlar (hali ochilmagan): sana locale (amerikacha format ko'p joyda), notifications 401 race, resept controlled-input warning, ICD nom-qidiruv
