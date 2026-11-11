import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchBlob = vi.fn();
vi.mock('@dental/api-client', () => ({
  fetchBlob: (...a: unknown[]) => fetchBlob(...a),
}));

import { downloadAuthedFile, useAuthedObjectUrl } from './useAuthedObjectUrl';

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  fetchBlob.mockReset();
  created.length = 0;
  revoked.length = 0;
  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:test/${++n}`;
    created.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => {
    revoked.push(u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('useAuthedObjectUrl', () => {
  it('api-client orqali blob oladi, object URL beradi, unmount’da revoke qiladi', async () => {
    fetchBlob.mockResolvedValue(new Blob(['x']));
    const { result, unmount } = renderHook(() => useAuthedObjectUrl('/uploads/a'));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.src).toBe('blob:test/1'));
    expect(fetchBlob).toHaveBeenCalledWith('/uploads/a', expect.any(AbortSignal));
    expect(revoked).toEqual([]);
    unmount();
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('url o‘zgarsa eski object URL revoke qilinadi', async () => {
    fetchBlob.mockResolvedValue(new Blob(['x']));
    const { result, rerender } = renderHook(({ u }) => useAuthedObjectUrl(u), {
      initialProps: { u: '/uploads/a' },
    });
    await waitFor(() => expect(result.current.src).toBe('blob:test/1'));
    rerender({ u: '/uploads/b' });
    await waitFor(() => expect(result.current.src).toBe('blob:test/2'));
    expect(revoked).toContain('blob:test/1');
  });

  it('xato (403) tashlamaydi — isError, src null', async () => {
    fetchBlob.mockRejectedValue(new Error('403'));
    const { result } = renderHook(() => useAuthedObjectUrl('/uploads/a'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.src).toBeNull();
    expect(created).toEqual([]);
  });

  it('url yo‘q bo‘lsa fetch qilinmaydi', () => {
    const { result } = renderHook(() => useAuthedObjectUrl(null));
    expect(result.current).toEqual({ src: null, isLoading: false, isError: false });
    expect(fetchBlob).not.toHaveBeenCalled();
  });

  it('unmount fetch tugashidan oldin bo‘lsa object URL yaratilmaydi', async () => {
    let resolve: (b: Blob) => void = () => {};
    fetchBlob.mockReturnValue(new Promise<Blob>((r) => (resolve = r)));
    const { unmount } = renderHook(() => useAuthedObjectUrl('/uploads/a'));
    unmount();
    await act(async () => resolve(new Blob(['x'])));
    expect(created).toEqual([]);
  });
});

describe('downloadAuthedFile', () => {
  it('Bearer blob → <a download> bosiladi', async () => {
    fetchBlob.mockResolvedValue(new Blob(['x']));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadAuthedFile('/uploads/a', 'f.png');
    expect(fetchBlob).toHaveBeenCalledWith('/uploads/a');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
