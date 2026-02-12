const crypto = require("crypto");
const { getFunctions } = require("firebase-admin/functions");

function createSyncHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

function buildTaskQueueName(region, queueName) {
  if (!region || !queueName) return queueName || "";
  return region === "us-central1"
    ? queueName
    : `locations/${region}/functions/${queueName}`;
}

function buildDiscordMessageUrl(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function enqueueSyncTask({
  region,
  queueName,
  payload,
  scheduleDelaySeconds = 2,
}) {
  const fullQueueName = buildTaskQueueName(region, queueName);
  const queue = getFunctions().taskQueue(fullQueueName);
  await queue.enqueue(payload, { scheduleDelaySeconds });
}

module.exports = {
  createSyncHash,
  buildTaskQueueName,
  buildDiscordMessageUrl,
  enqueueSyncTask,
};
