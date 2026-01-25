// 15 pastel colors across the spectrum
const PASTEL_COLORS = [
  { bg: "#FECDD3", text: "#9F1239" }, // Rose
  { bg: "#FED7AA", text: "#9A3412" }, // Orange
  { bg: "#FEF08A", text: "#854D0E" }, // Yellow
  { bg: "#D9F99D", text: "#3F6212" }, // Lime
  { bg: "#BBF7D0", text: "#166534" }, // Green
  { bg: "#A7F3D0", text: "#065F46" }, // Emerald
  { bg: "#99F6E4", text: "#115E59" }, // Teal
  { bg: "#A5F3FC", text: "#155E75" }, // Cyan
  { bg: "#BAE6FD", text: "#075985" }, // Sky
  { bg: "#BFDBFE", text: "#1E40AF" }, // Blue
  { bg: "#C7D2FE", text: "#3730A3" }, // Indigo
  { bg: "#DDD6FE", text: "#5B21B6" }, // Violet
  { bg: "#E9D5FF", text: "#7C3AED" }, // Purple
  { bg: "#F5D0FE", text: "#A21CAF" }, // Fuchsia
  { bg: "#FBCFE8", text: "#BE185D" }, // Pink
];

// Simple hash function for consistent color assignment
function hashEmail(email) {
  if (!email) return 0;
  const normalized = email.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Get consistent color for an email address
export function getColorForEmail(email) {
  const hash = hashEmail(email);
  return PASTEL_COLORS[hash % PASTEL_COLORS.length];
}

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

// Legacy function - now uses hash-based colors for consistency
export function buildColorMap(emails) {
  const map = {};
  emails.forEach((email) => {
    map[email] = getColorForEmail(email);
  });
  return map;
}

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
