const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "studio-473406021-87ead";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

async function seed() {
  const schedulerId = process.env.E2E_SCHEDULER_ID || "e2e-scheduler";
  const schedulerDeclineId =
    process.env.E2E_SCHEDULER_DECLINE_ID || "e2e-scheduler-decline";
  const schedulerNotificationId =
    process.env.E2E_SCHEDULER_NOTIFICATION_ID || "e2e-scheduler-notification";
  const friendAcceptId = process.env.E2E_FRIEND_ACCEPT_ID || "e2e-friend-accept";
  const friendDeclineId = process.env.E2E_FRIEND_DECLINE_ID || "e2e-friend-decline";
  const friendRevokeId = process.env.E2E_FRIEND_REVOKE_ID || "e2e-friend-revoke";
  const friendDeclineEmail =
    process.env.E2E_FRIEND_DECLINE_EMAIL || "stranger@example.com";
  const groupAcceptId = process.env.E2E_GROUP_ACCEPT_ID || "e2e-group-accept";
  const groupDeclineId = process.env.E2E_GROUP_DECLINE_ID || "e2e-group-decline";
  const groupRevokeId = process.env.E2E_GROUP_REVOKE_ID || "e2e-group-revoke";
  const groupOwnerId = process.env.E2E_GROUP_OWNER_ID || "e2e-group-owner";
  const groupAcceptName = "E2E Group Accept";
  const groupDeclineName = "E2E Group Decline";
  const groupRevokeName = "E2E Group Revoke";
  const groupOwnerName = "E2E Group Owner";
  const participantId = process.env.E2E_USER_UID || "test-owner";
  const participantEmail = process.env.E2E_USER_EMAIL || "owner@example.com";
  const participantPassword = process.env.E2E_USER_PASSWORD || "password";
  const inviteeId = process.env.E2E_PARTICIPANT_UID || "test-participant";
  const inviteeEmail = process.env.E2E_PARTICIPANT_EMAIL || "participant@example.com";
  const inviteePassword = process.env.E2E_PARTICIPANT_PASSWORD || "password";
  const revokeeId = process.env.E2E_REVOKE_UID || "test-revokee";
  const revokeeEmail = process.env.E2E_REVOKE_EMAIL || "revokee@example.com";
  const revokeePassword = process.env.E2E_REVOKE_PASSWORD || "password";
  const blockedId = process.env.E2E_BLOCKED_UID || "test-blocked";
  const blockedEmail = process.env.E2E_BLOCKED_EMAIL || "blocked@example.com";
  const blockedPassword = process.env.E2E_BLOCKED_PASSWORD || "password";

  const auth = admin.auth();
  const ensureUser = async ({ uid, email, password, displayName }) => {
    try {
      await auth.getUser(uid);
      await auth.updateUser(uid, {
        email,
        password,
        displayName,
        emailVerified: true,
      });
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        await auth.createUser({
          uid,
          email,
          password,
          displayName,
          emailVerified: true,
        });
      } else {
        throw err;
      }
    }
  };

  await ensureUser({
    uid: participantId,
    email: participantEmail,
    password: participantPassword,
    displayName: "Owner",
  });
  await ensureUser({
    uid: inviteeId,
    email: inviteeEmail,
    password: inviteePassword,
    displayName: "Participant",
  });
  await ensureUser({
    uid: revokeeId,
    email: revokeeEmail,
    password: revokeePassword,
    displayName: "Revokee",
  });
  await ensureUser({
    uid: blockedId,
    email: blockedEmail,
    password: blockedPassword,
    displayName: "Blocked",
  });

  const now = new Date();
  const slotStart = new Date(now.getTime() + 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  const slotStartTwo = new Date(slotStart.getTime() + 24 * 60 * 60 * 1000);
  const slotEndTwo = new Date(slotStartTwo.getTime() + 2 * 60 * 60 * 1000);

  await db.doc(`usersPublic/${participantId}`).set(
    {
      email: participantEmail.toLowerCase(),
      displayName: "Owner",
      emailNotifications: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.doc(`usersPublic/${inviteeId}`).set(
    {
      email: inviteeEmail.toLowerCase(),
      displayName: "Participant",
      emailNotifications: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.doc(`usersPublic/${revokeeId}`).set(
    {
      email: revokeeEmail.toLowerCase(),
      displayName: "Revokee",
      emailNotifications: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.doc(`usersPublic/${blockedId}`).set(
    {
      email: blockedEmail.toLowerCase(),
      displayName: "Blocked",
      emailNotifications: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const ownerEmailLower = participantEmail.toLowerCase();
  const inviteeEmailLower = inviteeEmail.toLowerCase();
  const revokeeEmailLower = revokeeEmail.toLowerCase();
  const blockedEmailLower = blockedEmail.toLowerCase();

  await db
    .doc(
      `users/${blockedId}/blockedUsers/${encodeURIComponent(ownerEmailLower)}`
    )
    .set({
      email: ownerEmailLower,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  const seedScheduler = async ({ id, title }) => {
    await db.doc(`schedulers/${id}`).set({
      title,
      creatorId: participantId,
      creatorEmail: participantEmail,
      status: "OPEN",
      participantIds: [participantId, inviteeId],
      pendingInvites: [inviteeEmail.toLowerCase()],
      pendingInviteMeta: {
        [inviteeEmail.toLowerCase()]: {
          invitedByEmail: participantEmail.toLowerCase(),
          invitedByUserId: participantId,
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      allowLinkSharing: false,
      timezone: "UTC",
      timezoneMode: "utc",
      winningSlotId: null,
      googleEventId: null,
      questingGroupId: null,
      questingGroupName: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db
      .doc(
        `users/${inviteeId}/notifications/dedupe:poll:${id}:invite:${inviteeEmailLower}`
      )
      .set({
        type: "POLL_INVITE_SENT",
        title: "Session poll invite",
        body: `${participantEmail} invited you to join \"${title}\"`,
        read: false,
        dismissed: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          schedulerId: id,
          schedulerTitle: title,
          inviterEmail: participantEmail.toLowerCase(),
          inviterUserId: participantId,
        },
        resource: { type: "poll", id, title },
        actor: {
          uid: participantId,
          email: participantEmail.toLowerCase(),
          displayName: "Owner",
        },
      });

    await db.doc(`schedulers/${id}/slots/slot-1`).set({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      stats: { feasible: 0, preferred: 0 },
    });

    await db.doc(`schedulers/${id}/slots/slot-2`).set({
      start: slotStartTwo.toISOString(),
      end: slotEndTwo.toISOString(),
      stats: { feasible: 0, preferred: 0 },
    });
  };

  const seedFriendRequest = async ({
    id,
    fromEmail,
    fromUserId,
    fromDisplayName,
    toEmail,
    toUserId,
  }) => {
    await db.doc(`friendRequests/${id}`).set({
      fromUserId: fromUserId || null,
      fromEmail: fromEmail.toLowerCase(),
      fromEmailRaw: fromEmail,
      fromDisplayName: fromDisplayName || null,
      toEmail: toEmail.toLowerCase(),
      toUserId: toUserId || null,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  };

  const seedFriendNotification = async ({
    userId,
    requestId,
    actorEmail,
    actorUserId,
    actorName,
  }) => {
    await db
      .doc(`users/${userId}/notifications/dedupe:friend:${requestId}`)
      .set({
        type: "FRIEND_REQUEST_SENT",
        title: "Friend request",
        body: `${actorEmail} sent you a friend request`,
        read: false,
        dismissed: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          requestId,
        },
        resource: { type: "friend", id: requestId, title: "Friend Request" },
        actor: {
          uid: actorUserId || null,
          email: actorEmail.toLowerCase(),
          displayName: actorName || actorEmail,
        },
      });
  };

  const seedGroup = async ({ id, name, pendingEmail }) => {
    const pendingInvite = pendingEmail ? pendingEmail.toLowerCase() : null;
    await db.doc(`questingGroups/${id}`).set({
      name,
      creatorId: participantId,
      creatorEmail: ownerEmailLower,
      memberManaged: false,
      memberIds: [participantId],
      pendingInvites: pendingInvite ? [pendingInvite] : [],
      pendingInviteMeta: pendingInvite
        ? {
            [pendingInvite]: {
              invitedByEmail: ownerEmailLower,
              invitedByUserId: participantId,
              invitedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          }
        : {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  };

  const seedGroupNotification = async ({
    userId,
    groupId,
    groupName,
    actorEmail,
    actorUserId,
    actorName,
    inviteeEmail,
  }) => {
    const inviteeLower = inviteeEmail.toLowerCase();
    await db
      .doc(
        `users/${userId}/notifications/dedupe:group:${groupId}:invite:${inviteeLower}`
      )
      .set({
      type: "GROUP_INVITE_SENT",
      title: "Group invite",
      body: `${actorEmail} invited you to join \"${groupName}\"`,
      read: false,
      dismissed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          groupId,
          groupName,
          inviterEmail: actorEmail.toLowerCase(),
          inviterUserId: actorUserId,
        },
      resource: { type: "group", id: groupId, title: groupName },
      actor: {
        uid: actorUserId || null,
        email: actorEmail.toLowerCase(),
        displayName: actorName || actorEmail,
      },
    });
  };

  await seedScheduler({ id: schedulerId, title: "E2E Scheduler Poll" });
  await seedScheduler({ id: schedulerDeclineId, title: "E2E Scheduler Poll Decline" });
  await seedScheduler({ id: schedulerNotificationId, title: "E2E Scheduler Poll Notification" });

  await seedFriendRequest({
    id: friendAcceptId,
    fromEmail: participantEmail,
    fromUserId: participantId,
    fromDisplayName: "Owner",
    toEmail: inviteeEmail,
    toUserId: inviteeId,
  });

  await seedFriendRequest({
    id: friendDeclineId,
    fromEmail: friendDeclineEmail,
    fromUserId: null,
    fromDisplayName: friendDeclineEmail,
    toEmail: inviteeEmail,
    toUserId: inviteeId,
  });

  await seedFriendRequest({
    id: friendRevokeId,
    fromEmail: participantEmail,
    fromUserId: participantId,
    fromDisplayName: "Owner",
    toEmail: revokeeEmail,
    toUserId: revokeeId,
  });

  await seedFriendNotification({
    userId: inviteeId,
    requestId: friendAcceptId,
    actorEmail: participantEmail,
    actorUserId: participantId,
    actorName: "Owner",
  });

  await seedFriendNotification({
    userId: inviteeId,
    requestId: friendDeclineId,
    actorEmail: friendDeclineEmail,
    actorUserId: null,
    actorName: friendDeclineEmail,
  });

  await seedFriendNotification({
    userId: revokeeId,
    requestId: friendRevokeId,
    actorEmail: participantEmail,
    actorUserId: participantId,
    actorName: "Owner",
  });

  await seedGroup({
    id: groupAcceptId,
    name: groupAcceptName,
    pendingEmail: inviteeEmail,
  });
  await seedGroup({
    id: groupDeclineId,
    name: groupDeclineName,
    pendingEmail: inviteeEmail,
  });
  await seedGroup({
    id: groupRevokeId,
    name: groupRevokeName,
    pendingEmail: revokeeEmail,
  });
  await seedGroup({ id: groupOwnerId, name: groupOwnerName, pendingEmail: null });

  await seedGroupNotification({
    userId: inviteeId,
    groupId: groupAcceptId,
    groupName: groupAcceptName,
    actorEmail: participantEmail,
    actorUserId: participantId,
    actorName: "Owner",
    inviteeEmail: inviteeEmail,
  });

  await seedGroupNotification({
    userId: inviteeId,
    groupId: groupDeclineId,
    groupName: groupDeclineName,
    actorEmail: participantEmail,
    actorUserId: participantId,
    actorName: "Owner",
    inviteeEmail: inviteeEmail,
  });

  await seedGroupNotification({
    userId: revokeeId,
    groupId: groupRevokeId,
    groupName: groupRevokeName,
    actorEmail: participantEmail,
    actorUserId: participantId,
    actorName: "Owner",
    inviteeEmail: revokeeEmail,
  });

  console.log(
    `Seeded schedulers ${schedulerId}, ${schedulerDeclineId}, and ${schedulerNotificationId} for ${participantEmail}`
  );
}

seed().catch((err) => {
  console.error("Failed to seed e2e scheduler:", err);
  process.exitCode = 1;
});
