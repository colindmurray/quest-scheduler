const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { createChannelMessage } = require("./discord-client");
const { APP_URL, DISCORD_REGION, DISCORD_BOT_TOKEN } = require("./config");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const NUDGE_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Build a nudge message mentioning users who haven't voted.
 */
function buildNudgeMessage({
  schedulerId,
  schedulerTitle,
  discordUserIds,
  firstSlotUnix,
  pollMessageUrl,
}) {
  const mentions = discordUserIds.map((id) => `<@${id}>`).join(" ");
  const pollUrl = `${APP_URL}/scheduler/${schedulerId}`;

  let content = `**Reminder: Votes needed for "${schedulerTitle}"**\n\n`;
  content += `${mentions}\n\n`;
  content += `Hey! Your votes are still needed for this session poll.\n`;

  if (firstSlotUnix) {
    content += `The first proposed time is <t:${firstSlotUnix}:F> (<t:${firstSlotUnix}:R>).\n`;
  }

  content += `\n**[Vote now](${pollUrl})**`;

  if (pollMessageUrl) {
    content += ` | [View poll message](${pollMessageUrl})`;
  }

  return { content };
}

/**
 * Nudge Discord participants who haven't voted on a session poll.
 * Only the poll creator can trigger this, with an 8-hour cooldown per poll.
 */
exports.nudgeDiscordParticipants = onCall(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const schedulerId = (request.data?.schedulerId || "").trim();
    if (!schedulerId) {
      throw new HttpsError("invalid-argument", "Missing schedulerId");
    }

    const userId = request.auth.uid;

  // Get the scheduler document
  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();

  if (!schedulerSnap.exists) {
    throw new HttpsError("not-found", "Session poll not found");
  }

  const scheduler = schedulerSnap.data();

  // Verify caller is the creator
  if (scheduler.creatorId !== userId) {
    throw new HttpsError(
      "permission-denied",
      "Only the poll creator can nudge participants"
    );
  }

  // Check if poll is posted to Discord
  const discordChannelId = scheduler.discord?.channelId;
  if (!discordChannelId) {
    throw new HttpsError(
      "failed-precondition",
      "This poll is not posted to Discord"
    );
  }

  // Check cooldown
  const lastNudge = scheduler.discord?.nudgeLastSentAt?.toDate?.() || null;
  if (lastNudge) {
    const elapsed = Date.now() - lastNudge.getTime();
    if (elapsed < NUDGE_COOLDOWN_MS) {
      const remainingMs = NUDGE_COOLDOWN_MS - elapsed;
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      throw new HttpsError(
        "resource-exhausted",
        `Nudge is on cooldown. Try again in ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`
      );
    }
  }

  // Check if poll is still open
  if (scheduler.status !== "OPEN") {
    throw new HttpsError(
      "failed-precondition",
      "Can only nudge participants on open polls"
    );
  }

  // Collect all participant user IDs
  const participantIds = new Set(
    (scheduler.participantIds || []).map((id) => String(id))
  );

  // Add questing group members if linked
  if (scheduler.questingGroupId) {
    const groupSnap = await db
      .collection("questingGroups")
      .doc(scheduler.questingGroupId)
      .get();
    if (groupSnap.exists) {
      const groupMemberIds = groupSnap.data()?.memberIds || [];
      groupMemberIds.forEach((id) => participantIds.add(String(id)));
    }
  }

  // Remove the creator from the list (they don't need to be nudged)
  participantIds.delete(userId);

  if (participantIds.size === 0) {
    throw new HttpsError(
      "failed-precondition",
      "No participants to nudge"
    );
  }

  // Get who has already voted
  const votesSnap = await schedulerRef.collection("votes").get();
  const voterIds = new Set(votesSnap.docs.map((doc) => doc.id));

  // Find non-voters
  const nonVoterIds = Array.from(participantIds).filter((id) => !voterIds.has(id));

  if (nonVoterIds.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Everyone has already voted!"
    );
  }

  // Look up Discord user IDs for non-voters
  const discordUserIds = [];
  const nonVoterChunks = [];
  for (let i = 0; i < nonVoterIds.length; i += 10) {
    nonVoterChunks.push(nonVoterIds.slice(i, i + 10));
  }

  for (const chunk of nonVoterChunks) {
    const usersSnap = await db
      .collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", chunk)
      .get();

    usersSnap.forEach((doc) => {
      const discordUserId = doc.data()?.discord?.userId;
      if (discordUserId) {
        discordUserIds.push(discordUserId);
      }
    });
  }

  if (discordUserIds.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "No non-voters have linked their Discord accounts"
    );
  }

  // Get the first slot time for urgency
  const slotsSnap = await schedulerRef.collection("slots").orderBy("start").limit(1).get();
  let firstSlotUnix = null;
  if (!slotsSnap.empty) {
    const firstSlot = slotsSnap.docs[0].data();
    if (firstSlot.start) {
      firstSlotUnix = Math.floor(new Date(firstSlot.start).getTime() / 1000);
    }
  }

  // Build and send the nudge message
  const messageBody = buildNudgeMessage({
    schedulerId,
    schedulerTitle: scheduler.title || "Quest Session",
    discordUserIds,
    firstSlotUnix,
    pollMessageUrl: scheduler.discord?.messageUrl || null,
  });

  try {
    await createChannelMessage({
      channelId: discordChannelId,
      body: messageBody,
    });
  } catch (err) {
    console.error("Failed to send nudge message:", err);
    throw new HttpsError(
      "internal",
      "Failed to send Discord message. The bot may not have permission to post in this channel."
    );
  }

  // Update the cooldown timestamp
  await schedulerRef.update({
    "discord.nudgeLastSentAt": admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    nudgedCount: discordUserIds.length,
    totalNonVoters: nonVoterIds.length,
  };
});
