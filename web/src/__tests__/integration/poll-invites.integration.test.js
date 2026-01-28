import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { acceptPollInvite, removeParticipantFromPoll } from '../../lib/data/pollInvites';
import { ensureUserProfile } from '../../lib/data/users';

const projectId = 'studio-473406021-87ead';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const firestoreRules = readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');

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

test('acceptPollInvite adds participantId and clears pending invite', async () => {
  const schedulerId = 'integration-scheduler-invite';
  const email = 'invitee@example.com';
  const password = 'password123';
  const user = await signInTestUser(email, password);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'schedulers', schedulerId), {
      title: 'Integration Poll',
      creatorId: 'creator1',
      creatorEmail: 'creator@example.com',
      status: 'OPEN',
      participantIds: [],
      pendingInvites: [email],
      allowLinkSharing: false,
      createdAt: new Date(),
    });
  });

  await acceptPollInvite(schedulerId, email, user.uid);

  const snap = await getDoc(doc(db, 'schedulers', schedulerId));
  expect(snap.exists()).toBe(true);
  expect(snap.data().participantIds).toContain(user.uid);
  expect(snap.data().pendingInvites || []).not.toContain(email);
});

test('removeParticipantFromPoll removes participantId and votes', async () => {
  const schedulerId = 'integration-scheduler-remove';
  const email = 'remove@example.com';
  const password = 'password123';
  const user = await signInTestUser(email, password);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'schedulers', schedulerId), {
      title: 'Integration Poll',
      creatorId: user.uid,
      creatorEmail: email,
      status: 'OPEN',
      participantIds: [user.uid],
      pendingInvites: [],
      allowLinkSharing: false,
      createdAt: new Date(),
    });
    await setDoc(doc(context.firestore(), 'schedulers', schedulerId, 'votes', user.uid), {
      userEmail: email,
      votes: { slot1: 'FEASIBLE' },
    });
  });

  await removeParticipantFromPoll(schedulerId, email, true, false, null);

  const schedulerSnap = await getDoc(doc(db, 'schedulers', schedulerId));
  expect(schedulerSnap.data().participantIds || []).not.toContain(user.uid);
  const voteSnap = await getDoc(doc(db, 'schedulers', schedulerId, 'votes', user.uid));
  expect(voteSnap.exists()).toBe(false);
});
