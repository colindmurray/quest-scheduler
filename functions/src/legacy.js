const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { defineJsonSecret } = require("firebase-functions/params");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
  admin.initializeApp();
}

const MAX_INVITE_ALLOWANCE = 50;
const MAX_POLL_INVITES_PER_RECIPIENT = 3;
const INVITE_BLOCK_PENALTY = 5;
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

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

const googleOAuthClientJson = defineJsonSecret("QS_GOOGLE_OAUTH_CLIENT_JSON");
const functionsWithOAuthSecrets = functions.runWith({ secrets: [googleOAuthClientJson] });

let cachedFileConfig = null;
let fileConfigLoaded = false;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function encodeEmailId(value) {
  return encodeURIComponent(normalizeEmail(value));
}

function isDiscordUsername(value) {
  if (!value) return false;
  if (!DISCORD_USERNAME_REGEX.test(value)) return false;
  if (value.startsWith(".") || value.endsWith(".")) return false;
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

function friendRequestIdForEmails(fromEmail, toEmail) {
  return `friendRequest:${encodeURIComponent(`${fromEmail}__${toEmail}`)}`;
}

async function findUserIdByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const snapshot = await admin
    .firestore()
    .collection("usersPublic")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0]?.id || null;
}

async function findUserByDiscordUsername(usernameLower) {
  if (!usernameLower) return null;
  const snapshot = await admin
    .firestore()
    .collection("usersPublic")
    .where("discordUsernameLower", "==", usernameLower)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  const data = docSnap.data() || {};
  return { uid: docSnap.id, email: normalizeEmail(data.email), data };
}

async function findUserByQsUsername(usernameLower) {
  if (!usernameLower) return null;
  const usernameDoc = await admin.firestore().collection("qsUsernames").doc(usernameLower).get();
  if (!usernameDoc.exists) return null;
  const uid = usernameDoc.data()?.uid || null;
  if (!uid) return null;
  const publicSnap = await admin.firestore().collection("usersPublic").doc(uid).get();
  if (!publicSnap.exists) return { uid, email: null, data: null };
  const data = publicSnap.data() || {};
  return { uid, email: normalizeEmail(data.email), data };
}

async function getUserIdentifierHints(uid) {
  if (!uid) return { discordUsernameLower: null, qsUsernameLower: null };
  const snap = await admin.firestore().collection("usersPublic").doc(uid).get();
  if (!snap.exists) return { discordUsernameLower: null, qsUsernameLower: null };
  const data = snap.data() || {};
  return {
    discordUsernameLower: data.discordUsernameLower || null,
    qsUsernameLower: data.qsUsernameLower || null,
  };
}

async function findUserIdsByEmails(emails = []) {
  const normalized = Array.from(
    new Set((emails || []).filter(Boolean).map((email) => normalizeEmail(email)))
  );
  if (normalized.length === 0) return {};
  const results = {};
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 30) {
    chunks.push(normalized.slice(i, i + 30));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      const snapshot = await admin
        .firestore()
        .collection("usersPublic")
        .where("email", "in", chunk)
        .get();
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data?.email) {
          results[normalizeEmail(data.email)] = doc.id;
        }
      });
    })
  );
  return results;
}

async function ensureUserStatus(uid) {
  const db = admin.firestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  const currentAllowance =
    typeof data.inviteAllowance === "number" ? data.inviteAllowance : MAX_INVITE_ALLOWANCE;
  const suspended = data.suspended === true || currentAllowance <= 0;

  if (!snap.exists || data.inviteAllowance == null || data.suspended !== suspended) {
    await ref.set(
      {
        inviteAllowance: currentAllowance,
        suspended,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { ref, data: { ...data, inviteAllowance: currentAllowance, suspended } };
}

async function countPendingFriendRequests(uid) {
  const snap = await admin
    .firestore()
    .collection("friendRequests")
    .where("fromUserId", "==", uid)
    .where("status", "==", "pending")
    .get();
  return snap.size;
}

async function countPendingPollInvites(uid) {
  const snap = await admin
    .firestore()
    .collection("schedulers")
    .where("creatorId", "==", uid)
    .get();
  let count = 0;
  snap.forEach((doc) => {
    const pending = doc.data()?.pendingInvites || [];
    count += pending.length;
  });
  return count;
}

async function countOutstandingInvites(uid) {
  const [pendingFriendRequests, pendingPollInvites] = await Promise.all([
    countPendingFriendRequests(uid),
    countPendingPollInvites(uid),
  ]);
  return pendingFriendRequests + pendingPollInvites;
}

async function isBlockedByUser(targetUserId, senderEmail, senderUserId = null, senderDiscord = null, senderQs = null) {
  if (!targetUserId) return false;
  const db = admin.firestore();
  const blockedCollection = db
    .collection("users")
    .doc(targetUserId)
    .collection("blockedUsers");
  const legacySnap = await blockedCollection.doc(encodeEmailId(senderEmail)).get();
  if (legacySnap.exists) return true;
  if (senderUserId) {
    const uidSnap = await blockedCollection
      .where("blockedUserId", "==", senderUserId)
      .limit(1)
      .get();
    if (!uidSnap.empty) return true;
  }
  if (senderDiscord) {
    const discordSnap = await blockedCollection
      .where("discordUsernameLower", "==", senderDiscord)
      .limit(1)
      .get();
    if (!discordSnap.empty) return true;
  }
  if (senderQs) {
    const qsSnap = await blockedCollection
      .where("qsUsernameLower", "==", senderQs)
      .limit(1)
      .get();
    if (!qsSnap.empty) return true;
  }
  const emailSnap = await blockedCollection
    .where("email", "==", normalizeEmail(senderEmail))
    .limit(1)
    .get();
  return !emailSnap.empty;
}

async function adjustInviteAllowance(userId, delta) {
  const db = admin.firestore();
  const ref = db.collection("users").doc(userId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? snap.data() : {};
    const current =
      typeof data.inviteAllowance === "number" ? data.inviteAllowance : MAX_INVITE_ALLOWANCE;
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > MAX_INVITE_ALLOWANCE) next = MAX_INVITE_ALLOWANCE;
    const isSuspended = next <= 0;

    const updates = {
      inviteAllowance: next,
      suspended: isSuspended,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (isSuspended && !data.suspended) {
      updates.suspendedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    if (!isSuspended && data.suspended) {
      updates.suspendedAt = admin.firestore.FieldValue.delete();
    }

    transaction.set(ref, updates, { merge: true });
  });
}

async function createFriendRequestNotification(userId, { requestId, fromEmail, fromUserId }) {
  const ref = admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .doc(`friendRequest:${requestId}`);

  await ref.set(
    {
      type: "FRIEND_REQUEST",
      title: "Friend Request",
      body: `${fromEmail} sent you a friend request`,
      actionUrl: `/friends?request=${requestId}`,
      metadata: {
        requestId,
        fromEmail,
        fromUserId: fromUserId || null,
        actorUserId: fromUserId || null,
        actorEmail: fromEmail || null,
      },
      read: false,
      dismissed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function createFriendAcceptedNotification(userId, { requestId, friendEmail, friendUserId }) {
  const ref = admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .doc();

  await ref.set({
    type: "FRIEND_ACCEPTED",
    title: "Friend Request Accepted",
    body: `${friendEmail} accepted your friend request`,
    actionUrl: "/friends",
    metadata: {
      requestId,
      friendEmail,
      friendUserId: friendUserId || null,
      actorUserId: friendUserId || null,
      actorEmail: friendEmail || null,
    },
    read: false,
    dismissed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function createPollInviteNotification(
  userId,
  { schedulerId, schedulerTitle, inviterEmail, inviterUserId }
) {
  const ref = admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .doc(`pollInvite:${schedulerId}`);

  await ref.set(
    {
      type: "POLL_INVITE",
      title: "Session Poll Invite",
      body: `${inviterEmail} invited you to join "${schedulerTitle}"`,
      actionUrl: `/scheduler/${schedulerId}`,
      metadata: {
        schedulerId,
        schedulerTitle,
        inviterEmail,
        inviterUserId: inviterUserId || null,
        actorUserId: inviterUserId || null,
        actorEmail: inviterEmail || null,
      },
      read: false,
      dismissed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function getUserIdsByEmail(emails) {
  const normalized = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  const result = new Map();
  const db = admin.firestore();
  const chunkSize = 10;

  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const snap = await db.collection("usersPublic").where("email", "in", chunk).get();
    snap.forEach((docSnap) => {
      const email = normalizeEmail(docSnap.data()?.email);
      if (email) {
        result.set(email, docSnap.id);
      }
    });
  }

  return result;
}

async function countPendingPollInvitesForRecipient(creatorId, recipientEmail) {
  const normalized = normalizeEmail(recipientEmail);
  if (!normalized) return 0;
  const snap = await admin
    .firestore()
    .collection("schedulers")
    .where("creatorId", "==", creatorId)
    .where("pendingInvites", "array-contains", normalized)
    .get();
  return snap.size;
}

function extractOAuthConfig(payload) {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return extractOAuthConfig(JSON.parse(payload));
    } catch (err) {
      return null;
    }
  }
  if (typeof payload !== "object") return null;
  const source = payload.web && typeof payload.web === "object" ? payload.web : payload;
  if (!source.client_id || !source.client_secret) return null;
  const redirectUri = Array.isArray(source.redirect_uris)
    ? source.redirect_uris.find((uri) => uri.includes("googleCalendarOAuthCallback")) || source.redirect_uris[0]
    : source.redirect_uri;

  return {
    clientId: source.client_id,
    clientSecret: source.client_secret,
    redirectUri,
  };
}

function loadOAuthFileConfig() {
  if (fileConfigLoaded) return cachedFileConfig;
  fileConfigLoaded = true;

  const fallbackPath = path.resolve(
    __dirname,
    "..",
    "..",
    "client_secret_2_1070792785962-mgkd2hkda3c7p8k2kflsau30shbdtrsj.apps.googleusercontent.com.json"
  );
  const filePath = process.env.QS_GOOGLE_OAUTH_CLIENT_SECRET_FILE || fallbackPath;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    cachedFileConfig = extractOAuthConfig(parsed);
    return cachedFileConfig;
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.warn("Failed to read Google OAuth client secret file", err);
    }
    return null;
  }
}

function getConfig() {
  const fileCfg = loadOAuthFileConfig();
  let secretCfg = null;
  if (!fileCfg) {
    try {
      secretCfg = extractOAuthConfig(googleOAuthClientJson.value());
    } catch (err) {
      secretCfg = null;
    }
  }
  const envCfg = {
    clientId: process.env.QS_GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.QS_GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.QS_GOOGLE_OAUTH_REDIRECT_URI,
  };
  return {
    clientId: fileCfg?.clientId || secretCfg?.clientId || envCfg.clientId,
    clientSecret: fileCfg?.clientSecret || secretCfg?.clientSecret || envCfg.clientSecret,
    redirectUri: fileCfg?.redirectUri || secretCfg?.redirectUri || envCfg.redirectUri,
    appUrl: process.env.QS_APP_URL,
    encKey: process.env.QS_ENC_KEY_B64,
  };
}

function getOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Google OAuth is not configured."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getEncKey() {
  const { encKey } = getConfig();
  if (!encKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Encryption key is not configured."
    );
  }
  const key = Buffer.from(encKey, "base64");
  if (key.length !== 32) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Encryption key must be 32 bytes base64 encoded."
    );
  }
  return key;
}

function encrypt(text) {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decrypt(payload) {
  const key = getEncKey();
  const iv = Buffer.from(payload.iv, "base64");
  const data = Buffer.from(payload.data, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

async function getRefreshToken(uid) {
  const snap = await admin.firestore().collection("userSecrets").doc(uid).get();
  if (!snap.exists) return null;
  const token = snap.data()?.googleCalendar?.refreshToken;
  if (!token) return null;
  return decrypt(token);
}

async function storeRefreshToken(uid, refreshToken) {
  const encrypted = encrypt(refreshToken);
  await admin
    .firestore()
    .collection("userSecrets")
    .doc(uid)
    .set(
      {
        googleCalendar: {
          refreshToken: encrypted,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
}

async function clearRefreshToken(uid) {
  await admin
    .firestore()
    .collection("userSecrets")
    .doc(uid)
    .set(
      {
        googleCalendar: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
}

async function getOAuthEmail(oauth2Client, tokens) {
  if (tokens?.id_token) {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: oauth2Client._clientId,
    });
    const payload = ticket.getPayload();
    return payload?.email || null;
  }
  if (tokens?.access_token) {
    oauth2Client.setCredentials({ access_token: tokens.access_token });
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const response = await oauth2.userinfo.get();
    return response?.data?.email || null;
  }
  return null;
}

function isAuthExpiredError(err) {
  const message = err?.message || "";
  const errorCode = err?.code || err?.response?.data?.error || "";
  return (
    message.includes("invalid_grant") ||
    message.includes("Invalid Credentials") ||
    String(errorCode).includes("invalid_grant")
  );
}

exports.googleCalendarStartAuth = functionsWithOAuthSecrets.https.onCall(async (_, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const oauth2Client = getOAuthClient();
  const state = crypto.randomBytes(16).toString("hex");
  await admin.firestore().collection("oauthStates").doc(state).set({
    uid: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    login_hint: context.auth.token.email,
    scope: SCOPES,
    state,
  });
  return { authUrl };
});

exports.googleCalendarOAuthCallback = functionsWithOAuthSecrets.https.onRequest(async (req, res) => {
  try {
    const { state, code } = req.query;
    if (!state || !code) {
      res.status(400).send("Missing state or code");
      return;
    }
    const stateSnap = await admin.firestore().collection("oauthStates").doc(state).get();
    if (!stateSnap.exists) {
      res.status(400).send("Invalid state");
      return;
    }
    const { uid } = stateSnap.data();
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      res.status(400).send("Missing refresh token. Please revoke and retry.");
      return;
    }
    const tokenEmail = normalizeEmail(await getOAuthEmail(oauth2Client, tokens));
    if (!tokenEmail) {
      await admin.firestore().collection("oauthStates").doc(state).delete();
      res.status(400).send("Unable to determine Google account email.");
      return;
    }

    try {
      const existingUser = await admin.auth().getUserByEmail(tokenEmail);
      if (existingUser.uid !== uid) {
        await admin.firestore().collection("oauthStates").doc(state).delete();
        res
          .status(409)
          .send("This Google account is already associated with another Quest Scheduler user.");
        return;
      }
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }
    await storeRefreshToken(uid, tokens.refresh_token);
    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .set(
        {
          settings: {
            linkedCalendarEmail: tokenEmail,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    await admin.firestore().collection("oauthStates").doc(state).delete();
    const { appUrl } = getConfig();
    const redirectUrl = appUrl ? `${appUrl}/settings?calendar=linked` : "/";
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("OAuth callback failed", err);
    res.status(500).send("OAuth failed");
  }
});

exports.googleCalendarListCalendars = functionsWithOAuthSecrets.https.onCall(async (_, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const refreshToken = await getRefreshToken(context.auth.uid);
  if (!refreshToken) {
    throw new functions.https.HttpsError("failed-precondition", "Google Calendar not linked");
  }
  const oauth2Client = getOAuthClient();
  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const response = await calendar.calendarList.list({
      minAccessRole: "writer",
      showDeleted: false,
    });
    const items = response.data.items || [];
    return {
      items: items.map((item) => ({
        id: item.id,
        summary: item.summary,
        primary: item.primary || false,
      })),
    };
  } catch (err) {
    if (isAuthExpiredError(err)) {
      await clearRefreshToken(context.auth.uid);
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Google Calendar authorization expired. Re-link in Settings."
      );
    }
    throw err;
  }
});

exports.googleCalendarFinalizePoll = functionsWithOAuthSecrets.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const { schedulerId, slotId, calendarId, title, description, durationMinutes, attendees, deleteOldEvent } = data || {};
  if (!schedulerId || !slotId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing scheduler or slot id");
  }

  const schedulerRef = admin.firestore().collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Scheduler not found");
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Only creator can finalize");
  }

  const slotSnap = await schedulerRef.collection("slots").doc(slotId).get();
  if (!slotSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Slot not found");
  }
  const slot = slotSnap.data();
  const start = slot.start ? new Date(slot.start) : null;
  if (!start) {
    throw new functions.https.HttpsError("invalid-argument", "Slot start missing");
  }
  const duration = Number(durationMinutes || 0);
  const end = new Date(start.getTime() + duration * 60 * 1000);

  let eventId = null;
  let calendarIdToSave = null;

  if (data?.createCalendarEvent) {
    const refreshToken = await getRefreshToken(context.auth.uid);
    if (!refreshToken) {
      throw new functions.https.HttpsError("failed-precondition", "Google Calendar not linked");
    }
    const oauth2Client = getOAuthClient();
    try {
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      calendarIdToSave = calendarId || scheduler.googleCalendarId || "primary";

      if (deleteOldEvent && scheduler.googleEventId) {
        await calendar.events.delete({
          calendarId: scheduler.googleCalendarId || calendarIdToSave,
          eventId: scheduler.googleEventId,
        });
      }

      const response = await calendar.events.insert({
        calendarId: calendarIdToSave,
        requestBody: {
          summary: title,
          description,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: Array.isArray(attendees)
            ? attendees.map((email) => ({ email }))
            : [],
        },
      });
      eventId = response.data.id || null;
    } catch (err) {
      if (isAuthExpiredError(err)) {
        await clearRefreshToken(context.auth.uid);
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Google Calendar authorization expired. Re-link in Settings."
        );
      }
      throw err;
    }
  }

  await schedulerRef.update({
    status: "FINALIZED",
    winningSlotId: slotId,
    googleEventId: eventId,
    googleCalendarId: calendarIdToSave,
  });

  return { eventId, calendarId: calendarIdToSave };
});

exports.cloneSchedulerPoll = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const { schedulerId, title, inviteEmails, clearVotes, questingGroupId, questingGroupName } = data || {};
  if (!schedulerId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing scheduler id");
  }

  const schedulerRef = admin.firestore().collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Scheduler not found");
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Only creator can clone with votes");
  }

  const normalizedInvites = Array.isArray(inviteEmails)
    ? inviteEmails.map(normalizeEmail).filter(Boolean)
    : [];
  const creatorEmail = normalizeEmail(context.auth.token.email);
  const inviteEmailsNormalized = Array.from(
    new Set([creatorEmail, ...normalizedInvites].filter(Boolean))
  );
  const participantIdsByEmail = await findUserIdsByEmails(inviteEmailsNormalized);
  if (creatorEmail) {
    participantIdsByEmail[creatorEmail] = context.auth.uid;
  }
  const participantIds = Array.from(
    new Set(Object.values(participantIdsByEmail).filter(Boolean))
  );
  const pendingInvites = inviteEmailsNormalized.filter((email) => !participantIdsByEmail[email]);

  let groupNameToSave = null;
  let groupMemberIds = [];
  if (questingGroupId) {
    const groupSnap = await admin.firestore().collection("questingGroups").doc(questingGroupId).get();
    if (groupSnap.exists) {
      const groupData = groupSnap.data() || {};
      groupNameToSave = groupData.name || questingGroupName || null;
      groupMemberIds = Array.isArray(groupData.memberIds) ? groupData.memberIds : [];
    } else {
      groupNameToSave = questingGroupName || null;
    }
  }

  const newId = crypto.randomUUID();
  const newRef = admin.firestore().collection("schedulers").doc(newId);

  await newRef.set({
    title: title || `${scheduler.title || "Untitled poll"} (copy)`,
    creatorId: context.auth.uid,
    creatorEmail,
    status: "OPEN",
    participantIds,
    pendingInvites,
    timezone: scheduler.timezone || null,
    timezoneMode: scheduler.timezoneMode || null,
    winningSlotId: null,
    googleEventId: null,
    googleCalendarId: null,
    questingGroupId: questingGroupId || null,
    questingGroupName: groupNameToSave,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const slotsSnap = await schedulerRef.collection("slots").get();
  const now = Date.now();
  const validSlots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && new Date(slot.start).getTime() > now);
  const validSlotIds = new Set(validSlots.map((slot) => slot.id));

  await Promise.all(
    validSlots.map((slot) =>
      newRef.collection("slots").doc(slot.id).set({
        start: slot.start,
        end: slot.end,
        stats: { feasible: 0, preferred: 0 },
      })
    )
  );

  if (!clearVotes) {
    const participantIdSet = new Set(
      [...participantIds, ...groupMemberIds].filter(Boolean)
    );
    const votesSnap = await schedulerRef.collection("votes").get();
    await Promise.all(
      votesSnap.docs.map((voteDoc) => {
        const voteData = voteDoc.data() || {};
        if (!participantIdSet.has(voteDoc.id)) {
          return Promise.resolve();
        }
        const nextVotes = Object.fromEntries(
          Object.entries(voteData.votes || {}).filter(([slotId]) =>
            validSlotIds.has(slotId)
          )
        );
        if (Object.keys(nextVotes).length === 0 && !voteData.noTimesWork) {
          return Promise.resolve();
        }
        return newRef
          .collection("votes")
          .doc(voteDoc.id)
          .set(
            {
              voterId: voteDoc.id,
              userEmail: normalizeEmail(voteData.userEmail),
              userAvatar: voteData.userAvatar || null,
              votes: nextVotes,
              noTimesWork: Boolean(voteData.noTimesWork),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      })
    );
  }

  return { schedulerId: newId };
});

exports.googleCalendarDeleteEvent = functionsWithOAuthSecrets.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const { schedulerId, calendarId } = data || {};
  if (!schedulerId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing scheduler id");
  }

  const schedulerRef = admin.firestore().collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Scheduler not found");
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Only creator can update calendar");
  }

  if (!scheduler.googleEventId) {
    await schedulerRef.update({ googleEventId: null });
    return { deleted: false };
  }

  const refreshToken = await getRefreshToken(context.auth.uid);
  if (!refreshToken) {
    throw new functions.https.HttpsError("failed-precondition", "Google Calendar not linked");
  }

  const oauth2Client = getOAuthClient();
  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const calendarIdToDelete = scheduler.googleCalendarId || calendarId || "primary";
    await calendar.events.delete({
      calendarId: calendarIdToDelete,
      eventId: scheduler.googleEventId,
    });
  } catch (err) {
    if (isAuthExpiredError(err)) {
      await clearRefreshToken(context.auth.uid);
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Google Calendar authorization expired. Re-link in Settings."
      );
    }
    const status = err?.code || err?.response?.status;
    if (status !== 404 && status !== 410) {
      throw err;
    }
  }

  await schedulerRef.update({ googleEventId: null });
  return { deleted: true };
});

exports.sendFriendRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const fromUserId = context.auth.uid;
  const fromEmail = normalizeEmail(context.auth.token.email);
  const toEmail = normalizeEmail(data?.toEmail);
  const fromDisplayName = data?.fromDisplayName || context.auth.token.name || fromEmail;

  if (!fromEmail || !toEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing email.");
  }
  if (fromEmail === toEmail) {
    throw new functions.https.HttpsError("failed-precondition", "You cannot add yourself as a friend.");
  }

  const { data: userStatus } = await ensureUserStatus(fromUserId);
  if (userStatus.suspended) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Your account is suspended. Contact support@questscheduler.cc."
    );
  }

  const db = admin.firestore();
  const [directSnap, reverseSnap] = await Promise.all([
    db
      .collection("friendRequests")
      .where("fromEmail", "==", fromEmail)
      .where("toEmail", "==", toEmail)
      .limit(1)
      .get(),
    db
      .collection("friendRequests")
      .where("fromEmail", "==", toEmail)
      .where("toEmail", "==", fromEmail)
      .limit(1)
      .get(),
  ]);

  const existingDocs = [...directSnap.docs, ...reverseSnap.docs];
  existingDocs.forEach((docSnap) => {
    const status = docSnap.data()?.status;
    if (status === "pending") {
      throw new functions.https.HttpsError("failed-precondition", "Friend request already pending.");
    }
    if (status === "accepted") {
      throw new functions.https.HttpsError("failed-precondition", "You are already friends.");
    }
  });

  const toUserId = await findUserIdByEmail(toEmail);
  const inviterIdentifiers = await getUserIdentifierHints(fromUserId);
  if (
    await isBlockedByUser(
      toUserId,
      fromEmail,
      fromUserId,
      inviterIdentifiers.discordUsernameLower,
      inviterIdentifiers.qsUsernameLower
    )
  ) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "This user is not accepting new invites from you."
    );
  }

  const outstandingCount = await countOutstandingInvites(fromUserId);
  if (outstandingCount >= userStatus.inviteAllowance) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "You have too many outstanding invites. Wait for responses or add them as a friend."
    );
  }

  if (existingDocs.length > 0) {
    await Promise.all(existingDocs.map((docSnap) => docSnap.ref.delete()));
  }

  const requestRef = db.collection("friendRequests").doc();
  const requestId = requestRef.id;
  await requestRef.set({
    fromUserId,
    fromEmail,
    fromEmailRaw: context.auth.token.email || fromEmail,
    fromDisplayName: fromDisplayName || null,
    toEmail,
    toUserId: toUserId || null,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (toUserId) {
    await createFriendRequestNotification(toUserId, {
      requestId,
      fromEmail,
      fromUserId,
    });
  }

  return { requestId, toUserId: toUserId || null };
});

exports.acceptFriendInviteLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const inviteCode = (data?.inviteCode || "").trim();
  const userEmail = normalizeEmail(context.auth.token.email);
  if (!inviteCode) {
    throw new functions.https.HttpsError("invalid-argument", "Invite code is missing.");
  }
  if (!userEmail) {
    throw new functions.https.HttpsError("failed-precondition", "User email not available.");
  }

  const db = admin.firestore();
  const snapshot = await db
    .collection("usersPublic")
    .where("friendInviteCode", "==", inviteCode)
    .limit(1)
    .get();
  if (snapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Invite link is invalid or expired.");
  }

  const senderDoc = snapshot.docs[0];
  const sender = senderDoc.data() || {};
  const senderEmail = normalizeEmail(sender.email);
  if (!senderEmail) {
    throw new functions.https.HttpsError("failed-precondition", "Invite link is missing sender info.");
  }
  if (senderEmail === userEmail) {
    throw new functions.https.HttpsError("failed-precondition", "You cannot accept your own invite link.");
  }

  const [directSnap, reverseSnap] = await Promise.all([
    db
      .collection("friendRequests")
      .where("fromEmail", "==", senderEmail)
      .where("toEmail", "==", userEmail)
      .limit(1)
      .get(),
    db
      .collection("friendRequests")
      .where("fromEmail", "==", userEmail)
      .where("toEmail", "==", senderEmail)
      .limit(1)
      .get(),
  ]);

  const existingDoc = directSnap.docs[0] || reverseSnap.docs[0] || null;
  if (existingDoc) {
    const status = existingDoc.data()?.status;
    if (status === "accepted") {
      return {
        senderEmail,
        senderDisplayName: sender.displayName || senderEmail,
      };
    }
    if (status === "pending") {
      await existingDoc.ref.update({
        status: "accepted",
        toUserId: context.auth.uid,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await createFriendAcceptedNotification(senderDoc.id, {
        requestId: existingDoc.id,
        friendEmail: userEmail,
        friendUserId: context.auth.uid,
      });
      await db
        .collection("users")
        .doc(context.auth.uid)
        .collection("notifications")
        .doc(`friendRequest:${existingDoc.id}`)
        .delete()
        .catch(() => undefined);
      return {
        senderEmail,
        senderDisplayName: sender.displayName || senderEmail,
      };
    }
  }

  const requestRef = db.collection("friendRequests").doc();
  const requestId = requestRef.id;
  await requestRef.set({
    fromUserId: senderDoc.id,
    fromEmail: senderEmail,
    fromEmailRaw: senderEmail,
    fromDisplayName: sender.displayName || senderEmail,
    toEmail: userEmail,
    toUserId: context.auth.uid,
    status: "accepted",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    respondedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await createFriendAcceptedNotification(senderDoc.id, {
    requestId,
    friendEmail: userEmail,
    friendUserId: context.auth.uid,
  });

  return {
    senderEmail,
    senderDisplayName: sender.displayName || senderEmail,
  };
});

exports.sendPollInvites = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const schedulerId = (data?.schedulerId || "").trim();
  const invitees = Array.isArray(data?.invitees) ? data.invitees : [];
  if (!schedulerId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing scheduler id.");
  }

  const inviterId = context.auth.uid;
  const inviterEmail = normalizeEmail(context.auth.token.email);
  const schedulerRef = admin.firestore().collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Session poll not found.");
  }

  const scheduler = schedulerSnap.data() || {};
  if (scheduler.creatorId !== inviterId) {
    throw new functions.https.HttpsError("permission-denied", "Only the poll creator can invite.");
  }

  let groupMemberIds = [];
  if (scheduler.questingGroupId) {
    const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
    if (groupSnap.exists) {
      groupMemberIds = groupSnap.data()?.memberIds || [];
    }
  }

  const { data: userStatus } = await ensureUserStatus(inviterId);
  if (userStatus.suspended) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Your account is suspended. Contact support@questscheduler.cc."
    );
  }

  const participantIds = Array.isArray(scheduler.participantIds) ? scheduler.participantIds : [];
  const pending = (scheduler.pendingInvites || []).map(normalizeEmail);
  const inviterIdentifiers = await getUserIdentifierHints(inviterId);
  const normalizedInvitees = Array.from(
    new Set(invitees.map(normalizeEmail).filter(Boolean))
  ).filter((email) => email && email !== inviterEmail);

  const candidates = normalizedInvitees.filter(
    (email) => !pending.includes(email)
  );
  if (candidates.length === 0) {
    return { added: [], rejected: [] };
  }

  const userIdMap = await getUserIdsByEmail(candidates);
  const rejected = [];
  const valid = [];

  for (const email of candidates) {
    const userId = userIdMap.get(email) || null;
    if (userId && (participantIds.includes(userId) || groupMemberIds.includes(userId))) {
      continue;
    }
    if (
      userId &&
      (await isBlockedByUser(
        userId,
        inviterEmail,
        inviterId,
        inviterIdentifiers.discordUsernameLower,
        inviterIdentifiers.qsUsernameLower
      ))
    ) {
      rejected.push({ email, reason: "blocked" });
      continue;
    }
    const count = await countPendingPollInvitesForRecipient(inviterId, email);
    if (count >= MAX_POLL_INVITES_PER_RECIPIENT) {
      rejected.push({ email, reason: "limit" });
      continue;
    }
    valid.push({ email, userId });
  }

  const outstandingCount = await countOutstandingInvites(inviterId);
  const remaining = userStatus.inviteAllowance - outstandingCount;
  if (remaining <= 0 || valid.length > remaining) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "You have too many outstanding invites. Wait for responses or add them as a friend."
    );
  }

  const nextPending = Array.from(new Set([...pending, ...valid.map((item) => item.email)]));
  const existingMeta = scheduler.pendingInviteMeta || {};
  const nextMeta = { ...existingMeta };
  valid.forEach(({ email }) => {
    nextMeta[email] = {
      invitedByEmail: inviterEmail,
      invitedByUserId: inviterId,
      invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  });

  await schedulerRef.update({
    pendingInvites: nextPending,
    pendingInviteMeta: nextMeta,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const schedulerTitle = data?.schedulerTitle || scheduler.title || "Session Poll";
  await Promise.all(
    valid.map(async ({ email, userId }) => {
      if (!userId) return;
      try {
        await createPollInviteNotification(userId, {
          schedulerId,
          schedulerTitle,
          inviterEmail,
          inviterUserId: inviterId,
        });
      } catch (err) {
        console.warn("Failed to create poll invite notification:", err);
      }
    })
  );

  return {
    added: valid.map(({ email }) => email),
    rejected,
  };
});

exports.registerQsUsername = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const raw = String(data?.username || "").trim().toLowerCase();
  if (!raw || !isValidQsUsername(raw)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Username must be 3-20 characters, start with a letter, and contain only letters, numbers, or underscores."
    );
  }

  if (RESERVED_QS_USERNAMES.has(raw)) {
    throw new functions.https.HttpsError("invalid-argument", "Username is reserved.");
  }

  const db = admin.firestore();
  const uid = context.auth.uid;
  const usernameRef = db.collection("qsUsernames").doc(raw);
  const userRef = db.collection("users").doc(uid);
  const publicRef = db.collection("usersPublic").doc(uid);

  await db.runTransaction(async (tx) => {
    const [usernameSnap, userSnap] = await Promise.all([
      tx.get(usernameRef),
      tx.get(userRef),
    ]);

    if (usernameSnap.exists && usernameSnap.data()?.uid !== uid) {
      throw new functions.https.HttpsError("already-exists", "Username is already taken.");
    }

    const existingUsername = userSnap.exists ? userSnap.data()?.qsUsername : null;
    if (existingUsername && existingUsername !== raw) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Username cannot be changed once set."
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    if (!usernameSnap.exists) {
      tx.set(usernameRef, { uid, username: raw, createdAt: now, updatedAt: now });
    } else {
      tx.set(usernameRef, { uid, username: raw, updatedAt: now }, { merge: true });
    }

    tx.set(
      userRef,
      {
        qsUsername: raw,
        updatedAt: now,
      },
      { merge: true }
    );
    tx.set(
      publicRef,
      {
        qsUsername: raw,
        qsUsernameLower: raw,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  return { username: raw };
});

exports.revokePollInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const schedulerId = (data?.schedulerId || "").trim();
  const inviteeEmail = normalizeEmail(data?.inviteeEmail);
  if (!schedulerId || !inviteeEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing scheduler or invitee email.");
  }

  const db = admin.firestore();
  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Session poll not found.");
  }

  const scheduler = schedulerSnap.data() || {};
  if (scheduler.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Only the poll creator can revoke invites.");
  }

  const nextPending = (scheduler.pendingInvites || []).filter(
    (email) => normalizeEmail(email) !== inviteeEmail
  );
  const nextMeta = { ...(scheduler.pendingInviteMeta || {}) };
  delete nextMeta[inviteeEmail];

  await schedulerRef.update({
    pendingInvites: nextPending,
    pendingInviteMeta: nextMeta,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const inviteeUserId = await findUserIdByEmail(inviteeEmail);
  if (inviteeUserId) {
    await db
      .collection("users")
      .doc(inviteeUserId)
      .collection("notifications")
      .doc(`pollInvite:${schedulerId}`)
      .delete()
      .catch(() => undefined);
  }

  return { ok: true };
});

exports.sendGroupInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const groupId = String(data?.groupId || "").trim();
  const inviteeEmail = normalizeEmail(data?.inviteeEmail);
  if (!groupId || !inviteeEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing group or invitee email.");
  }

  const inviterId = context.auth.uid;
  const inviterEmail = normalizeEmail(context.auth.token.email);
  if (!inviterEmail) {
    throw new functions.https.HttpsError("failed-precondition", "User email not available.");
  }

  if (inviteeEmail === inviterEmail) {
    throw new functions.https.HttpsError("failed-precondition", "You cannot invite yourself.");
  }

  const db = admin.firestore();
  const groupRef = db.collection("questingGroups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Questing group not found.");
  }
  const group = groupSnap.data() || {};
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
  const pending = Array.isArray(group.pendingInvites)
    ? group.pendingInvites.map(normalizeEmail)
    : [];

  const isCreator = group.creatorId === inviterId;
  const isMember = memberIds.includes(inviterId);
  const canInvite = isCreator || (group.memberManaged === true && isMember);
  if (!canInvite) {
    throw new functions.https.HttpsError("permission-denied", "Only group managers can invite.");
  }

  if (pending.includes(inviteeEmail)) {
    return { added: false, reason: "pending" };
  }

  const inviteeUserId = await findUserIdByEmail(inviteeEmail);
  if (inviteeUserId && memberIds.includes(inviteeUserId)) {
    return { added: false, reason: "member" };
  }
  const inviterIdentifiers = await getUserIdentifierHints(inviterId);
  if (
    await isBlockedByUser(
      inviteeUserId,
      inviterEmail,
      inviterId,
      inviterIdentifiers.discordUsernameLower,
      inviterIdentifiers.qsUsernameLower
    )
  ) {
    return { added: false, reason: "blocked" };
  }

  await groupRef.update({
    pendingInvites: admin.firestore.FieldValue.arrayUnion(inviteeEmail),
    [`pendingInviteMeta.${inviteeEmail}`]: {
      invitedByEmail: inviterEmail,
      invitedByUserId: inviterId,
      invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { added: true, inviteeUserId: inviteeUserId || null };
});

exports.revokeGroupInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const groupId = String(data?.groupId || "").trim();
  const inviteeEmail = normalizeEmail(data?.inviteeEmail);
  if (!groupId || !inviteeEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing group or invitee email.");
  }

  const inviterId = context.auth.uid;
  const inviterEmail = normalizeEmail(context.auth.token.email);
  if (!inviterEmail) {
    throw new functions.https.HttpsError("failed-precondition", "User email not available.");
  }

  const db = admin.firestore();
  const groupRef = db.collection("questingGroups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Questing group not found.");
  }
  const group = groupSnap.data() || {};
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];

  const isCreator = group.creatorId === inviterId;
  const isMember = memberIds.includes(inviterId);
  const canInvite = isCreator || (group.memberManaged === true && isMember);
  if (!canInvite) {
    throw new functions.https.HttpsError("permission-denied", "Only group managers can revoke invites.");
  }

  await groupRef.update({
    pendingInvites: admin.firestore.FieldValue.arrayRemove(inviteeEmail),
    [`pendingInviteMeta.${inviteeEmail}`]: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const inviteeUserId = await findUserIdByEmail(inviteeEmail);
  if (inviteeUserId) {
    await db
      .collection("users")
      .doc(inviteeUserId)
      .collection("notifications")
      .doc(`groupInvite:${groupId}`)
      .delete()
      .catch(() => undefined);
  }

  return { ok: true };
});

exports.removeGroupMemberFromPolls = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const groupId = String(data?.groupId || "").trim();
  const memberEmail = normalizeEmail(data?.memberEmail);
  if (!groupId || !memberEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing group or member email.");
  }

  const db = admin.firestore();
  const groupRef = db.collection("questingGroups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Questing group not found.");
  }

  const group = groupSnap.data() || {};
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
  const requesterUid = context.auth.uid;
  const requesterEmail = normalizeEmail(context.auth.token.email);
  const isCreator = group.creatorId === requesterUid;
  const isMember = memberIds.includes(requesterUid);
  const isManager = isCreator || (group.memberManaged === true && isMember);
  const isSelf = requesterEmail && requesterEmail === memberEmail;

  if (!isManager && !isSelf) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only group managers or the member themselves can remove poll data."
    );
  }

  const memberUid = await findUserIdByEmail(memberEmail);
  const pollsSnap = await db
    .collection("schedulers")
    .where("questingGroupId", "==", groupId)
    .get();

  const pollDocs = pollsSnap.docs;
  if (pollDocs.length === 0) {
    return { ok: true, polls: 0 };
  }

  const deleteVoteDocs = async (pollRef) => {
    if (memberUid) {
      await pollRef.collection("votes").doc(memberUid).delete().catch(() => undefined);
    }
    const voteSnap = await pollRef
      .collection("votes")
      .where("userEmail", "==", memberEmail)
      .get();
    if (!voteSnap.empty) {
      await batchDelete(voteSnap.docs);
    }
  };

  const notificationDeletes = [];
  if (memberUid) {
    pollDocs.forEach((pollDoc) => {
      notificationDeletes.push(
        db
          .collection("users")
          .doc(memberUid)
          .collection("notifications")
          .doc(`pollInvite:${pollDoc.id}`)
          .delete()
          .catch(() => undefined)
      );
    });
  }

  for (const pollDoc of pollDocs) {
    await pollDoc.ref.update({
      ...(memberUid ? { participantIds: admin.firestore.FieldValue.arrayRemove(memberUid) } : {}),
      pendingInvites: admin.firestore.FieldValue.arrayRemove(memberEmail),
      [`pendingInviteMeta.${memberEmail}`]: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await deleteVoteDocs(pollDoc.ref);
  }

  if (notificationDeletes.length > 0) {
    await Promise.all(notificationDeletes);
  }

  return { ok: true, polls: pollDocs.length };
});

exports.blockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const blockerId = context.auth.uid;
  const blockerEmail = normalizeEmail(context.auth.token.email);
  const identifier = data?.identifier || data?.email;
  const parsed = parseIdentifier(identifier);

  if (!blockerEmail || !identifier) {
    throw new functions.https.HttpsError("invalid-argument", "Missing identifier.");
  }

  let targetEmail = null;
  let targetUserId = null;
  let targetDiscordUsername = null;
  let targetQsUsername = null;

  if (parsed.type === "email") {
    targetEmail = normalizeEmail(parsed.value);
    targetUserId = await findUserIdByEmail(targetEmail);
  } else if (parsed.type === "discordUsername") {
    const user = await findUserByDiscordUsername(parsed.value);
    if (!user?.uid) {
      throw new functions.https.HttpsError(
        "not-found",
        "No Quest Scheduler user found with that Discord username."
      );
    }
    targetEmail = user.email;
    targetUserId = user.uid;
    targetDiscordUsername = parsed.value;
  } else if (parsed.type === "qsUsername") {
    const user = await findUserByQsUsername(parsed.value);
    if (!user?.uid) {
      throw new functions.https.HttpsError("not-found", "No user found with that username.");
    }
    targetEmail = user.email;
    targetUserId = user.uid;
    targetQsUsername = parsed.value;
  } else if (parsed.type === "legacyDiscordTag") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Legacy Discord tags are not supported. Use their current Discord username or email."
    );
  } else if (parsed.type === "discordId") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Discord IDs are not supported. Use a Discord username or email."
    );
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please enter a valid email, Discord username, or @username."
    );
  }

  if (!targetEmail && !targetUserId) {
    throw new functions.https.HttpsError("failed-precondition", "User could not be resolved.");
  }
  if (targetEmail && blockerEmail === targetEmail) {
    throw new functions.https.HttpsError("failed-precondition", "You cannot block yourself.");
  }
  if (targetUserId && blockerId === targetUserId) {
    throw new functions.https.HttpsError("failed-precondition", "You cannot block yourself.");
  }

  const db = admin.firestore();
  const blockedCollection = db
    .collection("users")
    .doc(blockerId)
    .collection("blockedUsers");
  if (targetEmail) {
    const legacyRef = blockedCollection.doc(encodeEmailId(targetEmail));
    const legacySnap = await legacyRef.get();
    if (legacySnap.exists) {
      return { ok: true, alreadyBlocked: true };
    }
    const existingSnap = await blockedCollection
      .where("email", "==", targetEmail)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      return { ok: true, alreadyBlocked: true };
    }
  }
  if (targetUserId) {
    const uidSnap = await blockedCollection
      .where("blockedUserId", "==", targetUserId)
      .limit(1)
      .get();
    if (!uidSnap.empty) {
      return { ok: true, alreadyBlocked: true };
    }
  }
  if (targetDiscordUsername) {
    const discordSnap = await blockedCollection
      .where("discordUsernameLower", "==", targetDiscordUsername)
      .limit(1)
      .get();
    if (!discordSnap.empty) {
      return { ok: true, alreadyBlocked: true };
    }
  }
  if (targetQsUsername) {
    const qsSnap = await blockedCollection
      .where("qsUsernameLower", "==", targetQsUsername)
      .limit(1)
      .get();
    if (!qsSnap.empty) {
      return { ok: true, alreadyBlocked: true };
    }
  }

  const friendSnap = targetEmail
    ? await db
        .collection("friendRequests")
        .where("fromEmail", "==", targetEmail)
        .where("toEmail", "==", blockerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get()
    : { docs: [] };
  const friendDoc = friendSnap.docs[0] || null;
  const hasPendingFriend = Boolean(friendDoc);

  const pollSnap = targetEmail
    ? await db
        .collection("schedulers")
        .where("creatorEmail", "==", targetEmail)
        .where("pendingInvites", "array-contains", blockerEmail)
        .get()
    : { empty: true, docs: [] };

  const hasPendingPollInvites = !pollSnap.empty;
  const groupSnap = await db
    .collection("questingGroups")
    .where("pendingInvites", "array-contains", blockerEmail)
    .get();
  const groupInvites = groupSnap.docs.filter((docSnap) => {
    const meta = docSnap.data()?.pendingInviteMeta?.[blockerEmail] || {};
    return targetEmail && normalizeEmail(meta.invitedByEmail) === targetEmail;
  });
  const hasPendingGroupInvites = groupInvites.length > 0;
  let offenderUserId = null;
  if (hasPendingFriend) {
    offenderUserId = friendDoc.data()?.fromUserId || null;
  }
  if (!offenderUserId && hasPendingPollInvites) {
    offenderUserId = pollSnap.docs[0]?.data()?.creatorId || null;
  }
  if (!offenderUserId && hasPendingGroupInvites) {
    const meta = groupInvites[0].data()?.pendingInviteMeta?.[blockerEmail] || {};
    offenderUserId = meta.invitedByUserId || null;
  }
  if (!offenderUserId && hasPendingGroupInvites && targetEmail) {
    offenderUserId = await findUserIdByEmail(targetEmail);
  }

  const shouldPenalize = Boolean(
    offenderUserId && (hasPendingFriend || hasPendingPollInvites || hasPendingGroupInvites)
  );

  const blockRef = blockedCollection.doc();
  await blockRef.set({
    email: targetEmail || null,
    blockedUserId: offenderUserId || targetUserId || null,
    discordUsernameLower: targetDiscordUsername || null,
    qsUsernameLower: targetQsUsername || null,
    blockedAt: admin.firestore.FieldValue.serverTimestamp(),
    penalized: shouldPenalize,
    penaltyValue: shouldPenalize ? INVITE_BLOCK_PENALTY : 0,
    penaltyAppliedAt: shouldPenalize
      ? admin.firestore.FieldValue.serverTimestamp()
      : null,
  });

  if (hasPendingFriend) {
    await friendDoc.ref.delete();
    await db
      .collection("users")
      .doc(blockerId)
      .collection("notifications")
      .doc(`friendRequest:${friendDoc.id}`)
      .delete()
      .catch(() => undefined);
  }

  if (hasPendingPollInvites) {
    for (const pollDoc of pollSnap.docs) {
      const pollData = pollDoc.data() || {};
      const pendingInvites = (pollData.pendingInvites || []).filter(
        (email) => normalizeEmail(email) !== blockerEmail
      );
      const nextMeta = { ...(pollData.pendingInviteMeta || {}) };
      delete nextMeta[blockerEmail];
      await pollDoc.ref.update({
        pendingInvites,
        pendingInviteMeta: nextMeta,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db
        .collection("users")
        .doc(blockerId)
        .collection("notifications")
        .doc(`pollInvite:${pollDoc.id}`)
        .delete()
        .catch(() => undefined);
    }
  }

  if (hasPendingGroupInvites) {
    for (const groupDoc of groupInvites) {
      const groupData = groupDoc.data() || {};
      const pendingInvites = (groupData.pendingInvites || []).filter(
        (email) => normalizeEmail(email) !== blockerEmail
      );
      const nextMeta = { ...(groupData.pendingInviteMeta || {}) };
      delete nextMeta[blockerEmail];
      await groupDoc.ref.update({
        pendingInvites,
        pendingInviteMeta: nextMeta,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db
        .collection("users")
        .doc(blockerId)
        .collection("notifications")
        .doc(`groupInvite:${groupDoc.id}`)
        .delete()
        .catch(() => undefined);
    }
  }

  if (shouldPenalize) {
    await adjustInviteAllowance(offenderUserId, -INVITE_BLOCK_PENALTY);
  }

  return { ok: true, penalized: shouldPenalize };
});

exports.unblockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const blockerId = context.auth.uid;
  const identifier = data?.identifier || data?.email;
  const parsed = parseIdentifier(identifier);
  if (!identifier) {
    throw new functions.https.HttpsError("invalid-argument", "Missing identifier.");
  }

  let targetEmail = null;
  let targetDiscordUsername = null;
  let targetQsUsername = null;

  if (parsed.type === "email") {
    targetEmail = normalizeEmail(parsed.value);
  } else if (parsed.type === "discordUsername") {
    targetDiscordUsername = parsed.value;
  } else if (parsed.type === "qsUsername") {
    targetQsUsername = parsed.value;
  } else if (parsed.type === "legacyDiscordTag") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Legacy Discord tags are not supported. Use their current Discord username or email."
    );
  } else if (parsed.type === "discordId") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Discord IDs are not supported. Use a Discord username or email."
    );
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please enter a valid email, Discord username, or @username."
    );
  }

  const db = admin.firestore();
  const blockedCollection = db
    .collection("users")
    .doc(blockerId)
    .collection("blockedUsers");
  const blocks = [];

  if (targetEmail) {
    const legacyRef = blockedCollection.doc(encodeEmailId(targetEmail));
    const legacySnap = await legacyRef.get();
    if (legacySnap.exists) {
      blocks.push({ ref: legacyRef, data: legacySnap.data() || {} });
    }
    const querySnap = await blockedCollection.where("email", "==", targetEmail).get();
    querySnap.docs.forEach((docSnap) => {
      if (docSnap.id === legacyRef.id) return;
      blocks.push({ ref: docSnap.ref, data: docSnap.data() || {} });
    });
  }

  if (targetDiscordUsername) {
    const discordSnap = await blockedCollection
      .where("discordUsernameLower", "==", targetDiscordUsername)
      .get();
    discordSnap.docs.forEach((docSnap) => {
      blocks.push({ ref: docSnap.ref, data: docSnap.data() || {} });
    });
  }

  if (targetQsUsername) {
    const qsSnap = await blockedCollection
      .where("qsUsernameLower", "==", targetQsUsername)
      .get();
    qsSnap.docs.forEach((docSnap) => {
      blocks.push({ ref: docSnap.ref, data: docSnap.data() || {} });
    });
  }

  if (blocks.length === 0) {
    return { ok: true, alreadyUnblocked: true };
  }

  const penalizedBlock = blocks.find((block) => block.data?.penalized);
  await Promise.all(blocks.map((block) => block.ref.delete()));

  if (penalizedBlock) {
    const offenderUserId =
      penalizedBlock.data.blockedUserId || (targetEmail && (await findUserIdByEmail(targetEmail)));
    if (offenderUserId) {
      await adjustInviteAllowance(offenderUserId, INVITE_BLOCK_PENALTY);
    }
  }

  return { ok: true };
});

async function commitBatch(batch, count) {
  if (count > 0) {
    await batch.commit();
  }
}

async function batchDelete(docs) {
  const db = admin.firestore();
  let batch = db.batch();
  let count = 0;
  for (const docSnap of docs) {
    batch.delete(docSnap.ref);
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  await commitBatch(batch, count);
}

async function deleteUserVotesEverywhere(uid, email) {
  const db = admin.firestore();
  const seen = new Map();
  if (uid) {
    const votesById = await db
      .collectionGroup("votes")
      .where(admin.firestore.FieldPath.documentId(), "==", uid)
      .get();
    votesById.docs.forEach((docSnap) => {
      seen.set(docSnap.ref.path, docSnap);
    });
  }
  if (email) {
    const votesByEmail = await db
      .collectionGroup("votes")
      .where("userEmail", "==", email)
      .get();
    votesByEmail.docs.forEach((docSnap) => {
      if (!seen.has(docSnap.ref.path)) {
        seen.set(docSnap.ref.path, docSnap);
      }
    });
  }
  const docs = Array.from(seen.values());
  if (docs.length > 0) {
    await batchDelete(docs);
  }
}

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  let step = "init";
  try {
    const uid = context.auth.uid;
    const email = (context.auth.token.email || "").toLowerCase();
    if (!email) {
      throw new functions.https.HttpsError("failed-precondition", "User email not available");
    }

    const db = admin.firestore();
    const arrayRemove = admin.firestore.FieldValue.arrayRemove;

    step = "check-suspension";
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const isSuspended =
      userData?.suspended === true ||
      (typeof userData?.inviteAllowance === "number" && userData.inviteAllowance <= 0);
    const discordUserId = userData?.discord?.userId ? String(userData.discord.userId) : null;
    if (isSuspended) {
      await db
        .collection("bannedEmails")
        .doc(encodeEmailId(email))
        .set(
          {
            email,
            bannedAt: admin.firestore.FieldValue.serverTimestamp(),
            reason: "suspended",
          },
          { merge: true }
        );
    }

    step = "discord-cleanup";
    const discordDeletes = [];
    if (discordUserId) {
      discordDeletes.push(
        db.collection("discordUserLinks").doc(discordUserId).delete().catch(() => undefined)
      );
    }
    discordDeletes.push(
      db.collection("discordLinkCodeRateLimits").doc(uid).delete().catch(() => undefined)
    );
    const [linkCodesSnap, voteSessionsSnap] = await Promise.all([
      db.collection("discordLinkCodes").where("uid", "==", uid).get(),
      db.collection("discordVoteSessions").where("qsUserId", "==", uid).get(),
    ]);
    await batchDelete([...linkCodesSnap.docs, ...voteSessionsSnap.docs]);
    await Promise.all(discordDeletes);

    step = "friend-requests";
    const [fromSnap, toSnap] = await Promise.all([
      db.collection("friendRequests").where("fromEmail", "==", email).get(),
      db.collection("friendRequests").where("toEmail", "==", email).get(),
    ]);
    await batchDelete([...fromSnap.docs, ...toSnap.docs]);

    step = "questing-groups";
    const [memberSnap, inviteSnap, creatorSnap] = await Promise.all([
      db.collection("questingGroups").where("memberIds", "array-contains", uid).get(),
      db.collection("questingGroups").where("pendingInvites", "array-contains", email).get(),
      db.collection("questingGroups").where("creatorId", "==", uid).get(),
    ]);
    const groupsById = new Map();
    [...memberSnap.docs, ...inviteSnap.docs, ...creatorSnap.docs].forEach((docSnap) => {
      groupsById.set(docSnap.id, docSnap);
    });

    const groupIds = Array.from(groupsById.keys());
    for (const groupId of groupIds) {
      const groupSnap = groupsById.get(groupId);
      const data = groupSnap?.data() || {};
      const memberIds = data.memberIds || [];
      const pendingInvites = data.pendingInvites || [];
      const nextMemberIds = memberIds.filter((memberId) => memberId !== uid);
      const nextInvites = pendingInvites.filter((invite) => invite !== email);

      if (data.creatorId === uid && data.memberManaged !== true) {
        await db.collection("questingGroups").doc(groupId).delete();
        continue;
      }

      if (nextMemberIds.length === 0 && nextInvites.length === 0) {
        await db.collection("questingGroups").doc(groupId).delete();
        continue;
      }

      await db.collection("questingGroups").doc(groupId).update({
        memberIds: arrayRemove(uid),
        pendingInvites: arrayRemove(email),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    step = "notifications";
    try {
      const [friendNotifSnap, groupInviteSnap] = await Promise.all([
        db.collectionGroup("notifications").where("metadata.fromEmail", "==", email).get(),
        db.collectionGroup("notifications").where("metadata.inviterEmail", "==", email).get(),
      ]);
      const friendNotifs = friendNotifSnap.docs.filter(
        (docSnap) => docSnap.data()?.type === "FRIEND_REQUEST"
      );
      const inviteTypes = ["GROUP_INVITE", "POLL_INVITE", "SESSION_INVITE"];
      const groupOrPollInvites = groupInviteSnap.docs.filter((docSnap) =>
        inviteTypes.includes(docSnap.data()?.type)
      );
      await batchDelete([...friendNotifs, ...groupOrPollInvites]);
    } catch (err) {
      console.warn("deleteUserAccount: notifications cleanup failed", err);
    }

    step = "created-polls";
    const createdPollsSnap = await db.collection("schedulers").where("creatorId", "==", uid).get();
    for (const pollDoc of createdPollsSnap.docs) {
      await db.recursiveDelete(pollDoc.ref);
    }

    step = "all-votes";
    await deleteUserVotesEverywhere(uid, email);

    step = "participant-polls";
    const participantPollsSnap = await db
      .collection("schedulers")
      .where("participantIds", "array-contains", uid)
      .get();
    for (const pollDoc of participantPollsSnap.docs) {
      const pollData = pollDoc.data() || {};
      if (pollData.creatorId === uid) continue;
      await pollDoc.ref.update({
        participantIds: arrayRemove(uid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await pollDoc.ref.collection("votes").doc(uid).delete();
    }

    step = "pending-polls";
    const pendingPollsSnap = await db
      .collection("schedulers")
      .where("pendingInvites", "array-contains", email)
      .get();
    for (const pollDoc of pendingPollsSnap.docs) {
      await pollDoc.ref.update({
        pendingInvites: arrayRemove(email),
        [`pendingInviteMeta.${email}`]: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    step = "profiles";
    await db.collection("usersPublic").doc(uid).delete();
    await db.collection("userSecrets").doc(uid).delete();
    await db.recursiveDelete(db.collection("users").doc(uid));

    step = "auth-delete";
    await admin.auth().deleteUser(uid);

    return { ok: true };
  } catch (err) {
    console.error(`deleteUserAccount failed at ${step}`, err);
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    throw new functions.https.HttpsError(
      "internal",
      `Failed to delete account (${step}).`
    );
  }
});
