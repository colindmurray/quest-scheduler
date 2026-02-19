import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { ensureUserProfile } from "../../lib/data/users";
import { deleteQuestingGroup } from "../../lib/data/questingGroups";
import { deleteSchedulerWithRelatedData } from "../../lib/data/schedulers";
import {
  createEmbeddedBasicPoll,
  createBasicPoll,
  deleteBasicPollVote,
  deleteBasicPoll,
  deleteEmbeddedBasicPoll,
  finalizeEmbeddedBasicPoll,
  finalizeBasicPoll,
  reorderEmbeddedBasicPolls,
  reopenEmbeddedBasicPoll,
  reopenBasicPoll,
  submitBasicPollVote,
  subscribeToBasicPoll,
  subscribeToBasicPollVotes,
  subscribeToEmbeddedBasicPolls,
  subscribeToGroupPolls,
  subscribeToMyBasicPollVote,
  updateEmbeddedBasicPoll,
  updateBasicPoll,
} from "../../lib/data/basicPolls";

const projectId = "studio-473406021-87ead";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const firestoreRules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");

let testEnv;

function uniqueEmail(prefix) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return `${prefix}-${stamp}@example.com`;
}

async function registerUser(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(result.user);
  await signOut(auth);
  return result.user;
}

async function signInUser(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

function waitForGroupPollSnapshot(groupId, predicate = (polls) => polls.length > 0) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for group poll snapshot"));
    }, 5000);

    unsubscribe = subscribeToGroupPolls(
      groupId,
      (polls) => {
        if (!predicate(polls)) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(polls);
      },
      (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      }
    );
  });
}

function waitForBasicPollSnapshot(groupId, pollId, predicate = (poll) => Boolean(poll)) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for basic poll snapshot"));
    }, 5000);

    unsubscribe = subscribeToBasicPoll(
      groupId,
      pollId,
      (poll) => {
        if (!predicate(poll)) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(poll);
      },
      (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      }
    );
  });
}

function waitForBasicPollVotesSnapshot(
  parentType,
  parentId,
  pollId,
  predicate = (votes) => votes.length > 0
) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for basic poll votes snapshot"));
    }, 5000);

    unsubscribe = subscribeToBasicPollVotes(
      parentType,
      parentId,
      pollId,
      (votes) => {
        if (!predicate(votes)) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(votes);
      },
      (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      }
    );
  });
}

function waitForMyBasicPollVoteSnapshot(
  parentType,
  parentId,
  pollId,
  userId,
  predicate = (vote) => Boolean(vote)
) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for my basic poll vote snapshot"));
    }, 5000);

    unsubscribe = subscribeToMyBasicPollVote(
      parentType,
      parentId,
      pollId,
      userId,
      (vote) => {
        if (!predicate(vote)) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(vote);
      },
      (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      }
    );
  });
}

function waitForEmbeddedBasicPollsSnapshot(
  schedulerId,
  predicate = (polls) => polls.length > 0
) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for embedded basic polls snapshot"));
    }, 5000);

    unsubscribe = subscribeToEmbeddedBasicPolls(
      schedulerId,
      (polls) => {
        if (!predicate(polls)) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(polls);
      },
      (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      }
    );
  });
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

test("basic poll CRUD helpers work end-to-end with vote cleanup", async () => {
  const password = "password123";
  const managerEmail = uniqueEmail("basic-poll-manager");
  const memberEmail = uniqueEmail("basic-poll-member");
  const manager = await registerUser(managerEmail, password);
  const member = await registerUser(memberEmail, password);

  const groupId = "integration-basic-poll-group-crud";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "questingGroups", groupId), {
      name: "Integration Group",
      creatorId: manager.uid,
      creatorEmail: managerEmail,
      memberManaged: false,
      memberIds: [manager.uid, member.uid],
      pendingInvites: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(managerEmail, password);

  const pollId = await createBasicPoll(groupId, {
    title: "Choose campaign",
    description: "Pick one",
    settings: { voteType: "MULTIPLE_CHOICE" },
    options: [{ id: "opt-1", label: "Option 1", order: 0 }],
  });

  expect(pollId).toBeTruthy();

  await updateBasicPoll(groupId, pollId, { title: "Updated campaign vote" });
  await finalizeBasicPoll(groupId, pollId);

  const finalizedSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  expect(finalizedSnap.exists()).toBe(true);
  expect(finalizedSnap.data().status).toBe("FINALIZED");
  expect(finalizedSnap.data().title).toBe("Updated campaign vote");

  await reopenBasicPoll(groupId, pollId);

  const reopenedSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  expect(reopenedSnap.exists()).toBe(true);
  expect(reopenedSnap.data().status).toBe("OPEN");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId, "votes", manager.uid),
      {
        optionIds: ["opt-1"],
        updatedAt: new Date(),
      }
    );
    await setDoc(
      doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid),
      {
        optionIds: ["opt-1"],
        updatedAt: new Date(),
      }
    );
  });

  await deleteBasicPoll(groupId, pollId);

  const pollSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  const managerVoteSnap = await getDoc(
    doc(db, "questingGroups", groupId, "basicPolls", pollId, "votes", manager.uid)
  );
  const memberVoteSnap = await getDoc(
    doc(db, "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid)
  );

  expect(pollSnap.exists()).toBe(false);
  expect(managerVoteSnap.exists()).toBe(false);
  expect(memberVoteSnap.exists()).toBe(false);
});

test("basic poll privacy settings persist and normalize on update", async () => {
  const password = "password123";
  const managerEmail = uniqueEmail("basic-poll-privacy-manager");
  const memberEmail = uniqueEmail("basic-poll-privacy-member");
  const manager = await registerUser(managerEmail, password);
  const member = await registerUser(memberEmail, password);
  const groupId = "integration-basic-poll-privacy";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "questingGroups", groupId), {
      name: "Privacy Group",
      creatorId: manager.uid,
      creatorEmail: managerEmail,
      memberManaged: false,
      memberIds: [manager.uid, member.uid],
      pendingInvites: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(managerEmail, password);
  const pollId = await createBasicPoll(groupId, {
    title: "Privacy poll",
    settings: { voteType: "MULTIPLE_CHOICE" },
    options: [
      { id: "opt-1", label: "One", order: 0 },
      { id: "opt-2", label: "Two", order: 1 },
    ],
    voteVisibility: "hidden_until_all_voted",
    hideVoterIdentities: true,
    voteAnonymization: "creator_excluded",
  });

  const createdSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  expect(createdSnap.exists()).toBe(true);
  expect(createdSnap.data()).toEqual(
    expect.objectContaining({
      voteVisibility: "hidden_until_all_voted",
      hideVoterIdentities: true,
      voteAnonymization: "creator_excluded",
    })
  );

  await updateBasicPoll(groupId, pollId, {
    voteVisibility: "full_visibility",
    hideVoterIdentities: true,
    voteAnonymization: "all_participants",
  });

  const updatedSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  expect(updatedSnap.exists()).toBe(true);
  expect(updatedSnap.data()).toEqual(
    expect.objectContaining({
      voteVisibility: "full_visibility",
      hideVoterIdentities: false,
      voteAnonymization: "all_participants",
    })
  );
});

test("finalized group poll snapshots remain stable after vote docs are deleted", async () => {
  const password = "password123";
  const managerEmail = uniqueEmail("basic-poll-finalize-manager");
  const memberEmail = uniqueEmail("basic-poll-finalize-member");
  const manager = await registerUser(managerEmail, password);
  const member = await registerUser(memberEmail, password);
  const groupId = "integration-basic-poll-final-results";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "questingGroups", groupId), {
      name: "Snapshot Group",
      creatorId: manager.uid,
      creatorEmail: managerEmail,
      memberManaged: false,
      memberIds: [manager.uid, member.uid],
      pendingInvites: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(managerEmail, password);
  const pollId = await createBasicPoll(groupId, {
    title: "Finalized snapshot poll",
    status: "OPEN",
    settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false, allowWriteIn: true },
    options: [
      { id: "opt-1", label: "Pizza", order: 0 },
      { id: "opt-2", label: "Burgers", order: 1 },
    ],
  });

  await submitBasicPollVote("group", groupId, pollId, manager.uid, {
    optionIds: ["opt-1"],
    source: "web",
  });

  await signInUser(memberEmail, password);
  await submitBasicPollVote("group", groupId, pollId, member.uid, {
    optionIds: ["opt-2"],
    otherText: "Tacos",
    source: "web",
  });

  await signInUser(managerEmail, password);
  await finalizeBasicPoll(groupId, pollId);

  const finalizedSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  expect(finalizedSnap.exists()).toBe(true);
  const finalizedData = finalizedSnap.data() || {};
  expect(finalizedData.status).toBe("FINALIZED");
  expect(finalizedData.finalResults).toEqual(
    expect.objectContaining({
      voteType: "MULTIPLE_CHOICE",
      voterCount: 2,
      winnerIds: expect.arrayContaining(["opt-1", "opt-2", "write-in:tacos"]),
      rows: expect.arrayContaining([
        expect.objectContaining({ key: "opt-1", count: 1 }),
        expect.objectContaining({ key: "opt-2", count: 1 }),
        expect.objectContaining({ key: "write-in:tacos", count: 1 }),
      ]),
    })
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      deleteDoc(
        doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId, "votes", manager.uid)
      ),
      deleteDoc(
        doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid)
      ),
    ]);
  });

  const postDeleteSnap = await getDoc(doc(db, "questingGroups", groupId, "basicPolls", pollId));
  expect(postDeleteSnap.exists()).toBe(true);
  expect(postDeleteSnap.data().finalResults).toEqual(finalizedData.finalResults);
});

test("basic poll subscribe helpers stream group and single-poll updates", async () => {
  const password = "password123";
  const managerEmail = uniqueEmail("basic-poll-subscriber");
  const manager = await registerUser(managerEmail, password);
  const groupId = "integration-basic-poll-group-subscribe";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "questingGroups", groupId), {
      name: "Integration Group",
      creatorId: manager.uid,
      creatorEmail: managerEmail,
      memberManaged: false,
      memberIds: [manager.uid],
      pendingInvites: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(managerEmail, password);

  const pollId = await createBasicPoll(groupId, {
    title: "Streaming poll",
    settings: { voteType: "MULTIPLE_CHOICE" },
    options: [{ id: "opt-1", label: "Option 1", order: 0 }],
  });

  const groupPolls = await waitForGroupPollSnapshot(
    groupId,
    (polls) => polls.some((poll) => poll.id === pollId)
  );
  expect(groupPolls.some((poll) => poll.id === pollId)).toBe(true);

  const poll = await waitForBasicPollSnapshot(groupId, pollId);
  expect(poll?.id).toBe(pollId);
  expect(poll?.title).toBe("Streaming poll");
});

test("basic poll vote helpers support group parent with create/update/delete and subscriptions", async () => {
  const password = "password123";
  const managerEmail = uniqueEmail("basic-poll-vote-manager");
  const memberEmail = uniqueEmail("basic-poll-vote-member");
  const manager = await registerUser(managerEmail, password);
  const member = await registerUser(memberEmail, password);
  const groupId = "integration-basic-poll-group-votes";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "questingGroups", groupId), {
      name: "Integration Group",
      creatorId: manager.uid,
      creatorEmail: managerEmail,
      memberManaged: false,
      memberIds: [manager.uid, member.uid],
      pendingInvites: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(managerEmail, password);
  const pollId = await createBasicPoll(groupId, {
    title: "Vote helpers poll",
    settings: { voteType: "MULTIPLE_CHOICE" },
    options: [{ id: "opt-1", label: "Option 1", order: 0 }],
  });

  await signInUser(memberEmail, password);

  const votesPromise = waitForBasicPollVotesSnapshot(
    "group",
    groupId,
    pollId,
    (votes) => votes.some((vote) => vote.id === member.uid)
  );
  const myVotePromise = waitForMyBasicPollVoteSnapshot("group", groupId, pollId, member.uid);

  await submitBasicPollVote("group", groupId, pollId, member.uid, {
    optionIds: ["opt-1"],
    source: "web",
  });

  const votes = await votesPromise;
  const myVote = await myVotePromise;
  expect(votes.some((vote) => vote.id === member.uid)).toBe(true);
  expect(myVote?.optionIds).toEqual(["opt-1"]);

  await submitBasicPollVote("group", groupId, pollId, member.uid, {
    optionIds: ["opt-2"],
    source: "web",
  });
  const updatedVoteSnap = await getDoc(
    doc(db, "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid)
  );
  expect(updatedVoteSnap.exists()).toBe(true);
  expect(updatedVoteSnap.data().optionIds).toEqual(["opt-2"]);

  const voteClearedPromise = waitForMyBasicPollVoteSnapshot(
    "group",
    groupId,
    pollId,
    member.uid,
    (vote) => vote === null
  );
  await deleteBasicPollVote("group", groupId, pollId, member.uid);
  await voteClearedPromise;

  const removedVoteSnap = await getDoc(
    doc(db, "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid)
  );
  expect(removedVoteSnap.exists()).toBe(false);
});

test("basic poll vote helpers support scheduler parent paths", async () => {
  const password = "password123";
  const creatorEmail = uniqueEmail("embedded-poll-creator");
  const participantEmail = uniqueEmail("embedded-poll-participant");
  const creator = await registerUser(creatorEmail, password);
  const participant = await registerUser(participantEmail, password);
  const schedulerId = "integration-basic-poll-scheduler-votes";
  const pollId = "embedded-poll-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Embedded Poll Scheduler",
      creatorId: creator.uid,
      creatorEmail,
      status: "OPEN",
      participantIds: [participant.uid],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "basicPolls", pollId), {
      title: "Embedded Poll",
      creatorId: creator.uid,
      deadlineAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(participantEmail, password);

  await submitBasicPollVote("scheduler", schedulerId, pollId, participant.uid, {
    rankings: ["opt-1"],
    source: "web",
  });

  const voteSnap = await getDoc(
    doc(db, "schedulers", schedulerId, "basicPolls", pollId, "votes", participant.uid)
  );
  expect(voteSnap.exists()).toBe(true);
  expect(voteSnap.data().rankings).toEqual(["opt-1"]);

  await deleteBasicPollVote("scheduler", schedulerId, pollId, participant.uid);

  const deletedVoteSnap = await getDoc(
    doc(db, "schedulers", schedulerId, "basicPolls", pollId, "votes", participant.uid)
  );
  expect(deletedVoteSnap.exists()).toBe(false);

  await signOut(auth);
  await signInUser(creatorEmail, password);
  await finalizeEmbeddedBasicPoll(schedulerId, pollId);

  const finalizedPollSnap = await getDoc(
    doc(db, "schedulers", schedulerId, "basicPolls", pollId)
  );
  expect(finalizedPollSnap.exists()).toBe(true);
  expect(finalizedPollSnap.data().status).toBe("FINALIZED");

  await signOut(auth);
  await signInUser(participantEmail, password);
  await expect(
    submitBasicPollVote("scheduler", schedulerId, pollId, participant.uid, {
      rankings: ["opt-1"],
      source: "web",
    })
  ).rejects.toBeTruthy();

  await signOut(auth);
  await signInUser(creatorEmail, password);
  await reopenEmbeddedBasicPoll(schedulerId, pollId);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "schedulers", schedulerId),
      {
        title: "Embedded Poll Scheduler",
        creatorId: creator.uid,
        creatorEmail,
        status: "FINALIZED",
        participantIds: [participant.uid],
        pendingInvites: [],
        allowLinkSharing: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });

  await signOut(auth);
  await signInUser(participantEmail, password);
  await submitBasicPollVote("scheduler", schedulerId, pollId, participant.uid, {
    rankings: ["opt-1"],
    source: "web",
  });

  const voteAfterSchedulerFinalizeSnap = await getDoc(
    doc(db, "schedulers", schedulerId, "basicPolls", pollId, "votes", participant.uid)
  );
  expect(voteAfterSchedulerFinalizeSnap.exists()).toBe(true);
  expect(voteAfterSchedulerFinalizeSnap.data().rankings).toEqual(["opt-1"]);
});

test("deleteQuestingGroup removes group-linked basic polls and vote subdocs", async () => {
  const password = "password123";
  const creatorEmail = uniqueEmail("group-delete-creator");
  const memberEmail = uniqueEmail("group-delete-member");
  const creator = await registerUser(creatorEmail, password);
  const member = await registerUser(memberEmail, password);
  const groupId = "integration-group-delete-basic-polls";
  const pollId = "group-basic-poll-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "questingGroups", groupId), {
      name: "Delete Group",
      creatorId: creator.uid,
      creatorEmail,
      memberManaged: false,
      memberIds: [creator.uid, member.uid],
      pendingInvites: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId), {
      title: "Group poll",
      creatorId: creator.uid,
      status: "OPEN",
      deadlineAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(
      doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid),
      {
        optionIds: ["opt-a"],
        updatedAt: new Date(),
      }
    );
  });

  await signInUser(creatorEmail, password);
  await deleteQuestingGroup(groupId);

  let groupSnap;
  let pollSnap;
  let voteSnap;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    [groupSnap, pollSnap, voteSnap] = await Promise.all([
      getDoc(doc(context.firestore(), "questingGroups", groupId)),
      getDoc(doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId)),
      getDoc(
        doc(context.firestore(), "questingGroups", groupId, "basicPolls", pollId, "votes", member.uid)
      ),
    ]);
  });

  expect(groupSnap.exists()).toBe(false);
  expect(pollSnap.exists()).toBe(false);
  expect(voteSnap.exists()).toBe(false);
});

test("deleteSchedulerWithRelatedData removes scheduler slots, votes, and embedded basic polls", async () => {
  const password = "password123";
  const creatorEmail = uniqueEmail("scheduler-delete-creator");
  const participantEmail = uniqueEmail("scheduler-delete-participant");
  const creator = await registerUser(creatorEmail, password);
  const participant = await registerUser(participantEmail, password);
  const schedulerId = "integration-scheduler-delete-basic-polls";
  const pollId = "embedded-delete-poll-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Delete Scheduler",
      creatorId: creator.uid,
      creatorEmail,
      status: "OPEN",
      participantIds: [participant.uid],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "slots", "slot-1"), {
      label: "Slot 1",
      startAt: new Date(),
      endAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", participant.uid), {
      votes: { "slot-1": "FEASIBLE" },
      updatedAt: new Date(),
    });
    await setDoc(doc(context.firestore(), "schedulers", schedulerId, "basicPolls", pollId), {
      title: "Embedded delete poll",
      creatorId: creator.uid,
      deadlineAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(
      doc(context.firestore(), "schedulers", schedulerId, "basicPolls", pollId, "votes", participant.uid),
      {
        optionIds: ["opt-a"],
        updatedAt: new Date(),
      }
    );
  });

  await signInUser(creatorEmail, password);
  await deleteSchedulerWithRelatedData(schedulerId);

  let schedulerSnap;
  let slotSnap;
  let voteSnap;
  let pollSnap;
  let pollVoteSnap;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    [schedulerSnap, slotSnap, voteSnap, pollSnap, pollVoteSnap] = await Promise.all([
      getDoc(doc(context.firestore(), "schedulers", schedulerId)),
      getDoc(doc(context.firestore(), "schedulers", schedulerId, "slots", "slot-1")),
      getDoc(doc(context.firestore(), "schedulers", schedulerId, "votes", participant.uid)),
      getDoc(doc(context.firestore(), "schedulers", schedulerId, "basicPolls", pollId)),
      getDoc(
        doc(context.firestore(), "schedulers", schedulerId, "basicPolls", pollId, "votes", participant.uid)
      ),
    ]);
  });

  expect(schedulerSnap.exists()).toBe(false);
  expect(slotSnap.exists()).toBe(false);
  expect(voteSnap.exists()).toBe(false);
  expect(pollSnap.exists()).toBe(false);
  expect(pollVoteSnap.exists()).toBe(false);
});

test("embedded basic poll CRUD/reorder/subscribe helpers work for scheduler parent", async () => {
  const password = "password123";
  const creatorEmail = uniqueEmail("embedded-crud-creator");
  const participantEmail = uniqueEmail("embedded-crud-participant");
  const creator = await registerUser(creatorEmail, password);
  const participant = await registerUser(participantEmail, password);
  const schedulerId = "integration-embedded-poll-crud";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Scheduler for Embedded CRUD",
      creatorId: creator.uid,
      creatorEmail,
      status: "OPEN",
      participantIds: [participant.uid],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await signInUser(creatorEmail, password);

  const pollA = await createEmbeddedBasicPoll(schedulerId, {
    title: "Poll A",
    order: 0,
    voteVisibility: "hidden_while_voting",
    hideVoterIdentities: true,
    voteAnonymization: "creator_excluded",
    options: [{ id: "opt-a", label: "A", order: 0 }],
  });
  const pollB = await createEmbeddedBasicPoll(schedulerId, {
    title: "Poll B",
    order: 1,
    options: [{ id: "opt-b", label: "B", order: 0 }],
  });
  const pollC = await createEmbeddedBasicPoll(schedulerId, {
    title: "Poll C",
    order: 2,
    options: [{ id: "opt-c", label: "C", order: 0 }],
  });

  const subscribedPolls = await waitForEmbeddedBasicPollsSnapshot(
    schedulerId,
    (polls) => polls.length >= 3
  );
  expect(subscribedPolls.length).toBeGreaterThanOrEqual(3);

  const createdPollASnap = await getDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollA));
  expect(createdPollASnap.exists()).toBe(true);
  expect(createdPollASnap.data()).toEqual(
    expect.objectContaining({
      voteVisibility: "hidden_while_voting",
      hideVoterIdentities: true,
      voteAnonymization: "creator_excluded",
    })
  );

  await updateEmbeddedBasicPoll(schedulerId, pollB, {
    required: true,
    voteVisibility: "full_visibility",
    hideVoterIdentities: true,
    voteAnonymization: "all_participants",
  });
  const updatedPollSnap = await getDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollB));
  expect(updatedPollSnap.exists()).toBe(true);
  expect(updatedPollSnap.data()).toEqual(
    expect.objectContaining({
      required: true,
      voteVisibility: "full_visibility",
      hideVoterIdentities: false,
      voteAnonymization: "all_participants",
    })
  );

  await reorderEmbeddedBasicPolls(schedulerId, [pollC, pollA, pollB]);

  const pollASnap = await getDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollA));
  const pollBSnap = await getDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollB));
  const pollCSnap = await getDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollC));
  expect(pollCSnap.data().order).toBe(0);
  expect(pollASnap.data().order).toBe(1);
  expect(pollBSnap.data().order).toBe(2);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "schedulers", schedulerId, "basicPolls", pollB, "votes", participant.uid),
      {
        optionIds: ["opt-b"],
        updatedAt: new Date(),
      }
    );
  });

  await deleteEmbeddedBasicPoll(schedulerId, pollB);

  const deletedPollSnap = await getDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollB));
  const deletedVoteSnap = await getDoc(
    doc(db, "schedulers", schedulerId, "basicPolls", pollB, "votes", participant.uid)
  );
  expect(deletedPollSnap.exists()).toBe(false);
  expect(deletedVoteSnap.exists()).toBe(false);
});
