import { Button, Card, Input, Select } from '@dental/ui';
import { Checkbox, TagsInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ChevronLeft, Phone, Users } from 'lucide-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useCreatePatient } from '../patients.api';
import { type PatientFormValues, patientFormSchema } from '../patients.schema';
import classes from './PatientNewScreen.module.css';

/** Lokal initial-larni hisoblash (gradient avatar uchun). Bo'sh bo'lsa '··'. */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '··';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
}

export function PatientNewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMut = useCreatePatient();

  const form = useForm<PatientFormValues>({
    initialValues: {
      fullName: '',
      dateOfBirth: '',
      gender: undefined,
      phone: '',
      phoneSecondary: '',
      passport: '',
      address: '',
      notes: '',
      tags: [],
      source: '',
      insurance: { provider: '', policyNumber: '' },
    },
    validate: zod4Resolver(patientFormSchema),
  });

  const submit = form.onSubmit((values) => {
    const insurance = values.insurance?.provider ? values.insurance : null;
    createMut.mutate(
      {
        fullName: values.fullName,
        dateOfBirth: values.dateOfBirth || undefined,
        gender: values.gender,
        phone: values.phone || undefined,
        phoneSecondary: values.phoneSecondary || undefined,
        passport: values.passport || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
        tags: values.tags,
        source: values.source || undefined,
        insurance,
      },
      { onSuccess: (p) => navigate(`/patients/${p.id}`) },
    );
  });

  // ---- O'ng rail preview (presentational, form.values'dan) ----
  const previewName = form.values.fullName.trim() || t('patients.create');
  const previewPhone = form.values.phone?.trim() || '';
  const genderLabel = form.values.gender ? t(`patients.gender.${form.values.gender}`) : '';
  const sourceLabel = form.values.source ? t(`patients.source.${form.values.source}`) : '';
  const hasName = form.values.fullName.trim().length > 0;
  const hasPhone = (form.values.phone ?? '').trim().length > 0;

  return (
    <form onSubmit={submit} className={classes.form}>
      <button
        type="button"
        className={classes.backLink}
        onClick={() => navigate('/patients')}
        data-testid="back-link"
      >
        <ChevronLeft size={16} />
        <span>{t('patients.back_to_list')}</span>
      </button>

      <div className={classes.layout}>
        {/* ---- Chap ustun: 3 sectioned karta ---- */}
        <div className={classes.cards}>
          {/* Karta 1 — Shaxsiy ma'lumot */}
          <Card>
            <div className={classes.cardHead}>
              <span className={classes.iconTile} data-tone="primary">
                <Users size={18} />
              </span>
              <div>
                <div className={classes.cardTitle}>{t('patients.form.section_personal')}</div>
                <div className={classes.cardSub}>{t('patients.form.sub_personal')}</div>
              </div>
            </div>
            <div className={classes.fields}>
              <div className={`${classes.fieldWrap} ${classes.required}`}>
                <Input
                  label={t('patients.form.full_name')}
                  value={form.values.fullName}
                  error={form.errors.fullName}
                  onChange={(v) => form.setFieldValue('fullName', v)}
                />
              </div>
              <div className={classes.grid2}>
                <div className={classes.fieldWrap}>
                  <Input
                    label={t('patients.form.date_of_birth')}
                    type="date"
                    value={form.values.dateOfBirth ?? ''}
                    error={form.errors.dateOfBirth}
                    onChange={(v) => form.setFieldValue('dateOfBirth', v)}
                  />
                </div>
                <div className={classes.fieldWrap}>
                  <Select
                    label={t('patients.form.gender_label')}
                    placeholder={t('common.select')}
                    value={form.values.gender ?? null}
                    error={form.errors.gender}
                    onChange={(v) =>
                      form.setFieldValue('gender', (v as PatientFormValues['gender']) ?? undefined)
                    }
                    data={[
                      { value: 'male', label: t('patients.gender.male') },
                      { value: 'female', label: t('patients.gender.female') },
                      { value: 'other', label: t('patients.gender.other') },
                    ]}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Karta 2 — Aloqa */}
          <Card>
            <div className={classes.cardHead}>
              <span className={classes.iconTile} data-tone="primary">
                <Phone size={18} />
              </span>
              <div>
                <div className={classes.cardTitle}>{t('patients.form.section_contact')}</div>
                <div className={classes.cardSub}>{t('patients.form.sub_contact')}</div>
              </div>
            </div>
            <div className={classes.fields}>
              <div className={classes.grid2}>
                <div className={`${classes.phoneWrap} ${classes.required}`}>
                  <PhoneInput label={t('patients.form.phone')} {...form.getInputProps('phone')} />
                </div>
                <div className={classes.phoneWrap}>
                  <PhoneInput
                    label={t('patients.form.phone_secondary')}
                    {...form.getInputProps('phoneSecondary')}
                  />
                </div>
              </div>
              <div className={classes.fieldWrap}>
                <Input
                  label={t('patients.form.address')}
                  value={form.values.address ?? ''}
                  error={form.errors.address}
                  onChange={(v) => form.setFieldValue('address', v)}
                />
              </div>
              <div className={classes.fieldWrap}>
                <Select
                  label={t('patients.form.source')}
                  placeholder={t('common.select')}
                  value={form.values.source ?? null}
                  error={form.errors.source}
                  onChange={(v) => form.setFieldValue('source', v ?? '')}
                  data={[
                    { value: 'referral', label: t('patients.source.referral') },
                    { value: 'ad', label: t('patients.source.ad') },
                    { value: 'repeat', label: t('patients.source.repeat') },
                    { value: 'other', label: t('patients.source.other') },
                  ]}
                />
              </div>
            </div>
          </Card>

          {/* Karta 3 — Qo'shimcha / Sug'urta */}
          <Card>
            <div className={classes.cardHead}>
              <span className={classes.iconTile} data-tone="violet">
                <Users size={18} />
              </span>
              <div>
                <div className={classes.cardTitle}>{t('patients.form.section_extra')}</div>
                <div className={classes.cardSub}>{t('patients.form.sub_extra')}</div>
              </div>
            </div>
            <div className={classes.fields}>
              <div className={classes.fieldWrap}>
                <Input
                  label={t('patients.form.passport')}
                  value={form.values.passport ?? ''}
                  error={form.errors.passport}
                  onChange={(v) => form.setFieldValue('passport', v)}
                />
              </div>
              <div className={classes.textareaWrap}>
                <Textarea
                  label={t('patients.form.notes')}
                  rows={3}
                  {...form.getInputProps('notes')}
                />
              </div>
              <div className={classes.textareaWrap}>
                <TagsInput label={t('patients.form.tags')} {...form.getInputProps('tags')} />
              </div>

              <div className={classes.insuranceBlock}>
                <div className={classes.grid2}>
                  <div className={classes.fieldWrap}>
                    <Input
                      label={t('patients.form.insurance')}
                      placeholder={t('patients.form.insurance_provider')}
                      value={form.values.insurance?.provider ?? ''}
                      error={form.errors['insurance.provider']}
                      onChange={(v) => form.setFieldValue('insurance.provider', v)}
                    />
                  </div>
                  <div className={classes.fieldWrap}>
                    <Input
                      label={t('patients.form.insurance_policy')}
                      value={form.values.insurance?.policyNumber ?? ''}
                      error={form.errors['insurance.policyNumber']}
                      onChange={(v) => form.setFieldValue('insurance.policyNumber', v)}
                    />
                  </div>
                  <div className={classes.fieldWrap}>
                    <Select
                      label={t('patients.form.insurance_coverage')}
                      value={form.values.insurance?.coverageType ?? null}
                      onChange={(v) =>
                        form.setFieldValue(
                          'insurance.coverageType',
                          (v as 'dental' | 'general' | 'other') || undefined,
                        )
                      }
                      data={[
                        { value: 'dental', label: t('patients.form.coverage_dental') },
                        { value: 'general', label: t('patients.form.coverage_general') },
                        { value: 'other', label: t('patients.form.coverage_other') },
                      ]}
                    />
                  </div>
                  <div className={classes.fieldWrap}>
                    <Input
                      label={t('patients.form.insurance_expiry')}
                      type="date"
                      value={form.values.insurance?.expiryDate ?? ''}
                      onChange={(v) => form.setFieldValue('insurance.expiryDate', v || undefined)}
                    />
                  </div>
                </div>
                <Checkbox
                  mt="sm"
                  label={t('patients.form.insurance_active')}
                  checked={form.values.insurance?.isActive ?? false}
                  onChange={(e) =>
                    form.setFieldValue('insurance.isActive', e.currentTarget.checked)
                  }
                />
              </div>
            </div>
          </Card>
        </div>

        {/* ---- O'ng rail: live preview + checklist + amallar ---- */}
        <aside className={classes.rail}>
          <div className={classes.previewCard}>
            <span
              className={classes.previewAvatar}
              aria-hidden="true"
              data-empty={hasName ? undefined : true}
            >
              {initialsOf(form.values.fullName)}
            </span>
            <div className={classes.previewName}>{previewName}</div>
            {previewPhone && <div className={classes.previewPhone}>{previewPhone}</div>}
            <div className={classes.previewMeta}>
              {genderLabel && <span className={classes.metaChip}>{genderLabel}</span>}
              {sourceLabel && <span className={classes.metaChip}>{sourceLabel}</span>}
            </div>
          </div>

          <div className={classes.checklist}>
            <div className={classes.checklistTitle}>{t('patients.form.checklist_title')}</div>
            <div className={classes.checklistItem}>
              <span
                className={classes.dot}
                data-filled={hasName || undefined}
                data-testid="checklist-dot-name"
                aria-hidden="true"
              />
              <span>{t('patients.form.checklist_name')}</span>
            </div>
            <div className={classes.checklistItem}>
              <span
                className={classes.dot}
                data-filled={hasPhone || undefined}
                data-testid="checklist-dot-phone"
                aria-hidden="true"
              />
              <span>{t('patients.form.checklist_phone')}</span>
            </div>
          </div>

          <div className={classes.actions}>
            <Button type="submit" variant="primary" block disabled={createMut.isPending}>
              {t('common.save')}
            </Button>
            <Button variant="ghost" block onClick={() => navigate('/patients')}>
              {t('common.cancel')}
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}
