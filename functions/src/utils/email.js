function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function encodeEmailId(value) {
  return encodeURIComponent(normalizeEmail(value));
}

module.exports = {
  normalizeEmail,
  encodeEmailId,
};
