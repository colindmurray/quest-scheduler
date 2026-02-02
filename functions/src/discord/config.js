const { defineSecret } = require("firebase-functions/params");

const DISCORD_APPLICATION_ID = defineSecret("DISCORD_APPLICATION_ID");
const DISCORD_PUBLIC_KEY = defineSecret("DISCORD_PUBLIC_KEY");
const DISCORD_BOT_TOKEN = defineSecret("DISCORD_BOT_TOKEN");
const DISCORD_CLIENT_ID = defineSecret("DISCORD_CLIENT_ID");
const DISCORD_CLIENT_SECRET = defineSecret("DISCORD_CLIENT_SECRET");

const DISCORD_REGION = process.env.DISCORD_REGION || "us-central1";
const DISCORD_TASK_QUEUE = process.env.DISCORD_TASK_QUEUE || "processDiscordInteraction";
const DISCORD_SCHEDULER_TASK_QUEUE =
  process.env.DISCORD_SCHEDULER_TASK_QUEUE || "processDiscordSchedulerUpdate";
const APP_URL = process.env.QS_APP_URL || "https://questscheduler.cc";

const DISCORD_NOTIFICATION_DEFAULTS = {
  finalizationEvents: true,
  slotChanges: true,
  voteSubmitted: false,
  allVotesIn: false,
};

module.exports = {
  DISCORD_APPLICATION_ID,
  DISCORD_PUBLIC_KEY,
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REGION,
  DISCORD_TASK_QUEUE,
  DISCORD_SCHEDULER_TASK_QUEUE,
  APP_URL,
  DISCORD_NOTIFICATION_DEFAULTS,
};
