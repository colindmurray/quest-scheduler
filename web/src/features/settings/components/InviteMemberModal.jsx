import { useState } from "react";
import { toast } from "sonner";
import { resolveIdentifier } from "../../../lib/identifiers";
import { useUserProfiles } from "../../../hooks/useUserProfiles";
import { UserIdentity } from "../../../components/UserIdentity";
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
  const [sendFriendInvite, setSendFriendInvite] = useState(false);

  const existingMembers = new Set([
    ...(group?.members || []).map((e) => e.toLowerCase()),
    ...(group?.pendingInvites || []).map((e) => e.toLowerCase()),
  ]);

  const friendSet = new Set(friends.map((e) => e.toLowerCase()));
  const availableSuggestions = friends.filter(
    (e) => !existingMembers.has(e.toLowerCase())
  );
  const { enrichUsers } = useUserProfiles(availableSuggestions);
  const suggestionUsers = enrichUsers(availableSuggestions);
  const normalizedEmail = email.trim().toLowerCase();
  const showFriendInviteToggle = Boolean(normalizedEmail);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!normalizedEmail) {
      setError("Please enter an email or Discord username");
      return;
    }

    let resolved;
    try {
      resolved = await resolveIdentifier(normalizedEmail);
    } catch (err) {
      setError(err.message || "Please enter a valid email or Discord username");
      return;
    }

    const resolvedEmail = resolved.email.toLowerCase();
    if (existingMembers.has(resolvedEmail)) {
      setError("This person is already a member or has a pending invite");
      return;
    }

    setSaving(true);
    try {
      await onInviteMember(group.id, group.name, normalizedEmail, {
        sendFriendInvite,
      });
      setEmail("");
      setSendFriendInvite(false);
      onOpenChange(false);
      toast.success(`Invitation sent to ${resolvedEmail}`);
    } catch (err) {
      console.error("Failed to invite member:", err);
      setError(err.message || "Failed to send invitation");
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestionClick = (suggestedEmail) => {
    setEmail(suggestedEmail);
    setSendFriendInvite(false);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {group?.name}</DialogTitle>
          <DialogDescription>
            Invite someone by email, Discord username, or @username. They'll receive an email and in-app notification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
              Email, Discord username, or @username
              <input
                type="text"
                value={email}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setEmail(nextValue);
                  const nextNormalized = nextValue.trim().toLowerCase();
                  if (!nextNormalized || friendSet.has(nextNormalized)) {
                    setSendFriendInvite(false);
                  }
                  setError(null);
                }}
                placeholder="friend@example.com, discord_username, or @username"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                autoFocus
              />
            </label>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
            )}

            {showFriendInviteToggle && (
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={sendFriendInvite}
                  onChange={(e) => setSendFriendInvite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary dark:border-slate-600"
                />
                <span>Also send a friend request.</span>
              </label>
            )}

            {availableSuggestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  From your friends
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestionUsers.slice(0, 6).map((suggestedUser) => (
                    <button
                      key={suggestedUser.email}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestedUser.email)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-700"
                    >
                      + <UserIdentity user={suggestedUser} showIdentifier={false} />
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
