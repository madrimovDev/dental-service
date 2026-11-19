import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../Button';
import classes from './CameraCapture.module.css';

export type CameraUnavailableReason = 'denied' | 'not_found' | 'unsupported' | 'failed';

export interface CameraCaptureLabels {
  capture: string;
  retake: string;
  use: string;
  switchCamera: string;
  upload: string;
  cancel: string;
  starting: string;
  denied: string;
  notFound: string;
  unsupported: string;
  failed: string;
  previewAlt: string;
  videoLabel: string;
}

export interface CameraCaptureProps {
  /** Suratga olingan (tasdiqlangan) yoki yuklangan fayl. */
  onCapture: (file: File) => void;
  onCancel?: () => void;
  /**
   * Kamera ochilmadi (ruxsat yo'q / qurilma yo'q / qo'llanmaydi). Fayl yuklash
   * fallback'i ochiq qoladi; chaqiruvchi sababni saqlashi mumkin (masalan kassa
   * rasmi `skipped_reason`).
   */
  onUnavailable?: (reason: CameraUnavailableReason) => void;
  /** Tarjimalar (`@dental/ui` i18n'ga bog'liq emas). */
  labels: CameraCaptureLabels;
  /** Boshlang'ich kamera: `user` (old) yoki `environment` (orqa). */
  initialFacing?: 'user' | 'environment';
  /** Eng katta tomon (px); katta kadrlar kichraytiriladi. */
  maxDimension?: number;
}

type Phase = 'starting' | 'live' | 'captured' | 'unavailable';

const reasonFromError = (e: unknown): CameraUnavailableReason => {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  ) {
    return 'not_found';
  }
  return 'failed';
};

const stopStream = (stream: MediaStream | null) => {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
};

export function CameraCapture({
  onCapture,
  onCancel,
  onUnavailable,
  labels,
  initialFacing = 'user',
  maxDimension = 1600,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const [facing, setFacing] = useState<'user' | 'environment'>(initialFacing);
  const [phase, setPhase] = useState<Phase>('starting');
  const [reason, setReason] = useState<CameraUnavailableReason | null>(null);
  const [captured, setCaptured] = useState<{ file: File; url: string } | null>(null);

  const hasCapture = captured !== null;

  // Oqim: facing/surat holati o'zgarganda qayta ochiladi; unmount'da to'xtatiladi.
  useEffect(() => {
    if (hasCapture) return; // surat olingan — kamera o'chiq
    let cancelled = false;
    setPhase('starting');
    const fail = (r: CameraUnavailableReason) => {
      setReason(r);
      setPhase('unavailable');
      onUnavailableRef.current?.(r);
    };
    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!getUserMedia) {
      fail('unsupported');
      return;
    }
    getUserMedia({ video: { facingMode: facing }, audio: false }).then(
      (stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play?.()?.catch(() => {});
        }
        setPhase('live');
      },
      (e: unknown) => {
        if (!cancelled) fail(reasonFromError(e));
      },
    );
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing, hasCapture]);

  // Preview URL'ni tozalash
  useEffect(() => {
    return () => {
      if (captured) URL.revokeObjectURL(captured.url);
    };
  }, [captured]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || phase !== 'live') return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const scale = Math.min(1, maxDimension / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream(streamRef.current);
        streamRef.current = null;
        setCaptured({ file, url: URL.createObjectURL(blob) });
        setPhase('captured');
      },
      'image/jpeg',
      0.9,
    );
  }, [phase, maxDimension]);

  const retake = () => {
    setCaptured(null);
  };

  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onCapture(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  const unavailableText =
    reason === 'denied'
      ? labels.denied
      : reason === 'not_found'
        ? labels.notFound
        : reason === 'unsupported'
          ? labels.unsupported
          : labels.failed;

  return (
    <div className={classes.root}>
      <div className={classes.stage}>
        {phase === 'captured' && captured ? (
          <img className={classes.media} src={captured.url} alt={labels.previewAlt} />
        ) : phase === 'unavailable' ? (
          <p className={classes.message} role="alert">
            {unavailableText}
          </p>
        ) : (
          <>
            <video
              ref={videoRef}
              className={classes.media}
              data-mirrored={facing === 'user' || undefined}
              aria-label={labels.videoLabel}
              autoPlay
              playsInline
              muted
            />
            {phase === 'starting' && <p className={classes.overlay}>{labels.starting}</p>}
          </>
        )}
      </div>

      <div className={classes.actions}>
        {phase === 'captured' ? (
          <>
            <Button variant="primary" onClick={() => captured && onCapture(captured.file)}>
              {labels.use}
            </Button>
            <Button onClick={retake}>{labels.retake}</Button>
          </>
        ) : phase === 'unavailable' ? null : (
          <>
            <Button variant="primary" disabled={phase !== 'live'} onClick={capture}>
              {labels.capture}
            </Button>
            <Button onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
              {labels.switchCamera}
            </Button>
          </>
        )}
        {phase !== 'captured' && (
          <Button onClick={() => fileRef.current?.click()}>{labels.upload}</Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.currentTarget.files)}
      />
    </div>
  );
}
