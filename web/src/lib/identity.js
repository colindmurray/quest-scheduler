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
