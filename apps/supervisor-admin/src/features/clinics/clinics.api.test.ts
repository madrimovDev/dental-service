import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClinic } from './clinics.api';

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe('createClinic', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it("POST /v1/admin/clinics ga to'g'ri body yuboradi va { clinic, license } qaytaradi", async () => {
    const clinic = {
      id: 'c1',
      name: 'New Clinic',
      contactEmail: 'new@test.com',
      contactPhone: null,
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    const license = {
      id: 'lic1',
      clinicId: 'c1',
      branchId: 'b1',
      licenseKey: 'ABCDE-FGHIJ-KLMNO-PQRST',
      fingerprint: null,
      plan: 'standard',
      modules: ['patients'],
      gracePeriodDays: 30,
      expiresAt: '2027-07-04T00:00:00.000Z',
      isActive: true,
      lastHeartbeatAt: null,
      activatedAt: null,
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ clinic, license }));

    const result = await createClinic({
      name: 'New Clinic',
      contactEmail: 'new@test.com',
      plan: 'standard',
      expiresAt: '2027-07-04',
      gracePeriodDays: 30,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/admin/clinics'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'New Clinic',
          contactEmail: 'new@test.com',
          plan: 'standard',
          expiresAt: '2027-07-04',
          gracePeriodDays: 30,
        }),
      }),
    );
    expect(result).toEqual({ clinic, license });
  });

  it('server 400/500 qaytarsa generic xato tashlaydi', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, false));

    await expect(
      createClinic({
        name: '',
        plan: 'starter',
        expiresAt: '2027-01-01',
        gracePeriodDays: 30,
      }),
    ).rejects.toThrow("Klinika yaratib bo'lmadi");
  });
});
