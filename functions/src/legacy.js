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

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
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

async function isBlockedByUser(targetUserId, senderEmail) {
  if (!targetUserId) return false;
  const blockedRef = admin
    .firestore()
    .collection("users")
    .doc(targetUserId)
    .collection("blockedUsers")
    .doc(encodeEmailId(senderEmail));
  const snap = await blockedRef.get();
  return snap.exists;
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

async function createFriendRequestNotification(userId, { requestId, fromEmail }) {
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
      },
      read: false,
      dismissed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function createFriendAcceptedNotification(userId, { requestId, friendEmail }) {
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
    },
    read: false,
    dismissed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function createPollInviteNotification(userId, { schedulerId, schedulerTitle, inviterEmail }) {
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
    const authUser = await admin.auth().getUser(uid);
    const expectedEmail = normalizeEmail(authUser.email);
    const tokenEmail = normalizeEmail(await getOAuthEmail(oauth2Client, tokens));
    if (!expectedEmail || !tokenEmail || expectedEmail !== tokenEmail) {
      await admin.firestore().collection("oauthStates").doc(state).delete();
      res
        .status(403)
        .send("Google account mismatch. Please use the same account you signed in with.");
      return;
    }
    await storeRefreshToken(uid, tokens.refresh_token);
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
  const participants = Array.from(new Set([creatorEmail, ...normalizedInvites].filter(Boolean)));

  let groupNameToSave = null;
  let groupMembers = [];
  if (questingGroupId) {
    const groupSnap = await admin.firestore().collection("questingGroups").doc(questingGroupId).get();
    if (groupSnap.exists) {
      const groupData = groupSnap.data() || {};
      groupNameToSave = groupData.name || questingGroupName || null;
      groupMembers = Array.isArray(groupData.members) ? groupData.members : [];
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
    participants,
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
    const participantSet = new Set(
      [...participants, ...groupMembers.map((email) => normalizeEmail(email))]
        .filter(Boolean)
        .map((email) => email.toLowerCase())
    );
    const votesSnap = await schedulerRef.collection("votes").get();
    await Promise.all(
      votesSnap.docs.map((voteDoc) => {
        const voteData = voteDoc.data() || {};
        const userEmail = normalizeEmail(voteData.userEmail);
        if (!userEmail || !participantSet.has(userEmail)) {
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
              userEmail,
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

  const requestId = friendRequestIdForEmails(fromEmail, toEmail);
  const reverseId = friendRequestIdForEmails(toEmail, fromEmail);
  const db = admin.firestore();
  const [directSnap, reverseSnap] = await Promise.all([
    db.collection("friendRequests").doc(requestId).get(),
    db.collection("friendRequests").doc(reverseId).get(),
  ]);

  const existing = directSnap.exists ? directSnap : reverseSnap;
  if (existing?.exists) {
    const status = existing.data()?.status;
    if (status === "pending") {
      throw new functions.https.HttpsError("failed-precondition", "Friend request already pending.");
    }
    if (status === "accepted") {
      throw new functions.https.HttpsError("failed-precondition", "You are already friends.");
    }
  }

  const toUserId = await findUserIdByEmail(toEmail);
  if (await isBlockedByUser(toUserId, fromEmail)) {
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

  if (directSnap.exists && directSnap.data()?.status && directSnap.data()?.status !== "pending") {
    await db.collection("friendRequests").doc(requestId).delete();
  }
  if (reverseSnap.exists && reverseSnap.data()?.status && reverseSnap.data()?.status !== "pending") {
    await db.collection("friendRequests").doc(reverseId).delete();
  }

  await db.collection("friendRequests").doc(requestId).set({
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

  const requestId = friendRequestIdForEmails(senderEmail, userEmail);
  const reverseId = friendRequestIdForEmails(userEmail, senderEmail);
  const [directSnap, reverseSnap] = await Promise.all([
    db.collection("friendRequests").doc(requestId).get(),
    db.collection("friendRequests").doc(reverseId).get(),
  ]);

  const existing = directSnap.exists ? directSnap : reverseSnap;
  if (existing?.exists) {
    const status = existing.data()?.status;
    if (status === "accepted") {
      return {
        senderEmail,
        senderDisplayName: sender.displayName || senderEmail,
      };
    }
    if (status === "pending") {
      const docRef = db.collection("friendRequests").doc(existing.id);
      await docRef.update({
        status: "accepted",
        toUserId: context.auth.uid,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await createFriendAcceptedNotification(senderDoc.id, {
        requestId: existing.id,
        friendEmail: userEmail,
      });
      await db
        .collection("users")
        .doc(context.auth.uid)
        .collection("notifications")
        .doc(`friendRequest:${existing.id}`)
        .delete()
        .catch(() => undefined);
      return {
        senderEmail,
        senderDisplayName: sender.displayName || senderEmail,
      };
    }
  }

  await db.collection("friendRequests").doc(requestId).set({
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

  let groupMembers = [];
  if (scheduler.questingGroupId) {
    const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
    if (groupSnap.exists) {
      groupMembers = (groupSnap.data()?.members || []).map(normalizeEmail);
    }
  }

  const { data: userStatus } = await ensureUserStatus(inviterId);
  if (userStatus.suspended) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Your account is suspended. Contact support@questscheduler.cc."
    );
  }

  const participants = (scheduler.participants || []).map(normalizeEmail);
  const pending = (scheduler.pendingInvites || []).map(normalizeEmail);
  const normalizedInvitees = Array.from(
    new Set(invitees.map(normalizeEmail).filter(Boolean))
  ).filter((email) => email && email !== inviterEmail);

  const candidates = normalizedInvitees.filter(
    (email) =>
      !participants.includes(email) &&
      !pending.includes(email) &&
      !groupMembers.includes(email)
  );
  if (candidates.length === 0) {
    return { added: [], rejected: [] };
  }

  const userIdMap = await getUserIdsByEmail(candidates);
  const rejected = [];
  const valid = [];

  for (const email of candidates) {
    const userId = userIdMap.get(email) || null;
    if (userId && (await isBlockedByUser(userId, inviterEmail))) {
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

exports.blockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const blockerId = context.auth.uid;
  const blockerEmail = normalizeEmail(context.auth.token.email);
  const targetEmail = normalizeEmail(data?.email);

  if (!blockerEmail || !targetEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing email.");
  }
  if (blockerEmail === targetEmail) {
    throw new functions.https.HttpsError("failed-precondition", "You cannot block yourself.");
  }

  const db = admin.firestore();
  const blockRef = db
    .collection("users")
    .doc(blockerId)
    .collection("blockedUsers")
    .doc(encodeEmailId(targetEmail));
  const existingBlock = await blockRef.get();
  if (existingBlock.exists) {
    return { ok: true, alreadyBlocked: true };
  }

  const friendRequestId = friendRequestIdForEmails(targetEmail, blockerEmail);
  const friendSnap = await db.collection("friendRequests").doc(friendRequestId).get();
  const hasPendingFriend =
    friendSnap.exists && friendSnap.data()?.status === "pending";

  const pollSnap = await db
    .collection("schedulers")
    .where("creatorEmail", "==", targetEmail)
    .where("pendingInvites", "array-contains", blockerEmail)
    .get();

  const hasPendingPollInvites = !pollSnap.empty;
  let offenderUserId = null;
  if (hasPendingFriend) {
    offenderUserId = friendSnap.data()?.fromUserId || null;
  }
  if (!offenderUserId && hasPendingPollInvites) {
    offenderUserId = pollSnap.docs[0]?.data()?.creatorId || null;
  }

  const shouldPenalize = Boolean(offenderUserId && (hasPendingFriend || hasPendingPollInvites));

  await blockRef.set({
    email: targetEmail,
    blockedUserId: offenderUserId || null,
    blockedAt: admin.firestore.FieldValue.serverTimestamp(),
    penalized: shouldPenalize,
    penaltyValue: shouldPenalize ? INVITE_BLOCK_PENALTY : 0,
    penaltyAppliedAt: shouldPenalize
      ? admin.firestore.FieldValue.serverTimestamp()
      : null,
  });

  if (hasPendingFriend) {
    await db.collection("friendRequests").doc(friendRequestId).delete();
    await db
      .collection("users")
      .doc(blockerId)
      .collection("notifications")
      .doc(`friendRequest:${friendRequestId}`)
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
  const targetEmail = normalizeEmail(data?.email);
  if (!targetEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing email.");
  }

  const db = admin.firestore();
  const blockRef = db
    .collection("users")
    .doc(blockerId)
    .collection("blockedUsers")
    .doc(encodeEmailId(targetEmail));
  const blockSnap = await blockRef.get();
  if (!blockSnap.exists) {
    return { ok: true, alreadyUnblocked: true };
  }
  const blockData = blockSnap.data() || {};
  await blockRef.delete();

  if (blockData.penalized) {
    const offenderUserId =
      blockData.blockedUserId || (await findUserIdByEmail(targetEmail));
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

    step = "friend-requests";
    const [fromSnap, toSnap] = await Promise.all([
      db.collection("friendRequests").where("fromEmail", "==", email).get(),
      db.collection("friendRequests").where("toEmail", "==", email).get(),
    ]);
    await batchDelete([...fromSnap.docs, ...toSnap.docs]);

    step = "questing-groups";
    const [memberSnap, inviteSnap, creatorSnap] = await Promise.all([
      db.collection("questingGroups").where("members", "array-contains", email).get(),
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
      const members = data.members || [];
      const pendingInvites = data.pendingInvites || [];
      const nextMembers = members.filter((member) => member !== email);
      const nextInvites = pendingInvites.filter((invite) => invite !== email);

      if (data.creatorId === uid && data.memberManaged !== true) {
        await db.collection("questingGroups").doc(groupId).delete();
        continue;
      }

      if (nextMembers.length === 0 && nextInvites.length === 0) {
        await db.collection("questingGroups").doc(groupId).delete();
        continue;
      }

      await db.collection("questingGroups").doc(groupId).update({
        members: arrayRemove(email),
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
      const groupOrPollInvites = groupInviteSnap.docs.filter((docSnap) =>
        ["GROUP_INVITE", "POLL_INVITE"].includes(docSnap.data()?.type)
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

    step = "participant-polls";
    const participantPollsSnap = await db
      .collection("schedulers")
      .where("participants", "array-contains", email)
      .get();
    for (const pollDoc of participantPollsSnap.docs) {
      const pollData = pollDoc.data() || {};
      if (pollData.creatorId === uid) continue;
      await pollDoc.ref.update({
        participants: arrayRemove(email),
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
