import { describe, expect, it } from 'bun:test';
import {
  app,
  clinicReq,
  config,
  connectClinic,
  createLab,
  labLogin,
  labReq,
  linkActive,
  sendCase,
  uniquePhone,
} from './helpers';

const internal = (
  path: string,
  method: string,
  body?: unknown,
  token = config.supervisorHubToken,
) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('ichki admin API (Supervisor → Hub)', () => {
  it('tokensiz/noto‘g‘ri token 401', async () => {
    expect((await app.request('/internal/labs')).status).toBe(401);
    expect((await internal('/internal/labs', 'GET', undefined, 'x'.repeat(40))).status).toBe(401);
  });

  it('lab yaratish: vaqtinchalik parol bir marta, majburiy almashtirish; telefon unique', async () => {
    const phone = uniquePhone();
    const body = {
      name: 'Dental Lab Pro',
      expiresAt: new Date(Date.now() + 86_400_000 * 30).toISOString(),
      leadFullName: 'Sardor',
      leadPhone: phone.replace('+998', ''),
    };
    const res = await internal('/internal/labs', 'POST', body);
    expect(res.status).toBe(201);
    const created = (await res.json()) as {
      lab: { id: string };
      lead: { phone: string; tempPassword: string };
    };
    expect(created.lead.phone).toBe(phone);
    expect(created.lead.tempPassword.length).toBe(16);
    expect((await internal('/internal/labs', 'POST', body)).status).toBe(409);

    const list = (await (await internal('/internal/labs', 'GET')).json()) as {
      labs: { id: string; tempPassword?: string }[];
    };
    const mine = list.labs.find((l) => l.id === created.lab.id);
    expect(mine).toBeDefined();
    expect(JSON.stringify(list)).not.toContain(created.lead.tempPassword);

    const login = await labLogin(phone, created.lead.tempPassword);
    expect(login.mustChangePassword).toBe(true);
    const blocked = await app.request('/v1/lab/cases', {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'auth.password_change_required',
    );
  });

  it('noto‘g‘ri parol 401', async () => {
    const lab = await createLab();
    const res = await app.request('/v1/lab/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': crypto.randomUUID() },
      body: JSON.stringify({ phone: lab.phone, password: 'wrong-password-123' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('lab portali', () => {
  it('lead texnik qo‘shadi; texnik lead-only amallarni bajara olmaydi; taqsimlash', async () => {
    const lab = await createLab();
    const tPhone = uniquePhone();
    const add = await labReq(lab, '/v1/lab/users', {
      method: 'POST',
      body: { fullName: 'Texnik Bobur', phone: tPhone },
    });
    expect(add.status).toBe(201);
    const { user, tempPassword } = (await add.json()) as {
      user: { id: string; role: string };
      tempPassword: string;
    };
    expect(user.role).toBe('technician');

    const first = await labLogin(tPhone, tempPassword);
    const ch = await app.request('/v1/lab/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.token}` },
      body: JSON.stringify({ currentPassword: tempPassword, newPassword: 'Texnik-parol-2026' }),
    });
    const tech = { ...lab, token: ((await ch.json()) as { token: string }).token };

    expect(
      (
        await labReq(tech, '/v1/lab/users', {
          method: 'POST',
          body: { fullName: 'Boshqa Texnik', phone: uniquePhone() },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await labReq(tech, '/v1/lab/price-list', {
          method: 'POST',
          body: { workType: 'x', price: 1 },
        })
      ).status,
    ).toBe(403);

    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    expect(
      (
        await labReq(tech, `/v1/lab/cases/${c.caseId}/price`, {
          method: 'POST',
          body: { price: 5 },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await labReq(tech, `/v1/lab/cases/${c.caseId}/assign`, {
          method: 'POST',
          body: { technicianId: user.id },
        })
      ).status,
    ).toBe(403);
    const asg = await labReq(lab, `/v1/lab/cases/${c.caseId}/assign`, {
      method: 'POST',
      body: { technicianId: user.id },
    });
    expect(asg.status).toBe(200);
    const mine = (await (
      await labReq(tech, `/v1/lab/cases?technicianId=${user.id}&tab=new`)
    ).json()) as { cases: { id: string; assignedTechnicianId: string }[] };
    expect(mine.cases.map((x) => x.id)).toEqual([c.caseId]);
    // texnik holatni o'zgartira oladi
    expect(
      (
        await labReq(tech, `/v1/lab/cases/${c.caseId}/status`, {
          method: 'POST',
          body: { to: 'accepted' },
        })
      ).status,
    ).toBe(200);

    // boshqa labdagi foydalanuvchini taqsimlab bo'lmaydi
    const other = await createLab();
    const otherAdd = await labReq(other, '/v1/lab/users', {
      method: 'POST',
      body: { fullName: 'Begona', phone: uniquePhone() },
    });
    const otherUser = ((await otherAdd.json()) as { user: { id: string } }).user;
    expect(
      (
        await labReq(lab, `/v1/lab/cases/${c.caseId}/assign`, {
          method: 'POST',
          body: { technicianId: otherUser.id },
        })
      ).status,
    ).toBe(404);

    // texnik o'chirilsa — tokeni ishlamaydi
    expect(
      (
        await labReq(lab, `/v1/lab/users/${user.id}`, {
          method: 'PATCH',
          body: { isActive: false },
        })
      ).status,
    ).toBe(200);
    expect((await labReq(tech, '/v1/lab/cases')).status).toBe(401);
  });

  it('prays-list CRUD va akt-sverka: to‘landi belgisi', async () => {
    const lab = await createLab();
    const p = await labReq(lab, '/v1/lab/price-list', {
      method: 'POST',
      body: { workType: 'Toj', material: 'Zirkoniy', price: 450000 },
    });
    expect(p.status).toBe(201);
    const { item } = (await p.json()) as { item: { id: string; price: string } };
    expect(item.price).toBe('450000.00');
    expect(
      (
        await labReq(lab, `/v1/lab/price-list/${item.id}`, {
          method: 'PATCH',
          body: { price: 500000 },
        })
      ).status,
    ).toBe(200);
    const list = (await (await labReq(lab, '/v1/lab/price-list')).json()) as {
      items: { price: string }[];
    };
    expect(list.items.map((i) => i.price)).toEqual(['500000.00']);

    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    for (const price of [100000, 250000]) {
      const c = await sendCase(clinic, lab.labId);
      await labReq(lab, `/v1/lab/cases/${c.caseId}/price`, {
        method: 'POST',
        body: { price, priceListItemId: item.id },
      });
      await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/approve-price`, {
        method: 'POST',
        body: { price },
      });
    }
    const period = new Date().toISOString().slice(0, 7);
    const s = (await (await labReq(lab, `/v1/lab/settlements?period=${period}`)).json()) as {
      rows: { clinicId: string; totalApproved: string; caseCount: number; paidAt: string | null }[];
    };
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({
      clinicId: clinic.clinicId,
      totalApproved: '350000.00',
      caseCount: 2,
      paidAt: null,
    });
    const paid = await labReq(lab, '/v1/lab/settlements/mark-paid', {
      method: 'POST',
      body: { clinicId: clinic.clinicId, period, paid: true },
    });
    expect(paid.status).toBe(200);
    const s2 = (await (await labReq(lab, `/v1/lab/settlements?period=${period}`)).json()) as {
      rows: { paidAt: string | null }[];
    };
    expect(s2.rows[0]!.paidAt).not.toBeNull();
    expect((await labReq(lab, `/v1/lab/price-list/${item.id}`, { method: 'DELETE' })).status).toBe(
      200,
    );
  });

  it('katalog: ko‘rinmas lab yo‘q; klinika so‘rovi labda pending ko‘rinadi', async () => {
    const visible = await createLab();
    const hidden = await createLab({ catalogVisible: false });
    const clinic = await connectClinic();
    const cat = (await (await clinicReq(clinic, '/v1/clinic/labs')).json()) as {
      labs: { id: string; linkStatus: string | null }[];
    };
    expect(cat.labs.some((l) => l.id === visible.labId)).toBe(true);
    expect(cat.labs.some((l) => l.id === hidden.labId)).toBe(false);
    expect(
      (
        await clinicReq(clinic, '/v1/clinic/links', {
          method: 'POST',
          body: { labId: hidden.labId },
        })
      ).status,
    ).toBe(404);
    await clinicReq(clinic, '/v1/clinic/links', { method: 'POST', body: { labId: visible.labId } });
    const links = (await (await labReq(visible, '/v1/lab/links')).json()) as {
      links: { clinicId: string; status: string; clinicName: string }[];
    };
    expect(links.links).toHaveLength(1);
    expect(links.links[0]).toMatchObject({ clinicId: clinic.clinicId, status: 'pending' });
  });
});
