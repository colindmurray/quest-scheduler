import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { onSnapshot } from 'firebase/firestore';

import { useFirestoreDoc } from './useFirestoreDoc';

describe('useFirestoreDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns null state when doc ref missing', () => {
    const { result } = renderHook(() => useFirestoreDoc(null));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('maps snapshot into data when exists', async () => {
    const onSnapshotMock = vi.mocked(onSnapshot);
    onSnapshotMock.mockImplementation((ref, onNext) => {
      onNext({
        id: 'doc-1',
        exists: () => true,
        data: () => ({ name: 'Alpha' }),
      });
      return () => {};
    });

    const { result } = renderHook(() => useFirestoreDoc('ref'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: 'doc-1', name: 'Alpha' });
  });

  test('clears stale error when doc ref changes', async () => {
    const onSnapshotMock = vi.mocked(onSnapshot);
    onSnapshotMock.mockImplementation((ref, onNext, onError) => {
      if (ref === 'ref-a') {
        onError(new Error('boom'));
      } else {
        onNext({
          id: 'doc-2',
          exists: () => true,
          data: () => ({ name: 'Beta' }),
        });
      }
      return () => {};
    });

    const { result, rerender } = renderHook(({ refValue }) => useFirestoreDoc(refValue), {
      initialProps: { refValue: 'ref-a' },
    });

    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    rerender({ refValue: 'ref-b' });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({ id: 'doc-2', name: 'Beta' });
  });
});
