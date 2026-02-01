const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { DISCORD_REGION } = require("./config");

exports.discordWarmup = onSchedule(
  {
    region: DISCORD_REGION,
    schedule: "every 5 minutes",
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.PROJECT_ID;
    if (!projectId) {
      logger.warn("Discord warmup skipped: missing project ID");
      return;
    }

    const url = `https://${DISCORD_REGION}-${projectId}.cloudfunctions.net/discordInteractions?warmup=1`;
    try {
      const response = await fetch(url, { method: "GET" });
      logger.info("Discord warmup pinged", {
        status: response.status,
      });
    } catch (err) {
      logger.warn("Discord warmup failed", { error: err?.message });
    }
  }
);
