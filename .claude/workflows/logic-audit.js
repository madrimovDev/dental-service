export const meta = {
  name: 'logic-audit',
  description: 'Flow-based logic-flaw audit: auditor per business flow (tiered model) -> dedupe -> refuter per finding (severity-tiered) -> completeness critic',
  whenToUse: 'dental-service: find cross-module logic flaws. args: { flows?: [{key,title,tier,risky,scope}], only?: [flowKey], maxVerify?: number }. Tiers: A1 sonnet/medium, A2 sonnet/high, A3 opus/high. See docs/ORCHESTRATION-GUIDE.md §1b.',
  phases: [
    { title: 'Audit', detail: 'one auditor per flow, model by flow tier; escalate one tier if unsure/failed' },
    { title: 'Verify', detail: 'one refuter per finding (two for critical), model by severity/risk' },
    { title: 'Critic', detail: 'completeness critic: what was not covered' },
  ],
}

// ---- Tier table (docs/ORCHESTRATION-GUIDE.md §1b) ----
const TIERS = {
  A1: { model: 'sonnet', effort: 'medium' },
  A2: { model: 'sonnet', effort: 'high' },
  A3: { model: 'opus', effort: 'high' },
}
const NEXT = { A1: 'A2', A2: 'A3', A3: null }

const DEFAULT_FLOWS = [
  { key: 'booking', tier: 'A2', risky: false, title: 'Bron va yozilish',
    scope: 'Telegram bron so\'rovi (booking_requests) -> registrator tasdig\'i -> appointment yaratish (EXCLUDE doctor/patient busy, slot availability, ish soatlari) -> kalendar (drag/undo) -> navbat (queue, call-own) -> no-show strike. Qaysi rol nimani ko\'radi.' },
  { key: 'treatment', tier: 'A2', risky: false, title: 'Davolash oqimi',
    scope: 'Odontogramma (tooth charts) -> davolash rejasi (plan/stage holatlari, acceptance) -> konsent (sign/link) -> vizit yozuvi (stageId, performedServices, imzo, dori-allergiya) -> bosqich tugashi -> odontogramma sinxroni (recordStageCompletion) -> lab buyurtma gating. Rejasiz davolash yo\'li.' },
  { key: 'money', tier: 'A3', risky: true, title: 'Pul oqimi',
    scope: 'Kassa (POS items, plan allocation, visit-linked), chegirma va max_discount_percent, refund (to\'liq/qisman/proporsional), bemor balansi (planDebt/nonPlanBalance, bekor qilingan reja krediti), stage overpay guard, payroll komissiyasi va clawback (finalized davr), netCashTotal, hisobotlar (pnl, debt-aging, owner-today), fiskal payload. Pul yig\'indilari invariantlari.' },
  { key: 'inventory', tier: 'A2', risky: false, title: 'Ombor',
    scope: 'Xizmat BOM -> vizitda avtomatik chiqim -> batch, adjustment=set-to-value, manfiy qoldiq guard, low-stock bildirishnoma, "necha kunga yetadi", bekor qilingan vizit/qayta imzolashda qayta chiqim.' },
  { key: 'rbac', tier: 'A3', risky: true, title: 'Ruxsatlar va xodimlar',
    scope: 'Rol shablonlari (role-templates.ts) <-> nav-config/ekranlar <-> endpoint requirePermission: har cheklangan rol uchun ekran ochiladimi va API 403 bermaydimi. assertCanGrant eskalatsiya, invite/accept (accepted_at NULL), parol tiklash (must_change_password, pwc), switch-workspace/branch, is_practitioner, filial doirasi (report.view), JWT staleness.' },
  { key: 'tenancy', tier: 'A3', risky: true, title: 'Tenant izolyatsiyasi va tranzaksiya',
    scope: 'rlsMiddleware (rollback on error/5xx, fail() 4xx commit), getDb(c), worker/bot withTenant, onAfterCommit, /uploads RLS + prefix qoidasi, cross-tenant ID qabul qiladigan endpointlar (IDOR), lab-hub sinxroni tenant bog\'lanishi.' },
  { key: 'lab', tier: 'A2', risky: false, title: 'Lab buyurtmalar va Lab Hub',
    scope: 'Lab order yaratish/fayl -> outbox -> Hub (apps/lab-hub-api) -> narx tasdig\'i -> xarajatga yozilish faqat Hub tasdig\'idan keyin -> fayl/xabar qaytishi -> status sinxroni, qayta urinish/idempotentlik.' },
  { key: 'messaging', tier: 'A2', risky: false, title: 'Telegram va eslatmalar',
    scope: 'Per-tenant bot-manager (boot cloud/desktop), contact-share linking (oilaviy telefon), reminder 24h tugmalari (egasi/kelajak tekshiruvi), recall (skipped_no_channel), anketa qoralamasi, chek/retsept xabarlari, kanal prioriteti Telegram>SMS>NoOp, BullMQ jobId.' },
  { key: 'license', tier: 'A3', risky: true, title: 'Litsenziya, desktop va zaxira',
    scope: 'Aktivatsiya -> provisioning (imzo, tekis payload) -> heartbeat/renew -> expiresAt + 7 kun grace -> to\'liq blok (requireValidLicenseInDesktop whitelist) -> recheck; prepare-reinstall; owner reset token; desktop migratsiya-on-start + pre-dump + rollback; backup/restore (request-fayl, pre-restore dump); monotonik soat.' },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    advisorCalled: { type: 'boolean' },
    status: { type: 'string', enum: ['done', 'unsure', 'failed'] },
    flowMap: { type: 'array', items: { type: 'string' }, description: 'qadam -> fayl:qator' },
    invariants: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          invariant: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'array', items: { type: 'string' }, description: 'fayl:qator + parcha' },
          scenario: { type: 'string' },
          knownDecision: { type: 'boolean' },
        },
        required: ['title', 'invariant', 'severity', 'confidence', 'evidence', 'scenario'],
      },
    },
    notCovered: { type: 'array', items: { type: 'string' } },
  },
  required: ['advisorCalled', 'status', 'findings', 'notCovered'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    advisorCalled: { type: 'boolean' },
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'unproven'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    reasoning: { type: 'string' },
    counterEvidence: { type: 'array', items: { type: 'string' } },
    fixDirection: { type: 'string' },
    notChecked: { type: 'array', items: { type: 'string' } },
  },
  required: ['advisorCalled', 'verdict', 'severity', 'reasoning'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    advisorCalled: { type: 'boolean' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { flowKey: { type: 'string' }, gap: { type: 'string' }, suggestedTier: { type: 'string' } },
        required: ['flowKey', 'gap'],
      },
    },
  },
  required: ['advisorCalled', 'gaps'],
}

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 }

const a = args || {}
let flows = a.flows || DEFAULT_FLOWS
if (a.only) flows = flows.filter((f) => a.only.includes(f.key))
const maxVerify = a.maxVerify || 36

const auditPrompt = (f) => `Oqim: «${f.title}» (key=${f.key}).
Qamrov: ${f.scope}
Repo: /home/madrimov/Projects/dental-service (faqat o'qish).
Agent tanangdagi usulga amal qil: oqim xaritasi -> har qadam taxminlari -> invariantlar -> buzuvchi yo'llar. Faqat shu oqim. Har topilmada fayl:qator dalil va aniq scenariy. advisor chaqirma.`

const runAudit = async (f, tier) => {
  const t = TIERS[tier]
  const r = await agent(auditPrompt(f), {
    label: `audit:${f.key}:${tier}`, phase: 'Audit', agentType: 'auditor',
    schema: FINDINGS_SCHEMA, model: t.model, effort: t.effort,
  })
  if ((!r || r.status !== 'done') && NEXT[tier]) {
    log(`${f.key}: ${r ? r.status : 'null'} at ${tier} -> escalating to ${NEXT[tier]}`)
    return runAudit(f, NEXT[tier])
  }
  return r ? { ...r, flow: f, tierUsed: tier } : null
}

// ---- Phase 1: audit all flows (barrier needed: dedupe across flows) ----
phase('Audit')
const audits = (await parallel(flows.map((f) => () => runAudit(f, f.tier)))).filter(Boolean)
const missingFlows = flows.filter((f) => !audits.some((x) => x.flow.key === f.key)).map((f) => f.key)
if (missingFlows.length) log(`audit failed for: ${missingFlows.join(', ')}`)

// dedupe by first evidence location (file:line) + invariant prefix
const seen = new Map()
for (const au of audits) {
  for (const fd of au.findings) {
    if (fd.knownDecision) continue
    const loc = (fd.evidence[0] || '').split(/\s/)[0]
    const k = `${loc}|${fd.invariant.slice(0, 60).toLowerCase()}`
    const prev = seen.get(k)
    const item = { ...fd, flowKey: au.flow.key, risky: au.flow.risky }
    if (!prev || SEV_RANK[fd.severity] < SEV_RANK[prev.severity]) seen.set(k, item)
  }
}
const all = [...seen.values()].sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity])
const toVerify = all.slice(0, maxVerify)
const unverified = all.slice(maxVerify)
log(`${all.length} unique findings; verifying ${toVerify.length}${unverified.length ? `, ${unverified.length} left UNVERIFIED (maxVerify)` : ''}`)

// ---- Phase 2: verify, model by severity/risk ----
const verifierTier = (fd) => {
  if (fd.severity === 'critical' || (fd.risky && fd.severity === 'high')) return TIERS.A3
  if (fd.severity === 'low') return TIERS.A1
  return TIERS.A2
}
const verifyPrompt = (fd, lens) => `Bitta topilmani tekshir (oqim ${fd.flowKey}). Lens: ${lens}.
Sarlavha: ${fd.title}
Invariant: ${fd.invariant}
Auditor severity: ${fd.severity} (confidence ${fd.confidence})
Dalil: ${fd.evidence.join(' | ')}
Scenariy: ${fd.scenario}
Repo: /home/madrimov/Projects/dental-service. Real-DB probe ruxsat ETILMAGAN (statik tekshiruv). advisor chaqirma.`

const verified = await parallel(toVerify.map((fd, i) => async () => {
  const t = verifierTier(fd)
  const lenses = fd.severity === 'critical'
    ? ['kod yo\'li: scenariy haqiqatan o\'tadimi', 'boshqa qatlamdagi himoya: DB constraint/RLS/middleware/frontend gate/qasddan qaror']
    : ['umumiy: scenariy o\'tadimi va himoya bormi']
  const vs = (await parallel(lenses.map((lens, j) => () => agent(verifyPrompt(fd, lens), {
    label: `verify:${fd.flowKey}:${i}${lenses.length > 1 ? `:${j}` : ''}`, phase: 'Verify',
    agentType: 'refuter', schema: VERDICT_SCHEMA, model: t.model, effort: t.effort,
  })))).filter(Boolean)
  const verdicts = vs.map((v) => v.verdict)
  let final = 'unproven'
  if (verdicts.length && verdicts.every((v) => v === 'confirmed')) final = 'confirmed'
  else if (verdicts.length && verdicts.every((v) => v === 'refuted')) final = 'refuted'
  else if (verdicts.includes('confirmed') && verdicts.includes('refuted')) final = 'disputed'
  const sev = vs.length ? vs.map((v) => v.severity).sort((x, y) => SEV_RANK[x] - SEV_RANK[y])[0] : fd.severity
  return { ...fd, final, severity: sev, auditorSeverity: fd.severity, verdicts: vs }
}))

// ---- Phase 3: completeness critic ----
phase('Critic')
const critic = await agent(`Mantiqiy audit qamrovini tanqid qil. Oqimlar va ularning xaritasi/qamrab olinmaganlari:
${audits.map((au) => `- ${au.flow.key} (${au.tierUsed}): ${au.findings.length} topilma; notCovered: ${au.notCovered.join('; ') || '-'}; xarita qadamlari: ${(au.flowMap || []).length}`).join('\n')}
Audit yiqilgan oqimlar: ${missingFlows.join(', ') || '-'}.
Repo: /home/madrimov/Projects/dental-service. Qaysi muhim qadam/tutashuv/rol/rejim (cloud vs desktop) ko'rilmagan? Faqat aniq bo'shliqlar, har biriga oqim key va tavsiya etilgan tier (A1/A2/A3). advisor chaqirma.`, {
  label: 'critic', phase: 'Critic', agentType: 'auditor', schema: CRITIC_SCHEMA, model: 'sonnet', effort: 'medium',
})

const pick = (s) => verified.filter(Boolean).filter((v) => v.final === s)
return {
  confirmed: pick('confirmed'),
  disputed: pick('disputed'),
  unproven: pick('unproven'),
  refutedCount: pick('refuted').length,
  refuted: pick('refuted').map((v) => ({ title: v.title, flowKey: v.flowKey, why: v.verdicts.map((x) => x.reasoning).join(' / ') })),
  unverified,
  notCovered: audits.map((au) => ({ flow: au.flow.key, tierUsed: au.tierUsed, notCovered: au.notCovered })),
  failedFlows: missingFlows,
  criticGaps: critic ? critic.gaps : null,
  advisorFlags: [...audits, ...verified.filter(Boolean).flatMap((v) => v.verdicts), critic].filter(Boolean).filter((x) => x.advisorCalled).length,
}
