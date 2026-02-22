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
  const emptyVoteSchedulerId =
    process.env.E2E_EMPTY_VOTE_SCHEDULER_ID || "e2e-empty-vote-pending";
  const monthVoteSchedulerId =
    process.env.E2E_MONTH_VOTE_SCHEDULER_ID || "e2e-month-calendar-votes";
  const discordRepostSchedulerId =
    process.env.E2E_DISCORD_REPOST_SCHEDULER_ID || "e2e-discord-repost-poll";
  const discordRepostGroupId =
    process.env.E2E_DISCORD_REPOST_GROUP_ID || "e2e-discord-repost-group";
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
  const notifierId = process.env.E2E_NOTIFICATION_UID || "test-notifier";
  const notifierEmail = process.env.E2E_NOTIFICATION_EMAIL || "notifier@example.com";
  const notifierPassword = process.env.E2E_NOTIFICATION_PASSWORD || "password";
  const copySourceId = process.env.E2E_COPY_SOURCE_ID || "e2e-copy-source";
  const copyDestinationId = process.env.E2E_COPY_DEST_ID || "e2e-copy-destination";
  const copyPendingDestId = process.env.E2E_COPY_PENDING_DEST_ID || "e2e-copy-destination-pending";
  const copyOverlapDestId = process.env.E2E_COPY_OVERLAP_DEST_ID || "e2e-copy-destination-overlap";
  const copyVotedDestId = process.env.E2E_COPY_VOTED_DEST_ID || "e2e-copy-destination-voted";
  const busyFinalizedId = process.env.E2E_BUSY_FINALIZED_ID || "e2e-busy-finalized";
  const busyTargetId = process.env.E2E_BUSY_TARGET_ID || "e2e-busy-target";
  const basicGroupId = process.env.E2E_BASIC_GROUP_ID || groupOwnerId;
  const basicStandalonePollId =
    process.env.E2E_BASIC_STANDALONE_POLL_ID || "e2e-basic-standalone-poll";
  const basicRankedPollId =
    process.env.E2E_BASIC_RANKED_POLL_ID || "e2e-basic-ranked-poll";
  const basicDeadlinePollId =
    process.env.E2E_BASIC_DEADLINE_POLL_ID || "e2e-basic-deadline-poll";
  const basicDashboardPollId =
    process.env.E2E_BASIC_DASHBOARD_POLL_ID || "e2e-basic-dashboard-poll";
  const embeddedBasicPollId =
    process.env.E2E_EMBEDDED_BASIC_POLL_ID || "e2e-embedded-required-poll";
  const embeddedEditorSchedulerId =
    process.env.E2E_EMBEDDED_EDITOR_SCHEDULER_ID || "e2e-embedded-editor-scheduler";
  const embeddedEditorPollId =
    process.env.E2E_EMBEDDED_EDITOR_POLL_ID || "e2e-embedded-editor-existing-poll";

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
  await ensureUser({
    uid: notifierId,
    email: notifierEmail,
    password: notifierPassword,
    displayName: "Notifier",
  });

  const now = new Date();
  const slotStart = new Date(now.getTime() + 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  const slotStartTwo = new Date(slotStart.getTime() + 24 * 60 * 60 * 1000);
  const slotEndTwo = new Date(slotStartTwo.getTime() + 2 * 60 * 60 * 1000);
  const monthVoteDay = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  monthVoteDay.setUTCHours(0, 0, 0, 0);
  const monthSlotStartOne = new Date(monthVoteDay.getTime() + (13 * 60 + 30) * 60 * 1000);
  const monthSlotEndOne = new Date(monthVoteDay.getTime() + 16 * 60 * 60 * 1000);
  const monthSlotStartTwo = new Date(monthVoteDay.getTime() + 17 * 60 * 60 * 1000);
  const monthSlotEndTwo = new Date(monthVoteDay.getTime() + (19 * 60 + 30) * 60 * 1000);
  const monthSlotStartThree = new Date(monthVoteDay.getTime() + 20 * 60 * 60 * 1000);
  const monthSlotEndThree = new Date(monthVoteDay.getTime() + 22 * 60 * 60 * 1000);
  const monthSingleDay = new Date(monthVoteDay.getTime() + 24 * 60 * 60 * 1000);
  const monthSlotStartSingle = new Date(monthSingleDay.getTime() + 18 * 60 * 60 * 1000);
  const monthSlotEndSingle = new Date(monthSingleDay.getTime() + (20 * 60 + 30) * 60 * 1000);

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

  await db.doc(`usersPublic/${notifierId}`).set(
    {
      email: notifierEmail.toLowerCase(),
      displayName: "Notifier",
      emailNotifications: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const notificationPreferenceEvents = [
    "POLL_CREATED",
    "POLL_INVITE_SENT",
    "POLL_INVITE_ACCEPTED",
    "POLL_INVITE_DECLINED",
    "POLL_INVITE_REVOKED",
    "VOTE_SUBMITTED",
    "VOTE_REMINDER",
    "POLL_READY_TO_FINALIZE",
    "POLL_ALL_VOTES_IN",
    "POLL_FINALIZED",
    "POLL_REOPENED",
    "POLL_CANCELLED",
    "POLL_RESTORED",
    "POLL_DELETED",
    "SLOT_CHANGED",
    "DISCORD_NUDGE_SENT",
    "FRIEND_REQUEST_SENT",
    "FRIEND_REQUEST_ACCEPTED",
    "FRIEND_REQUEST_DECLINED",
    "FRIEND_REMOVED",
    "GROUP_INVITE_SENT",
    "GROUP_INVITE_ACCEPTED",
    "GROUP_INVITE_DECLINED",
    "GROUP_MEMBER_REMOVED",
    "GROUP_MEMBER_LEFT",
    "GROUP_DELETED",
  ];
  const buildNotificationPreferences = () =>
    Object.fromEntries(notificationPreferenceEvents.map((eventType) => [eventType, "inApp"]));

  const seedUserSettings = async ({ uid, email, displayName }) => {
    await db.doc(`users/${uid}`).set(
      {
        email: email.toLowerCase(),
        displayName: displayName || null,
        settings: {
          notificationMode: "advanced",
          notificationPreferences: buildNotificationPreferences(),
          emailNotifications: true,
          autoBlockConflicts: false,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  };

  await seedUserSettings({
    uid: participantId,
    email: participantEmail,
    displayName: "Owner",
  });

  await seedUserSettings({
    uid: inviteeId,
    email: inviteeEmail,
    displayName: "Participant",
  });

  await seedUserSettings({
    uid: notifierId,
    email: notifierEmail,
    displayName: "Notifier",
  });

  const ownerEmailLower = participantEmail.toLowerCase();
  const inviteeEmailLower = inviteeEmail.toLowerCase();
  const revokeeEmailLower = revokeeEmail.toLowerCase();
  const blockedEmailLower = blockedEmail.toLowerCase();
  const notifierEmailLower = notifierEmail.toLowerCase();

  await db
    .doc(
      `users/${blockedId}/blockedUsers/${encodeURIComponent(ownerEmailLower)}`
    )
    .set({
      email: ownerEmailLower,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  const seedScheduler = async ({
    id,
    title,
    pendingEmails = [inviteeEmailLower],
    participantIds = [participantId, inviteeId],
    creatorId = participantId,
    creatorEmail = participantEmail,
    status = "OPEN",
    winningSlotId = null,
    finalizedAtMs = null,
    finalizedSlotPriorityAtMs = null,
    seedDefaultSlots = true,
    questingGroupId = null,
    questingGroupName = null,
  }) => {
    const pendingInviteMeta = {};
    pendingEmails.forEach((email) => {
      if (!email) return;
      pendingInviteMeta[email] = {
        invitedByEmail: ownerEmailLower,
        invitedByUserId: participantId,
        invitedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    });
    await db.doc(`schedulers/${id}`).set({
      title,
      creatorId,
      creatorEmail,
      status,
      participantIds,
      pendingInvites: pendingEmails,
      pendingInviteMeta,
      allowLinkSharing: false,
      timezone: "UTC",
      timezoneMode: "utc",
      winningSlotId,
      ...(finalizedAtMs ? { finalizedAtMs } : {}),
      ...(finalizedSlotPriorityAtMs ? { finalizedSlotPriorityAtMs } : {}),
      googleEventId: null,
      questingGroupId,
      questingGroupName,
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

    if (seedDefaultSlots) {
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
    }
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

  const seedGroup = async ({
    id,
    name,
    pendingEmail,
    memberIds = [participantId],
    discord = null,
  }) => {
    const pendingInvite = pendingEmail ? pendingEmail.toLowerCase() : null;
    await db.doc(`questingGroups/${id}`).set({
      name,
      creatorId: participantId,
      creatorEmail: ownerEmailLower,
      memberManaged: false,
      memberIds,
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
      ...(discord ? { discord } : {}),
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
  await seedScheduler({
    id: emptyVoteSchedulerId,
    title: "E2E Empty Vote Pending Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
  });
  await db.doc(`schedulers/${emptyVoteSchedulerId}/votes/${participantId}`).set({
    voterId: participantId,
    userEmail: participantEmail,
    userAvatar: null,
    noTimesWork: false,
    votes: { "slot-1": "FEASIBLE" },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.doc(`schedulers/${emptyVoteSchedulerId}/votes/${inviteeId}`).set({
    voterId: inviteeId,
    userEmail: inviteeEmail,
    userAvatar: null,
    noTimesWork: false,
    votes: {},
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await seedScheduler({
    id: monthVoteSchedulerId,
    title: "E2E Month Calendar Vote Poll",
    pendingEmails: [],
    participantIds: [participantId],
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${monthVoteSchedulerId}/slots/month-slot-1`).set({
    start: monthSlotStartOne.toISOString(),
    end: monthSlotEndOne.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${monthVoteSchedulerId}/slots/month-slot-2`).set({
    start: monthSlotStartTwo.toISOString(),
    end: monthSlotEndTwo.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${monthVoteSchedulerId}/slots/month-slot-3`).set({
    start: monthSlotStartThree.toISOString(),
    end: monthSlotEndThree.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${monthVoteSchedulerId}/slots/month-slot-single`).set({
    start: monthSlotStartSingle.toISOString(),
    end: monthSlotEndSingle.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await seedScheduler({
    id: discordRepostSchedulerId,
    title: "E2E Discord Repost Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    questingGroupId: discordRepostGroupId,
    questingGroupName: "E2E Discord Repost Group",
  });
  await seedScheduler({
    id: embeddedEditorSchedulerId,
    title: "E2E Embedded Editor Scheduler",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
  });
  await seedScheduler({
    id: "auto-poll-invite-accepted",
    title: "Auto Poll Invite Accepted",
    pendingEmails: [notifierEmailLower],
    participantIds: [participantId, notifierId],
  });
  await seedScheduler({
    id: "auto-poll-invite-declined",
    title: "Auto Poll Invite Declined",
    pendingEmails: [notifierEmailLower],
    participantIds: [participantId, notifierId],
  });
  await seedScheduler({
    id: "auto-poll-cancelled",
    title: "Auto Poll Cancelled",
    pendingEmails: [notifierEmailLower],
    participantIds: [participantId, notifierId],
  });

  // Seed Copy Votes scenarios
  // Source poll: owner has votes on future slots.
  const copySourceStart = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const copySourceEnd = new Date(copySourceStart.getTime() + 2 * 60 * 60 * 1000);
  const copySourceStartTwo = new Date(copySourceStart.getTime() + 24 * 60 * 60 * 1000);
  const copySourceEndTwo = new Date(copySourceStartTwo.getTime() + 2 * 60 * 60 * 1000);

  await seedScheduler({
    id: copySourceId,
    title: "E2E Copy Source Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${copySourceId}/slots/slot-a`).set({
    start: copySourceStart.toISOString(),
    end: copySourceEnd.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${copySourceId}/slots/slot-b`).set({
    start: copySourceStartTwo.toISOString(),
    end: copySourceEndTwo.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${copySourceId}/votes/${participantId}`).set({
    voterId: participantId,
    userEmail: participantEmail,
    userAvatar: null,
    noTimesWork: false,
    votes: { "slot-a": "PREFERRED", "slot-b": "FEASIBLE" },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Destination poll: overlapping and extending slots for match warnings.
  await seedScheduler({
    id: copyDestinationId,
    title: "E2E Copy Destination Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${copyDestinationId}/slots/dest-1`).set({
    start: new Date(copySourceStart.getTime() + 30 * 60 * 1000).toISOString(),
    end: new Date(copySourceStart.getTime() + 90 * 60 * 1000).toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${copyDestinationId}/slots/dest-2`).set({
    start: new Date(copySourceStart.getTime() + 60 * 60 * 1000).toISOString(),
    end: new Date(copySourceEnd.getTime() + 60 * 60 * 1000).toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });

  // Overlap-review destination: slot starts before the source slot but overlaps.
  await seedScheduler({
    id: copyOverlapDestId,
    title: "E2E Copy Overlap Review Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${copyOverlapDestId}/slots/overlap-1`).set({
    start: new Date(copySourceStart.getTime() - 30 * 60 * 1000).toISOString(),
    end: new Date(copySourceStart.getTime() + 30 * 60 * 1000).toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });

  // Already-voted destination: should be excluded from the "Copy votes" dropdown.
  await seedScheduler({
    id: copyVotedDestId,
    title: "E2E Copy Already Voted Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${copyVotedDestId}/slots/voted-1`).set({
    start: new Date(copySourceStart.getTime() + 45 * 60 * 1000).toISOString(),
    end: new Date(copySourceStart.getTime() + 105 * 60 * 1000).toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${copyVotedDestId}/votes/${participantId}`).set({
    voterId: participantId,
    userEmail: participantEmail,
    userAvatar: null,
    noTimesWork: false,
    votes: { "voted-1": "FEASIBLE" },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Pending-invite destination: created by participant, invites owner.
  await seedScheduler({
    id: copyPendingDestId,
    title: "E2E Copy Pending Invite Poll",
    pendingEmails: [ownerEmailLower],
    participantIds: [inviteeId],
    creatorId: inviteeId,
    creatorEmail: inviteeEmail,
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${copyPendingDestId}/slots/pdest-1`).set({
    start: new Date(copySourceStart.getTime() + 30 * 60 * 1000).toISOString(),
    end: new Date(copySourceStart.getTime() + 90 * 60 * 1000).toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });

  // Seed busy window scenario:
  // A finalized poll where owner confirmed, producing a busy window that overlaps an open poll slot.
  const busyStart = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const busyEnd = new Date(busyStart.getTime() + 2 * 60 * 60 * 1000);
  const busyTargetStart = new Date(busyStart.getTime() + 30 * 60 * 1000);
  const busyTargetEnd = new Date(busyTargetStart.getTime() + 2 * 60 * 60 * 1000);
  const priorityAtMs = Date.now() - 10000;

  await seedScheduler({
    id: busyFinalizedId,
    title: "E2E Busy Finalized Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    creatorId: inviteeId,
    creatorEmail: inviteeEmail,
    status: "FINALIZED",
    winningSlotId: "busy-slot",
    finalizedAtMs: priorityAtMs,
    finalizedSlotPriorityAtMs: { "busy-slot": priorityAtMs },
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${busyFinalizedId}/slots/busy-slot`).set({
    start: busyStart.toISOString(),
    end: busyEnd.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${busyFinalizedId}/votes/${participantId}`).set({
    voterId: participantId,
    userEmail: participantEmail,
    userAvatar: null,
    noTimesWork: false,
    votes: { "busy-slot": "FEASIBLE" },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await seedScheduler({
    id: busyTargetId,
    title: "E2E Busy Target Poll",
    pendingEmails: [],
    participantIds: [participantId, inviteeId],
    creatorId: inviteeId,
    creatorEmail: inviteeEmail,
    seedDefaultSlots: false,
  });
  await db.doc(`schedulers/${busyTargetId}/slots/target-slot`).set({
    start: busyTargetStart.toISOString(),
    end: busyTargetEnd.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });
  await db.doc(`schedulers/${busyTargetId}/votes/${participantId}`).set({
    voterId: participantId,
    userEmail: participantEmail,
    userAvatar: null,
    noTimesWork: false,
    votes: { "target-slot": "PREFERRED" },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Wait for functions triggers to populate busy windows for the owner.
  const waitForBusyWindow = async () => {
    const pollMs = 250;
    const configuredTimeoutMs = Number.parseInt(
      process.env.E2E_BUSY_WINDOW_WAIT_MS ||
        (process.env.CI ? "45000" : "8000"),
      10
    );
    const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : 8000;
    const maxTries = Math.ceil(timeoutMs / pollMs);
    for (let i = 0; i < maxTries; i++) {
      const snap = await db.doc(`usersPublic/${participantId}`).get();
      const windows = snap.exists ? snap.data()?.busyWindows || [] : [];
      if (windows.some((win) => win?.sourceSchedulerId === busyFinalizedId)) {
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Timed out waiting for busy window trigger after ${timeoutMs}ms`);
  };
  await waitForBusyWindow();

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
  await seedFriendRequest({
    id: "auto-friend-accepted",
    fromEmail: participantEmail,
    fromUserId: participantId,
    fromDisplayName: "Owner",
    toEmail: notifierEmail,
    toUserId: notifierId,
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
  await seedGroup({
    id: discordRepostGroupId,
    name: "E2E Discord Repost Group",
    pendingEmail: null,
    memberIds: [participantId, inviteeId],
    discord: {
      guildId: "e2e-guild-repost",
      channelId: "e2e-channel-repost",
    },
  });
  await seedGroup({
    id: "auto-group-accepted",
    name: "Auto Group Accepted",
    pendingEmail: notifierEmail,
  });
  await seedGroup({
    id: "auto-group-declined",
    name: "Auto Group Declined",
    pendingEmail: notifierEmail,
  });
  await seedGroup({
    id: "auto-group-deleted",
    name: "Auto Group Deleted",
    pendingEmail: notifierEmail,
  });

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  await db.doc(`questingGroups/${basicGroupId}/basicPolls/${basicStandalonePollId}`).set({
    title: "E2E Standalone Basic Poll",
    description: "Choose one option.",
    creatorId: participantId,
    status: "OPEN",
    settings: {
      voteType: "MULTIPLE_CHOICE",
      allowMultiple: false,
      allowWriteIn: false,
      deadlineAt: nextWeek,
    },
    options: [
      { id: "pizza", label: "Pizza", order: 0 },
      { id: "tacos", label: "Tacos", order: 1 },
      { id: "curry", label: "Curry", order: 2 },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`questingGroups/${basicGroupId}/basicPolls/${basicRankedPollId}`).set({
    title: "E2E Ranked Basic Poll",
    description: "Rank your campaign choices.",
    creatorId: participantId,
    status: "OPEN",
    settings: {
      voteType: "RANKED_CHOICE",
      allowMultiple: false,
      allowWriteIn: false,
      deadlineAt: nextWeek,
    },
    options: [
      { id: "strahd", label: "Curse of Strahd", order: 0 },
      { id: "tomb", label: "Tomb of Annihilation", order: 1 },
      { id: "wild", label: "The Wild Beyond the Witchlight", order: 2 },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`questingGroups/${basicGroupId}/basicPolls/${basicDeadlinePollId}`).set({
    title: "E2E Deadline Closed Poll",
    description: "Voting should be closed due to deadline.",
    creatorId: participantId,
    status: "OPEN",
    settings: {
      voteType: "MULTIPLE_CHOICE",
      allowMultiple: false,
      allowWriteIn: false,
      deadlineAt: yesterday,
    },
    options: [
      { id: "a", label: "Option A", order: 0 },
      { id: "b", label: "Option B", order: 1 },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`questingGroups/${basicGroupId}/basicPolls/${basicDashboardPollId}`).set({
    title: "E2E Dashboard Group Poll",
    description: "Should appear in dashboard unvoted list.",
    creatorId: participantId,
    status: "OPEN",
    settings: {
      voteType: "MULTIPLE_CHOICE",
      allowMultiple: false,
      allowWriteIn: false,
      deadlineAt: tomorrow,
    },
    options: [
      { id: "d1", label: "Friday", order: 0 },
      { id: "d2", label: "Saturday", order: 1 },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`schedulers/${schedulerId}/basicPolls/${embeddedBasicPollId}`).set({
    title: "E2E Embedded Required Poll",
    description: "**Required** embedded poll for dashboard + deep-link coverage.",
    creatorId: participantId,
    required: true,
    order: 0,
    settings: {
      voteType: "MULTIPLE_CHOICE",
      allowMultiple: false,
      allowWriteIn: false,
      deadlineAt: nextWeek,
    },
    options: [
      { id: "e1", label: "In person", order: 0, note: "Bring **physical dice** and minis." },
      { id: "e2", label: "Online", order: 1 },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db
    .doc(`schedulers/${embeddedEditorSchedulerId}/basicPolls/${embeddedEditorPollId}`)
    .set({
      title: "E2E Embedded Editable Poll",
      description: "Poll used for embedded add/edit/remove e2e coverage.",
      creatorId: participantId,
      required: false,
      order: 0,
      settings: {
        voteType: "MULTIPLE_CHOICE",
        allowMultiple: false,
        allowWriteIn: false,
        deadlineAt: nextWeek,
      },
      options: [
        { id: "ep1", label: "Option Alpha", order: 0 },
        { id: "ep2", label: "Option Beta", order: 1 },
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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
