const { normalizeEmail } = require("./email");

const DISCORD_USERNAME_REGEX = /^[a-z0-9_.]{2,32}$/i;
const LEGACY_DISCORD_TAG_REGEX = /^.+#\d{4}$/;
const DISCORD_ID_REGEX = /^\d{17,20}$/;
const QS_USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;
const RESERVED_QS_USERNAMES = new Set([
  "admin",
  "support",
  "help",
  "system",
  "quest",
  "scheduler",
]);

function isDiscordUsername(value) {
  if (!value) return false;
  if (!DISCORD_USERNAME_REGEX.test(value)) return false;
  if (value.startsWith(".")) return false;
  if (value.endsWith(".")) return false;
  if (value.includes("..")) return false;
  return true;
}

function isValidQsUsername(value) {
  if (!value) return false;
  if (!QS_USERNAME_REGEX.test(value)) return false;
  return !RESERVED_QS_USERNAMES.has(value);
}

function parseIdentifier(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { type: "unknown", value: "" };
  if (trimmed.startsWith("@")) {
    return { type: "qsUsername", value: trimmed.slice(1).toLowerCase() };
  }
  if (trimmed.includes("@") && !trimmed.startsWith("@") && trimmed.includes(".")) {
    return { type: "email", value: normalizeEmail(trimmed) };
  }
  if (DISCORD_ID_REGEX.test(trimmed)) {
    return { type: "discordId", value: trimmed };
  }
  if (LEGACY_DISCORD_TAG_REGEX.test(trimmed)) {
    return { type: "legacyDiscordTag", value: trimmed };
  }
  if (isDiscordUsername(trimmed)) {
    return { type: "discordUsername", value: trimmed.toLowerCase() };
  }
  return { type: "unknown", value: trimmed };
}

module.exports = {
  DISCORD_USERNAME_REGEX,
  LEGACY_DISCORD_TAG_REGEX,
  DISCORD_ID_REGEX,
  QS_USERNAME_REGEX,
  RESERVED_QS_USERNAMES,
  isDiscordUsername,
  isValidQsUsername,
  parseIdentifier,
};
