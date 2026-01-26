const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { DISCORD_REGION, DISCORD_BOT_TOKEN } = require("./config");
const { fetchGuildRoles } = require("./discord-client");

if (!admin.apps.length) {
  admin.initializeApp();
}

function isGroupManager(group, uid, email) {
  if (!group) return false;
  const normalizedEmail = String(email || "").toLowerCase();
  const isMember = (group.members || []).includes(normalizedEmail);
  return group.creatorId === uid || (group.memberManaged === true && isMember);
}

exports.discordListGuildRoles = onCall(
  { region: DISCORD_REGION, secrets: [DISCORD_BOT_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const { groupId } = request.data || {};
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Missing groupId");
    }

    const groupSnap = await admin.firestore().collection("questingGroups").doc(groupId).get();
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Questing group not found");
    }

    const group = groupSnap.data() || {};
    if (!isGroupManager(group, request.auth.uid, request.auth.token.email)) {
      throw new HttpsError("permission-denied", "Not authorized to manage this group");
    }

    const guildId = group.discord?.guildId;
    if (!guildId) {
      return { roles: [], notifyRoleId: group.discord?.notifyRoleId || null };
    }

    const roles = await fetchGuildRoles({ guildId });
    const mapped = [
      { id: "none", name: "No ping" },
      { id: "everyone", name: "@everyone" },
      ...(roles || []).map((role) => {
      if (role.id === guildId) {
        return { id: "everyone", name: "@everyone" };
      }
      return { id: role.id, name: role.name };
      }),
    ];

    const deduped = [];
    const seen = new Set();
    for (const role of mapped) {
      if (seen.has(role.id)) continue;
      seen.add(role.id);
      deduped.push(role);
    }

    return {
      roles: deduped,
      notifyRoleId: group.discord?.notifyRoleId || "everyone",
    };
  }
);
