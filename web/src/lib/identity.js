export function buildPublicIdentifier({
  publicIdentifier,
  publicIdentifierType,
  qsUsername,
  discordUsername,
  email,
} = {}) {
  if (publicIdentifier) return publicIdentifier;
  const type = publicIdentifierType || "email";
  if (type === "qsUsername" && qsUsername) {
    return `@${qsUsername}`;
  }
  if (type === "discordUsername" && discordUsername) {
    return discordUsername;
  }
  return email || "";
}

export function getUserIdentity(user = {}) {
  const displayName = String(user?.displayName || "").trim();
  const publicIdentifier = buildPublicIdentifier(user);
  const normalizedDisplay = displayName.toLowerCase();
  const normalizedPublic = String(publicIdentifier || "").toLowerCase();
  const isDuplicate =
    displayName && publicIdentifier && normalizedDisplay === normalizedPublic;
  const label =
    displayName && !isDuplicate ? displayName : publicIdentifier || displayName;
  return { displayName, publicIdentifier, label, isDuplicate };
}

export function getUserLabel(user = {}) {
  return getUserIdentity(user).label || "";
}

export function getUserAvatarUrl(user = {}) {
  if (!user) return null;
  return (
    user.avatar ||
    user.photoURL ||
    user.photoUrl ||
    user.userAvatar ||
    user.avatarUrl ||
    user.customAvatarUrl ||
    null
  );
}
