import { type ReactNode, useEffect, useRef, useState } from 'react';
import classes from './UndoToast.module.css';

export interface UndoToastProps {
  /** Nima bo'lgani ("Jasur Tursunov — Kelmadi deb belgilandi"). */
  children: ReactNode;
  /** Tugma matni; qolgan soniya avtomatik qo'shiladi ("Qaytarish · 8 s"). */
  undoLabel: string;
  /** Soniya birligi ("s"). */
  secondsSuffix?: string;
  /** Qaytarish tugmasi bosildi — amal bajarilmaydi. */
  onUndo: () => void;
  /** Muddat tugadi — amal yakunlanadi (faqat bir marta). */
  onCommit: () => void;
  durationMs?: number;
  /** true bo'lsa ekran pastida markazda `fixed`. */
  floating?: boolean;
}

/**
 * Qaytarib bo'ladigan amal («Kelmadi», «Bekor qilish», «Arxivlash») uchun
 * tasdiq oynasi o'rniga 10 soniyalik qaytarish imkoni.
 *
 * ⚠️ PUL BILAN BOG'LIQ AMALLAR UCHUN ISHLATILMAYDI (to'lovni qaytarish, chegirma...) —
 * ular doim `CriticalActionDialog`/tasdiq oynasi bilan.
 *
 * `onCommit` faqat muddat tugaganda chaqiriladi; unmount (sahifadan chiqish) uni
 * chaqirmaydi — chaqiruvchi kutilayotgan amalni o'zi yakunlashi kerak.
 */
export function UndoToast({
  children,
  undoLabel,
  secondsSuffix = 's',
  onUndo,
  onCommit,
  durationMs = 10_000,
  floating = false,
}: UndoToastProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const settled = useRef(false);
  const undoRef = useRef(onUndo);
  const commitRef = useRef(onCommit);
  undoRef.current = onUndo;
  commitRef.current = onCommit;

  useEffect(() => {
    const deadline = Date.now() + durationMs;
    const id = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) {
        clearInterval(id);
        setRemainingMs(0);
        if (!settled.current) {
          settled.current = true;
          commitRef.current();
        }
        return;
      }
      setRemainingMs(left);
    }, 250);
    return () => clearInterval(id);
  }, [durationMs]);

  const handleUndo = () => {
    if (settled.current) return;
    settled.current = true;
    undoRef.current();
  };

  return (
    <div className={classes.root} role="status" data-floating={floating || undefined}>
      <span className={classes.text}>{children}</span>
      <button type="button" className={classes.undo} onClick={handleUndo}>
        {undoLabel} · {Math.ceil(remainingMs / 1000)} {secondsSuffix}
      </button>
    </div>
  );
}
