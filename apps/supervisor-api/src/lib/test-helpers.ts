import { SignJWT } from 'jose';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

// Test helper — Task 4'dagi login endpoint bilan bir xil sxema orqali (jose + JWT_SECRET) admin uchun test tokeni yasaydi.
export const signAdminTestToken = async (subject = 'test-admin-id'): Promise<string> => {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret());
};
