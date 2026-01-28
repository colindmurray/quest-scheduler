import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { onSnapshot } from 'firebase/firestore';

import { useFirestoreCollection } from './useFirestoreCollection';

describe('useFirestoreCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns empty state when query ref missing', () => {
    const { result } = renderHook(() => useFirestoreCollection(null));

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('maps snapshot docs into data', async () => {
    const onSnapshotMock = vi.mocked(onSnapshot);
    onSnapshotMock.mockImplementation((ref, onNext) => {
      onNext({
        docs: [
          { id: 'doc-1', data: () => ({ name: 'Alpha' }) },
          { id: 'doc-2', data: () => ({ name: 'Beta' }) },
        ],
      });
      return () => {};
    });

    const { result } = renderHook(() => useFirestoreCollection('ref'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([
      { id: 'doc-1', name: 'Alpha' },
      { id: 'doc-2', name: 'Beta' },
    ]);
  });
});
