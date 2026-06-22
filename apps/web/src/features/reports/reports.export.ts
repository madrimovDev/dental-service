import type {
  AppointmentStatsReport,
  DoctorWorkloadRow,
  OneCExportRow,
  PlanCompletionReport,
  RevenueReport,
} from '@dental/api-client';
// NOTE: `xlsx` (~430 kB) is NOT imported statically — it is dynamically loaded
// inside `downloadXlsx` so it only enters the bundle (as its own async chunk)
// when the user actually clicks "Excel". CSV export + the toRows mappers stay
// in the main chunk (tiny, no SheetJS). (CLI-239 / D8 bundle splitting.)

// ── Pure toRows mappers (string[][]) ──────────────────────────────────────────
// Har biri: bo'lim sarlavhasi + ustun sarlavhalari + qiymat qatorlari.
// Sof funksiyalar — DOM/Blob/SheetJS yo'q (test qilinadi).

export function revenueToRows(r: RevenueReport): string[][] {
  const rows: string[][] = [];
  rows.push(['Daromad hisoboti']);
  rows.push(['Jami', String(r.total)]);
  rows.push([]);

  rows.push(['Filial bo‘yicha', 'Summa']);
  for (const b of r.byBranch) rows.push([b.branchId, String(b.total)]);
  rows.push([]);

  rows.push(['Xizmat bo‘yicha', 'Summa']);
  for (const s of r.byService) rows.push([s.serviceName, String(s.total)]);
  rows.push([]);

  rows.push(['Shifokor bo‘yicha', 'Summa']);
  for (const d of r.byDoctor) rows.push([d.doctorId ?? '—', String(d.total)]);
  rows.push([]);

  rows.push(['Sana bo‘yicha', 'Summa']);
  for (const p of r.byPeriod) rows.push([p.date, String(p.total)]);

  return rows;
}

export function appointmentsToRows(r: AppointmentStatsReport): string[][] {
  const rows: string[][] = [];
  rows.push(['Qabullar statistikasi']);
  rows.push(['Jami', String(r.total)]);
  rows.push(['Kelmaganlar ulushi', String(r.noShowRate)]);
  rows.push(['Slot bandligi', String(r.slotUtilization)]);
  rows.push([]);

  rows.push(['Status', 'Soni']);
  for (const s of r.byStatus) rows.push([s.status, String(s.count)]);

  return rows;
}

export function doctorsToRows(
  rows: DoctorWorkloadRow[],
  nameOf?: (id: string) => string,
): string[][] {
  const out: string[][] = [];
  out.push(['Shifokorlar yuklamasi']);
  out.push(['Shifokor', 'Jami', 'Yakunlangan']);
  for (const r of rows) {
    out.push([nameOf ? nameOf(r.doctorId) : r.doctorId, String(r.total), String(r.completed)]);
  }
  return out;
}

export function planCompletionToRows(r: PlanCompletionReport): string[][] {
  const rows: string[][] = [];
  rows.push(['Davolash rejalari bajarilishi']);
  rows.push(['Jami bosqichlar', String(r.totalStages)]);
  rows.push(['Yakunlangan bosqichlar', String(r.completedStages)]);
  rows.push(['Bajarilish ulushi', String(r.rate)]);
  rows.push([]);

  rows.push(['Status', 'Soni']);
  for (const s of r.byStatus) rows.push([s.status, String(s.count)]);

  return rows;
}

// ── Download helpers (thin wrappers — test qilinmaydi) ────────────────────────

const escapeCsvCell = (cell: string): string => {
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
};

/**
 * 1C buxgalteriya eksporti — tranzaksiya qatorlari (V3-4). ⚠️ FORMAT PROVIZIONAL:
 * standart ustun-xaritasi (Дата;Документ;Тип;Метод;Сумма;Контрагент). Aniq 1C
 * interchange mijozning konfiguratsiyasiga (hisoblar rejasi) bog'liq.
 * TODO: mijoz 1C XSD/shabloni bilan ustunlarni moslash.
 */
export function oneCToRows(rows: OneCExportRow[]): string[][] {
  const out: string[][] = [['Дата', 'Документ', 'Тип', 'Метод', 'Сумма', 'Контрагент']];
  for (const r of rows) {
    out.push([
      r.date,
      r.receiptNumber ?? '',
      r.type,
      r.paymentMethod,
      String(r.amount),
      r.patientName ?? '',
    ]);
  }
  return out;
}

/** 1C CSV — nuqta-vergul ajratkichi (1C/RU Excel konvensiyasi). */
export function download1C(rows: string[][], filename: string): void {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function downloadCsv(rows: string[][], filename: string): void {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  // BOM (U+FEFF) — Excel UTF-8 (lotin diakritika) to'g'ri o'qishi uchun.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export async function downloadXlsx(rows: string[][], filename: string): Promise<void> {
  // Lazy-load SheetJS only on demand — keeps it out of the initial bundle.
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const name = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
