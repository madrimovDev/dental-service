// Supervisor's RSA public key — verifies `.lic` signatures offline.
// The matching private key lives ONLY in the Supervisor VPS's
// `.env.production` (`RSA_PRIVATE_KEY`), never in this repo.
//
// UPDATED (CLI-361, 2026-07-11): freshly generated production RSA keypair for
// the VM deploy (replaces the old dev keypair of CLI-401). This is the SPKI
// public half; the matching PKCS8 private half lives ONLY in the Supervisor
// VM's env (`RSA_PRIVATE_KEY`), never in this repo. Generated via
// `apps/supervisor-api/src/lib/rsa.ts` generateKeyPair() (RSA-2048, SHA256).
// The keypair MUST stay matched: swapping one half without the other breaks
// all existing `.lic` signatures. Desktop builds bake THIS public key, so any
// keypair change requires rebuilding + redistributing the desktop app.
export const SUPERVISOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq0vbIWAqHLHwMCPCUaqf
Heez0fvyPcHbKBqODNPkYke/L0cv/ysHqRnKqpWycSHgVsTpiHMsnuD0RLsQznwh
aKYAT+vNgdDcCe0kvt4ey2xjLcvN++W88O8o0T0gvPuVbmbqipiwOv1WXLKfoa8A
ztH+cNJ2P4eR8cIyE7kub+UdeE7zD2yiM2hVVDBbzdRnNDi6bDQEMdJFojDUxKcM
O787ITrDRQPUXxIiDHJ/EzXwVjVpK5LVwQpr61SuVbkwunRp34J9WtUPrXuZOo06
MSn8sQTl7KHvUrXx6tA6+/+4XA+EnyC8UA1mDX1c3S4udoldRkKgmd+wIvvNFa8D
XwIDAQAB
-----END PUBLIC KEY-----
`;
