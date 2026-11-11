import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { kb } from '@/lib/format';
import { useUploadFile } from '../cases.api';
import type { CaseFile } from '../cases.types';

const isImage = (f: CaseFile) => f.mimeType.startsWith('image/');

export function FileList({
  caseId,
  files,
  canUpload,
}: {
  caseId: string;
  files: CaseFile[];
  canUpload: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFile(caseId);

  const open = async (f: CaseFile, mode: 'view' | 'download') => {
    setError(false);
    try {
      const blob = await api.blob(`/v1/lab/cases/${caseId}/files/${f.id}`);
      const url = URL.createObjectURL(blob);
      if (mode === 'view') {
        window.open(url, '_blank', 'noopener');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.fileName ?? 'file';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="files">
      <span className="section-title">{t('labHub.detail.files')}</span>
      {files.length === 0 && <span className="muted">{t('labHub.detail.filesNone')}</span>}
      {files.map((f) => (
        <div className="file" key={f.id}>
          <span className="file__name">{f.fileName ?? '—'}</span>
          <span className="file__size mono">
            {t('labHub.detail.sizeKb', { n: kb(f.sizeBytes) })}
          </span>
          {isImage(f) && (
            <button type="button" className="btn btn--sm" onClick={() => open(f, 'view')}>
              {t('labHub.detail.preview')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--sm"
            aria-label={`${t('labHub.detail.download')}: ${f.fileName ?? ''}`}
            onClick={() => open(f, 'download')}
          >
            {t('labHub.detail.download')}
          </button>
        </div>
      ))}
      {error && (
        <div role="alert" className="form-error">
          {t('labHub.detail.fileError')}
        </div>
      )}
      {canUpload && (
        <div>
          <input
            ref={input}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('labHub.detail.attach')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn--sm"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            + {t('labHub.detail.attach')}
          </button>
        </div>
      )}
    </div>
  );
}
