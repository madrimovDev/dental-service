/**
 * @dental/fiscal — provider tanlash + NoOp/Soliq xulqi (V3-1, sof, tarmoqsiz).
 */
import { describe, expect, test } from 'bun:test';
import {
  createFiscalProvider,
  createNoOpFiscalProvider,
  createSoliqFiscalProvider,
} from './index.ts';

const payment = { id: 'p1', amount: 100000, items: [] };

describe('fiscal provider', () => {
  test('NoOp: fiscalId null, provider=noop', async () => {
    const r = await createNoOpFiscalProvider().createReceipt(payment);
    expect(r.fiscalId).toBeNull();
    expect((r.response as { provider: string }).provider).toBe('noop');
  });

  test('createFiscalProvider: env yo‘q → NoOp', async () => {
    const r = await createFiscalProvider({}).createReceipt(payment);
    expect((r.response as { provider: string }).provider).toBe('noop');
  });

  test('createFiscalProvider: SOLIQ_* env bor → Soliq (provider=soliq)', async () => {
    const provider = createFiscalProvider({
      soliqApiUrl: 'http://127.0.0.1:1',
      soliqApiKey: 'k',
    });
    // 127.0.0.1:1 — ulanish rad → catch → fiscalId null, provider=soliq (cashier bloklanmaydi).
    const r = await provider.createReceipt(payment);
    expect(r.fiscalId).toBeNull();
    expect((r.response as { provider: string }).provider).toBe('soliq');
  });

  test('Soliq xato → throw EMAS, fiscalId null', async () => {
    const r = await createSoliqFiscalProvider({
      apiUrl: 'http://127.0.0.1:1',
      apiKey: 'k',
    }).createReceipt(payment);
    expect(r.fiscalId).toBeNull();
  });
});
