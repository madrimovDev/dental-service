import { AlertBanner, Button, Select } from '@dental/ui';
import { Modal } from '@mantine/core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  guessMapping,
  IMPORT_FIELDS,
  type ImportField,
  ImportFileError,
  type ImportMapping,
  type ImportResult,
  type ImportRowInput,
  isMappingComplete,
  mapRows,
  REQUIRED_IMPORT_FIELDS,
  readSpreadsheet,
} from '../patient-import';
import { useImportPatients } from '../patients.api';
import classes from './PatientImportModal.module.css';

type Step = 'file' | 'map' | 'preview' | 'done';

const NO_COLUMN = '';
/** Xato ro'yxatida ko'pi bilan shuncha qator ko'rsatiladi (qolgani sanoqda). */
const MAX_ERRORS_SHOWN = 20;

/** 0 → A, 1 → B, … 26 → AA (Excel ustun harfi). */
function columnLetter(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function PatientImportModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const importMut = useImportPatients();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportMapping>(() => guessMapping([]));
  const [prepared, setPrepared] = useState<{ rows: ImportRowInput[]; sourceRows: number[] }>({
    rows: [],
    sourceRows: [],
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const reset = () => {
    setStep('file');
    setFileName('');
    setTable([]);
    setMapping(guessMapping([]));
    setPrepared({ rows: [], sourceRows: [] });
    setResult(null);
    setError(null);
    setReading(false);
    importMut.reset();
    if (fileInput.current) fileInput.current.value = '';
  };
  const close = () => {
    reset();
    onClose();
  };

  const headers = table[0] ?? [];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const cells = await readSpreadsheet(file);
      setFileName(file.name);
      setTable(cells);
      setMapping(guessMapping(cells[0] ?? []));
      setStep('map');
    } catch (e) {
      const code = e instanceof ImportFileError ? e.code : 'unreadable';
      setError(t(`patientImport.file_error.${code}`));
    } finally {
      setReading(false);
    }
  };

  const toPreview = async () => {
    setError(null);
    const mapped = mapRows(table.slice(1), mapping);
    if (mapped.rows.length === 0) {
      setError(t('patientImport.no_rows'));
      return;
    }
    setPrepared(mapped);
    try {
      setResult(await importMut.mutateAsync({ rows: mapped.rows, dryRun: true }));
      setStep('preview');
    } catch {
      setError(t('patientImport.request_error'));
    }
  };

  const runImport = async () => {
    setError(null);
    try {
      setResult(await importMut.mutateAsync({ rows: prepared.rows, dryRun: false }));
      setStep('done');
    } catch {
      setError(t('patientImport.request_error'));
    }
  };

  const columnOptions = [
    { value: NO_COLUMN, label: t('patientImport.no_column') },
    ...headers.map((h, i) => ({
      value: String(i),
      label: `${columnLetter(i)} — ${h || t('patientImport.empty_header')}`,
    })),
  ];

  const errorRows = (result?.results ?? []).filter((r) => r.status === 'error');
  const busy = importMut.isPending;

  return (
    <Modal opened={opened} onClose={close} title={t('patientImport.title')} size="lg" centered>
      <div className={classes.body}>
        {error && (
          <AlertBanner tier={2} title={t('patientImport.error_title')}>
            {error}
          </AlertBanner>
        )}

        {step === 'file' && (
          <div className={classes.section}>
            <p className={classes.hint}>{t('patientImport.file_hint')}</p>
            <input
              ref={fileInput}
              className={classes.fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              aria-label={t('patientImport.choose_file')}
              disabled={reading}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {reading && <p className={classes.hint}>{t('patientImport.reading')}</p>}
          </div>
        )}

        {step === 'map' && (
          <div className={classes.section}>
            <p className={classes.hint}>
              {t('patientImport.map_hint', { file: fileName, count: table.length - 1 })}
            </p>
            <div className={classes.mapGrid}>
              {IMPORT_FIELDS.map((field: ImportField) => (
                <Select
                  key={field}
                  label={`${t(`patientImport.field.${field}`)}${
                    REQUIRED_IMPORT_FIELDS.includes(field) ? ' *' : ''
                  }`}
                  value={mapping[field] == null ? NO_COLUMN : String(mapping[field])}
                  data={columnOptions}
                  onChange={(v) => setMapping((m) => ({ ...m, [field]: v ? Number(v) : null }))}
                />
              ))}
            </div>
            <div className={classes.actions}>
              <Button variant="ghost" onClick={reset}>
                {t('patientImport.back')}
              </Button>
              <Button
                variant="primary"
                disabled={!isMappingComplete(mapping) || busy}
                onClick={toPreview}
              >
                {t('patientImport.preview')}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && result && (
          <div className={classes.section}>
            <p className={classes.hint}>{t('patientImport.preview_hint')}</p>
            <ResultCounts result={result} />
            {errorRows.length > 0 && (
              <ErrorList errors={errorRows} sourceRows={prepared.sourceRows} />
            )}
            {result.skippedDuplicate > 0 && (
              <p className={classes.hint}>{t('patientImport.duplicates_note')}</p>
            )}
            <div className={classes.actions}>
              <Button variant="ghost" onClick={() => setStep('map')}>
                {t('patientImport.back')}
              </Button>
              <Button variant="primary" disabled={result.created === 0 || busy} onClick={runImport}>
                {t('patientImport.run', { count: result.created })}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className={classes.section}>
            <AlertBanner tier={3} title={t('patientImport.done_title')}>
              {t('patientImport.done_desc', { count: result.created })}
            </AlertBanner>
            <ResultCounts result={result} />
            {errorRows.length > 0 && (
              <ErrorList errors={errorRows} sourceRows={prepared.sourceRows} />
            )}
            <div className={classes.actions}>
              <Button variant="primary" onClick={close}>
                {t('patientImport.close')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ResultCounts({ result }: { result: ImportResult }) {
  const { t } = useTranslation();
  return (
    <div className={classes.counts}>
      <div className={classes.count} data-kind="new">
        <strong>{result.created}</strong>
        <span>{t('patientImport.count_new')}</span>
      </div>
      <div className={classes.count} data-kind="duplicate">
        <strong>{result.skippedDuplicate}</strong>
        <span>{t('patientImport.count_duplicate')}</span>
      </div>
      <div className={classes.count} data-kind="error">
        <strong>{result.errorCount}</strong>
        <span>{t('patientImport.count_error')}</span>
      </div>
    </div>
  );
}

function ErrorList({
  errors,
  sourceRows,
}: {
  errors: ImportResult['results'];
  sourceRows: number[];
}) {
  const { t } = useTranslation();
  return (
    <ul className={classes.errors} aria-label={t('patientImport.errors_title')}>
      {errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
        <li key={e.row}>
          {t('patientImport.error_row', {
            row: sourceRows[e.row - 1] ?? e.row,
            reason: t(`patientImport.error.${e.code ?? 'unknown'}`),
          })}
        </li>
      ))}
      {errors.length > MAX_ERRORS_SHOWN && (
        <li>{t('patientImport.errors_more', { count: errors.length - MAX_ERRORS_SHOWN })}</li>
      )}
    </ul>
  );
}
