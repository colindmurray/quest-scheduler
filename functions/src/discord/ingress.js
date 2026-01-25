const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { verifyKey } = require("discord-interactions");
const admin = require("firebase-admin");
const { getFunctions } = require("firebase-admin/functions");
const {
  DISCORD_APPLICATION_ID,
  DISCORD_PUBLIC_KEY,
  DISCORD_REGION,
  DISCORD_TASK_QUEUE,
} = require("./config");

if (!admin.apps.length) {
  admin.initializeApp();
}

function parseInteractionBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (!req.rawBody) {
    return null;
  }
  try {
    return JSON.parse(req.rawBody.toString("utf8"));
  } catch (err) {
    logger.warn("Failed to parse Discord interaction body", { error: err?.message });
    return null;
  }
}

function trimInteractionPayload(body) {
  return {
    id: body?.id,
    applicationId: body?.application_id,
    type: body?.type,
    token: body?.token,
    data: body?.data,
    guildId: body?.guild_id,
    channelId: body?.channel_id,
    member: body?.member
      ? {
          user: body.member.user,
          permissions: body.member.permissions,
        }
      : null,
    user: body?.user,
    messageId: body?.message?.id || null,
    locale: body?.locale,
  };
}

exports.discordInteractions = onRequest(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).send("Method Not Allowed");
    }

    const signature = req.header("x-signature-ed25519");
    const timestamp = req.header("x-signature-timestamp");

    if (!signature || !timestamp || !req.rawBody) {
      logger.warn("Discord interaction missing signature headers");
      return res.status(401).send("Invalid signature");
    }

    const isValid = await verifyKey(
      req.rawBody,
      signature,
      timestamp,
      DISCORD_PUBLIC_KEY.value()
    );

    if (!isValid) {
      logger.warn("Discord interaction signature invalid");
      return res.status(401).send("Invalid signature");
    }

    const body = parseInteractionBody(req);
    if (!body) {
      return res.status(400).send("Invalid payload");
    }

    if (body.application_id !== DISCORD_APPLICATION_ID.value()) {
      logger.warn("Discord application ID mismatch", {
        received: body.application_id,
      });
      return res.status(401).send("Invalid application");
    }

    if (body.type === 1) {
      return res.json({ type: 1 });
    }

    const payload = trimInteractionPayload(body);

    const queueName =
      DISCORD_REGION === "us-central1"
        ? DISCORD_TASK_QUEUE
        : `locations/${DISCORD_REGION}/functions/${DISCORD_TASK_QUEUE}`;
    const queue = getFunctions().taskQueue(queueName);
    const enqueuePromise = queue.enqueue(payload).catch((err) => {
      logger.error("Failed to enqueue Discord interaction", {
        error: err?.message,
      });
    });

    let responsePayload = { type: 5, data: { flags: 64 } };
    if (body.type === 3 && body.data?.custom_id) {
      const customId = body.data.custom_id;
      if (!customId.startsWith("vote_btn:")) {
        responsePayload = { type: 6 };
      }
    }

    res.json(responsePayload);

    await enqueuePromise;
    return;
  }
);
