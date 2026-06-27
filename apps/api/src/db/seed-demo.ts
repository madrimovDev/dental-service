/**
 * Demo-data seed — "Demo Klinika" tenant uchun har ekranga real ko'rinishli ma'lumot.
 *
 * Maqsad: 5–10 satr har muhim tenant-scoped jadvalga, butun klinika oqimini
 * (bemor → yozilish → vizit → davolash rejasi → kassa → ombor → payroll → recall)
 * sinab ko'rish uchun.
 *
 * RLS: bu skript `DATABASE_ADMIN_URL` (`dental` super/bypassrls roli) orqali
 * ulanadi → FORCE ROW LEVEL SECURITY chetlanadi. Shunga qaramay har insert'da
 * `tenant_id` aniq beriladi (tenant-scope kafolati). Boshqa tenantlarga TEGILMAYDI.
 *
 * Idempotent: har guruh insert'idan oldin shu tenant uchun mavjud satrlar
 * tekshiriladi; bor bo'lsa o'sha guruh o'tkazib yuboriladi (qayta-ishga xavfsiz).
 *
 * Ishga tushirish: `bun run db:seed:demo` (apps/api ichidan) yoki root'dan
 * `bun --filter @dental/api db:seed:demo`.
 */
import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  consentForms,
  consentTemplates,
  doctorSchedules,
  doctorTimeOff,
  expenseCategories,
  expenses,
  labOrders,
  medicalRecords,
  notifications,
  patientEmergencyContacts,
  patientImages,
  patientRelatives,
  patients,
  payrollLines,
  payrollRuns,
  prescriptions,
  queueTickets,
  recallLogs,
  recalls,
  serviceCategories,
  serviceMaterials,
  servicePrices,
  services,
  staffProfiles,
  stockBatches,
  stockItems,
  stockMovements,
  toothCharts,
  toothStates,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/password.ts';
import { createAdminDb } from './client.ts';

// ── Fixed tenant context (register-tenant orqali allaqachon yaratilgan) ──
const TENANT_ID = '296f3092-eb66-4a2e-946b-c94ef32cfc6e';
const OWNER_USER_ID = '0a9514e4-0064-4a23-ab2c-bae9d1973266';
const MAIN_BRANCH_ID = 'fc39566d-017c-4ddb-bd4c-57e7a45f303d';

// System role templates (shu tenantda allaqachon seed qilingan)
const ROLE = {
  admin: 'b8300cfc-5bb0-4f52-8433-bf8579e9f317',
  manager: '09de06a2-920c-4f25-92e2-8f70315ac9e2',
  doctor: '1bf4301a-802f-418e-8ebe-1c0ebe14b20f',
  doctorAssistant: '31203804-65f5-4c1d-b3e1-18e73b42526e',
  nurse: '93f6c7f3-6d0c-4b4d-ac01-1768ee689ebf',
  receptionist: '5102963a-efdf-453a-b9d4-3a1b18dfadd2',
  accountant: '35207739-0a40-4ab1-a789-e51625da5f0b',
  technician: '7075869d-cc5b-4bc7-9a3e-82f98be06b31',
};

const STAFF_PASSWORD = 'DemoStaff2026'; // 12+ belgi (parol validatori min 12 talab qiladi)

// Deterministik UUID'lar — qayta-ishga / o'zaro FK uchun
const id = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;

const now = new Date();
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);
const atHour = (date: Date, h: number, m = 0) => {
  const x = new Date(date);
  x.setHours(h, m, 0, 0);
  return x;
};
const dateStr = (date: Date) => date.toISOString().slice(0, 10);

const { db, client } = createAdminDb();

// biome-ignore lint/suspicious/noExplicitAny: generic tenant-scoped count helper
async function count(table: any): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.tenantId, TENANT_ID));
  return row?.c ?? 0;
}

async function seed() {
  console.log(`Seeding demo data → tenant ${TENANT_ID}\n`);

  // ─────────────────────────── 1. BRANCHES (1 qo'shimcha) ───────────────────────────
  const BRANCH2_ID = id(1);
  if ((await count(branches)) < 2) {
    await db
      .insert(branches)
      .values({
        id: BRANCH2_ID,
        tenantId: TENANT_ID,
        name: 'Chilonzor filiali',
        address: "Toshkent sh., Chilonzor t., Bunyodkor ko'chasi 12",
        phone: '+998712001020',
        workHours: {
          mon: { open: '09:00', close: '18:00' },
          tue: { open: '09:00', close: '18:00' },
          wed: { open: '09:00', close: '18:00' },
          thu: { open: '09:00', close: '18:00' },
          fri: { open: '09:00', close: '18:00' },
          sat: { open: '09:00', close: '14:00' },
          sun: null,
        },
      })
      .onConflictDoNothing();
    console.log('  ✓ branches: +1 (Chilonzor filiali)');
  } else {
    console.log('  · branches: already seeded, skip');
  }

  // ─────────────────────────── 2. USERS + ASSIGNMENTS + STAFF PROFILES ───────────────────────────
  // 6 xodim: 2 doktor, 1 hamshira, 1 registrator, 1 buxgalter, 1 menejer
  const passwordHash = await hashPassword(STAFF_PASSWORD);
  const staff = [
    {
      uid: id(10),
      fullName: 'Doktor Sardor Aliyev',
      phone: '+998901112201',
      email: 'sardor.aliyev@demo-klinika.uz',
      roleId: ROLE.doctor,
      specialty: 'Terapevt-stomatolog',
      baseSalary: '6000000',
      commissionPercent: '15',
      branchId: MAIN_BRANCH_ID,
    },
    {
      uid: id(11),
      fullName: 'Doktor Gulnora Yusupova',
      phone: '+998901112202',
      email: 'gulnora.yusupova@demo-klinika.uz',
      roleId: ROLE.doctor,
      specialty: 'Ortoped-stomatolog',
      baseSalary: '7000000',
      commissionPercent: '18',
      branchId: MAIN_BRANCH_ID,
    },
    {
      uid: id(12),
      fullName: 'Hamshira Madina Tursunova',
      phone: '+998901112203',
      email: 'madina.tursunova@demo-klinika.uz',
      roleId: ROLE.nurse,
      specialty: 'Stomatologiya hamshirasi',
      baseSalary: '3500000',
      commissionPercent: '0',
      branchId: MAIN_BRANCH_ID,
    },
    {
      uid: id(13),
      fullName: 'Registrator Nilufar Qodirova',
      phone: '+998901112204',
      email: 'nilufar.qodirova@demo-klinika.uz',
      roleId: ROLE.receptionist,
      specialty: null,
      baseSalary: '3000000',
      commissionPercent: '0',
      branchId: MAIN_BRANCH_ID,
    },
    {
      uid: id(14),
      fullName: 'Buxgalter Jasur Ergashev',
      phone: '+998901112205',
      email: 'jasur.ergashev@demo-klinika.uz',
      roleId: ROLE.accountant,
      specialty: null,
      baseSalary: '4500000',
      commissionPercent: '0',
      branchId: null, // tenant-wide
    },
    {
      uid: id(15),
      fullName: 'Menejer Kamola Saidova',
      phone: '+998901112206',
      email: 'kamola.saidova@demo-klinika.uz',
      roleId: ROLE.manager,
      specialty: null,
      baseSalary: '5500000',
      commissionPercent: '0',
      branchId: MAIN_BRANCH_ID,
    },
  ];

  if ((await count(userAssignments)) < 1) {
    for (const s of staff) {
      await db
        .insert(users)
        .values({
          id: s.uid,
          phone: s.phone,
          email: s.email,
          passwordHash,
          fullName: s.fullName,
          preferredLanguage: 'uz',
        })
        .onConflictDoNothing();
      await db
        .insert(userAssignments)
        .values({
          userId: s.uid,
          tenantId: TENANT_ID,
          branchId: s.branchId,
          roleId: s.roleId,
          isActive: true,
        })
        .onConflictDoNothing();
      await db
        .insert(staffProfiles)
        .values({
          tenantId: TENANT_ID,
          userId: s.uid,
          specialty: s.specialty,
          employmentStatus: 'active',
          startedAt: dateStr(daysFromNow(-400)),
          baseSalary: s.baseSalary,
          commissionPercent: s.commissionPercent,
        })
        .onConflictDoNothing();
    }
    // Owner uchun ham staff_profile (dashboard'da ko'rinsin)
    await db
      .insert(staffProfiles)
      .values({
        tenantId: TENANT_ID,
        userId: OWNER_USER_ID,
        specialty: 'Klinika rahbari',
        employmentStatus: 'active',
        baseSalary: '0',
        commissionPercent: '0',
      })
      .onConflictDoNothing();
    console.log(
      `  ✓ users/assignments/staff_profiles: +${staff.length} (parol: ${STAFF_PASSWORD})`,
    );
  } else {
    console.log('  · staff: already seeded, skip');
  }

  const DOC1 = id(10); // Sardor
  const DOC2 = id(11); // Gulnora

  // ─────────────────────────── 3. DOCTOR SCHEDULES + TIME OFF ───────────────────────────
  if ((await count(doctorSchedules)) < 1) {
    for (const docId of [DOC1, DOC2]) {
      for (const weekday of [1, 2, 3, 4, 5]) {
        await db.insert(doctorSchedules).values({
          tenantId: TENANT_ID,
          branchId: MAIN_BRANCH_ID,
          doctorId: docId,
          weekday,
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          isActive: true,
        });
      }
    }
    await db.insert(doctorTimeOff).values({
      tenantId: TENANT_ID,
      doctorId: DOC2,
      branchId: MAIN_BRANCH_ID,
      type: 'vacation',
      startAt: atHour(daysFromNow(14), 0),
      endAt: atHour(daysFromNow(21), 23),
      reason: "Yillik ta'til",
      createdBy: OWNER_USER_ID,
    });
    console.log('  ✓ doctor_schedules: +10, doctor_time_off: +1');
  } else {
    console.log('  · doctor_schedules: already seeded, skip');
  }

  // ─────────────────────────── 4. SERVICES + PRICES + (materials later) ───────────────────────────
  const svc = [
    {
      sid: id(100),
      code: 'KONS',
      nameUz: 'Konsultatsiya',
      nameRu: 'Консультация',
      category: 'Diagnostika',
      price: '50000',
      dur: 20,
    },
    {
      sid: id(101),
      code: 'PLOMBA',
      nameUz: 'Tish plombasi (kompozit)',
      nameRu: 'Пломба зуба (композит)',
      category: 'Terapiya',
      price: '350000',
      dur: 45,
    },
    {
      sid: id(102),
      code: 'KANAL',
      nameUz: 'Kanal davolash (1 kanal)',
      nameRu: 'Лечение канала (1 канал)',
      category: 'Terapiya',
      price: '600000',
      dur: 60,
    },
    {
      sid: id(103),
      code: 'TOZALASH',
      nameUz: 'Professional tish tozalash',
      nameRu: 'Профессиональная чистка',
      category: 'Gigiyena',
      price: '250000',
      dur: 40,
    },
    {
      sid: id(104),
      code: 'OLISH',
      nameUz: 'Tish olish (oddiy)',
      nameRu: 'Удаление зуба (простое)',
      category: 'Xirurgiya',
      price: '200000',
      dur: 30,
    },
    {
      sid: id(105),
      code: 'KORONKA',
      nameUz: 'Metallokeramika koronka',
      nameRu: 'Металлокерамическая коронка',
      category: 'Ortopediya',
      price: '1200000',
      dur: 60,
    },
    {
      sid: id(106),
      code: 'IMPLANT',
      nameUz: 'Implant o‘rnatish',
      nameRu: 'Установка импланта',
      category: 'Implantologiya',
      price: '4000000',
      dur: 90,
    },
    {
      sid: id(107),
      code: 'OQARTIRISH',
      nameUz: 'Tish oqartirish',
      nameRu: 'Отбеливание зубов',
      category: 'Estetika',
      price: '800000',
      dur: 60,
    },
    {
      sid: id(108),
      code: 'BREKET',
      nameUz: 'Breket tizimi o‘rnatish',
      nameRu: 'Установка брекет-системы',
      category: 'Ortodontiya',
      price: '3500000',
      dur: 90,
    },
    {
      sid: id(109),
      code: 'RENTGEN',
      nameUz: 'Pritsel rentgen',
      nameRu: 'Прицельный снимок',
      category: 'Diagnostika',
      price: '40000',
      dur: 15,
    },
  ];
  if ((await count(services)) < 1) {
    // Insert distinct categories first (services.category_id FK requires them)
    const uniqueCatNames = [...new Set(svc.map((s) => s.category))];
    await db
      .insert(serviceCategories)
      .values(uniqueCatNames.map((name) => ({ tenantId: TENANT_ID, name })))
      .onConflictDoNothing();
    const catRows = await db
      .select({ id: serviceCategories.id, name: serviceCategories.name })
      .from(serviceCategories)
      .where(eq(serviceCategories.tenantId, TENANT_ID));
    const catId = Object.fromEntries(catRows.map((r) => [r.name, r.id]));

    for (const s of svc) {
      await db.insert(services).values({
        id: s.sid,
        tenantId: TENANT_ID,
        code: s.code,
        nameUz: s.nameUz,
        nameRu: s.nameRu,
        categoryId: catId[s.category],
        durationMinutes: s.dur,
        isActive: true,
      });
      // Narx — har ikki filial uchun
      for (const br of [MAIN_BRANCH_ID, BRANCH2_ID]) {
        await db.insert(servicePrices).values({
          serviceId: s.sid,
          branchId: br,
          price: s.price,
          currency: 'UZS',
          validFrom: dateStr(daysFromNow(-400)),
        });
      }
    }
    console.log(
      `  ✓ service_categories: +${uniqueCatNames.length}, services: +${svc.length}, service_prices: +${svc.length * 2}`,
    );
  } else {
    console.log('  · services: already seeded, skip');
  }

  // ─────────────────────────── 5. STOCK ITEMS + BATCHES + MOVEMENTS ───────────────────────────
  const stock = [
    {
      iid: id(200),
      name: 'Kompozit plomba materiali',
      unit: 'shprits',
      qty: '45',
      min: '10',
      cost: '85000',
    },
    {
      iid: id(201),
      name: 'Anesteziya (Ultracain)',
      unit: 'ampula',
      qty: '120',
      min: '30',
      cost: '12000',
    },
    {
      iid: id(202),
      name: 'Bir martalik qo‘lqop',
      unit: 'quti',
      qty: '8',
      min: '15',
      cost: '45000',
    }, // below threshold
    {
      iid: id(203),
      name: 'Steril marlya salfetka',
      unit: 'paket',
      qty: '200',
      min: '50',
      cost: '15000',
    },
    {
      iid: id(204),
      name: 'Endodontik fayl (K-file)',
      unit: 'dona',
      qty: '60',
      min: '20',
      cost: '8000',
    },
    {
      iid: id(205),
      name: 'Metallokeramika qotishmasi',
      unit: 'gramm',
      qty: '300',
      min: '100',
      cost: '25000',
    },
    {
      iid: id(206),
      name: 'Implant (titan, Osstem)',
      unit: 'dona',
      qty: '12',
      min: '5',
      cost: '1500000',
    },
    { iid: id(207), name: 'Bor (almaz, turli)', unit: 'dona', qty: '90', min: '25', cost: '6000' },
  ];
  if ((await count(stockItems)) < 1) {
    for (const it of stock) {
      await db.insert(stockItems).values({
        id: it.iid,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        name: it.name,
        unit: it.unit,
        quantity: it.qty,
        minThreshold: it.min,
      });
      await db.insert(stockBatches).values({
        tenantId: TENANT_ID,
        itemId: it.iid,
        supplierName: 'MedDental Supply',
        batchNumber: `B-${it.iid.slice(-4)}-2026`,
        expiryDate: daysFromNow(365),
        costPerUnit: it.cost,
        qtyReceived: it.qty,
      });
      await db.insert(stockMovements).values({
        tenantId: TENANT_ID,
        itemId: it.iid,
        type: 'in',
        quantity: it.qty,
        reason: 'Boshlang‘ich kelib tushish',
        createdBy: OWNER_USER_ID,
      });
    }
    // Bir nechta 'out' harakat (sarflanish)
    await db.insert(stockMovements).values({
      tenantId: TENANT_ID,
      itemId: id(201),
      type: 'out',
      quantity: '5',
      reason: 'Vizitlarda sarflandi',
      createdBy: DOC1,
    });
    console.log(
      `  ✓ stock_items: +${stock.length}, stock_batches: +${stock.length}, stock_movements: +${stock.length + 1}`,
    );
  } else {
    console.log('  · stock_items: already seeded, skip');
  }

  // service_materials (xizmat → material BOM)
  if ((await count(serviceMaterials)) < 1) {
    const bom = [
      { svc: id(101), item: id(200), qty: '1' }, // plomba → kompozit
      { svc: id(101), item: id(201), qty: '1' }, // plomba → anesteziya
      { svc: id(102), item: id(204), qty: '3' }, // kanal → fayl
      { svc: id(102), item: id(201), qty: '1' },
      { svc: id(105), item: id(205), qty: '8' }, // koronka → qotishma
      { svc: id(106), item: id(206), qty: '1' }, // implant → implant
      { svc: id(104), item: id(201), qty: '2' }, // olish → anesteziya
    ];
    for (const b of bom) {
      await db.insert(serviceMaterials).values({
        tenantId: TENANT_ID,
        serviceId: b.svc,
        itemId: b.item,
        qtyPerService: b.qty,
      });
    }
    console.log(`  ✓ service_materials: +${bom.length}`);
  } else {
    console.log('  · service_materials: already seeded, skip');
  }

  // ─────────────────────────── 6. PATIENTS + medical/emergency/relatives ───────────────────────────
  const pts = [
    {
      pid: id(300),
      fullName: 'Akmal Karimov',
      dob: '1988-03-12',
      gender: 'male' as const,
      phone: '+998901230001',
      source: 'Tavsiya',
    },
    {
      pid: id(301),
      fullName: 'Dilnoza Rahimova',
      dob: '1995-07-25',
      gender: 'female' as const,
      phone: '+998901230002',
      source: 'Instagram',
    },
    {
      pid: id(302),
      fullName: 'Bobur Toshmatov',
      dob: '1979-11-03',
      gender: 'male' as const,
      phone: '+998901230003',
      source: 'Google',
    },
    {
      pid: id(303),
      fullName: 'Sevara Aliyeva',
      dob: '2001-01-19',
      gender: 'female' as const,
      phone: '+998901230004',
      source: 'Tavsiya',
    },
    {
      pid: id(304),
      fullName: 'Jahongir Umarov',
      dob: '1992-05-30',
      gender: 'male' as const,
      phone: '+998901230005',
      source: 'Telegram',
    },
    {
      pid: id(305),
      fullName: 'Malika Yo‘ldosheva',
      dob: '1985-09-14',
      gender: 'female' as const,
      phone: '+998901230006',
      source: "O'tib ketayotgan",
    },
    {
      pid: id(306),
      fullName: 'Oybek Nazarov',
      dob: '1998-12-08',
      gender: 'male' as const,
      phone: '+998901230007',
      source: 'Instagram',
    },
    {
      pid: id(307),
      fullName: 'Zarina Sobirova',
      dob: '1990-04-22',
      gender: 'female' as const,
      phone: '+998901230008',
      source: 'Tavsiya',
    },
    {
      pid: id(308),
      fullName: 'Rustam Egamberdiyev',
      dob: '1975-08-17',
      gender: 'male' as const,
      phone: '+998901230009',
      source: 'Google',
    },
    {
      pid: id(309),
      fullName: 'Nigora Xolmatova',
      dob: '2003-02-11',
      gender: 'female' as const,
      phone: '+998901230010',
      source: 'Instagram',
    },
  ];
  if ((await count(patients)) < 1) {
    for (const p of pts) {
      await db.insert(patients).values({
        id: p.pid,
        tenantId: TENANT_ID,
        fullName: p.fullName,
        dateOfBirth: p.dob,
        gender: p.gender,
        phone: p.phone,
        address: 'Toshkent sh., Yunusobod t.',
        source: p.source,
        tags: p.gender === 'female' ? ['VIP'] : [],
        insurance:
          p.pid === id(300)
            ? {
                provider: 'Gross Insurance',
                policyNumber: 'POL-2026-0012',
                coverageType: 'dental',
                isActive: true,
              }
            : null,
      });
    }
    // medical_records (har bemorga)
    for (const p of pts) {
      await db.insert(medicalRecords).values({
        tenantId: TENANT_ID,
        patientId: p.pid,
        anamnez:
          p.pid === id(302)
            ? "Gipertoniya bor, muntazam dori qabul qiladi. Yurak shikoyatlari yo'q."
            : "Umumiy ahvol qoniqarli. Surunkali kasalliklar yo'q.",
        chronicConditions: p.pid === id(302) ? ['Gipertoniya'] : [],
        currentMedications: p.pid === id(302) ? ['Enalapril 10mg'] : [],
        allergies:
          p.pid === id(301)
            ? [
                {
                  type: 'anesthetic',
                  substance: 'Lidokain',
                  severity: 'moderate',
                  notes: 'Toshma chiqqan',
                },
              ]
            : [],
        bloodType: ['A+', 'B+', 'O+', 'AB+'][Math.floor(Math.random() * 4)],
        pregnancyStatus: p.gender === 'female' && p.pid === id(303) ? 'pregnant' : 'not_applicable',
        lastUpdatedBy: DOC1,
      });
    }
    // emergency contacts (ba'zilarga)
    for (const p of pts.slice(0, 6)) {
      await db.insert(patientEmergencyContacts).values({
        tenantId: TENANT_ID,
        patientId: p.pid,
        name: `Qarindosh — ${p.fullName.split(' ')[0]}`,
        phone: `+99890${7000000 + Number(p.pid.slice(-4))}`,
        relationship: p.gender === 'male' ? 'Rafiqasi' : 'Turmush o‘rtog‘i',
        isPrimary: true,
      });
    }
    // patient_relatives (Akmal & Dilnoza er-xotin; Sevara & Malika)
    await db.insert(patientRelatives).values([
      {
        tenantId: TENANT_ID,
        patientId: id(300),
        relativePatientId: id(301),
        relationship: 'Turmush o‘rtog‘i',
      },
      { tenantId: TENANT_ID, patientId: id(303), relativePatientId: id(305), relationship: 'Ona' },
    ]);
    console.log(
      `  ✓ patients: +${pts.length}, medical_records: +${pts.length}, emergency_contacts: +6, relatives: +2`,
    );
  } else {
    console.log('  · patients: already seeded, skip');
  }

  // ─────────────────────────── 7. APPOINTMENTS + QUEUE ───────────────────────────
  const apptStatuses = [
    'completed',
    'completed',
    'completed',
    'confirmed',
    'scheduled',
    'scheduled',
    'in_progress',
    'no_show',
    'cancelled',
    'completed',
  ] as const;
  if ((await count(appointments)) < 1) {
    for (const [i, p] of pts.entries()) {
      const dayOffset = i - 4;
      const start = atHour(daysFromNow(dayOffset), 9 + (i % 6), (i % 2) * 30);
      const doc = i % 2 === 0 ? DOC1 : DOC2;
      const status = apptStatuses[i];
      const apptSvc = svc[(i % 5) + 1];
      if (!apptSvc) continue;
      await db
        .insert(appointments)
        .values({
          id: id(400 + i),
          tenantId: TENANT_ID,
          branchId: MAIN_BRANCH_ID,
          patientId: p.pid,
          doctorId: doc,
          startTime: start,
          endTime: new Date(start.getTime() + 45 * 60_000),
          status,
          serviceIds: [apptSvc.sid],
          notes: status === 'cancelled' ? 'Bemor bekor qildi' : null,
          cancellationReason: status === 'cancelled' ? 'Bemor kela olmadi' : null,
          createdBy: id(13),
        })
        .onConflictDoNothing();
    }
    console.log(`  ✓ appointments: +${pts.length}`);
  } else {
    console.log('  · appointments: already seeded, skip');
  }

  // Bugungi navbat (queue) — 5 ta
  if ((await count(queueTickets)) < 1) {
    const queueStatuses = ['done', 'done', 'in_progress', 'waiting', 'waiting'] as const;
    for (let i = 0; i < 5; i++) {
      const qPat = pts[i];
      const qSvc = svc[(i % 5) + 1];
      if (!qPat || !qSvc) continue;
      await db.insert(queueTickets).values({
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: qPat.pid,
        serviceId: qSvc.sid,
        doctorId: i % 2 === 0 ? DOC1 : DOC2,
        queueNumber: i + 1,
        status: queueStatuses[i],
        calledAt: i < 3 ? atHour(now, 9 + i) : null,
        finishedAt: i < 2 ? atHour(now, 9 + i, 40) : null,
      });
    }
    console.log('  ✓ queue_tickets: +5');
  } else {
    console.log('  · queue_tickets: already seeded, skip');
  }

  // ─────────────────────────── 8. TREATMENT PLANS + STAGES ───────────────────────────
  const PLAN1 = id(500);
  const PLAN2 = id(501);
  const PLAN3 = id(502);
  const STAGE = { a1: id(510), a2: id(511), a3: id(512), b1: id(513), b2: id(514), c1: id(515) };
  if ((await count(treatmentPlans)) < 1) {
    await db.insert(treatmentPlans).values([
      {
        id: PLAN1,
        tenantId: TENANT_ID,
        patientId: id(300),
        doctorId: DOC1,
        title: 'Kompleks terapevtik davolash',
        totalCost: '1550000',
        totalVisits: 3,
        status: 'in_progress',
        notes: 'Bir nechta tishda karies, 36-tish kanal davolash kerak.',
      },
      {
        id: PLAN2,
        tenantId: TENANT_ID,
        patientId: id(302),
        doctorId: DOC2,
        title: 'Protezlash (metallokeramika)',
        totalCost: '2400000',
        totalVisits: 4,
        status: 'accepted',
        consentSignedAt: daysFromNow(-2),
        notes: '16 va 26 tishlarga koronka.',
      },
      {
        id: PLAN3,
        tenantId: TENANT_ID,
        patientId: id(304),
        doctorId: DOC1,
        title: 'Implantatsiya rejasi',
        totalCost: '4000000',
        totalVisits: 2,
        status: 'presented',
        notes: '46-tish o‘rniga implant.',
      },
    ]);
    await db.insert(treatmentStages).values([
      // Plan 1
      {
        id: STAGE.a1,
        treatmentPlanId: PLAN1,
        sequence: 1,
        serviceId: id(101),
        serviceName: 'Tish plombasi (kompozit)',
        toothNumbers: [16, 17],
        estimatedVisits: 1,
        cost: '700000',
        status: 'completed',
        acceptance: 'accepted',
        completedAt: daysFromNow(-4),
      },
      {
        id: STAGE.a2,
        treatmentPlanId: PLAN1,
        sequence: 2,
        serviceId: id(102),
        serviceName: 'Kanal davolash (1 kanal)',
        toothNumbers: [36],
        estimatedVisits: 1,
        cost: '600000',
        status: 'in_progress',
        acceptance: 'accepted',
      },
      {
        id: STAGE.a3,
        treatmentPlanId: PLAN1,
        sequence: 3,
        serviceId: id(103),
        serviceName: 'Professional tish tozalash',
        toothNumbers: [],
        estimatedVisits: 1,
        cost: '250000',
        status: 'pending',
        acceptance: 'accepted',
      },
      // Plan 2
      {
        id: STAGE.b1,
        treatmentPlanId: PLAN2,
        sequence: 1,
        serviceId: id(105),
        serviceName: 'Metallokeramika koronka',
        toothNumbers: [16],
        estimatedVisits: 2,
        cost: '1200000',
        status: 'pending',
        acceptance: 'accepted',
      },
      {
        id: STAGE.b2,
        treatmentPlanId: PLAN2,
        sequence: 2,
        serviceId: id(105),
        serviceName: 'Metallokeramika koronka',
        toothNumbers: [26],
        estimatedVisits: 2,
        cost: '1200000',
        status: 'pending',
        acceptance: 'accepted',
      },
      // Plan 3
      {
        id: STAGE.c1,
        treatmentPlanId: PLAN3,
        sequence: 1,
        serviceId: id(106),
        serviceName: 'Implant o‘rnatish',
        toothNumbers: [46],
        estimatedVisits: 2,
        cost: '4000000',
        status: 'pending',
        acceptance: 'proposed',
      },
    ]);
    console.log('  ✓ treatment_plans: +3, treatment_stages: +6');
  } else {
    console.log('  · treatment_plans: already seeded, skip');
  }

  // ─────────────────────────── 9. VISIT NOTES (SOAP) + TOOTH CHARTS ───────────────────────────
  const VN1 = id(600);
  const VN2 = id(601);
  const VN3 = id(602);
  if ((await count(visitNotes)) < 1) {
    await db.insert(visitNotes).values([
      {
        id: VN1,
        tenantId: TENANT_ID,
        patientId: id(300),
        doctorId: DOC1,
        appointmentId: id(400),
        stageId: STAGE.a1,
        visitDate: daysFromNow(-4),
        subjective: 'Bemor 16 va 17 tishlarda sovuq/issiqdan og‘riq sezishini aytmoqda.',
        objective:
          '16, 17 tishlarda o‘rtacha chuqurlikdagi karies. Perkussiya manfiy. EOD me‘yorida.',
        plan: 'Kariesni tozalab kompozit plomba qo‘yildi. Gigiyena bo‘yicha tavsiyalar berildi.',
        performedServices: [id(101)],
        freeNotes: 'Bemor davolanishdan mamnun.',
      },
      {
        id: VN2,
        tenantId: TENANT_ID,
        patientId: id(302),
        doctorId: DOC2,
        appointmentId: id(402),
        visitDate: daysFromNow(-2),
        subjective: 'Protezlash uchun murojaat. 16, 26 tishlar oldindan davolangan.',
        objective: 'Tishlar koronka ostiga tayyorlangan. Yumshoq to‘qimalar sog‘lom.',
        plan: 'Qoliplar olindi, laboratoriyaga yuborildi. Vaqtinchalik koronka qo‘yildi.',
        performedServices: [id(105)],
      },
      {
        id: VN3,
        tenantId: TENANT_ID,
        patientId: id(301),
        doctorId: DOC1,
        visitDate: daysFromNow(-1),
        subjective: 'Profilaktik ko‘rik va tish tozalash uchun keldi.',
        objective: 'Yumshoq va qattiq tish karashlari mavjud. Milk yallig‘lanishi yengil.',
        plan: 'Professional tozalash bajarildi. 6 oydan keyin qayta ko‘rik.',
        performedServices: [id(103)],
      },
    ]);
    // tooth charts + states
    const CHART1 = id(610);
    const CHART2 = id(611);
    await db.insert(toothCharts).values([
      {
        id: CHART1,
        tenantId: TENANT_ID,
        patientId: id(300),
        visitNoteId: VN1,
        notes: 'Boshlang‘ich odontogramma',
        createdBy: DOC1,
      },
      {
        id: CHART2,
        tenantId: TENANT_ID,
        patientId: id(302),
        visitNoteId: VN2,
        notes: 'Protezlash oldidan',
        createdBy: DOC2,
      },
    ]);
    await db.insert(toothStates).values([
      { toothChartId: CHART1, toothNumber: 16, surface: 'O', state: 'filling' },
      { toothChartId: CHART1, toothNumber: 17, surface: 'O', state: 'filling' },
      { toothChartId: CHART1, toothNumber: 36, surface: 'whole', state: 'root_canal' },
      { toothChartId: CHART1, toothNumber: 11, surface: 'whole', state: 'healthy' },
      { toothChartId: CHART1, toothNumber: 48, surface: 'whole', state: 'missing' },
      { toothChartId: CHART2, toothNumber: 16, surface: 'whole', state: 'crown' },
      { toothChartId: CHART2, toothNumber: 26, surface: 'whole', state: 'crown' },
      { toothChartId: CHART2, toothNumber: 46, surface: 'whole', state: 'to_extract' },
    ]);
    console.log('  ✓ visit_notes: +3, tooth_charts: +2, tooth_states: +8');
  } else {
    console.log('  · visit_notes: already seeded, skip');
  }

  // ─────────────────────────── 10. PRESCRIPTIONS + LAB ORDERS + CONSENTS + IMAGES ───────────────────────────
  if ((await count(prescriptions)) < 1) {
    await db.insert(prescriptions).values([
      {
        tenantId: TENANT_ID,
        patientId: id(300),
        doctorId: DOC1,
        visitNoteId: VN1,
        diagnosis: 'Kanal davolashdan keyingi og‘riq',
        items: [
          {
            medicationName: 'Ibuprofen',
            dosage: '400mg',
            frequency: 'Kuniga 2 marta',
            durationDays: 5,
            instructions: 'Ovqatdan keyin',
          },
          {
            medicationName: 'Xlorgeksidin',
            dosage: '0.05%',
            frequency: 'Kuniga 3 marta chayish',
            durationDays: 7,
          },
        ],
        notes: 'Og‘riq kuchaysa shifokorga murojaat qiling.',
      },
      {
        tenantId: TENANT_ID,
        patientId: id(302),
        doctorId: DOC2,
        items: [
          {
            medicationName: 'Amoksitsillin',
            dosage: '500mg',
            frequency: 'Kuniga 3 marta',
            durationDays: 7,
          },
        ],
        diagnosis: 'Profilaktik antibiotik',
      },
    ]);
    console.log('  ✓ prescriptions: +2');
  } else {
    console.log('  · prescriptions: already seeded, skip');
  }

  if ((await count(labOrders)) < 1) {
    await db.insert(labOrders).values([
      {
        tenantId: TENANT_ID,
        patientId: id(302),
        doctorId: DOC2,
        orderNumber: 1,
        labName: 'DentLab Toshkent',
        orderType: 'crown',
        status: 'in_progress',
        items: [
          {
            description: 'Metallokeramika koronka',
            toothNumbers: [16, 26],
            material: 'Metallokeramika',
            shade: 'A2',
            quantity: 2,
          },
        ],
        sentDate: daysFromNow(-2),
        expectedDate: daysFromNow(7),
        cost: '900000',
      },
      {
        tenantId: TENANT_ID,
        patientId: id(304),
        doctorId: DOC1,
        orderNumber: 2,
        labName: 'DentLab Toshkent',
        orderType: 'prosthetic',
        status: 'sent',
        items: [
          { description: 'Implant abatment', toothNumbers: [46], material: 'Titan', quantity: 1 },
        ],
        sentDate: now,
        expectedDate: daysFromNow(14),
        cost: '600000',
      },
    ]);
    console.log('  ✓ lab_orders: +2');
  } else {
    console.log('  · lab_orders: already seeded, skip');
  }

  // consent templates + signed forms
  const CT1 = id(700);
  const CT2 = id(701);
  if ((await count(consentTemplates)) < 1) {
    await db.insert(consentTemplates).values([
      {
        id: CT1,
        tenantId: TENANT_ID,
        type: 'treatment',
        title: 'Davolashga rozilik',
        bodyUz:
          'Men taklif etilgan stomatologik davolash usullari, ularning xavf va oqibatlari bilan tanishdim va roziman.',
        bodyRu: 'Я ознакомлен с предложенным лечением, его рисками и последствиями и согласен.',
        isActive: true,
      },
      {
        id: CT2,
        tenantId: TENANT_ID,
        type: 'anesthesia',
        title: 'Anesteziyaga rozilik',
        bodyUz: 'Men mahalliy anesteziya qo‘llanilishiga va uning ehtimoliy ta‘siriga roziman.',
        bodyRu: 'Я согласен на применение местной анестезии.',
        isActive: true,
      },
    ]);
    await db.insert(consentForms).values([
      {
        tenantId: TENANT_ID,
        patientId: id(300),
        templateId: CT1,
        type: 'treatment',
        title: 'Davolashga rozilik',
        bodyText: 'Men taklif etilgan stomatologik davolash usullari bilan tanishdim va roziman.',
        language: 'uz',
        signedAt: daysFromNow(-4),
        signedByUserId: DOC1,
        patientSignatureName: 'Akmal Karimov',
      },
      {
        tenantId: TENANT_ID,
        patientId: id(302),
        templateId: CT2,
        type: 'anesthesia',
        title: 'Anesteziyaga rozilik',
        bodyText: 'Men mahalliy anesteziya qo‘llanilishiga roziman.',
        language: 'uz',
        signedAt: daysFromNow(-2),
        signedByUserId: DOC2,
        patientSignatureName: 'Bobur Toshmatov',
      },
    ]);
    console.log('  ✓ consent_templates: +2, consent_forms: +2');
  } else {
    console.log('  · consent_templates: already seeded, skip');
  }

  // patient_images (faqat metadata — haqiqiy yuklash YO'Q)
  if ((await count(patientImages)) < 1) {
    await db.insert(patientImages).values([
      {
        tenantId: TENANT_ID,
        patientId: id(300),
        visitNoteId: VN1,
        uploadedByUserId: DOC1,
        type: 'xray_periapical',
        objectKey: `tenants/${TENANT_ID}/patients/${id(300)}/demo-xray-16.jpg`,
        originalFilename: 'xray-16.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 245000,
        title: '16-tish pritsel rentgen',
        toothNumbers: [16],
        takenDate: daysFromNow(-4),
      },
      {
        tenantId: TENANT_ID,
        patientId: id(302),
        visitNoteId: VN2,
        uploadedByUserId: DOC2,
        type: 'xray_panoramic',
        objectKey: `tenants/${TENANT_ID}/patients/${id(302)}/demo-opg.jpg`,
        originalFilename: 'opg.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 880000,
        title: 'Panoramik rentgen (OPG)',
        takenDate: daysFromNow(-3),
      },
      {
        tenantId: TENANT_ID,
        patientId: id(301),
        uploadedByUserId: DOC1,
        type: 'intraoral_photo',
        objectKey: `tenants/${TENANT_ID}/patients/${id(301)}/demo-intraoral.jpg`,
        originalFilename: 'intraoral.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1200000,
        title: 'Tozalashdan oldin',
        takenDate: daysFromNow(-1),
      },
    ]);
    console.log('  ✓ patient_images: +3 (metadata only)');
  } else {
    console.log('  · patient_images: already seeded, skip');
  }

  // ─────────────────────────── 11. CASHIER TRANSACTIONS + ITEMS + STAGE PAYMENTS ───────────────────────────
  if ((await count(cashierTransactions)) < 1) {
    const TX1 = id(800);
    const TX2 = id(801);
    const TX3 = id(802);
    const TX4 = id(803);
    const TX5 = id(804);
    const TX6 = id(805); // refund
    await db.insert(cashierTransactions).values([
      {
        id: TX1,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(300),
        treatmentPlanId: PLAN1,
        receiptNumber: 'R-2026-0001',
        totalAmount: '700000',
        paidAmount: '700000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdBy: id(13),
        createdAt: daysFromNow(-4),
      },
      {
        id: TX2,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(302),
        treatmentPlanId: PLAN2,
        receiptNumber: 'R-2026-0002',
        totalAmount: '1200000',
        paidAmount: '600000',
        discount: '0',
        paymentMethod: 'card',
        type: 'payment',
        status: 'completed',
        createdBy: id(13),
        createdAt: daysFromNow(-2),
      },
      {
        id: TX3,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(301),
        receiptNumber: 'R-2026-0003',
        totalAmount: '250000',
        paidAmount: '250000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdBy: id(13),
        createdAt: daysFromNow(-1),
      },
      {
        id: TX4,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(303),
        receiptNumber: 'R-2026-0004',
        totalAmount: '50000',
        paidAmount: '50000',
        paymentMethod: 'transfer',
        type: 'payment',
        status: 'completed',
        createdBy: id(13),
      },
      {
        id: TX5,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(305),
        receiptNumber: 'R-2026-0005',
        totalAmount: '350000',
        paidAmount: '300000',
        discount: '50000',
        paymentMethod: 'card',
        type: 'payment',
        status: 'completed',
        createdBy: id(13),
      },
      {
        id: TX6,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(305),
        receiptNumber: 'R-2026-0006',
        totalAmount: '-100000',
        paidAmount: '-100000',
        paymentMethod: 'card',
        type: 'refund',
        status: 'completed',
        parentTransactionId: TX5,
        notes: 'Qisman qaytarish',
        createdBy: id(14),
      },
    ]);
    await db.insert(cashierTransactionItems).values([
      {
        transactionId: TX1,
        serviceId: id(101),
        serviceName: 'Tish plombasi (kompozit)',
        quantity: 2,
        unitPrice: '350000',
        subtotal: '700000',
      },
      {
        transactionId: TX2,
        serviceId: id(105),
        serviceName: 'Metallokeramika koronka',
        quantity: 1,
        unitPrice: '1200000',
        subtotal: '1200000',
      },
      {
        transactionId: TX3,
        serviceId: id(103),
        serviceName: 'Professional tish tozalash',
        quantity: 1,
        unitPrice: '250000',
        subtotal: '250000',
      },
      {
        transactionId: TX4,
        serviceId: id(100),
        serviceName: 'Konsultatsiya',
        quantity: 1,
        unitPrice: '50000',
        subtotal: '50000',
      },
      {
        transactionId: TX5,
        serviceId: id(101),
        serviceName: 'Tish plombasi (kompozit)',
        quantity: 1,
        unitPrice: '350000',
        subtotal: '350000',
      },
    ]);
    // stage payments (plan-linked)
    await db.insert(treatmentStagePayments).values([
      { tenantId: TENANT_ID, transactionId: TX1, stageId: STAGE.a1, amount: '700000' },
      { tenantId: TENANT_ID, transactionId: TX2, stageId: STAGE.b1, amount: '600000' },
    ]);
    console.log('  ✓ cashier_transactions: +6 (incl. 1 refund), items: +5, stage_payments: +2');
  } else {
    console.log('  · cashier_transactions: already seeded, skip');
  }

  // ─────────────────────────── 12. EXPENSES + CATEGORIES ───────────────────────────
  if ((await count(expenseCategories)) < 1) {
    const cats = [
      { cid: id(900), name: 'Ijara', nameRu: 'Аренда' },
      { cid: id(901), name: 'Kommunal', nameRu: 'Коммунальные' },
      { cid: id(902), name: 'Materiallar', nameRu: 'Материалы' },
      { cid: id(903), name: 'Marketing', nameRu: 'Маркетинг' },
      { cid: id(904), name: 'Boshqa', nameRu: 'Прочее' },
    ];
    for (const c of cats) {
      await db
        .insert(expenseCategories)
        .values({ id: c.cid, tenantId: TENANT_ID, name: c.name, nameRu: c.nameRu });
    }
    await db.insert(expenses).values([
      {
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        categoryId: id(900),
        amount: '8000000',
        date: dateStr(daysFromNow(-15)),
        note: 'Oylik ijara',
        createdBy: id(14),
      },
      {
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        categoryId: id(901),
        amount: '1200000',
        date: dateStr(daysFromNow(-10)),
        note: 'Elektr va suv',
        createdBy: id(14),
      },
      {
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        categoryId: id(902),
        amount: '3500000',
        date: dateStr(daysFromNow(-8)),
        note: 'Plomba materiallari',
        createdBy: id(14),
      },
      {
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        categoryId: id(903),
        amount: '900000',
        date: dateStr(daysFromNow(-5)),
        note: 'Instagram reklama',
        createdBy: id(15),
      },
      {
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        categoryId: id(904),
        amount: '450000',
        date: dateStr(daysFromNow(-3)),
        note: 'Kanstovarlar',
        createdBy: id(13),
      },
    ]);
    console.log('  ✓ expense_categories: +5, expenses: +5');
  } else {
    console.log('  · expense_categories: already seeded, skip');
  }

  // ─────────────────────────── 13. PAYROLL RUNS + LINES ───────────────────────────
  if ((await count(payrollRuns)) < 1) {
    const RUN1 = id(1000);
    await db.insert(payrollRuns).values({
      id: RUN1,
      tenantId: TENANT_ID,
      periodFrom: dateStr(daysFromNow(-30)),
      periodTo: dateStr(daysFromNow(-1)),
      status: 'finalized',
      createdBy: id(14),
    });
    await db.insert(payrollLines).values([
      {
        tenantId: TENANT_ID,
        runId: RUN1,
        userId: DOC1,
        baseSalary: '6000000',
        attributedRevenue: '950000',
        commissionPercent: '15',
        commissionAmount: '142500',
        total: '6142500',
      },
      {
        tenantId: TENANT_ID,
        runId: RUN1,
        userId: DOC2,
        baseSalary: '7000000',
        attributedRevenue: '600000',
        commissionPercent: '18',
        commissionAmount: '108000',
        total: '7108000',
      },
      {
        tenantId: TENANT_ID,
        runId: RUN1,
        userId: id(12),
        baseSalary: '3500000',
        attributedRevenue: '0',
        commissionPercent: '0',
        commissionAmount: '0',
        total: '3500000',
      },
      {
        tenantId: TENANT_ID,
        runId: RUN1,
        userId: id(13),
        baseSalary: '3000000',
        attributedRevenue: '0',
        commissionPercent: '0',
        commissionAmount: '0',
        total: '3000000',
      },
    ]);
    console.log('  ✓ payroll_runs: +1, payroll_lines: +4');
  } else {
    console.log('  · payroll_runs: already seeded, skip');
  }

  // ─────────────────────────── 14. RECALLS + LOGS ───────────────────────────
  if ((await count(recalls)) < 1) {
    const RC1 = id(1100);
    const RC2 = id(1101);
    const RC3 = id(1102);
    await db.insert(recalls).values([
      {
        id: RC1,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(301),
        reason: 'preventive',
        status: 'pending',
        source: 'manual',
        dueDate: dateStr(daysFromNow(180)),
        intervalMonths: 6,
        assignedDoctorId: DOC1,
        createdBy: DOC1,
      },
      {
        id: RC2,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(300),
        reason: 'treatment_followup',
        status: 'contacted',
        source: 'treatment_stage',
        dueDate: dateStr(daysFromNow(7)),
        treatmentPlanId: PLAN1,
        assignedDoctorId: DOC1,
        contactAttempts: 1,
        lastContactedAt: daysFromNow(-1),
        createdBy: DOC1,
      },
      {
        id: RC3,
        tenantId: TENANT_ID,
        branchId: MAIN_BRANCH_ID,
        patientId: id(302),
        reason: 'post_op_check',
        status: 'scheduled',
        source: 'appointment',
        dueDate: dateStr(daysFromNow(3)),
        assignedDoctorId: DOC2,
        createdBy: DOC2,
      },
    ]);
    await db.insert(recallLogs).values([
      {
        tenantId: TENANT_ID,
        recallId: RC2,
        channel: 'sms',
        outcome: 'sent',
        detail: 'SMS yuborildi: nazorat ko‘rigi',
        sentAt: daysFromNow(-1),
      },
      {
        tenantId: TENANT_ID,
        recallId: RC3,
        channel: 'manual',
        outcome: 'sent',
        detail: 'Telefon orqali bog‘lanildi, yozildi',
      },
    ]);
    console.log('  ✓ recalls: +3, recall_logs: +2');
  } else {
    console.log('  · recalls: already seeded, skip');
  }

  // ─────────────────────────── 15. NOTIFICATIONS ───────────────────────────
  if ((await count(notifications)) < 1) {
    await db.insert(notifications).values([
      {
        tenantId: TENANT_ID,
        userId: OWNER_USER_ID,
        type: 'low_stock',
        title: 'Ombor: zaxira kam',
        body: '"Bir martalik qo‘lqop" minimal darajadan past (8 < 15).',
        createdAt: daysFromNow(-1),
      },
      {
        tenantId: TENANT_ID,
        userId: OWNER_USER_ID,
        type: 'appointment',
        title: 'Yangi yozilish',
        body: 'Sevara Aliyeva ertaga 11:00 ga yozildi.',
      },
      {
        tenantId: TENANT_ID,
        userId: DOC1,
        type: 'recall',
        title: 'Recall eslatma',
        body: 'Akmal Karimov bilan nazorat ko‘rigi bo‘yicha bog‘laning.',
      },
      {
        tenantId: TENANT_ID,
        userId: DOC2,
        type: 'lab_order',
        title: 'Lab buyurtma tayyor',
        body: 'DentLab buyurtmasi (koronka) kutilmoqda.',
        readAt: daysFromNow(-1),
      },
    ]);
    console.log('  ✓ notifications: +4');
  } else {
    console.log('  · notifications: already seeded, skip');
  }

  console.log('\n✅ Demo seed complete.');
}

try {
  await seed();
} catch (err) {
  console.error('\n❌ Seed failed:', err);
  await client.end();
  process.exit(1);
}
await client.end();
process.exit(0);
