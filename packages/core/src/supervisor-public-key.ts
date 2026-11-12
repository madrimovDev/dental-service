// Supervisor's RSA public key — verifies `.lic` signatures offline.
// The matching private key lives ONLY on the Supervisor VPS
// (`/srv/dental/secrets/supervisor-private.pem` → `RSA_PRIVATE_KEY`), never in this repo.
//
// ROTATED (FU-54, 2026-11-12): the previous production private key was exposed in a
// local agent transcript, so a fresh RSA-2048 keypair was generated ON the VPS
// (infra/vps/gen-secrets.sh). Every `.lic` signed by the old key and every desktop
// installer built before this commit is INVALID — rebuild + redistribute.
// The keypair MUST stay matched: swapping one half without the other breaks
// all existing `.lic` signatures. Desktop builds bake THIS public key.
export const SUPERVISOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvmbxBkoX5oo3cyqKmdzN
xls3M3eZcDSLiy8D/MZqCetdnOX+/avPKeEblmgTnKPMD49jZtnocc87mkW17x1I
bfYt9cH8zXkiKnd419rivzo62UUdKz4VW9y+bVzxxO87m24019trFl0WJaAjsnDr
xvV1OJT1lARWt9MCT6sCqxYjZ7ttiQYD3g3R9iZyxqyRPCWmDQnKYV8r+vSh+CoH
ihEfjnJ566kXwHLnvs56A/a7BwhKRk7HlPROHy4pvoxHrrHgXizEcmQdQE7jcC8/
JilXbBXNmrwEfMHRRr0gPEMb5XH3zEPxuTMbxXCgFywuZxKk7CbA2cgGRm9rtkOm
wwIDAQAB
-----END PUBLIC KEY-----
`;
