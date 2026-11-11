import { jwtVerify, SignJWT } from 'jose';

export type LabClaims = {
  sub: string;
  lab: string;
  role: 'lead' | 'technician';
  /** must change password — true bo'lsa faqat change-password/me ochiq. */
  pwc: boolean;
};

const key = (secret: string) => new TextEncoder().encode(secret);

export const signLabToken = (secret: string, c: LabClaims) =>
  new SignJWT({ lab: c.lab, role: c.role, pwc: c.pwc, typ: 'lab' })
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
    return { sub: payload.sub, lab: payload.lab, role, pwc: payload.pwc === true };
  } catch {
    return null;
  }
};
