import { getUserAvatarUrl, getUserLabel } from "../../lib/identity";
import { getColorForEmail, getInitial, uniqueUsers } from "./voter-avatar-utils";

export function AvatarBubble({ user, email, avatar, label, size = 24, colorMap }) {
  const resolvedUser = user || {};
  const resolvedEmail = email || resolvedUser.email || null;
  const resolvedAvatar = avatar || getUserAvatarUrl(resolvedUser);
  const resolvedLabel =
    label ||
    getUserLabel({ ...resolvedUser, email: resolvedEmail }) ||
    resolvedEmail ||
    "User";
  // Use colorMap if provided, otherwise compute color directly from email hash
  const palette =
    colorMap?.[resolvedEmail] || getColorForEmail(resolvedEmail || resolvedLabel);
  return (
    <div
      className="flex items-center justify-center rounded-full border border-white shadow-sm dark:border-slate-900"
      style={{
        width: size,
        height: size,
        backgroundColor: resolvedAvatar ? "transparent" : palette.bg,
        color: palette.text,
      }}
      title={resolvedLabel}
    >
      {resolvedAvatar ? (
        <img
          src={resolvedAvatar}
          alt={resolvedLabel}
          className="h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-[10px] font-semibold">{getInitial(resolvedLabel)}</span>
      )}
    </div>
  );
}

export function AvatarStack({ users, max = 4, size = 20, colorMap }) {
  const unique = uniqueUsers(users || []);
  const visible = unique.slice(0, max);
  const extra = unique.length - visible.length;
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((userInfo, index) => (
        <AvatarBubble
          key={userInfo.email || index}
          user={userInfo}
          size={size}
          colorMap={colorMap}
        />
      ))}
      {extra > 0 && (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-slate-200 text-[10px] font-semibold text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-700 dark:text-slate-200"
          title={`${extra} more`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

export const VOTING_AVATAR_MAX = 10;

export function VotingAvatarStack({ users, max = VOTING_AVATAR_MAX, size = 20, colorMap }) {
  return <AvatarStack users={users} max={max} size={size} colorMap={colorMap} />;
}
