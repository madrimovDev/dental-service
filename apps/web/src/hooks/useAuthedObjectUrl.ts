import { fetchBlob } from '@dental/api-client';
import { useEffect, useState } from 'react';

/**
 * P11 — brauzer `<img src>` / `<a href>` `Authorization` header yubormaydi, shuning
 * `/uploads/:key` 401 berardi. Bu hook faylni `api-client` orqali (Bearer + 401
 * refresh) Blob qilib oladi va `URL.createObjectURL` beradi; unmount / url
 * o'zgarganda `revokeObjectURL`.
 *
 * Xato (403/404/tarmoq) tashlamaydi — `isError: true` qaytaradi (rasm kartasi
 * sinmasligi uchun).
 */
export type AuthedObjectUrl = {
  src: string | null;
  isLoading: boolean;
  isError: boolean;
};

export function useAuthedObjectUrl(url: string | null | undefined): AuthedObjectUrl {
  const [state, setState] = useState<AuthedObjectUrl>({
    src: null,
    isLoading: !!url,
    isError: false,
  });

  useEffect(() => {
    if (!url) {
      setState({ src: null, isLoading: false, isError: false });
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ src: null, isLoading: true, isError: false });

    fetchBlob(url, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, isLoading: false, isError: false });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ src: null, isLoading: false, isError: true });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

/**
 * Bosilganda faylni Bearer bilan olib, brauzerga saqlatadi (yoki `openInNewTab`
 * bo'lsa yangi tabda ochadi). Yuklash xatosi chaqiruvchiga tashlanadi.
 */
export async function downloadAuthedFile(
  url: string,
  filename: string,
  opts: { openInNewTab?: boolean } = {},
): Promise<void> {
  const blob = await fetchBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  if (opts.openInNewTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  } else {
    a.download = filename;
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Yangi tab/yuklash boshlangach bo'shatamiz.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
