export function getInitial(email) {
  if (!email) return "?";
  return email.trim()[0]?.toUpperCase() || "?";
}

export function uniqueUsers(users) {
  const map = new Map();
  users.forEach((user) => {
    if (user?.email && !map.has(user.email)) {
      map.set(user.email, user);
    }
  });
  return Array.from(map.values());
}

export function buildColorMap(emails) {
  const map = {};
  emails.forEach((email, index) => {
    const hue = (index * 137.508) % 360;
    map[email] = {
      bg: `hsl(${hue} 60% 78%)`,
      text: `hsl(${hue} 35% 25%)`,
    };
  });
  return map;
}

export function AvatarBubble({ email, avatar, size = 24, colorMap }) {
  const palette = colorMap?.[email] || { bg: "#e2e8f0", text: "#0f172a" };
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
