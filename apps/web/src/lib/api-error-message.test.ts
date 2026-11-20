import { ApiError } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error-message';
import { i18n } from './i18n';

describe('apiErrorMessage (FX-155 review)', () => {
  it.each([
    ['ownership.not_practitioner'],
    ['prescription.on_behalf_forbidden'],
    ['visit_note.on_behalf_forbidden'],
    ['discount.forbidden'],
    ['patient.discount_exceeds_max'],
    // FT-01 review: davolash rejasi / «bajarilgan ish» 409/400/403 kodlari.
    ['plan.locked'],
    ['plan.not_active'],
    ['plan.doctor_mismatch'],
    ['stage.locked'],
    ['visit_note.signed'],
    ['visit_note.stage_linked'],
    ['ownership.not_found'],
    ['ownership.mismatch'],
    ['medical_record.on_behalf_forbidden'],
  ])('%s — uz va ru tarjimasi bor, xom server matni ko‘rsatilmaydi', async (code) => {
    const err = new ApiError(code, 'Ownership check failed for user: not_practitioner', 400);
    await i18n.changeLanguage('uz');
    const uz = apiErrorMessage(err);
    await i18n.changeLanguage('ru');
    const ru = apiErrorMessage(err);
    await i18n.changeLanguage('uz');
    expect(uz).not.toContain('Ownership');
    expect(uz).not.toBe(`apiErrors.${code}`);
    expect(ru).not.toBe(uz);
  });

  it('FT-04: details interpolatsiya qilinadi (maxPercent)', async () => {
    await i18n.changeLanguage('uz');
    const msg = apiErrorMessage(
      new ApiError('patient.discount_exceeds_max', 'x', 400, { maxPercent: 15 }),
    );
    expect(msg).toContain('15%');
  });

  it('tarjimasi yo‘q kod — server xabari', () => {
    expect(apiErrorMessage(new ApiError('x.unknown', 'boom', 500))).toBe('boom');
  });
});
