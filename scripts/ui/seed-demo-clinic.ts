/**
 * Landing skrinshotlari uchun namuna klinika («Smile Dental») — HTTP orqali real API.
 *
 *   bun --env-file=.env scripts/ui/seed-demo-clinic.ts --base http://localhost:8165 \
 *     --lang uz --out /tmp/claude-1000/lp-site/demo-creds-uz.json
 *
 * Til bo'yicha alohida tenant (uz: lotin ismlar, ru: kirill ismlar) — har til uchun
 * skrinshotda foydalanuvchi o'z yozuvini ko'radi. Barcha ism/telefon O'YLAB TOPILGAN
 * (`+99890…` soxta raqamlar).
 *
 * Bitta istisno: bugungi yozilishlar API orqali faqat KELAJAKKA ochiladi (`time.in_past`),
 * shuning uchun ular ertangi kunga yoziladi va keyin `DATABASE_ADMIN_URL` orqali shu
 * (lokal, namuna) bazada 1 kunga oldinga suriladi; xuddi shunday kassa to'lovlari va
 * ombor chiqimlari o'tgan kunlarga taqsimlanadi (hisobot diagrammasi uchun). Faqat
 * demo tenant yozuvlari o'zgaradi.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (get('base') ?? 'http://localhost:8165').replace(/\/$/, '');
const lang = (get('lang') ?? 'uz') as 'uz' | 'ru';
const out = get('out') ?? `/tmp/claude-1000/lp-site/demo-creds-${lang}.json`;
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl)
  throw new Error('DATABASE_ADMIN_URL kerak (bun --env-file=.env bilan ishga tushiring)');

const PASSWORD = 'Demo-Klinika-2026!x';
const stamp = Date.now().toString().slice(-6);
const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const ru = lang === 'ru';
const pick = <T>(uz: T, r: T): T => (ru ? r : uz);

type Json = Record<string, any>;
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Json> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json.data ?? json;
}

// ─── vaqt yordamchilari (klinika vaqti — Asia/Tashkent, UTC+5) ──────────────
const TZ = 5;
const tk = new Date(Date.now() + TZ * 3_600_000);
const ymd = (dayOffset: number) => {
  const d = new Date(Date.UTC(tk.getUTCFullYear(), tk.getUTCMonth(), tk.getUTCDate() + dayOffset));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
/** Klinika vaqti bo'yicha `dayOffset` kundagi hh:mm → ISO (UTC). */
const at = (dayOffset: number, hh: number, mm = 0) => {
  const { y, m, d } = ymd(dayOffset);
  return new Date(Date.UTC(y, m, d, hh - TZ, mm)).toISOString();
};
const dateOnly = (dayOffset: number) => {
  const { y, m, d } = ymd(dayOffset);
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
};

// ─── ma'lumot (o'ylab topilgan) ─────────────────────────────────────────────
type P = { uz: string; ru: string; g: 'male' | 'female'; dob: string };
const PATIENTS: P[] = [
  { uz: 'Sardor Tursunov', ru: 'Сардор Турсунов', g: 'male', dob: '1989-03-14' },
  { uz: 'Malika Yusupova', ru: 'Малика Юсупова', g: 'female', dob: '1994-07-02' },
  { uz: 'Jasur Mirzayev', ru: 'Жасур Мирзаев', g: 'male', dob: '1985-11-23' },
  { uz: 'Nodira Saidova', ru: 'Нодира Саидова', g: 'female', dob: '1991-01-30' },
  { uz: 'Bekzod Rasulov', ru: 'Бекзод Расулов', g: 'male', dob: '1998-05-18' },
  { uz: 'Aziz Qodirov', ru: 'Азиз Кодиров', g: 'male', dob: '1979-09-09' },
  { uz: 'Dilnoza Akramova', ru: 'Дилноза Акрамова', g: 'female', dob: '2002-12-05' },
  { uz: 'Otabek Komilov', ru: 'Отабек Комилов', g: 'male', dob: '1987-04-21' },
  { uz: 'Shahzoda Nazarova', ru: 'Шахзода Назарова', g: 'female', dob: '1996-08-11' },
  { uz: 'Rustam Ergashev', ru: 'Рустам Эргашев', g: 'male', dob: '1983-02-27' },
  { uz: 'Kamola Bekmurodova', ru: 'Камола Бекмуродова', g: 'female', dob: '1999-06-16' },
  { uz: 'Anvar Hamidov', ru: 'Анвар Хамидов', g: 'male', dob: '1975-10-03' },
  { uz: 'Zilola Raximova', ru: 'Зилола Рахимова', g: 'female', dob: '1990-03-29' },
  { uz: 'Sherzod Abdullayev', ru: 'Шерзод Абдуллаев', g: 'male', dob: '1993-01-12' },
  { uz: 'Gulnora Tosheva', ru: 'Гульнора Тошева', g: 'female', dob: '1968-07-25' },
  { uz: 'Farhod Ismoilov', ru: 'Фарход Исмоилов', g: 'male', dob: '2000-11-08' },
  { uz: 'Madina Qosimova', ru: 'Мадина Косимова', g: 'female', dob: '1988-02-19' },
  { uz: 'Behruz Normatov', ru: 'Бехруз Норматов', g: 'male', dob: '1995-09-30' },
  { uz: 'Laylo Jalilova', ru: 'Лайло Жалилова', g: 'female', dob: '1982-05-07' },
  { uz: 'Ulugbek Sobirov', ru: 'Улугбек Собиров', g: 'male', dob: '1977-12-14' },
  { uz: 'Sevara Murodova', ru: 'Севара Муродова', g: 'female', dob: '1997-04-04' },
  { uz: 'Eldor Xolmatov', ru: 'Элдор Холматов', g: 'male', dob: '1991-08-22' },
  { uz: 'Feruza Umarova', ru: 'Феруза Умарова', g: 'female', dob: '1986-06-01' },
  { uz: 'Timur Azizov', ru: 'Тимур Азизов', g: 'male', dob: '2003-03-17' },
  { uz: 'Nilufar Olimova', ru: 'Нилуфар Олимова', g: 'female', dob: '1992-10-10' },
];
const DOCTORS = [
  { name: pick('Dr. Karimova', 'Др. Каримова'), specialty: pick('Terapevt', 'Терапевт'), pct: 30 },
  { name: pick('Dr. Aliyev', 'Др. Алиев'), specialty: pick('Ortoped', 'Ортопед'), pct: 25 },
  { name: pick('Dr. Rahimov', 'Др. Рахимов'), specialty: pick('Jarroh', 'Хирург'), pct: 28 },
];
const SERVICES = [
  {
    code: 'CONS',
    uz: 'Konsultatsiya',
    ru: 'Консультация',
    cat: ['Diagnostika', 'Диагностика'],
    price: 100000,
    min: 30,
  },
  {
    code: 'FILL',
    uz: 'Plomba (kompozit)',
    ru: 'Пломба (композит)',
    cat: ['Terapiya', 'Терапия'],
    price: 450000,
    min: 60,
  },
  {
    code: 'CLEAN',
    uz: 'Professional tozalash',
    ru: 'Профессиональная чистка',
    cat: ['Gigiyena', 'Гигиена'],
    price: 300000,
    min: 60,
  },
  {
    code: 'ENDO',
    uz: 'Kanalni davolash',
    ru: 'Лечение каналов',
    cat: ['Terapiya', 'Терапия'],
    price: 900000,
    min: 60,
  },
  {
    code: 'EXTR',
    uz: 'Tishni olib tashlash',
    ru: 'Удаление зуба',
    cat: ['Jarrohlik', 'Хирургия'],
    price: 350000,
    min: 45,
  },
  {
    code: 'CROWN',
    uz: 'Keramik toj',
    ru: 'Керамическая коронка',
    cat: ['Ortopediya', 'Ортопедия'],
    price: 1200000,
    min: 60,
  },
  {
    code: 'IMPL',
    uz: "Implant o'rnatish",
    ru: 'Имплантация',
    cat: ['Jarrohlik', 'Хирургия'],
    price: 4500000,
    min: 60,
  },
  {
    code: 'BRACE',
    uz: 'Breket nazorati',
    ru: 'Контроль брекетов',
    cat: ['Ortodontiya', 'Ортодонтия'],
    price: 250000,
    min: 30,
  },
  {
    code: 'WHITE',
    uz: 'Oqartirish',
    ru: 'Отбеливание',
    cat: ['Estetika', 'Эстетика'],
    price: 900000,
    min: 60,
  },
] as const;
type SvcCode = (typeof SERVICES)[number]['code'];

// ─── 1. tenant + owner ──────────────────────────────────────────────────────
const ownerPhone = `+99890${(2000000 + Number(stamp)).toString().slice(-7)}`;
const staffPhone = (n: number) => `+99891${(3000000 + Number(stamp) * 3 + n).toString().slice(-7)}`;
const reg = await call('POST', '/auth/register-tenant', {
  tenantName: 'Smile Dental',
  ownerPhone,
  ownerFullName: pick('Madina Abdullayeva', 'Мадина Абдуллаева'),
  ownerPassword: PASSWORD,
  defaultLanguage: lang,
});
const branchId = reg.branchId as string;
const tenantId = reg.tenantId as string;

async function workspaceToken(phone: string, password: string) {
  const login = await call('POST', '/auth/login', { phone, password });
  if (login.mustChangePassword) throw new Error('mustChangePassword');
  const me = await call('GET', '/auth/me', undefined, login.accessToken);
  const a = me.assignments?.[0] ?? me.ownerTenants?.[0];
  const ws = await call(
    'POST',
    '/auth/switch-workspace',
    { tenantId: a.tenantId, branchId: a.branchId ?? branchId, refreshToken: login.refreshToken },
    login.accessToken,
  );
  return ws.accessToken as string;
}
const T = await workspaceToken(ownerPhone, PASSWORD);
await call(
  'PATCH',
  `/branches/${branchId}`,
  { name: pick('Markaziy filial', 'Центральный филиал') },
  T,
);

// ─── 2. shifokorlar ─────────────────────────────────────────────────────────
const roles = (await call('GET', '/roles', undefined, T)) as unknown as Json[];
const doctorRole = roles.find((r) => r.name === 'Doctor')?.id as string;
if (!doctorRole) throw new Error('Doctor rol shabloni topilmadi');
const doctors: Array<{ id: string; name: string; phone: string }> = [];
for (const [i, doc] of DOCTORS.entries()) {
  const phone = staffPhone(i + 1);
  const inv = await call(
    'POST',
    '/users/invite',
    { phone, fullName: doc.name, roleId: doctorRole, branchId },
    T,
  );
  const login = await call('POST', '/auth/login', { phone, password: inv.tempPassword });
  await call(
    'POST',
    '/auth/change-password',
    { currentPassword: inv.tempPassword, newPassword: PASSWORD },
    login.accessToken,
  );
  await call(
    'PUT',
    `/users/${inv.userId}/profile`,
    {
      specialty: doc.specialty,
      employmentStatus: 'active',
      baseSalary: 0,
      commissionPercent: doc.pct,
    },
    T,
  );
  doctors.push({ id: inv.userId as string, name: doc.name, phone });
}

// ─── 3. xizmatlar ───────────────────────────────────────────────────────────
const svc = {} as Record<SvcCode, { id: string; name: string; price: number }>;
for (const s of SERVICES) {
  const r = await call(
    'POST',
    '/services',
    {
      code: s.code,
      // web hozircha xizmat nomini `nameUz` dan ko'rsatadi — ru namuna klinikada ruscha nom shu maydonda
      nameUz: pick(s.uz, s.ru),
      nameRu: s.ru,
      category: pick(s.cat[0], s.cat[1]),
      durationMinutes: s.min,
      initialPrice: s.price,
      initialBranchId: branchId,
    },
    T,
  );
  svc[s.code] = { id: r.id as string, name: pick(s.uz, s.ru), price: s.price };
}

// ─── 4. bemorlar ────────────────────────────────────────────────────────────
const pat: Array<{ id: string; name: string }> = [];
for (const [i, p] of PATIENTS.entries()) {
  const r = await call(
    'POST',
    '/patients',
    {
      fullName: pick(p.uz, p.ru),
      dateOfBirth: p.dob,
      gender: p.g,
      phone: `+99890${(1000100 + (ru ? 700 : 0) + i * 17).toString()}`,
      source: pick('Instagram', 'Instagram'),
    },
    T,
  );
  pat.push({ id: r.id as string, name: pick(p.uz, p.ru) });
}

// ─── 5. yozilishlar: bugungi (ertangaga yozilib surilgan) + ertangi ──────────
type Slot = { p: number; d: number; h: number; s: SvcCode; tomorrow?: boolean };
const TODAY_SLOTS: Slot[] = [
  { p: 0, d: 0, h: 9, s: 'FILL' },
  { p: 1, d: 1, h: 9, s: 'CONS' },
  { p: 2, d: 0, h: 10, s: 'CROWN' },
  { p: 3, d: 2, h: 10, s: 'CLEAN' },
  { p: 4, d: 1, h: 11, s: 'ENDO' },
  { p: 5, d: 2, h: 11, s: 'EXTR' },
  { p: 6, d: 0, h: 12, s: 'BRACE' },
  { p: 7, d: 1, h: 12, s: 'FILL' },
  { p: 8, d: 2, h: 13, s: 'FILL' },
  { p: 9, d: 0, h: 14, s: 'EXTR' },
  { p: 10, d: 1, h: 14, s: 'WHITE' },
];
const TOMORROW_SLOTS: Slot[] = [
  { p: 2, d: 0, h: 10, s: 'IMPL' },
  { p: 11, d: 0, h: 9, s: 'CLEAN' },
  { p: 12, d: 1, h: 10, s: 'FILL' },
  { p: 13, d: 1, h: 11, s: 'CONS' },
  { p: 14, d: 2, h: 9, s: 'EXTR' },
  { p: 15, d: 2, h: 12, s: 'ENDO' },
  { p: 16, d: 0, h: 13, s: 'BRACE' },
];
const createAppt = async (s: Slot) =>
  call(
    'POST',
    '/appointments',
    {
      branchId,
      patientId: pat[s.p]?.id,
      doctorId: doctors[s.d]?.id,
      startTime: at(1, s.h),
      endTime: at(1, s.h + 1),
      serviceIds: [svc[s.s].id],
    },
    T,
  );
const todayAppts: Json[] = [];
for (const s of TODAY_SLOTS) todayAppts.push(await createAppt(s));

const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
try {
  const ids = todayAppts.map((a) => a.id as string);
  await sql`UPDATE appointments SET start_time = start_time - interval '1 day', end_time = end_time - interval '1 day' WHERE id = ANY(${ids}::uuid[])`;
} catch (e) {
  await sql.end();
  throw e;
}
for (const s of TOMORROW_SLOTS) await createAppt(s);

// holatlar: navbat orqali (sync) yoki to'g'ridan-to'g'ri
const apptStatus = (i: number, status: string) =>
  call('PATCH', `/appointments/${todayAppts[i]?.id}`, { status }, T);
const ticket = async (
  i: number,
  doctorIdx: number,
  finalStatus: 'waiting' | 'in_progress' | 'done',
) => {
  const t = await call(
    'POST',
    '/queue',
    { branchId, patientId: pat[TODAY_SLOTS[i]?.p ?? 0]?.id, appointmentId: todayAppts[i]?.id },
    T,
  );
  if (finalStatus === 'waiting') return t;
  await call(
    'PATCH',
    `/queue/${t.id}/status`,
    { status: 'in_progress', doctorId: doctors[doctorIdx]?.id },
    T,
  );
  if (finalStatus === 'done') await call('PATCH', `/queue/${t.id}/status`, { status: 'done' }, T);
  return t;
};
for (const i of [0, 1, 2, 3]) await ticket(i, TODAY_SLOTS[i]?.d ?? 0, 'done');
await ticket(4, 1, 'in_progress');
for (const i of [6, 7, 10]) await ticket(i, TODAY_SLOTS[i]?.d ?? 0, 'waiting');
await apptStatus(5, 'no_show');
for (const i of [6, 7, 10]) await apptStatus(i, 'confirmed').catch(() => undefined);

// ─── 6. kassa ───────────────────────────────────────────────────────────────
type Pay = {
  p: number;
  items: Array<[SvcCode, number]>;
  paid: number | 'full';
  method: 'cash' | 'card' | 'transfer';
  provider?: 'terminal' | 'click' | 'payme' | 'other';
  daysAgo: number;
};
const total = (items: Array<[SvcCode, number]>) =>
  items.reduce((a, [c, q]) => a + svc[c].price * q, 0);
const PAYS: Pay[] = [
  // bugun
  { p: 1, items: [['CONS', 1]], paid: 'full', method: 'cash', daysAgo: 0 },
  { p: 3, items: [['CLEAN', 1]], paid: 'full', method: 'card', provider: 'terminal', daysAgo: 0 },
  { p: 6, items: [['BRACE', 1]], paid: 'full', method: 'cash', daysAgo: 0 },
  { p: 10, items: [['WHITE', 1]], paid: 'full', method: 'card', provider: 'payme', daysAgo: 0 },
  { p: 9, items: [['IMPL', 1]], paid: 'full', method: 'transfer', daysAgo: 0 },
  // qarzlar (qisman/umuman to'lanmagan)
  { p: 0, items: [['FILL', 1]], paid: 0, method: 'cash', daysAgo: 0 },
  { p: 2, items: [['CROWN', 1]], paid: 0, method: 'cash', daysAgo: 0 },
  { p: 7, items: [['FILL', 1]], paid: 150000, method: 'cash', daysAgo: 0 },
  { p: 12, items: [['ENDO', 1]], paid: 400000, method: 'card', provider: 'click', daysAgo: 6 },
  // o'tgan kunlar (hisobot diagrammasi)
  ...(
    [
      [11, 'CLEAN', 'cash', 1],
      [13, 'FILL', 'card', 1],
      [14, 'CROWN', 'card', 1],
      [15, 'EXTR', 'cash', 2],
      [16, 'ENDO', 'card', 2],
      [17, 'FILL', 'cash', 2],
      [18, 'CONS', 'cash', 3],
      [19, 'WHITE', 'card', 3],
      [20, 'CROWN', 'card', 4],
      [21, 'FILL', 'cash', 4],
      [22, 'CLEAN', 'cash', 5],
      [23, 'EXTR', 'cash', 5],
      [24, 'ENDO', 'card', 5],
      [13, 'IMPL', 'transfer', 6],
      [16, 'FILL', 'cash', 7],
      [17, 'CROWN', 'card', 7],
      [18, 'CLEAN', 'cash', 8],
      [20, 'FILL', 'card', 9],
      [21, 'EXTR', 'cash', 9],
      [23, 'ENDO', 'card', 10],
      [14, 'CONS', 'cash', 10],
      [11, 'IMPL', 'transfer', 11],
    ] as const
  ).map(
    ([p, s, method, daysAgo]): Pay => ({
      p,
      items: [[s, 1]],
      paid: 'full',
      method,
      provider: method === 'card' ? (daysAgo % 2 ? 'terminal' : 'click') : undefined,
      daysAgo,
    }),
  ),
];
const txIds: Array<[string, number]> = [];
for (const x of PAYS) {
  const t = await call(
    'POST',
    '/cashier/transactions',
    {
      branchId,
      patientId: pat[x.p]?.id,
      items: x.items.map(([c, q]) => ({
        serviceId: svc[c].id,
        quantity: q,
        unitPrice: svc[c].price,
        serviceName: svc[c].name,
      })),
      paidAmount: x.paid === 'full' ? total(x.items) : x.paid,
      paymentMethod: x.method,
      ...(x.provider ? { cardProvider: x.provider } : {}),
    },
    T,
  );
  txIds.push([t.id as string, x.daysAgo]);
}

// ─── 7. davolash rejalari (shifokor ish haqi uchun plan-linked tushum) ───────
const consentTpl = await call(
  'POST',
  '/consent/templates',
  {
    type: 'treatment',
    title: pick('Davolashga rozilik', 'Согласие на лечение'),
    bodyUz: 'Men davolash rejasi bilan tanishdim va rozilik beraman.',
    bodyRu: 'Я ознакомился с планом лечения и даю согласие.',
  },
  T,
);
type PlanSpec = {
  p: number;
  d: number;
  title: string;
  stages: Array<[SvcCode, number[]]>;
  pay: number[];
  daysAgo: number;
};
const PLANS: PlanSpec[] = [
  {
    p: 13,
    d: 0,
    title: pick('Chap yuqori tishlarni davolash', 'Лечение верхних зубов слева'),
    stages: [
      ['ENDO', [26]],
      ['FILL', [26]],
    ],
    pay: [900000, 450000],
    daysAgo: 8,
  },
  {
    p: 14,
    d: 1,
    title: pick('Keramik tojlar', 'Керамические коронки'),
    stages: [
      ['CROWN', [11]],
      ['CROWN', [21]],
    ],
    pay: [1200000, 1200000],
    daysAgo: 5,
  },
  {
    p: 16,
    d: 2,
    title: pick('Aql tishini olib tashlash', 'Удаление зуба мудрости'),
    stages: [
      ['CONS', []],
      ['EXTR', [38]],
    ],
    pay: [100000, 350000],
    daysAgo: 3,
  },
  {
    p: 15,
    d: 0,
    title: pick('Estetik davolash', 'Эстетическое лечение'),
    stages: [
      ['FILL', [13]],
      ['FILL', [23]],
      ['WHITE', []],
    ],
    pay: [450000, 450000, 900000],
    daysAgo: 2,
  },
  {
    p: 20,
    d: 1,
    title: pick('Implant', 'Имплантация'),
    stages: [['IMPL', [46]]],
    pay: [4500000],
    daysAgo: 1,
  },
];
const planTxIds: Array<[string, number]> = [];
for (const pl of PLANS) {
  const plan = await call(
    'POST',
    '/treatment-plans',
    {
      patientId: pat[pl.p]?.id,
      doctorId: doctors[pl.d]?.id,
      title: pl.title,
      stages: pl.stages.map(([c, teeth]) => ({
        serviceId: svc[c].id,
        serviceName: svc[c].name,
        toothNumbers: teeth,
        cost: svc[c].price,
        estimatedVisits: 1,
      })),
    },
    T,
  );
  await call('PATCH', `/treatment-plans/${plan.id}`, { status: 'presented' }, T);
  const form = await call(
    'POST',
    '/consent/forms',
    {
      patientId: pat[pl.p]?.id,
      templateId: consentTpl.id,
      type: 'treatment',
      title: pick('Davolashga rozilik', 'Согласие на лечение'),
      bodyText: pick(
        'Men davolash rejasi bilan tanishdim va rozilik beraman.',
        'Я ознакомился с планом лечения и даю согласие.',
      ),
      language: lang,
      patientSignatureName: pat[pl.p]?.name,
      isPerpetual: true,
    },
    T,
  );
  await call('POST', `/treatment-plans/${plan.id}/consent`, { consentFormId: form.id }, T);
  await call('PATCH', `/treatment-plans/${plan.id}`, { status: 'accepted' }, T);
  const full = await call('GET', `/treatment-plans/${plan.id}`, undefined, T);
  const stages = (full.stages ?? []) as Json[];
  for (const st of stages)
    await call('PATCH', `/treatment-stages/${st.id}`, { acceptance: 'accepted' }, T);
  const tx = await call(
    'POST',
    '/cashier/transactions',
    {
      branchId,
      patientId: pat[pl.p]?.id,
      treatmentPlanId: plan.id,
      allocations: stages
        .map((st, i) => ({ stageId: st.id, amount: pl.pay[i] ?? 0 }))
        .filter((a) => a.amount > 0),
      paidAmount: pl.pay.reduce((a, b) => a + b, 0),
      paymentMethod: 'card',
      cardProvider: 'terminal',
    },
    T,
  );
  planTxIds.push([tx.id as string, pl.daysAgo]);
}

// o'tgan kunlarga taqsimlash
for (const [id, d] of [...txIds, ...planTxIds]) {
  if (d > 0)
    await sql`UPDATE cashier_transactions SET created_at = created_at - make_interval(days => ${d}) WHERE id = ${id}`;
}

// ─── 8. tish xaritasi + allergiya (bitta bemor) ─────────────────────────────
const star = pat[0]?.id;
await call(
  'PATCH',
  `/patients/${star}/medical`,
  {
    anamnez: pick("Shikoyat: 46-tishda sovuqdan og'riq.", 'Жалоба: боль от холодного в зубе 46.'),
    allergies: [
      {
        type: 'medication',
        substance: pick('Penitsillin', 'Пенициллин'),
        severity: 'severe',
        notes: pick('Toshma, nafas qisilishi', 'Сыпь, затруднение дыхания'),
      },
    ],
  },
  T,
);
await call(
  'POST',
  '/tooth-charts',
  {
    patientId: star,
    states: [
      { toothNumber: 16, surface: 'whole', state: 'filling' },
      { toothNumber: 26, surface: 'whole', state: 'filling' },
      { toothNumber: 46, surface: 'whole', state: 'caries' },
      { toothNumber: 11, surface: 'whole', state: 'crown' },
      { toothNumber: 21, surface: 'whole', state: 'crown' },
      { toothNumber: 36, surface: 'whole', state: 'root_canal' },
      { toothNumber: 38, surface: 'whole', state: 'to_extract' },
      { toothNumber: 18, surface: 'whole', state: 'missing' },
      { toothNumber: 48, surface: 'whole', state: 'missing' },
    ],
  },
  T,
);

// ─── 9. ombor (biri kam) ────────────────────────────────────────────────────
const items = [
  {
    name: pick('Kompozit plomba', 'Композит для пломб'),
    unit: pick('shpris', 'шприц'),
    qty: 6,
    min: 5,
    price: 180000,
    cat: pick('Terapiya', 'Терапия'),
    outs: 4,
  },
  {
    name: pick('Anestetik', 'Анестетик'),
    unit: pick('ampula', 'ампула'),
    qty: 120,
    min: 30,
    price: 6000,
    cat: pick('Anesteziya', 'Анестезия'),
    outs: 10,
  },
  {
    name: pick("Bir martalik qo'lqop", 'Одноразовые перчатки'),
    unit: pick('juft', 'пара'),
    qty: 240,
    min: 100,
    price: 900,
    cat: pick('Gigiyena', 'Гигиена'),
    outs: 20,
  },
  {
    name: pick('Implant tizimi', 'Имплантационная система'),
    unit: pick('dona', 'шт'),
    qty: 9,
    min: 3,
    price: 1500000,
    cat: pick('Jarrohlik', 'Хирургия'),
    outs: 1,
  },
];
for (const it of items) {
  const r = await call(
    'POST',
    '/stock/items',
    {
      branchId,
      name: it.name,
      unit: it.unit,
      category: it.cat,
      price: it.price,
      quantity: it.qty + it.outs * 7,
      minThreshold: it.min,
    },
    T,
  );
  // so'nggi 7 kunda sarf — "necha kunga yetadi" hisobi uchun
  for (let d = 1; d <= 7; d++) {
    const mv = await call(
      'POST',
      '/stock/movements',
      { itemId: r.id, type: 'out', quantity: it.outs, reason: pick('Davolash', 'Лечение') },
      T,
    );
    await sql`UPDATE stock_movements SET created_at = created_at - make_interval(days => ${d}) WHERE id = ${mv.id}`;
  }
}
await call(
  'POST',
  '/stock/bom',
  {
    serviceId: svc.FILL.id,
    itemId: ((await call('GET', '/stock/items', undefined, T)) as unknown as Json[]).find(
      (x) => x.name === items[0]?.name,
    )?.id,
    qtyPerService: 0.2,
  },
  T,
);

// ─── 10. ish haqi hisobi (1-noyabrdan bugungacha) ───────────────────────────
const period = { periodFrom: dateOnly(-(tk.getUTCDate() - 1)), periodTo: dateOnly(0) };
const run = await call('POST', '/payroll/runs', period, T);

await sql.end();
writeFileSync(
  out,
  JSON.stringify(
    {
      lang,
      tenant: 'Smile Dental',
      tenantId,
      branchId,
      owner: { phone: ownerPhone, password: PASSWORD },
      doctors,
      payrollRunId: run.id,
    },
    null,
    2,
  ),
);
console.log(
  `seed ok (${lang}): ${PATIENTS.length} bemor, ${TODAY_SLOTS.length + TOMORROW_SLOTS.length} yozilish, ${PAYS.length + PLANS.length} to'lov, ${PLANS.length} reja, ${items.length} ombor -> ${out}`,
);
