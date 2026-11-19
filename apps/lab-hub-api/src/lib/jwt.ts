import { jwtVerify, SignJWT } from 'jose';

export type LabClaims = {
  sub: string;
  lab: string;
  role: 'lead' | 'technician';
  /** must change password — true bo'lsa faqat change-password/me ochiq. */
  pwc: boolean;
  /** lab_users.token_version — parol almashtirilganda eski tokenlar bekor (FX-141). */
  tv: number;
};

const key = (secret: string) => new TextEncoder().encode(secret);

export const signLabToken = (secret: string, c: LabClaims) =>
  new SignJWT({ lab: c.lab, role: c.role, pwc: c.pwc, tv: c.tv, typ: 'lab' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key(secret));

export const verifyLabToken = async (secret: string, token: string): Promise<LabClaims | null> => {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (payload.typ !== 'lab' || typeof payload.sub !== 'string' || typeof payload.lab !== 'string')
      return null;
    const role = payload.role === 'lead' ? 'lead' : 'technician';
    return {
      sub: payload.sub,
      lab: payload.lab,
      role,
      pwc: payload.pwc === true,
      tv: typeof payload.tv === 'number' ? payload.tv : 0,
    };
  } catch {
    return null;
  }
};
