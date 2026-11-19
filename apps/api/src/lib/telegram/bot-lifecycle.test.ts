import { describe, expect, test } from 'bun:test';
import { Telegraf } from 'telegraf';
import { createBotLifecycle, type LifecycleBot } from './bot-lifecycle.ts';

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
