// Supervisor's RSA public key — verifies `.lic` signatures offline.
// The matching private key lives ONLY in the Supervisor VPS's
// `.env.production` (`RSA_PRIVATE_KEY`), never in this repo. This file is
// filled in by hand (copy-paste), per infra/supervisor/README.md
// "RSA keypair generation".
//
// ⚠️ OPEN QUESTION (docs/superpowers/specs/2026-07-04-cli-362-* §2.2):
// no real production keypair has been generated/persisted yet as of this
// writing — only a locally-generated dev RSA_PRIVATE_KEY exists in the
// gitignored apps/supervisor-api/.env, with no corresponding public-key
// artifact saved anywhere. An operator must decide (a) treat that dev key
// as the permanent root of trust and derive its public half via
// `crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' })`,
// or (b) generate a fresh production keypair via the README snippet —
// then paste the resulting PEM below, replacing this placeholder.
//
// Until replaced, this is NOT a valid PEM: `verifyLicenseSignature()` will
// fail closed (return false) for every real `.lic` file. This is the
// intended safe default — no license silently verifies against a
// placeholder.
export const SUPERVISOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
REPLACE_ME_BEFORE_PRODUCTION_DEPLOY_SEE_COMMENT_ABOVE
-----END PUBLIC KEY-----
`;
