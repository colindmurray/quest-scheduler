/* eslint-disable no-console */
const admin = require("firebase-admin");

const MAX_INVITE_ALLOWANCE = 50;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function encodeEmailId(value) {
  return encodeURIComponent(normalizeEmail(value));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set(args.filter((item) => item.startsWith("--")));
  const getValue = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    return args[index + 1] || fallback;
  };

  return {
    action: args.find((item) => !item.startsWith("--")) || "info",
    uid: getValue("--uid"),
    email: getValue("--email"),
    username: getValue("--username"),
    allowance: getValue("--allowance"),
    commit: flags.has("--commit"),
    quiet: flags.has("--quiet"),
  };
}

function printUsage() {
  console.log(`\nUsage:
  node functions/scripts/admin-user-tool.js <action> [options]

Actions:
  info           Show resolved user details
  delete         Delete account + cleanup (matches deleteUserAccount behavior)
  suspend        Suspend account (set inviteAllowance=0, suspended=true, add bannedEmails)
  unsuspend      Remove suspension (clear bannedEmails, set suspended=false)
  set-allowance  Set inviteAllowance to a specific number

Options:
  --uid <uid>
  --email <email>
  --username <displayName> (exact match, may be non-unique)
  --allowance <number>      (for set-allowance or unsuspend)
  --commit                  (apply changes; otherwise dry-run)
  --quiet                   (less output)
`);
}

async function resolveUser({ uid, email, username }) {
  const db = admin.firestore();

  if (uid) {
    let authUser = null;
    try {
      authUser = await admin.auth().getUser(uid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
    const userSnap = await db.collection("users").doc(uid).get();
    const publicSnap = await db.collection("usersPublic").doc(uid).get();
    return {
      uid,
      email: normalizeEmail(authUser?.email || userSnap.data()?.email || publicSnap.data()?.email),
      displayName: authUser?.displayName || userSnap.data()?.displayName || publicSnap.data()?.displayName || null,
      authUser,
      userDoc: userSnap.exists ? userSnap.data() : null,
      publicDoc: publicSnap.exists ? publicSnap.data() : null,
    };
  }

  if (email) {
    const normalized = normalizeEmail(email);
    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(normalized);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
    if (authUser) {
      return resolveUser({ uid: authUser.uid });
    }
    const snapshot = await db
      .collection("usersPublic")
      .where("email", "==", normalized)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      return resolveUser({ uid: snapshot.docs[0].id });
    }
    return null;
  }

  if (username) {
    const snapshot = await db
      .collection("usersPublic")
      .where("displayName", "==", username)
      .get();
    if (snapshot.empty) return null;
    if (snapshot.size > 1) {
      const matches = snapshot.docs.map((docSnap) => ({
        uid: docSnap.id,
        email: docSnap.data()?.email || null,
        displayName: docSnap.data()?.displayName || null,
      }));
      return { multiple: true, matches };
    }
    return resolveUser({ uid: snapshot.docs[0].id });
  }

  return null;
}

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

async function deleteUserVotesEverywhere({ uid, email }) {
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

async function deleteAccount({ uid, email }) {
  const db = admin.firestore();
  const arrayRemove = admin.firestore.FieldValue.arrayRemove;

  let step = "check-suspension";
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const isSuspended =
    userData?.suspended === true ||
    (typeof userData?.inviteAllowance === "number" && userData.inviteAllowance <= 0);
  const discordUserId = userData?.discord?.userId ? String(userData.discord.userId) : null;
  if (isSuspended && email) {
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
    db.collection("questingGroups").where("members", "array-contains", email).get(),
    db.collection("questingGroups").where("pendingInvites", "array-contains", email).get(),
    db.collection("questingGroups").where("creatorId", "==", uid).get(),
  ]);
  const groupsById = new Map();
  [...memberSnap.docs, ...inviteSnap.docs, ...creatorSnap.docs].forEach((docSnap) => {
    groupsById.set(docSnap.id, docSnap);
  });

  for (const [groupId, groupSnap] of groupsById.entries()) {
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
  await deleteUserVotesEverywhere({ uid, email });

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
}

async function updateInviteAllowance({ uid, email, allowance, suspend, unsuspend }) {
  const db = admin.firestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};

  let nextAllowance = allowance;
  if (typeof nextAllowance !== "number" || Number.isNaN(nextAllowance)) {
    nextAllowance = typeof data.inviteAllowance === "number" ? data.inviteAllowance : MAX_INVITE_ALLOWANCE;
  }
  if (nextAllowance < 0) nextAllowance = 0;

  let nextSuspended = data.suspended === true;
  if (suspend) nextSuspended = true;
  if (unsuspend) nextSuspended = false;
  if (!suspend && !unsuspend) {
    nextSuspended = nextAllowance <= 0;
  }
  if (nextSuspended && nextAllowance > 0 && suspend) {
    nextAllowance = 0;
  }
  if (!nextSuspended && nextAllowance <= 0) {
    nextAllowance = MAX_INVITE_ALLOWANCE;
  }

  const updates = {
    inviteAllowance: nextAllowance,
    suspended: nextSuspended,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (nextSuspended && !data.suspended) {
    updates.suspendedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  if (!nextSuspended && data.suspended) {
    updates.suspendedAt = admin.firestore.FieldValue.delete();
  }

  await ref.set(updates, { merge: true });

  if (email) {
    const bannedRef = db.collection("bannedEmails").doc(encodeEmailId(email));
    if (nextSuspended) {
      await bannedRef.set(
        {
          email,
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          reason: "suspended",
        },
        { merge: true }
      );
    } else {
      await bannedRef.delete().catch(() => undefined);
    }
  }

  return { inviteAllowance: nextAllowance, suspended: nextSuspended };
}

async function run() {
  const { action, uid, email, username, allowance, commit, quiet } = parseArgs(process.argv);

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  if (!uid && !email && !username) {
    printUsage();
    process.exit(1);
  }

  const resolved = await resolveUser({ uid, email, username });
  if (!resolved) {
    console.error("No user found with the provided identifier.");
    process.exit(1);
  }

  if (resolved.multiple) {
    console.error("Multiple users matched that username. Use --uid or --email instead.");
    resolved.matches.forEach((match) => {
      console.log(`- ${match.uid} | ${match.email || ""} | ${match.displayName || ""}`);
    });
    process.exit(1);
  }

  const target = resolved;
  if (!target.uid) {
    console.error("Unable to resolve user UID.");
    process.exit(1);
  }

  if (!quiet) {
    console.log(`Target: ${target.uid}`);
    console.log(`Email: ${target.email || "(none)"}`);
    console.log(`Display name: ${target.displayName || "(none)"}`);
  }

  if (action === "info") {
    return;
  }

  if (!commit) {
    console.log(`Dry run. Re-run with --commit to apply ${action}.`);
    return;
  }

  if (action === "delete") {
    if (!target.email) {
      console.error("Delete requires an email address on the account.");
      process.exit(1);
    }
    await deleteAccount({ uid: target.uid, email: target.email });
    console.log("Account deleted.");
    return;
  }

  if (action === "suspend") {
    const result = await updateInviteAllowance({
      uid: target.uid,
      email: target.email,
      allowance: 0,
      suspend: true,
    });
    console.log(`Suspended. inviteAllowance=${result.inviteAllowance}`);
    return;
  }

  if (action === "unsuspend") {
    const allowanceNumber = allowance ? Number(allowance) : MAX_INVITE_ALLOWANCE;
    const result = await updateInviteAllowance({
      uid: target.uid,
      email: target.email,
      allowance: allowanceNumber,
      unsuspend: true,
    });
    console.log(`Unsuspended. inviteAllowance=${result.inviteAllowance}`);
    return;
  }

  if (action === "set-allowance") {
    if (allowance == null) {
      console.error("--allowance is required for set-allowance.");
      process.exit(1);
    }
    const allowanceNumber = Number(allowance);
    if (Number.isNaN(allowanceNumber)) {
      console.error("--allowance must be a number.");
      process.exit(1);
    }
    const result = await updateInviteAllowance({
      uid: target.uid,
      email: target.email,
      allowance: allowanceNumber,
    });
    console.log(`Updated inviteAllowance=${result.inviteAllowance}, suspended=${result.suspended}`);
    return;
  }

  console.error(`Unknown action: ${action}`);
  printUsage();
  process.exit(1);
}

run().catch((err) => {
  console.error("Admin user tool failed:", err);
  process.exit(1);
});
