import { Modal } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { CartItem, TransactionVM } from '../cashier.types';

export interface ReceiptModalProps {
  opened: boolean;
  onClose: () => void;
  /** Chek manbasi: POS charge javobi yoki tarixdagi tranzaksiya (toTransactionVM). */
  transaction: TransactionVM;
  /**
   * Savat satrlari (faqat POS charge snapshot'idan keladi). Tarixda
   * (TransactionsTable) satrlar tranzaksiya VM'ida mavjud emas (data-gap) →
   * o'tkazib yuboriladi.
   */
  cart?: CartItem[];
  /** Bemor ismi (mavjud bo'lsa). Tarix VM'ida yo'q → placeholder. */
  patientName?: string;
  /** Klinika nomi (mavjud bo'lsa). */
  clinicName?: string;
}

/**
 * Print-ready chek hujjati (paper). DS0 token/dark-mode'dan MUSTAQIL:
 * literal 'Hanken Grotesk' (matn) + 'JetBrains Mono' (raqamlar/chek raqami) +
 * fiks light palitra. Yagona dinamik = i18n matnlar + `t('common.currency')`
 * (formatCurrency/formatNumber, CLI-166).
 *
 * Kontrakt = `transaction: TransactionVM` (+ ixtiyoriy `cart` POS snapshot'i).
 * POS charge (Task B) `toTransactionVM(data)` + savat uzatadi; tarix
 * (TransactionsTable) faqat VM uzatadi (satrlarsiz — data-gap).
 */
export function ReceiptModal({
  opened,
  onClose,
  transaction,
  cart,
  patientName,
  clinicName,
}: ReceiptModalProps) {
  const { t } = useTranslation();

  // Subtotal (chegirmadan oldin): savat satrlari bo'lsa undan, aks holda
  // sof jami + chegirma. Bo'sh massiv truthy → `.length` bilan tekshiramiz.
  const subtotal =
    cart && cart.length > 0
      ? cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      : transaction.totalAmount + transaction.discount;
  const discountPct = subtotal > 0 ? Math.round((transaction.discount / subtotal) * 100) : 0;

  const sans = "'Hanken Grotesk', sans-serif";
  const mono = "'JetBrains Mono', monospace";
  const ink = '#192420';
  const muted = '#5a6a64';
  const item = '#3c4a45';
  const dashed = '#c4ccc4';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      centered
      padding={0}
      size="auto"
      overlayProps={{ color: '#0a100e', backgroundOpacity: 0.55, blur: 3 }}
      styles={{
        content: {
          width: 'min(420px, 96vw)',
          background: '#fff',
          borderRadius: 8,
          overflow: 'hidden',
        },
        body: { padding: 0 },
      }}
    >
      {/* Dark header bar */}
      <div
        style={{
          background: '#10201c',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600, color: '#cfe3dd' }}>
          {t('cashier.receipt')} · {transaction.receiptNumber ?? '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              fontFamily: sans,
              fontSize: 12.5,
              fontWeight: 600,
              background: '#27b49c',
              color: '#04130f',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            {t('cashier.receipt_modal.print')}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: sans,
              fontSize: 12.5,
              fontWeight: 600,
              background: 'transparent',
              color: '#cfe3dd',
              border: '1px solid #2c4842',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            {t('cashier.receipt_modal.close')}
          </button>
        </div>
      </div>

      {/* Paper body */}
      <div
        style={{
          padding: '26px 28px',
          color: ink,
          fontFamily: sans,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {/* Klinika header */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>
            {clinicName ?? t('cashier.title')}
          </div>
        </div>

        <div style={{ borderTop: `1px dashed ${dashed}`, margin: '0 0 14px' }} />

        {/* Bemor qatori */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: muted,
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          <span>{t('cashier.patient')}</span>
          <span style={{ color: item }}>{patientName ?? t('cashier.no_patient')}</span>
        </div>

        {/* Savat satrlari (faqat mavjud bo'lsa) */}
        {cart && cart.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {cart.map((i) => (
              <div
                key={i.service.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 6,
                }}
              >
                <span style={{ color: item }}>
                  {i.service.nameUz}
                  {i.quantity > 1 ? ` × ${formatNumber(i.quantity)}` : ''}
                </span>
                <span style={{ fontFamily: mono, fontWeight: 600, color: ink }}>
                  {formatCurrency(i.unitPrice * i.quantity, t)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: `1px dashed ${dashed}`, margin: '0 0 14px' }} />

        {/* Totals */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: muted,
            fontSize: 12,
            marginBottom: 6,
          }}
        >
          <span>{t('cashier.subtotal')}</span>
          <span style={{ fontFamily: mono, color: item }}>{formatCurrency(subtotal, t)}</span>
        </div>
        {transaction.discount > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: muted,
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            <span>
              {t('cashier.discount')} · {formatNumber(discountPct)}%
            </span>
            <span style={{ fontFamily: mono, color: item }}>
              −{formatCurrency(transaction.discount, t)}
            </span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginTop: 10,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>
            {t('cashier.receipt_modal.total')}
          </span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 20, color: ink }}>
            {formatCurrency(transaction.totalAmount, t)}
          </span>
        </div>

        <div style={{ borderTop: `1px dashed ${dashed}`, margin: '14px 0' }} />

        {/* To'lov usuli */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: muted,
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          <span>{t('cashier.method_label')}</span>
          <span style={{ color: item }}>{t(`cashier.method.${transaction.paymentMethod}`)}</span>
        </div>

        {/* NoOp fiskal footer */}
        <div
          data-testid="receipt-noop-footer"
          style={{ textAlign: 'center', color: muted, fontSize: 11, fontStyle: 'italic' }}
        >
          {t('cashier.noop_fiscal')}
        </div>
      </div>
    </Modal>
  );
}
