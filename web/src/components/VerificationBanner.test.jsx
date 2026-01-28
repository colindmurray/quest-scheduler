import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('sonner', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { toast };
});

vi.mock('../app/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  resendVerificationEmail: vi.fn(),
}));

import { useAuth } from '../app/useAuth';
import { resendVerificationEmail } from '../lib/auth';
import { toast } from 'sonner';
import VerificationBanner from './VerificationBanner';

const baseUser = {
  email: 'test@example.com',
  emailVerified: false,
  providerData: [{ providerId: 'password' }],
};

describe('VerificationBanner', () => {
  test('renders nothing when user is verified', () => {
    const refreshUser = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: { ...baseUser, emailVerified: true },
      refreshUser,
    });

    const { container } = render(<VerificationBanner />);
    expect(container.firstChild).toBeNull();
  });

  test('resends verification email', async () => {
    const refreshUser = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: baseUser,
      refreshUser,
    });
    vi.mocked(resendVerificationEmail).mockResolvedValue();

    render(<VerificationBanner />);
    fireEvent.click(screen.getByText('Resend email'));

    await waitFor(() => {
      expect(resendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith('Verification email sent.');
    });
  });
});
