import { getColorForEmail, getInitial, uniqueUsers } from "./voter-avatar-utils";

export function AvatarBubble({ email, avatar, size = 24, colorMap }) {
  // Use colorMap if provided, otherwise compute color directly from email hash
  const palette = colorMap?.[email] || getColorForEmail(email);
  return (
    <div
      className="flex items-center justify-center rounded-full border border-white shadow-sm dark:border-slate-900"
      style={{
        width: size,
        height: size,
        backgroundColor: avatar ? "transparent" : palette.bg,
        color: palette.text,
      }}
      title={email}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={email}
          className="h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-[10px] font-semibold">{getInitial(email)}</span>
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
      {visible.map((userInfo) => (
        <AvatarBubble
          key={userInfo.email}
          email={userInfo.email}
          avatar={userInfo.avatar}
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
