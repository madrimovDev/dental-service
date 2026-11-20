// @dental/fiscal — Soliq.uz fiskal modul (scaffold pattern, RFC §3.7 + CLAUDE.md).
// NoOp default (DB'ga yozadi, soliqqa yubormaydi); SOLIQ_* env bo'lsa real provider.
// Business kod faqat `FiscalProvider` interfeysiga bog'liq — implementatsiya almashsa
// o'zgarmaydi.

/**
 * Fiskal chek qatori (FT-04.4). `amount` — NETTO (chegirma qatorlarga taqsimlangan):
 * `amount = grossAmount − discount`. Erkin POS'da xizmat qatori; reja to'lovida bosqich
 * allocation'i (`stageId`, `quantity = 1`, chegirma bosqich `cost`ida allaqachon snapshot).
 */
export type FiscalItem = {
  name: string;
  serviceId: string | null;
  stageId: string | null;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discount: number;
  amount: number;
};

/**
 * Fiskal chek uchun to'lov ma'lumoti (cashier'dan keladi). `amount` = haqiqatda olingan
 * summa (paidAmount, CLI-449); to'liq to'lovda `amount = Σ items.amount`. `discount` —
 * chekdagi jami chegirma (Σ items.discount).
 */
export type FiscalPayment = {
  id: string;
  amount: number;
  discount?: number;
  items: FiscalItem[];
};

/** Fiskal provider natijasi. `fiscalId` null = soliqqa yuborilmagan. */
export type FiscalReceipt = {
  fiscalId: string | null;
  response: unknown;
};

export interface FiscalProvider {
  createReceipt(payment: FiscalPayment): Promise<FiscalReceipt>;
}

/** NoOp — hech narsa yubormaydi (M1–M3 / Soliq sozlanmagan). */
export const createNoOpFiscalProvider = (): FiscalProvider => ({
  async createReceipt() {
    return { fiscalId: null, response: { provider: 'noop', note: 'No fiscal device wired' } };
  },
});

/** Soliq.uz real provider konfiguratsiyasi. */
export type SoliqConfig = {
  apiUrl: string;
  apiKey: string;
  /** Klinikaning soliq/fiskal IDsi. */
  fiscalId?: string;
  /** FX-77: so'rov muddati (ms). Default 8000 — javob bermasa chek `fiscalId=null` bilan qaytadi. */
  timeoutMs?: number;
};

/** FX-77: Soliq fetch uchun default timeout (osilib qolmasligi uchun). */
export const SOLIQ_DEFAULT_TIMEOUT_MS = 8000;

/**
 * Soliq.uz real fiskal provider — SKELETON (V3-1, CLI-249).
 *
 * ⚠️ TASHQI BOG'LIQLIK: jonli ishlashi uchun real Soliq.uz fiskal API endpoint +
 * API kalit + TLS sertifikat kerak (foydalanuvchi taqdim etadi). Quyidagi `fetch`
 * chaqiruvi Soliq protokoliga MOSLASH talab qiladi (request/response shakli mijoz
 * integratsiya hujjatiga bog'liq). Hozir interfeys chegarasi to'liq; sirlar bo'lganda
 * faollashtiriladi. Xato'da throw EMAS — fiscalId=null qaytaradi (cashier oqimi
 * bloklanmaydi; BullMQ retry keyin qo'shilishi mumkin).
 */
export const createSoliqFiscalProvider = (config: SoliqConfig): FiscalProvider => ({
  async createReceipt(payment: FiscalPayment): Promise<FiscalReceipt> {
    try {
      // TODO(V3-1 jonli): Soliq.uz API shakliga moslash (endpoint/payload/auth/TLS).
      const res = await fetch(`${config.apiUrl}/receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          fiscalId: config.fiscalId,
          paymentId: payment.id,
          amount: payment.amount,
          discount: payment.discount ?? 0,
          items: payment.items,
        }),
        signal: AbortSignal.timeout(config.timeoutMs ?? SOLIQ_DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { fiscalId: null, response: { provider: 'soliq', error: `http_${res.status}` } };
      }
      const data = (await res.json()) as { fiscalId?: string };
      return { fiscalId: data.fiscalId ?? null, response: { provider: 'soliq', data } };
    } catch (err) {
      return {
        fiscalId: null,
        response: { provider: 'soliq', error: err instanceof Error ? err.message : 'unknown' },
      };
    }
  },
});

/**
 * Env asosida fiskal provider tanlash (createSmsChannel precedenti):
 * SOLIQ_API_URL + SOLIQ_API_KEY bo'lsa real Soliq, aks holda NoOp.
 */
export const createFiscalProvider = (env: {
  soliqApiUrl?: string;
  soliqApiKey?: string;
  soliqFiscalId?: string;
}): FiscalProvider =>
  env.soliqApiUrl && env.soliqApiKey
    ? createSoliqFiscalProvider({
        apiUrl: env.soliqApiUrl,
        apiKey: env.soliqApiKey,
        fiscalId: env.soliqFiscalId,
      })
    : createNoOpFiscalProvider();
