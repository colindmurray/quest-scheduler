import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const useAuthMock = vi.fn(() => ({ user: { uid: 'user-1', email: 'User@Example.com' } }));
vi.mock('../app/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

import { useNotificationSync } from './useNotificationSync';

describe('useNotificationSync', () => {
  test('is a no-op when events handle notifications', () => {
    renderHook(() => useNotificationSync());

    expect(useAuthMock).toHaveBeenCalled();
  });
});
