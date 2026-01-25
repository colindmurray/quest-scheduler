const crypto = require("crypto");

function generateLinkCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function hashLinkCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

module.exports = { generateLinkCode, hashLinkCode };
