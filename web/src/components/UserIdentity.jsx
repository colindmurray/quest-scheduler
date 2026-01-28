import { buildPublicIdentifier } from "../lib/identity";

export function UserIdentity({ user, showIdentifier = true, className = "" }) {
  if (!user) return null;
  const publicIdentifier = buildPublicIdentifier(user);
  const displayName = user.displayName || "";
  const normalizedPublic = publicIdentifier || "";
  const isDuplicate =
    displayName && normalizedPublic && displayName.toLowerCase() === normalizedPublic.toLowerCase();

  if (!displayName || isDuplicate) {
    return <span className={className}>{publicIdentifier}</span>;
  }

  if (!showIdentifier || !publicIdentifier) {
    return <span className={className}>{displayName}</span>;
  }

  return (
    <span className={className}>
      {displayName} <span className="text-slate-500 dark:text-slate-400">({publicIdentifier})</span>
    </span>
  );
}
