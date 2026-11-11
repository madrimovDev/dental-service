import type { LabOrder } from '@dental/db-schema';

/**
 * PHI chegarasi (L3) — klinika → Lab Hub. Hub'ga FAQAT: bemor to'liq ismi, jinsi,
 * yoshi, klinika ichki ish kodi (karta raqami EMAS), shifokor ismi, tishlar, ish turi,
 * material, rang, muddat, izoh. Telefon, manzil, pasport, karta raqami, tibbiy yozuv —
 * HECH QACHON. Mapper kirishdagi ortiqcha maydonlarni o'qimaydi (faqat nomlangan
 * kalitlar ko'chiriladi); Hub tomonida esa `hubCaseSchema.strict()` noma'lum kalitni
 * 400 bilan rad etadi — ikki tomonlama qulf (`lab-hub-sync.test.ts`).
 */
export type HubCasePayload = {
  labId: string;
  patient: { fullName: string; sex: 'male' | 'female' | null; age: number | null };
  clinicCode: string;
  doctorName: string | null;
  teeth: number[];
  workType: string;
  material: string | null;
  shade: string | null;
  dueDate: string | null;
  note: string | null;
};

export type HubCaseOrder = Pick<
  LabOrder,
  'id' | 'orderNumber' | 'orderType' | 'items' | 'shade' | 'dueDate' | 'notes'
>;

/** Faqat shu uch maydon o'qiladi — qolgan bemor ustunlari (PII) e'tiborga olinmaydi. */
export type HubCasePatient = {
  fullName: string;
  gender: 'male' | 'female' | 'other' | null;
  dateOfBirth: string | null;
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  crown: 'Toj',
  bridge: "Ko'prik",
  prosthetic: 'Protez',
  aligners: 'Elayner',
  denture: 'Olinadigan protez',
  inlay_onlay: 'Vkladka (inlay/onlay)',
  other: 'Boshqa',
};

const clip = (s: string | null | undefined, max: number): string | null => {
  const v = s?.trim();
  return v ? v.slice(0, max) : null;
};

/** To'liq yillar (klinika vaqt zonasi farqi yoshga ta'sir qilmaydi — kun aniqligi yetarli). */
export const ageAt = (dateOfBirth: string | null, now: Date): number | null => {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)) return null;
  const [y, m, d] = dateOfBirth.slice(0, 10).split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  if (md < m * 100 + d) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
};

/** Klinika ichki ish kodi — buyurtma raqami (bemor karta raqami emas). */
export const clinicCaseCode = (order: Pick<LabOrder, 'id' | 'orderNumber'>): string =>
  order.orderNumber != null ? `LO-${order.orderNumber}` : `LO-${order.id.slice(0, 8)}`;

export const toHubCase = (input: {
  labId: string;
  order: HubCaseOrder;
  patient: HubCasePatient;
  doctorName: string | null;
  now?: Date;
}): HubCasePayload => {
  const { order, patient } = input;
  const items = order.items ?? [];
  const teeth = [
    ...new Set(
      items
        .flatMap((i) => i.toothNumbers ?? [])
        .filter((n) => Number.isInteger(n) && n >= 11 && n <= 85),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, 32);
  const descriptions = items.map((i) => i.description?.trim()).filter(Boolean);
  const workType =
    clip(descriptions.join('; '), 200) ?? ORDER_TYPE_LABEL[order.orderType] ?? order.orderType;
  const materials = [...new Set(items.map((i) => i.material?.trim()).filter(Boolean))];
  const sex = patient.gender === 'male' || patient.gender === 'female' ? patient.gender : null;
  return {
    labId: input.labId,
    patient: {
      fullName: patient.fullName.trim().slice(0, 200),
      sex,
      age: ageAt(patient.dateOfBirth, input.now ?? new Date()),
    },
    clinicCode: clinicCaseCode(order),
    doctorName: clip(input.doctorName, 200),
    teeth,
    workType,
    material: clip(materials.join(', '), 200),
    shade: clip(order.shade ?? items.find((i) => i.shade)?.shade, 100),
    dueDate: order.dueDate ?? null,
    note: clip(order.notes, 5000),
  };
};
