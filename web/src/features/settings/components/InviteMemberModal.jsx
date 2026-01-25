import { useState } from "react";
import { toast } from "sonner";
import { isValidEmail } from "../../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function InviteMemberModal({ open, onOpenChange, group, onInviteMember, friends = [] }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const existingMembers = new Set([
    ...(group?.members || []).map((e) => e.toLowerCase()),
    ...(group?.pendingInvites || []).map((e) => e.toLowerCase()),
  ]);

  const friendSet = new Set(friends.map((e) => e.toLowerCase()));
  const availableSuggestions = friends.filter(
    (e) => !existingMembers.has(e.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter an email address");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    if (existingMembers.has(normalizedEmail)) {
      setError("This person is already a member or has a pending invite");
      return;
    }
    if (!friendSet.has(normalizedEmail)) {
      setError("You can only invite friends to a questing group.");
      return;
    }

    setSaving(true);
    try {
      await onInviteMember(group.id, group.name, normalizedEmail);
      setEmail("");
      onOpenChange(false);
      toast.success(`Invitation sent to ${normalizedEmail}`);
    } catch (err) {
      console.error("Failed to invite member:", err);
      setError(err.message || "Failed to send invitation");
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestionClick = (suggestedEmail) => {
    setEmail(suggestedEmail);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {group?.name}</DialogTitle>
          <DialogDescription>
            Invite friends to join this questing group. They'll receive an email and in-app notification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="friend@example.com"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                autoFocus
              />
            </label>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
            )}

            {friends.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You need to add friends before inviting them to a questing group.
              </p>
            )}

            {availableSuggestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  From your friends
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableSuggestions.slice(0, 6).map((suggestedEmail) => (
                    <button
                      key={suggestedEmail}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestedEmail)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-700"
                    >
                      + {suggestedEmail}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !email.trim()}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Sending..." : "Send invitation"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
