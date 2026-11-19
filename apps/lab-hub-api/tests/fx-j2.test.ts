import { describe, expect, it } from 'bun:test';
import { app, createLab, labLogin, labReq, uniquePhone } from './helpers';

const addUser = async (lab: Awaited<ReturnType<typeof createLab>>, phone: string) => {
  const res = await labReq(lab, '/v1/lab/users', {
    method: 'POST',
    body: { fullName: 'Texnik Test', phone },
  });
  return res;
};

const setActive = (lab: Awaited<ReturnType<typeof createLab>>, id: string, isActive: boolean) =>
  labReq(lab, `/v1/lab/users/${id}`, { method: 'PATCH', body: { isActive } });

describe('FX-119: telefon bandligi faqat faol hisoblar uchun', () => {
  it('nofaol texnik telefoni boshqa labga qo‘shilishi mumkin; qayta aktivatsiya to‘qnashuvda 409', async () => {
    const labA = await createLab();
    const labB = await createLab();
    const phone = uniquePhone();

    const addA = await addUser(labA, phone);
    expect(addA.status).toBe(201);
    const techA = ((await addA.json()) as { user: { id: string } }).user;

    // faol bo'lgan paytda boshqa labga qo'shib bo'lmaydi
    expect((await addUser(labB, phone)).status).toBe(409);

    // Lab A texnikni nofaol qiladi — telefon ozod
    expect((await setActive(labA, techA.id, false)).status).toBe(200);
    const addB = await addUser(labB, phone);
    expect(addB.status).toBe(201);
    const { tempPassword } = (await addB.json()) as { tempPassword: string };

    // login endi Lab B'ning faol hisobiga olib boradi (token lab'i = B)
    const login = await labLogin(phone, tempPassword);
    const ch = await app.request('/v1/lab/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ currentPassword: tempPassword, newPassword: 'Texnik-parol-2026' }),
    });
    expect(ch.status).toBe(200);
    const { token } = (await ch.json()) as { token: string };
    const me = (await (await labReq({ ...labB, token }, '/v1/lab/me')).json()) as {
      lab: { id: string };
    };
    expect(me.lab.id).toBe(labB.labId);

    // Lab A eski texnikni qayta yoqa olmaydi: telefon Lab B'da faol
    expect((await setActive(labA, techA.id, true)).status).toBe(409);
  });
});

describe('FX-141: parol almashtirish eski tokenlarni bekor qiladi; change-password limitlanadi', () => {
  const changePassword = (token: string, currentPassword: string, newPassword: string) =>
    app.request('/v1/lab/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

  it('parol almashgach eski token 401, yangi token ishlaydi', async () => {
    const lab = await createLab();
    const oldToken = (await labLogin(lab.phone, lab.password)).token;
    expect((await labReq({ ...lab, token: oldToken }, '/v1/lab/me')).status).toBe(200);

    const ch = await changePassword(oldToken, lab.password, 'Yangi-parol-2026-x');
    expect(ch.status).toBe(200);
    const { token: newToken } = (await ch.json()) as { token: string };

    expect((await labReq({ ...lab, token: oldToken }, '/v1/lab/me')).status).toBe(401);
    expect((await labReq({ ...lab, token: newToken }, '/v1/lab/me')).status).toBe(200);
    // yangi parol bilan qayta kirish ishlaydi
    const again = await labLogin(lab.phone, 'Yangi-parol-2026-x');
    expect((await labReq({ ...lab, token: again.token }, '/v1/lab/me')).status).toBe(200);
  });

  it('change-password noto‘g‘ri parol bilan ketma-ket urinishda 429', async () => {
    const lab = await createLab();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      statuses.push(
        (await changePassword(lab.token, 'noto-g-ri-parol', 'Yangi-parol-2026-y')).status,
      );
    }
    expect(statuses[0]).toBe(401);
    expect(statuses).toContain(429);
    // sessiya o'chmagan (FX-100) — limit faqat change-password'ga tegadi
    expect((await labReq(lab, '/v1/lab/me')).status).toBe(200);
  });
});
