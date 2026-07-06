// Supervisor's RSA public key — verifies `.lic` signatures offline.
// The matching private key lives ONLY in the Supervisor VPS's
// `.env.production` (`RSA_PRIVATE_KEY`), never in this repo.
//
// RESOLVED (CLI-401, 2026-07-06): the locally-generated dev RSA_PRIVATE_KEY
// (gitignored apps/supervisor-api/.env) was chosen as the permanent root of
// trust — this is its public half, derived via
// `crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' })`.
// Any future production deploy must keep using this same keypair (or update
// both this file and the VPS `.env.production` together) — swapping one
// without the other breaks all existing `.lic` signatures.
export const SUPERVISOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuTI9WMh1rY7DC66dCmcT
XaKQ+B0fiVt+xGxxJoB1qapV8W2JC/1X2fFJIIyq7zppbJ5AC04LHQG2Mqf8lAYs
XZQefLGbR5aYaJy3l2dlVCHiLXe7T2X19okTp6jNqkTnIZPZqGChodXndqekEOW0
/yqq3geiGDnhW7tH6skihxF0KqL4F8f7XgG0TZbQeBvw6ZVysAH76TU7fN+npWq1
/iTRg6GJ5wmo78jAx6utMzzqV1mkP2aOqnyYr/UFTWEAvAYwuE+xawf2DUWma62G
X3ZPCt00xzFwR5cZwvmx6kL9hprYVkCdvhvrPyPMCnXD2+MvZ74lkcMR8duGuMur
WQIDAQAB
-----END PUBLIC KEY-----
`;
