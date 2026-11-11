import { AlertBanner, Button, CriticalActionDialog, IconButton, Mono, StateView } from '@dental/ui';
import type { ComboboxItem, OptionsFilter } from '@mantine/core';
import { MultiSelect, NumberInput, Select, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMedicalRecord, usePatient } from '@/features/patients/patients.api';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreatePrescription,
  useCreateVisitNote,
  useDiagnoses,
  usePatientAppointments,
  usePrescriptions,
  useServiceCatalog,
  useServicePrices,
  useSignVisitNote,
  useTreatmentPlans,
  useUpdateVisitNote,
  useVisitNote,
  useVisitNotes,
  useVisitNoteTemplates,
} from '../../clinical.api';
import { diagnosisSearchIndex, normalizeSearch, toDiagnosisOptions } from '../../clinical.mappers';
import type { AllergyOverride, NextVisit, VisitNoteView } from '../../clinical.types';
import classes from './VisitNotePage.module.css';
import {
  buildVisitNoteBody,
  clearDraft,
  draftKey,
  emptyVisitForm,
  firstUnresolvedRxConflict,
  isRxRowComplete,
  loadDraft,
  overrideCoversConflict,
  pendingAllergyConflict,
  type RxRow,
  saveDraft,
  type VisitFormValues,
} from './visit-note-form';

const REASONS = [
  'benefit_outweighs_risk',
  'patient_informed',
  'allergy_not_confirmed',
  'no_alternative',
] as const;
const NEXT_VISITS: NextVisit[] = ['none', '2w', '6m'];
const AUTOSAVE_MS = 700;

let rxSeq = 0;
const newRxRow = (): RxRow => ({
  key: `rx-${Date.now()}-${rxSeq++}`,
  drug: '',
  dosage: '',
  frequency: '',
  days: '',
});

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** UI-D4 — `/patients/:id/visits/new` va `/patients/:id/visits/:visitId/edit`. */
export function VisitNotePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ru' ? 'ru' : 'uz';
  const navigate = useNavigate();
  const { id: patientId = '', visitId } = useParams<{ id: string; visitId?: string }>();
  const { user, hasPermission, activeBranchId } = useAuthStore();

  const patientQuery = usePatient(patientId);
  const medicalQuery = useMedicalRecord(patientId);
  const noteQuery = useVisitNote(visitId);
  const notesQuery = useVisitNotes(patientId);
  const diagnosesQuery = useDiagnoses();
  const servicesQuery = useServiceCatalog();
  const plansQuery = useTreatmentPlans(patientId);
  const apptQuery = usePatientAppointments(patientId);
  const templatesQuery = useVisitNoteTemplates();
  const prescriptionsQuery = usePrescriptions(patientId);
  const createNote = useCreateVisitNote(patientId);
  const updateNote = useUpdateVisitNote(patientId);
  const signNote = useSignVisitNote(patientId);
  const createRx = useCreatePrescription(patientId);

  const [noteId, setNoteId] = useState<string | null>(visitId ?? null);
  const [values, setValues] = useState<VisitFormValues>(emptyVisitForm);
  const [rx, setRx] = useState<RxRow[]>([]);
  const [overrides, setOverrides] = useState<AllergyOverride[]>([]);
  const [draftAt, setDraftAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    index: number;
    drug: string;
    allergen: string;
    group: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);

  const note = noteQuery.data as VisitNoteView | undefined;
  const signed = !!note?.signedAt;
  const key = draftKey(patientId, noteId);

  // ── hydrate: server yozuvi yoki saqlanmagan lokal qoralama ───────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: bir martalik hydrate
  useEffect(() => {
    if (hydrated.current) return;
    if (visitId && !note) return; // tahrir: yozuv kelguncha kutamiz
    hydrated.current = true;
    const fromServer: VisitFormValues = note
      ? {
          subjective: note.subjective ?? '',
          objective: note.objective ?? '',
          assessmentDiagnoses: note.assessmentDiagnoses ?? [],
          plan: note.plan ?? '',
          freeNotes: note.freeNotes ?? '',
          performedServices: note.performedServices ?? [],
          stageId: note.stageId,
          appointmentId: note.appointmentId,
          nextVisit: note.metadata?.nextVisit ?? null,
        }
      : emptyVisitForm();
    const draft = loadDraft(key);
    const useDraft = draft && !note?.signedAt && (!note || draft.savedAt > note.updatedAt);
    if (useDraft && draft) {
      setValues(draft.values);
      setRx(draft.rx);
      setOverrides(draft.overrides);
      setDraftAt(draft.savedAt);
      notifications.show({ message: t('visitNote.draftRestored'), color: 'teal' });
    } else {
      setValues(fromServer);
    }
  }, [note, visitId]);

  // Shu bemorning oldingi vizitlarida sabab bilan tasdiqlangan overridelar (qayta so'ralmaydi).
  const knownOverrides = useMemo<AllergyOverride[]>(() => {
    const fromNotes = ((notesQuery.data ?? []) as VisitNoteView[]).flatMap(
      (n) => n.metadata?.allergyOverrides ?? [],
    );
    return [...fromNotes, ...overrides];
  }, [notesQuery.data, overrides]);

  // ── avto-qoralama (localStorage) ─────────────────────────────────────────
  useEffect(() => {
    if (!hydrated.current || signed) return;
    const timer = setTimeout(() => {
      const savedAt = new Date().toISOString();
      if (saveDraft(key, { values, rx, overrides, savedAt })) setDraftAt(savedAt);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [values, rx, overrides, key, signed]);

  const patch = (p: Partial<VisitFormValues>) => setValues((v) => ({ ...v, ...p }));
  const readOnly = signed;
  const allergies = medicalQuery.data?.allergies ?? null;

  // ── tashxis / xizmat / reja opsiyalari ───────────────────────────────────
  const diagnoses = diagnosesQuery.data ?? [];
  const dxOptions = toDiagnosisOptions(diagnoses, lang);
  const dxFilter = useMemo<OptionsFilter>(() => {
    const index = diagnosisSearchIndex(diagnoses);
    return ({ options, search }) => {
      const q = normalizeSearch(search.trim());
      if (!q) return options;
      return options.filter(
        (o) => 'value' in o && (index.get((o as ComboboxItem).value)?.includes(q) ?? false),
      );
    };
  }, [diagnoses]);

  const serviceOptions = useMemo(
    () =>
      (servicesQuery.data ?? [])
        .filter((s) => s.isActive || values.performedServices.includes(s.id))
        .map((s) => ({
          value: s.id,
          label: `${s.code} — ${lang === 'ru' ? (s.nameRu ?? s.nameUz) : s.nameUz}`,
        })),
    [servicesQuery.data, values.performedServices, lang],
  );
  const serviceLabel = (id: string) => serviceOptions.find((o) => o.value === id)?.label ?? id;
  const prices = useServicePrices(values.performedServices, activeBranchId);
  const total = values.performedServices.reduce((s, id) => s + (prices.get(id) ?? 0), 0);

  const stageOptions = useMemo(
    () =>
      (plansQuery.data ?? []).flatMap((p) =>
        (p.stages ?? [])
          .filter((s) => s.status !== 'completed' || s.id === note?.stageId)
          .map((s) => ({
            value: s.id,
            title: p.title,
            label: `${p.title} · ${s.sequence}. ${s.serviceName}`,
          })),
      ),
    [plansQuery.data, note?.stageId],
  );

  // ── shablon ──────────────────────────────────────────────────────────────
  const templates = templatesQuery.data ?? [];
  const applyTemplate = (id: string | null) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    patch({
      ...(tpl.template.subjective ? { subjective: tpl.template.subjective } : {}),
      ...(tpl.template.objective ? { objective: tpl.template.objective } : {}),
      ...(tpl.template.plan ? { plan: tpl.template.plan } : {}),
    });
    notifications.show({ message: t('visitNote.templateApplied'), color: 'teal' });
  };

  // ── retsept + allergiya ──────────────────────────────────────────────────
  const setRxRow = (index: number, p: Partial<RxRow>) =>
    setRx((rows) => rows.map((r, i) => (i === index ? { ...r, ...p } : r)));

  const checkDrug = (index: number) => {
    const drug = rx[index]?.drug ?? '';
    const c = pendingAllergyConflict(drug, allergies, knownOverrides);
    if (c) setConflict({ index, drug: c.drug, allergen: c.allergen, group: c.group });
  };

  const unresolved = firstUnresolvedRxConflict(rx, allergies, knownOverrides);
  const hasDrugs = rx.some((r) => r.drug.trim() !== '');
  const allergyState = unresolved
    ? 'conflict'
    : medicalQuery.isError
      ? 'unknown'
      : hasDrugs
        ? 'ok'
        : 'idle';

  const confirmOverride = (reason: string | null) => {
    if (!conflict || !reason) return;
    setOverrides((o) => [
      ...o.filter((x) => !overrideCoversConflict(x, conflict.drug, conflict)),
      { drug: conflict.drug, group: conflict.group, allergen: conflict.allergen, reason },
    ]);
    setConflict(null);
  };
  const keepSafe = () => {
    if (conflict) setRxRow(conflict.index, { drug: '' });
    setConflict(null);
  };

  // ── saqlash / imzolash ───────────────────────────────────────────────────
  const persist = async (): Promise<string | null> => {
    const guard = firstUnresolvedRxConflict(rx, allergies, knownOverrides);
    if (guard) {
      setConflict({
        index: guard.index,
        drug: guard.conflict.drug,
        allergen: guard.conflict.allergen,
        group: guard.conflict.group,
      });
      return null;
    }
    const completeRx = rx.filter(isRxRowComplete);
    const empty =
      !values.subjective &&
      !values.objective &&
      values.assessmentDiagnoses.length === 0 &&
      values.performedServices.length === 0 &&
      completeRx.length === 0;
    if (empty && !noteId) {
      notifications.show({ message: t('visitNote.validationEmpty'), color: 'red' });
      return null;
    }
    if (!user) return null;
    // Yangi vizit: bugungi yozilish (bekor qilinmagan) bo'lsa avtomatik bog'lanadi.
    const todayStr = new Date().toDateString();
    const todayAppt = (apptQuery.data ?? []).find(
      (a) =>
        new Date(a.startTime).toDateString() === todayStr &&
        a.status !== 'cancelled' &&
        a.status !== 'no_show',
    );
    const linked = noteId
      ? values
      : { ...values, appointmentId: values.appointmentId ?? todayAppt?.id ?? null };
    const body = buildVisitNoteBody(linked, {
      patientId,
      doctorId: user.id,
      isEdit: !!noteId,
      overrides,
    });
    let id = noteId;
    if (id) {
      const { patientId: _p, doctorId: _d, ...rest } = body;
      await updateNote.mutateAsync({ id, body: rest as never });
    } else {
      const created = await createNote.mutateAsync(body);
      id = created.id;
      setNoteId(id);
    }
    if (completeRx.length > 0) {
      await createRx.mutateAsync({
        patientId,
        doctorId: user.id,
        visitNoteId: id,
        items: completeRx.map((r) => ({
          medicationName: r.drug.trim(),
          dosage: r.dosage.trim(),
          frequency: r.frequency.trim(),
          durationDays: r.days === '' ? undefined : r.days,
        })),
      });
      setRx((rows) => rows.filter((r) => !isRxRowComplete(r)));
    }
    clearDraft(draftKey(patientId, noteId));
    clearDraft(draftKey(patientId, id));
    setDraftAt(null);
    return id;
  };

  const onSave = async () => {
    setBusy(true);
    try {
      const wasNew = !noteId;
      const id = await persist();
      if (!id) return;
      notifications.show({ message: t('visitNote.saved'), color: 'teal' });
      if (wasNew) navigate(`/patients/${patientId}/visits/${id}/edit`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const onSign = async () => {
    setBusy(true);
    try {
      const id = await persist();
      if (!id) return;
      await signNote.mutateAsync(id);
      notifications.show({ message: t('visitNote.signedToast'), color: 'teal' });
      navigate(hasPermission('cashier.view') ? '/cashier' : `/patients/${patientId}`);
    } finally {
      setBusy(false);
    }
  };

  // ── holatlar ─────────────────────────────────────────────────────────────
  const status = (e: unknown) => (e as { status?: number } | null)?.status;
  if (visitId && noteQuery.isLoading) return <StateView status="loading" skeleton="detail" />;
  if (visitId && noteQuery.isError) {
    return status(noteQuery.error) === 403 ? (
      <StateView status="forbidden" title={t('states.forbidden_title')} />
    ) : (
      <StateView
        status="error"
        title={t('visitNote.notFound')}
        retryLabel={t('states.retry')}
        onRetry={() => noteQuery.refetch()}
      />
    );
  }

  const patientName = patientQuery.data?.fullName ?? '';
  const pending = busy || createNote.isPending || updateNote.isPending || signNote.isPending;
  const savedRx = (prescriptionsQuery.data ?? []).filter((p) => p.visitNoteId === noteId);

  return (
    <div className={classes.root}>
      <header className={classes.head}>
        <Link
          to={`/patients/${patientId}`}
          className={classes.back}
          aria-label={t('visitNote.back')}
        >
          <IconChevronLeft size={18} aria-hidden="true" />
        </Link>
        <div className={classes.titleBox}>
          <h1 className={classes.title}>
            {t(visitId ? 'visitNote.titleEdit' : 'visitNote.titleFor', { name: patientName })}
          </h1>
          <span className={classes.sub}>
            {user?.fullName ? `${user.fullName} · ` : ''}
            {new Date(note?.visitDate ?? Date.now()).toLocaleDateString()}
          </span>
        </div>
        <Select
          aria-label={t('visitNote.template')}
          placeholder={t('visitNote.templatePlaceholder')}
          data={templates.map((x) => ({ value: x.id, label: x.name }))}
          value={null}
          onChange={applyTemplate}
          disabled={readOnly || templates.length === 0}
          w={240}
        />
      </header>

      {signed && (
        <AlertBanner tier={3} title={t('visitNote.signedBanner')}>
          {note?.signedAt ? t('visitNote.signedAt', { time: timeOf(note.signedAt) }) : ''}
        </AlertBanner>
      )}

      <div className={classes.cols}>
        <div className={classes.main}>
          <section className={classes.card} aria-labelledby="vn-so">
            <h2 className={classes.h2} id="vn-so">
              {t('visitNote.sectionSO')}
            </h2>
            <div className={classes.soGrid}>
              <Textarea
                label={t('visitNote.complaint')}
                rows={3}
                disabled={readOnly}
                value={values.subjective}
                onChange={(e) => patch({ subjective: e.currentTarget.value })}
              />
              <Textarea
                label={t('visitNote.exam')}
                rows={3}
                disabled={readOnly}
                value={values.objective}
                onChange={(e) => patch({ objective: e.currentTarget.value })}
              />
              <Textarea
                label={t('visitNote.plan')}
                rows={2}
                disabled={readOnly}
                value={values.plan}
                onChange={(e) => patch({ plan: e.currentTarget.value })}
              />
              <Textarea
                label={t('visitNote.freeNotes')}
                rows={2}
                disabled={readOnly}
                value={values.freeNotes}
                onChange={(e) => patch({ freeNotes: e.currentTarget.value })}
              />
            </div>
          </section>

          <section className={classes.card} aria-labelledby="vn-dx">
            <div className={classes.cardHead}>
              <h2 className={classes.h2} id="vn-dx">
                {t('visitNote.diagnosis')}
              </h2>
              <Link to={`/patients/${patientId}?tab=odontogram`} className={classes.link}>
                {t('visitNote.openOdontogram')}
              </Link>
            </div>
            <MultiSelect
              aria-label={t('visitNote.diagnosis')}
              placeholder={t('visitNote.diagnosisPlaceholder')}
              searchable
              data={dxOptions}
              filter={dxFilter}
              limit={20}
              disabled={readOnly}
              value={values.assessmentDiagnoses}
              onChange={(v) => patch({ assessmentDiagnoses: v })}
              nothingFoundMessage={t('visitNote.noDiagnosis')}
            />
          </section>

          <section className={classes.cardFlush} aria-labelledby="vn-sv">
            <div className={classes.servicesHead}>
              <h2 className={classes.h2} id="vn-sv">
                {t('visitNote.performed')}
              </h2>
              <MultiSelect
                aria-label={t('visitNote.performed')}
                placeholder={t('visitNote.servicesPlaceholder')}
                searchable
                clearable
                data={serviceOptions}
                disabled={readOnly}
                value={values.performedServices}
                onChange={(v) => patch({ performedServices: v })}
              />
            </div>
            {values.performedServices.map((id) => (
              <div key={id} className={classes.serviceRow}>
                <span className={classes.serviceName}>{serviceLabel(id)}</span>
                {prices.has(id) ? (
                  <Mono>{formatCurrency(prices.get(id) ?? 0, t)}</Mono>
                ) : (
                  <span className={classes.lockNote}>{t('visitNote.priceUnknown')}</span>
                )}
              </div>
            ))}
            <div className={classes.totalBar}>
              <span className={classes.totalNote}>
                {values.performedServices.length > 0
                  ? `${t('visitNote.stockDeduct')}. ${t('visitNote.priceLocked')}`
                  : t('visitNote.noServices')}
              </span>
              {values.performedServices.length > 0 && (
                <b>
                  <Mono>{t('visitNote.total', { amount: formatCurrency(total, t) })}</Mono>
                </b>
              )}
            </div>
          </section>

          <section className={classes.card} aria-labelledby="vn-rx">
            <h2 className={classes.h2} id="vn-rx">
              {t('visitNote.rx')}
            </h2>
            {savedRx.map((p) => (
              <div key={p.id} className={classes.hint}>
                {t('visitNote.rxSaved')}:{' '}
                {p.items.map((i) => `${i.medicationName} ${i.dosage}`).join(', ')}
              </div>
            ))}
            {rx.map((row, i) => (
              <div key={row.key} className={classes.rxRow}>
                <TextInput
                  label={t('visitNote.drug')}
                  value={row.drug}
                  disabled={readOnly}
                  onChange={(e) => setRxRow(i, { drug: e.currentTarget.value })}
                  onBlur={() => checkDrug(i)}
                />
                <TextInput
                  label={t('visitNote.dosage')}
                  value={row.dosage}
                  disabled={readOnly}
                  onChange={(e) => setRxRow(i, { dosage: e.currentTarget.value })}
                />
                <TextInput
                  label={t('visitNote.how')}
                  value={row.frequency}
                  disabled={readOnly}
                  onChange={(e) => setRxRow(i, { frequency: e.currentTarget.value })}
                />
                <NumberInput
                  label={t('visitNote.days')}
                  min={1}
                  value={row.days}
                  disabled={readOnly}
                  onChange={(v) => setRxRow(i, { days: typeof v === 'number' ? v : '' })}
                />
                <IconButton
                  label={t('visitNote.removeDrug')}
                  bordered
                  disabled={readOnly}
                  onClick={() => setRx((rows) => rows.filter((_, j) => j !== i))}
                >
                  ✕
                </IconButton>
              </div>
            ))}
            {allergyState !== 'idle' && (
              <span className={classes.allergyLine} data-state={allergyState} role="status">
                {allergyState === 'conflict' && unresolved
                  ? t('visitNote.allergyConflictLine', {
                      drug: unresolved.conflict.drug,
                      allergen: unresolved.conflict.allergen,
                    })
                  : allergyState === 'unknown'
                    ? t('visitNote.allergyUnknown')
                    : `✓ ${t('visitNote.allergyOk')}`}
              </span>
            )}
            <span className={classes.hint}>{t('visitNote.allergyHint')}</span>
            {!readOnly && (
              <div>
                <Button variant="default" onClick={() => setRx((rows) => [...rows, newRxRow()])}>
                  {t('visitNote.addDrug')}
                </Button>
              </div>
            )}
          </section>
        </div>

        <aside className={classes.aside}>
          <section className={classes.card} aria-labelledby="vn-plan">
            <h2 className={classes.h2} id="vn-plan">
              {t('visitNote.planLink')}
            </h2>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              <label className={classes.radio} data-checked={values.stageId === null}>
                <input
                  type="radio"
                  name="stage"
                  checked={values.stageId === null}
                  disabled={readOnly}
                  onChange={() => patch({ stageId: null })}
                />
                <span>{t('visitNote.noPlan')}</span>
              </label>
              {stageOptions.map((s) => (
                <label
                  key={s.value}
                  className={classes.radio}
                  data-checked={values.stageId === s.value}
                >
                  <input
                    type="radio"
                    name="stage"
                    checked={values.stageId === s.value}
                    disabled={readOnly || (!!note?.stageId && note.stageId !== s.value)}
                    onChange={() => patch({ stageId: s.value })}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <b>{s.label}</b>
                    <span className={classes.hint}>{t('visitNote.stageHint')}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          <section className={classes.card} aria-labelledby="vn-next">
            <h2 className={classes.h2} id="vn-next">
              {t('visitNote.nextVisit')}
            </h2>
            <fieldset className={classes.chips} aria-label={t('visitNote.nextVisit')}>
              {NEXT_VISITS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={classes.chip}
                  aria-pressed={values.nextVisit === n}
                  disabled={readOnly}
                  onClick={() => patch({ nextVisit: values.nextVisit === n ? null : n })}
                >
                  {t(`visitNote.next.${n}`)}
                </button>
              ))}
            </fieldset>
            <span className={classes.hint}>{t('visitNote.nextHint')}</span>
          </section>
        </aside>
      </div>

      {!readOnly && (
        <div className={classes.bar}>
          <span className={classes.barStatus}>
            {draftAt
              ? t('visitNote.draftSaved', { time: timeOf(draftAt) })
              : t('visitNote.draftNone')}
          </span>
          <Button variant="default" size="lg" disabled={pending} onClick={onSave}>
            {t('visitNote.save')}
          </Button>
          <Button variant="primary" size="lg" disabled={pending} onClick={onSign}>
            {t('visitNote.sign')}
          </Button>
        </div>
      )}

      <CriticalActionDialog
        opened={conflict !== null}
        title={t('visitNote.allergyTitle')}
        reasons={REASONS.map((r) => ({ value: r, label: t(`visitNote.reason.${r}`) }))}
        reasonsLabel={t('visitNote.reasonsLabel')}
        safeLabel={t('visitNote.allergySafe')}
        dangerLabel={t('visitNote.allergyDanger')}
        onSafe={keepSafe}
        onConfirm={confirmOverride}
      >
        {conflict
          ? t('visitNote.allergyBody', { allergen: conflict.allergen, drug: conflict.drug })
          : ''}
      </CriticalActionDialog>
    </div>
  );
}
