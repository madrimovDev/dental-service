export const meta = {
  name: 'fix-lanes',
  description:
    'Run fix/feature lanes: per-group implementer (sequential within lane, escalate sonnet->opus), max N lanes concurrent, then test-runner + reviewer (+ opus verifier) + one fix round per lane',
  whenToUse:
    'dental-service batches. args: { plan, backlog, audit, concurrency?, lanes: [{ key, name, model: "sonnet"|"opus", verifier: bool, groups: [[ "FX-..", ...], ...] }] }. Worktrees must exist at .claude/worktrees/fx-<key> (scripts/wf-lane.sh prep).',
  phases: [
    { title: 'Implement', detail: 'one implementer per group of 1-3 FX, sequential inside lane' },
    { title: 'Check', detail: 'test-runner rerun, reviewer, verifier per lane' },
    { title: 'Fix', detail: 'one fix round for reviewer/verifier issues' },
  ],
};

const ROOT = '/home/madrimov/Projects/dental-service';
const A = args || {};
const PLAN = A.plan;
const BACKLOG = A.backlog || `${ROOT}/docs/FIX-BACKLOG-2026-11-19.md`;
const AUDIT = A.audit || `${ROOT}/docs/LOGIC-AUDIT-2026-11-19.md`;
const CONC = A.concurrency || 4;
const S = { model: 'sonnet', effort: 'high' };
const O = { model: 'opus', effort: 'high' };

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    advisorCalled: { type: 'boolean' },
    status: { type: 'string', enum: ['done', 'blocked', 'failed'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          outcome: { type: 'string', enum: ['fixed', 'not_reproduced', 'partial', 'none'] },
          note: { type: 'string' },
        },
        required: ['id', 'outcome'],
      },
    },
    commits: { type: 'array', items: { type: 'string' } },
    testsRun: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, result: { type: 'string' } },
        required: ['file', 'result'],
      },
    },
    failingFirstSeen: { type: 'boolean' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    notDone: { type: 'array', items: { type: 'string' } },
    windowsOnly: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['advisorCalled', 'status', 'items', 'commits', 'testsRun', 'notDone', 'summary'],
};
const TEST_SCHEMA = {
  type: 'object',
  properties: {
    advisorCalled: { type: 'boolean' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          pass: { type: 'number' },
          fail: { type: 'number' },
          firstError: { type: 'string' },
        },
        required: ['file', 'pass', 'fail'],
      },
    },
    typecheck: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pkg: { type: 'string' },
          ok: { type: 'boolean' },
          firstError: { type: 'string' },
        },
        required: ['pkg', 'ok'],
      },
    },
    allGreen: { type: 'boolean' },
  },
  required: ['advisorCalled', 'results', 'typecheck', 'allGreen'],
};
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    advisorCalled: { type: 'boolean' },
    verdict: { type: 'string', enum: ['approve', 'changes_requested'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          fx: { type: 'string' },
          where: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'where', 'problem'],
      },
    },
  },
  required: ['advisorCalled', 'verdict', 'issues'],
};

const wt = (l) => `${ROOT}/.claude/worktrees/fx-${l.key}`;
const br = (l) => `wf/fx-${l.key}`;

const implPrompt = (l, grp, done) => `Sen dental-service lane implementer'isan.
Worktree: ${wt(l)} (branch ${br(l)}) — FAQAT shu papkada ishla (har buyruqdan oldin cd ${wt(l)}). Lane bazasi va Redis worktree .env'ida (buyruqqa URL qo'shma).
Vazifa guruhi: **${grp.join(', ')}** (lane ${l.key}: ${l.name}). Har band alohida commit (fix(<ID>): …).
O'qi: reja ${PLAN} (umumiy qoidalar + lane jadvali), FIX-BACKLOG ${BACKLOG} (har ID qatori — tavsif va tuzatish yo'nalishi; §4.1 🛠 qarorlar), dalil ${AUDIT} (LA/LB bo'limlari).
Lane'da oldin bajarilganlar: ${done.length ? done.join('; ') : "yo'q"}.
Tartib har band uchun: failing test (yiqilishini ko'r) → minimal tuzatish → yashil → tegilgan paket typecheck → commit. Statik topilma test bilan isbotlanmasa — tuzatma, outcome=not_reproduced. Pul/RLS/ruxsat — real-DB test, real cheklangan rol. Faqat shu guruh doirasi. main'ga merge/push, git stash, bun install TAQIQ. advisor chaqirma.`;

const runGroup = async (l, grp, done) => {
  let t = l.model === 'opus' ? O : S;
  for (;;) {
    const r = await agent(implPrompt(l, grp, done), {
      label: `impl:${l.key}:${grp.join('+')}:${t.model}`,
      phase: 'Implement',
      agentType: 'implementer',
      schema: IMPL_SCHEMA,
      model: t.model,
      effort: t.effort,
    });
    if (r && r.status === 'done') return { ...r, group: grp, tierUsed: t.model };
    if (t.model === 'opus')
      return r
        ? { ...r, group: grp, tierUsed: t.model }
        : {
            group: grp,
            status: 'failed',
            items: [],
            commits: [],
            testsRun: [],
            notDone: ['agent null'],
            summary: 'null',
          };
    log(`${l.key}/${grp.join('+')}: ${r ? r.status : 'null'} -> escalate opus`);
    t = O;
  }
};

const runLane = async (l) => {
  const results = [];
  for (const grp of l.groups) {
    const done = results.map(
      (r) => `${r.group.join('+')}: ${r.status} — ${(r.summary || '').slice(0, 140)}`,
    );
    results.push(await runGroup(l, grp, done));
  }
  const testFiles = [...new Set(results.flatMap((r) => (r.testsRun || []).map((x) => x.file)))];
  const touched = [...new Set(results.flatMap((r) => r.filesTouched || []))];
  const check = async (round) => {
    const tr = await agent(
      `Worktree ${wt(l)} (branch ${br(l)}). cd shu papkaga. Quyidagi test fayllarini HAR BIRINI ALOHIDA jarayonda yurgiz (API: cd apps/api && bun test --env-file=../../.env --timeout 30000 <fayl>; web: cd apps/web && bunx vitest run <fayl>; supervisor: cd apps/supervisor-api && bun run test <fayl>; lab-hub: paket package.json test skripti) va tegilgan paketlar typecheck'ini (bunx tsc --noEmit). Fayllar: ${JSON.stringify(testFiles)}. Tegilgan: ${JSON.stringify(touched)}. Kodni tuzatma. advisor chaqirma.`,
      {
        label: `test:${l.key}:${round}`,
        phase: 'Check',
        agentType: 'test-runner',
        schema: TEST_SCHEMA,
        model: 'haiku',
        effort: 'low',
      },
    );
    const reviewThunk = () =>
      agent(
        `Lane diff'ini ko'rib chiq: cd ${wt(l)} && git diff main...${br(l)}. Reja ${PLAN} (lane ${l.key}) va FIX-BACKLOG ${BACKLOG} bo'yicha: har ID bajarilganmi, scope'dan chiqilmaganmi, qoidalar (RLS/getDb, fail() vs throw, onAfterCommit, i18n ikkala tilda, real cheklangan rol testi, pul/RLS'da real-DB test, generatsiya qilingan fayl qo'lda tahrirlanmagan). Hisobotlar: ${JSON.stringify(results.map((r) => ({ group: r.group, status: r.status, items: r.items, notDone: r.notDone })))}. Faylga yozma. advisor chaqirma.`,
        {
          label: `review:${l.key}:${round}`,
          phase: 'Check',
          agentType: 'reviewer',
          schema: REVIEW_SCHEMA,
          model: 'sonnet',
          effort: 'medium',
        },
      );
    const verifyThunk = () =>
      agent(
        `Adversarial verify: cd ${wt(l)} && git diff main...${br(l)}. Lane ${l.name}. Har o'zgarishni RAD ETISHGA urin: tuzatish topilma scenariysini yopadimi (FIX-BACKLOG ${BACKLOG}, ${AUDIT}), yangi teshik/regressiya ochmadimi (boshqa rol, filial/tenant, 4xx commit, poyga, eski klient, ikki marta hisoblash), testlar haqiqatan xatoni tutadimi. Aniq failure scenariy — blocker/major. Probe skriptlari faqat scratchpad'da, lane bazasida. Repo fayllarini o'zgartirma. advisor chaqirma.`,
        {
          label: `verify:${l.key}:${round}`,
          phase: 'Check',
          agentType: 'verifier',
          schema: REVIEW_SCHEMA,
          model: 'opus',
          effort: 'high',
        },
      );
    const [rv, vf] = await parallel(l.verifier ? [reviewThunk, verifyThunk] : [reviewThunk]);
    return { tr, rv, vf };
  };
  let c = await check(1);
  const issues = (x) =>
    [...((x.rv && x.rv.issues) || []), ...((x.vf && x.vf.issues) || [])].filter(
      (i) => i.severity !== 'minor',
    );
  let fixRound = null;
  if (issues(c).length || (c.tr && !c.tr.allGreen)) {
    fixRound = await agent(
      `Worktree ${wt(l)} (branch ${br(l)}), cd shu papkaga. Lane ${l.name}: review/verify muammolarini tuzat (har biriga avval test, keyin tuzatish, commit fix(<ID>): review …). Muammolar: ${JSON.stringify(issues(c))}. Test/typecheck natijasi: ${JSON.stringify(c.tr)} (eslatma: testlar bitta jarayonda birga yurgizilsa env oqishi mumkin — avval faylni alohida yurgizib tekshir). Reja ${PLAN}. Rozi bo'lmagan muammoni tuzatma — notDone'ga sabab bilan. merge/push/stash/bun install TAQIQ. advisor chaqirma.`,
      {
        label: `fix:${l.key}`,
        phase: 'Fix',
        agentType: 'implementer',
        schema: IMPL_SCHEMA,
        model: 'opus',
        effort: 'high',
      },
    );
    if (fixRound) testFiles.push(...(fixRound.testsRun || []).map((x) => x.file));
    c = { ...(await check(2)), round1: c };
  }
  return { lane: l.key, name: l.name, results, check: c, fixRound, openIssues: issues(c) };
};

const limit = async (n, items, fn) => {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch (e) {
          out[k] = { lane: items[k].key, error: String(e) };
        }
      }
    }),
  );
  return out;
};

phase('Implement');
const lanes = await limit(CONC, A.lanes, runLane);
return lanes.map((x) => x && ({
  lane: x.lane, name: x.name, error: x.error,
  groups: (x.results || []).map((r) => ({ group: r.group, status: r.status, items: r.items, tier: r.tierUsed, commits: r.commits, notDone: r.notDone, windowsOnly: r.windowsOnly, failingFirstSeen: r.failingFirstSeen, summary: r.summary })),
  tests: x.check && x.check.tr, reviewVerdict: x.check && x.check.rv && x.check.rv.verdict, verifyVerdict: x.check && x.check.vf && x.check.vf.verdict,
  openIssues: x.openIssues, fixRound: x.fixRound && { status: x.fixRound.status, notDone: x.fixRound.notDone, summary: x.fixRound.summary },
  advisorFlags: [...(x.results || []), x.fixRound, x.check && x.check.tr, x.check && x.check.rv, x.check && x.check.vf].filter(Boolean).filter((y) => y.advisorCalled).length,
}))
