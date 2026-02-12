import { Check, X } from "lucide-react";
import { UserIdentity } from "../../../components/UserIdentity";
import { normalizeEmail } from "../../../lib/utils";
import { SectionHeader } from "./section-header";

export function PendingInvitesSection({
  visiblePendingInvites,
  normalizedUserEmail,
  inviterMap,
  pendingInviteBusy,
  onOpenInvite,
  onAcceptInvite,
  onDeclineInvite,
}) {
  if (!visiblePendingInvites?.length) return null;

  return (
    <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
      <SectionHeader
        title="Pending poll invites"
        subtitle="Session polls waiting for your response"
      />
      <div className="mt-4 space-y-2">
        {visiblePendingInvites.map((invite) => {
          const meta = invite.pendingInviteMeta?.[normalizedUserEmail] || {};
          const inviterEmail = meta.invitedByEmail || invite.creatorEmail || null;
          const inviterProfile = inviterEmail
            ? inviterMap.get(normalizeEmail(inviterEmail)) || { email: inviterEmail }
            : null;
          const isBusy = Boolean(pendingInviteBusy[invite.id]);
          return (
            <div
              key={invite.id}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              <button
                type="button"
                onClick={() => onOpenInvite(invite.id)}
                className="flex flex-1 flex-col text-left"
              >
                <p className="text-sm font-semibold">{invite.title || "Session Poll"}</p>
                <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-200/80">
                  Invited by{" "}
                  {inviterProfile ? (
                    <UserIdentity user={inviterProfile} />
                  ) : (
                    "Unknown"
                  )}
                </p>
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-800/60 dark:text-amber-200">
                  Review
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Accept invite"
                    onClick={() => onAcceptInvite(invite)}
                    disabled={isBusy}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Decline invite"
                    onClick={() => onDeclineInvite(invite)}
                    disabled={isBusy}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
