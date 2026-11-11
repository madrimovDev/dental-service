import classes from './ConnectionStatus.module.css';

/** lan = lokal serverga ulangan · offline = internet yo'q, ish davom etadi · cloud = bulut · noserver = server topilmadi */
export type ConnectionStatusKind = 'lan' | 'offline' | 'cloud' | 'noserver';

export interface ConnectionStatusProps {
  status: ConnectionStatusKind;
  /** Qisqa sarlavha ("Server ulangan"). */
  title: string;
  /** Ikkinchi qator ("Lokal tarmoq"). */
  description?: string;
}

export interface DeriveConnectionInput {
  /** `GET /api/license/status` → `mode`. */
  mode: 'desktop' | 'cloud';
  /** `navigator.onLine`. */
  online: boolean;
  /** Lokal/bulut API javob beryaptimi. */
  serverReachable: boolean;
}

/** Holatni aniqlash: server topilmasa — noserver; internet yo'q — offline; aks holda rejimga qarab. */
export function deriveConnectionStatus(input: DeriveConnectionInput): ConnectionStatusKind {
  if (!input.serverReachable) return 'noserver';
  if (!input.online) return 'offline';
  return input.mode === 'cloud' ? 'cloud' : 'lan';
}

/** Menyu pastida doim ko'rinadigan ulanish holati (rang + doira + matn). */
export function ConnectionStatus({ status, title, description }: ConnectionStatusProps) {
  return (
    <div className={classes.root} role="status" data-status={status}>
      <span className={classes.dot} aria-hidden="true" />
      <span className={classes.text}>
        <b className={classes.title}>{title}</b>
        {description && <span className={classes.description}>{description}</span>}
      </span>
    </div>
  );
}
