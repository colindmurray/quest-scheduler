import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { fetchSchedulerVotes, fetchUserSchedulerVote, upsertSchedulerVote } from "../../lib/data/schedulers";
import { ensureUserProfile } from "../../lib/data/users";
import { hasSubmittedSchedulerVote } from "../../lib/vote-utils";

const projectId = "studio-473406021-87ead";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const firestoreRules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");

let testEnv;

async function signInTestUser(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(result.user);
  return result.user;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  if (auth.currentUser) {
    await signOut(auth);
  }
});

afterAll(async () => {
  await testEnv.cleanup();
});

test("scheduler submitted-vote semantics treat empty vote docs as pending", async () => {
  const schedulerId = "integration-scheduler-empty-votes-pending";
  const email = "owner-empty-votes@example.com";
  const password = "password123";
  const owner = await signInTestUser(email, password);
  const pendingUserId = "pending-user";
  const unavailableUserId = "unavailable-user";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Integration Vote Semantics Poll",
      creatorId: owner.uid,
      creatorEmail: email,
      status: "OPEN",
      participantIds: [owner.uid, pendingUserId, unavailableUserId],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "slots", "slot-1"), {
      start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      stats: { feasible: 0, preferred: 0 },
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", owner.uid), {
      voterId: owner.uid,
      userEmail: email,
      noTimesWork: false,
      votes: { "slot-1": "FEASIBLE" },
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", pendingUserId), {
      voterId: pendingUserId,
      userEmail: "pending@example.com",
      noTimesWork: false,
      votes: {},
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", unavailableUserId), {
      voterId: unavailableUserId,
      userEmail: "unavailable@example.com",
      noTimesWork: true,
      votes: {},
    });
  });

  const voteDocs = await fetchSchedulerVotes(schedulerId);
  const submittedIds = voteDocs
    .filter((voteDoc) => hasSubmittedSchedulerVote(voteDoc))
    .map((voteDoc) => voteDoc.id)
    .sort();

  expect(submittedIds).toEqual([owner.uid, unavailableUserId].sort());
});

test("hidden_while_voting blocks full vote-list reads until participant submits a vote", async () => {
  const schedulerId = "integration-scheduler-hidden-while";
  const creatorEmail = "owner-hidden-while@example.com";
  const participantEmail = "participant-hidden-while@example.com";
  const password = "password123";
  const creator = await signInTestUser(creatorEmail, password);
  await signOut(auth);
  const participant = await signInTestUser(participantEmail, password);
  const otherParticipantId = "other-hidden-while";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Integration Hidden While Voting",
      creatorId: creator.uid,
      creatorEmail,
      status: "OPEN",
      voteVisibility: "hidden_while_voting",
      participantIds: [participant.uid, otherParticipantId],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", participant.uid), {
      voterId: participant.uid,
      userEmail: participantEmail,
      noTimesWork: false,
      votes: {},
      updatedAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", otherParticipantId), {
      voterId: otherParticipantId,
      userEmail: "other-hidden-while@example.com",
      noTimesWork: true,
      votes: {},
      updatedAt: new Date(),
    });
  });

  await expect(fetchSchedulerVotes(schedulerId)).rejects.toMatchObject({
    code: "permission-denied",
  });

  const myVote = await fetchUserSchedulerVote(schedulerId, participant.uid);
  expect(myVote?.id).toBe(participant.uid);

  await upsertSchedulerVote(schedulerId, participant.uid, {
    voterId: participant.uid,
    userEmail: participantEmail,
    noTimesWork: false,
    votes: { "slot-1": "FEASIBLE" },
    updatedAt: new Date(),
  });

  const visibleVotes = await fetchSchedulerVotes(schedulerId);
  expect(visibleVotes.map((voteDoc) => voteDoc.id).sort()).toEqual(
    [participant.uid, otherParticipantId].sort()
  );
});

test("hidden vote mode still allows creator to fetch all votes", async () => {
  const schedulerId = "integration-scheduler-hidden-creator";
  const creatorEmail = "owner-hidden-creator@example.com";
  const participantId = "participant-hidden-creator";
  const password = "password123";
  const creator = await signInTestUser(creatorEmail, password);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Integration Hidden Creator",
      creatorId: creator.uid,
      creatorEmail,
      status: "OPEN",
      voteVisibility: "hidden",
      participantIds: [participantId],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", participantId), {
      voterId: participantId,
      userEmail: "participant-hidden-creator@example.com",
      noTimesWork: true,
      votes: {},
      updatedAt: new Date(),
    });
  });

  const voteDocs = await fetchSchedulerVotes(schedulerId);
  expect(voteDocs.map((voteDoc) => voteDoc.id)).toContain(participantId);
});
