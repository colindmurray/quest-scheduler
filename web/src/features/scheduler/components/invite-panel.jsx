import { UserAvatar } from "../../../components/ui/avatar";
import { UserIdentity } from "../../../components/UserIdentity";

const DEFAULT_GROUP_COLOR = "#10b981";

export function InvitePanel({
  title = "Invitees",
  includedUser = null,
  groupName = null,
  groupColor = null,
  groupMembers = [],
  groupAvatarSize = 22,
  inviteUsers = [],
  onRemoveInvite,
  inviteEmptyLabel = "No individual invitees yet.",
  pendingInviteUsers = null,
  onRemovePendingInvite,
  pendingTitle = "Pending invites (non-friends)",
  pendingEmptyLabel = "No pending invites.",
  recommendedUsers = [],
  onAddInvite,
  inputValue,
  onInputChange,
  onAddInput,
  inputPlaceholder = "Add email, Discord username, or @username",
  error,
  showInviteAvatars = true,
  showPendingAvatars = true,
  showRecommendedAvatars = true,
}) {
  const resolvedGroupColor = groupColor || DEFAULT_GROUP_COLOR;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
      {includedUser && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          You are included as{" "}
          <UserIdentity user={includedUser} showIdentifier={false} />.
        </p>
      )}

      {groupName && (
        <div
          className="mt-3 rounded-2xl border px-3 py-3 text-xs"
          style={{
            borderColor: resolvedGroupColor,
            backgroundColor: `${resolvedGroupColor}22`,
          }}
        >
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-100">
            Members from {groupName}
          </p>
          <div className="mt-2 grid gap-2">
            {groupMembers.length === 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                No members listed for this group.
              </span>
            )}
            {groupMembers.map((member) => (
              <div
                key={member.email}
                className="flex items-center gap-2 rounded-xl border border-transparent bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
              >
                <UserAvatar user={member} email={member.email} src={member.avatar} size={groupAvatarSize} />
                <UserIdentity user={member} showIdentifier={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {inviteUsers.length === 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {inviteEmptyLabel}
          </span>
        )}
        {inviteUsers.map((invitee) => (
          <button
            key={invitee.email}
            type="button"
            onClick={() => onRemoveInvite(invitee.email)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-red-900/30 dark:hover:border-red-800 dark:hover:text-red-300"
            title="Remove"
          >
            {showInviteAvatars && (
              <UserAvatar user={invitee} email={invitee.email} src={invitee.avatar} size={20} />
            )}
            <UserIdentity user={invitee} />
            <span className="text-xs">✕</span>
          </button>
        ))}
      </div>

      {Array.isArray(pendingInviteUsers) && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {pendingTitle}
          </p>
          {pendingInviteUsers.length === 0 && (
            <span className="mt-2 block text-xs text-slate-400 dark:text-slate-500">
              {pendingEmptyLabel}
            </span>
          )}
          {pendingInviteUsers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingInviteUsers.map((invitee) => (
                <button
                  key={invitee.email}
                  type="button"
                  onClick={() => onRemovePendingInvite(invitee.email)}
                  className="flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                  title="Remove pending invite"
                >
                  {showPendingAvatars && (
                    <UserAvatar user={invitee} email={invitee.email} src={invitee.avatar} size={20} />
                  )}
                  <UserIdentity user={invitee} />
                  <span className="text-xs">✕</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {recommendedUsers.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Recommended (from friends)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recommendedUsers.map((entry) => (
              <button
                key={entry.email}
                type="button"
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-700"
                onClick={() => onAddInvite(entry.email)}
              >
                {showRecommendedAvatars && (
                  <UserAvatar user={entry} email={entry.email} src={entry.avatar} size={18} />
                )}
                + <UserIdentity user={entry} showIdentifier={false} />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          placeholder={inputPlaceholder}
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddInput();
            }
          }}
        />
        <button
          type="button"
          onClick={onAddInput}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
