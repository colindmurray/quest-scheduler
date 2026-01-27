import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../app/AuthProvider";
import { resendVerificationEmail } from "../lib/auth";

function hasPasswordProvider(user) {
  return (user?.providerData || []).some((provider) => provider.providerId === "password");
}

export default function VerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!user || user.emailVerified || !hasPasswordProvider(user)) {
    return null;
  }

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerificationEmail();
      toast.success("Verification email sent.");
    } catch (error) {
      toast.error(error?.message || "Failed to send verification email.");
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const refreshedUser = await refreshUser();
      if (refreshedUser?.emailVerified) {
        toast.success("Email verified. Thanks!");
      } else {
        toast("Still not verified yet. Check your inbox.");
      }
    } catch (error) {
      toast.error("Failed to refresh verification status.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Verify your email to unlock full access.</p>
          <p className="mt-1 text-[11px] text-amber-700/90 dark:text-amber-100/80">
            We sent a verification link to {user.email}. Confirm it to create polls and send invites.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            {sending ? "Sending..." : "Resend email"}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "I've verified"}
          </button>
        </div>
      </div>
    </div>
  );
}
