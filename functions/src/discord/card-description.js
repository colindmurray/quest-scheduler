const DISCORD_DESCRIPTION_LIMIT = 4096;
const DESCRIPTION_SPACE_RATIO = 0.25;
const DESCRIPTION_WRAP_WIDTH = 75;
const MAX_DESCRIPTION_CHARS = Math.floor(DISCORD_DESCRIPTION_LIMIT * DESCRIPTION_SPACE_RATIO);
const MAX_DESCRIPTION_ROWS = Math.floor(
  (DISCORD_DESCRIPTION_LIMIT / DESCRIPTION_WRAP_WIDTH) * DESCRIPTION_SPACE_RATIO
);
const MAX_DESCRIPTION_WORDS = 180;
const MAX_EXPLICIT_NEWLINES = 8;

function normalizeText(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function countWords(text) {
  if (!text) return 0;
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countExplicitNewlines(text) {
  if (!text) return 0;
  return (String(text).match(/\r?\n/g) || []).length;
}

function estimateWrappedRows(text) {
  if (!text) return 0;
  const lines = String(text).split(/\r?\n/);
  return lines.reduce((total, line) => {
    if (!line) return total + 1;
    return total + Math.max(1, Math.ceil(line.length / DESCRIPTION_WRAP_WIDTH));
  }, 0);
}

function isWithinBudget(text) {
  const value = String(text || "");
  return (
    value.length <= MAX_DESCRIPTION_CHARS &&
    countWords(value) <= MAX_DESCRIPTION_WORDS &&
    countExplicitNewlines(value) <= MAX_EXPLICIT_NEWLINES &&
    estimateWrappedRows(value) <= MAX_DESCRIPTION_ROWS
  );
}

function trimToWordBoundary(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;

  const sliced = text.slice(0, Math.max(0, maxLength)).trimEnd();
  if (!sliced) return "";

  const withoutPartialWord = sliced.replace(/\s+\S*$/, "").trimEnd();
  if (withoutPartialWord && withoutPartialWord.length >= 24) {
    return withoutPartialWord;
  }
  return sliced;
}

function formatEmbedDescription({ description, pollUrl }) {
  const normalized = normalizeText(description);
  if (!normalized) return undefined;
  if (isWithinBudget(normalized)) return normalized;

  const suffix = `\n\n_View full content on [Quest Scheduler](${pollUrl})._`;
  const ellipsis = "...";
  const maxBodyLength = Math.max(
    0,
    MAX_DESCRIPTION_CHARS - suffix.length - ellipsis.length
  );

  let candidate = trimToWordBoundary(normalized, maxBodyLength);
  while (candidate && !isWithinBudget(candidate)) {
    candidate = trimToWordBoundary(candidate, Math.max(0, candidate.length - 32));
  }

  const prefix = candidate ? `${candidate}${ellipsis}` : "";
  const formatted = `${prefix}${suffix}`;

  // Keep final output under Discord's hard embed description limit.
  return formatted.length <= DISCORD_DESCRIPTION_LIMIT
    ? formatted
    : formatted.slice(0, DISCORD_DESCRIPTION_LIMIT);
}

module.exports = {
  formatEmbedDescription,
  __test__: {
    countExplicitNewlines,
    countWords,
    estimateWrappedRows,
    isWithinBudget,
    normalizeText,
    trimToWordBoundary,
    MAX_DESCRIPTION_CHARS,
    MAX_DESCRIPTION_ROWS,
    MAX_DESCRIPTION_WORDS,
    MAX_EXPLICIT_NEWLINES,
  },
};
