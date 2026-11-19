import { describe, expect, test } from 'bun:test';
import { Telegraf } from 'telegraf';
import { createBotLifecycle, type LifecycleBot, telegrafLifecycleBot } from './bot-lifecycle.ts';

/** Telegraf xulqini taqlid qiladi: launch getMe kutadi, polling o'rnatiladi; stop() polling yo'q bo'lsa otadi. */
class FakeBot implements LifecycleBot {
  polling = false;
  stopped = false;
  private getMe!: { resolve: () => void; reject: (e: Error) => void };
  private finish!: () => void;
  readonly getMePromise = new Promise<void>((res, rej) => {
    this.getMe = { resolve: res, reject: rej };
  });
  constructor(readonly token: string) {
    this.getMePromise.catch(() => {});
  }
  okGetMe = () => this.getMe.resolve();
  failGetMe = () => this.getMe.reject(new Error('401 Unauthorized'));
  async launch(onLaunch: () => void) {
    await this.getMePromise;
    onLaunch();
    this.polling = true;
    await new Promise<void>((res) => {
      this.finish = res;
    });
  }
  stop() {
    if (!this.polling) throw new Error('Bot is not running!');
    this.stopped = true;
    this.polling = false;
    this.finish();
  }
}

const setup = () => {
  const created: FakeBot[] = [];
  const lc = createBotLifecycle<FakeBot>({
    create: (_t, token) => {
      const b = new FakeBot(token);
      created.push(b);
      return b;
    },
  });
  return { created, lc };
};
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('FX-40 bot lifecycle', () => {
  test('premise: haqiqiy Telegraf ishga tushmagan botda stop() otadi', () => {
    expect(() => new Telegraf('1:abc').stop()).toThrow('Bot is not running!');
  });

  test("launch yiqilgan bot ro'yxatdan o'chadi; reload yangi token bilan ishga tushadi", async () => {
    const { created, lc } = setup();
    await lc.start('t1', 'bad');
    created[0]!.failGetMe();
    await tick();
    expect(lc.has('t1')).toBe(false);

    await lc.reload('t1', async () => 'good');
    expect(created).toHaveLength(2);
    expect(lc.has('t1')).toBe(true);
    created[1]!.okGetMe();
    await tick();
    expect(created[1]!.polling).toBe(true);
  });

  test("yiqilmagan lekin hali launch bo'layotgan bot reload qilinsa: stop throw qilmaydi, eski polling boshlanmaydi", async () => {
    const { created, lc } = setup();
    await lc.start('t1', 'a');
    await lc.reload('t1', async () => 'b'); // eski bot hali getMe kutmoqda → stop() otadi
    expect(created).toHaveLength(2);
    created[0]!.okGetMe(); // kech keldi — cancelled → onLaunch otadi
    created[1]!.okGetMe();
    await tick();
    expect(created[0]!.polling).toBe(false);
    expect(created[1]!.polling).toBe(true);
    expect(lc.has('t1')).toBe(true); // eski instance yangisini o'chirib yubormadi
  });

  test("stopAll: bitta dead bot qolganlarni to'xtatishni to'sib qo'ymaydi", async () => {
    const { created, lc } = setup();
    await lc.start('t1', 'dead'); // getMe tugamagan → stop() otadi
    await lc.start('t2', 'ok');
    created[1]!.okGetMe();
    await tick();
    expect(() => lc.stopAll()).not.toThrow();
    expect(created[1]!.stopped).toBe(true);
    expect(lc.size()).toBe(0);
  });
});

describe('FX-143 parallel reload/bootAll', () => {
  test("bir tenantga parallel start/reload — bir vaqtda faqat bitta faol bot, qolganlari to'xtatilgan", async () => {
    const { created, lc } = setup();
    const readers = ['x', 'y', 'z'].map((t) => async () => t);
    await Promise.all([lc.start('t1', 'boot'), ...readers.map((r) => lc.reload('t1', r))]);
    expect(created.map((b) => b.token)).toEqual(['boot', 'x', 'y', 'z']);
    for (const b of created) b.okGetMe();
    await tick();
    const polling = created.filter((b) => b.polling);
    expect(polling).toHaveLength(1);
    expect(polling[0]!.token).toBe('z');
    expect(lc.size()).toBe(1);
  });

  test('reload token o‘qishi sekin bo‘lsa ham tartib saqlanadi (kech o‘qilgan eski token yangisini bosmaydi)', async () => {
    const { created, lc } = setup();
    const slow = lc.reload('t1', async () => {
      await new Promise((r) => setTimeout(r, 30));
      return 'old';
    });
    const fast = lc.reload('t1', async () => 'new');
    await Promise.all([slow, fast]);
    expect(created.map((b) => b.token)).toEqual(['old', 'new']);
    for (const b of created) b.okGetMe();
    await tick();
    expect(created.filter((b) => b.polling).map((b) => b.token)).toEqual(['new']);
  });
});

/**
 * FX-143 review — HAQIQIY Telegraf 4.16.3 (faqat `callApi` stub): launch = getMe → onLaunch →
 * `await deleteWebhook()` → startPolling. onLaunch o'tib, deleteWebhook kutilayotgan oynada
 * stop() `Bot is not running!` otadi; eski launch keyin startPolling'ga o'tib hech kim
 * to'xtata olmaydigan poller qoldirardi (FakeBot bu bosqichni modellamasdi).
 */
describe('FX-143 real Telegraf: deleteWebhook oynasida reload/stop', () => {
  type Inst = {
    bot: Telegraf;
    token: string;
    getUpdates: number;
    syncCalls: unknown[];
    handled: number;
    inDeleteWebhook: Promise<void>;
    releaseDeleteWebhook: () => void;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const setupReal = () => {
    const insts: Inst[] = [];
    const lc = createBotLifecycle({
      create: (_t, token) => {
        const bot = new Telegraf(token);
        let enter!: () => void;
        let release!: () => void;
        const gate = new Promise<void>((r) => {
          release = r;
        });
        const inst: Inst = {
          bot,
          token,
          getUpdates: 0,
          syncCalls: [],
          handled: 0,
          inDeleteWebhook: new Promise<void>((r) => {
            enter = r;
          }),
          releaseDeleteWebhook: release,
        };
        insts.push(inst);
        // biome-ignore lint/suspicious/noExplicitAny: test stub — Telegram HTTP o'rniga
        (bot.telegram as any).callApi = async (
          method: string,
          payload: { timeout?: number },
          opts?: { signal?: AbortSignal },
        ) => {
          if (method === 'getMe') return { id: 1, is_bot: true, first_name: 'b', username: 'b' };
          if (method === 'deleteWebhook') {
            enter();
            await gate;
            return true;
          }
          if (method === 'getUpdates' && payload.timeout === undefined) {
            inst.syncCalls.push(payload); // Polling.syncUpdateOffset (offset tasdig'i)
            return [];
          }
          if (method === 'getUpdates') {
            inst.getUpdates++;
            if (inst.getUpdates === 1) {
              return [
                {
                  update_id: 7,
                  message: {
                    message_id: 1,
                    date: 0,
                    chat: { id: 5, type: 'private', first_name: 'x' },
                    text: 'hi',
                  },
                },
              ];
            }
            await new Promise<void>((res, rej) => {
              const t = setTimeout(res, 5);
              opts?.signal?.addEventListener('abort', () => {
                clearTimeout(t);
                rej(Object.assign(new Error('aborted'), { name: 'AbortError' }));
              });
            });
            return [];
          }
          return true;
        };
        const lcBot = telegrafLifecycleBot(bot);
        bot.on('message', () => {
          inst.handled++;
        });
        return lcBot;
      },
    });
    return { insts, lc };
  };

  for (const sameToken of [false, true]) {
    test(`reload deleteWebhook oynasida — eski bot poll qilmaydi (${sameToken ? 'bir xil' : 'boshqa'} token)`, async () => {
      const { insts, lc } = setupReal();
      await lc.reload('t', async () => '111:AAA');
      await insts[0]!.inDeleteWebhook; // getMe + onLaunch o'tdi, polling hali yo'q
      await lc.reload('t', async () => (sameToken ? '111:AAA' : '222:BBB'));
      expect(insts).toHaveLength(2);
      insts[0]!.releaseDeleteWebhook();
      insts[1]!.releaseDeleteWebhook();
      await sleep(60);
      expect(insts[0]!.getUpdates).toBe(0);
      expect(insts[1]!.getUpdates).toBeGreaterThan(0);
      expect(lc.size()).toBe(1);
      lc.stopAll();
      await sleep(20);
      const after = insts[1]!.getUpdates;
      await sleep(40);
      expect(insts[1]!.getUpdates).toBe(after);
    });
  }

  test('stopAll deleteWebhook oynasida — hech bir poller qolmaydi', async () => {
    const { insts, lc } = setupReal();
    await lc.start('t', '111:AAA');
    await insts[0]!.inDeleteWebhook;
    expect(() => lc.stopAll()).not.toThrow();
    insts[0]!.releaseDeleteWebhook();
    await sleep(40);
    expect(insts[0]!.getUpdates).toBe(0);
    expect(lc.size()).toBe(0);
  });

  test("ishlayotgan botni oddiy to'xtatish offset'ni tasdiqlaydi (qayta yetkazilmaydi)", async () => {
    const { insts, lc } = setupReal();
    await lc.start('t', '111:AAA');
    insts[0]!.releaseDeleteWebhook();
    await sleep(30);
    expect(insts[0]!.handled).toBe(1);
    await lc.stop('t');
    await sleep(20);
    expect(insts[0]!.syncCalls).toEqual([{ offset: 8, limit: 1 }]);
  });

  test("to'xtatilgan bot kech kelgan update'ni qayta ishlamaydi", async () => {
    const { insts, lc } = setupReal();
    await lc.start('t', '111:AAA');
    await insts[0]!.inDeleteWebhook;
    await lc.stop('t');
    await insts[0]!.bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 5, type: 'private', first_name: 'x' },
        text: 'hi',
      },
    } as never);
    expect(insts[0]!.handled).toBe(0);
    insts[0]!.releaseDeleteWebhook();
    await sleep(20);
  });
});
