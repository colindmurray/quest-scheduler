import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const projectId = 'quest-scheduler-test';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const firestoreRules = readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
const storageRules = readFileSync(path.join(repoRoot, 'storage.rules'), 'utf8');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore rules', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  test('users: owner can read/write; protected fields are blocked', async () => {
    const alice = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });
    const bob = testEnv.authenticatedContext('bob', {
      email: 'bob@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), {
        displayName: 'Alice',
      });
    });

    await assertSucceeds(getDoc(doc(alice.firestore(), 'users', 'alice')));
    await assertFails(getDoc(doc(bob.firestore(), 'users', 'alice')));

    await assertSucceeds(
      updateDoc(doc(alice.firestore(), 'users', 'alice'), {
        displayName: 'Alice Updated',
      })
    );

    await assertFails(
      updateDoc(doc(alice.firestore(), 'users', 'alice'), {
        inviteAllowance: 3,
      })
    );
  });

  test('questingGroups: create requires verified email', async () => {
    const unverified = testEnv.authenticatedContext('eve', {
      email: 'eve@example.com',
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    });
    const verified = testEnv.authenticatedContext('vera', {
      email: 'vera@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    });

    await assertFails(
      setDoc(doc(unverified.firestore(), 'questingGroups', 'group1'), {
        creatorId: 'eve',
        memberIds: ['eve'],
      })
    );

    await assertSucceeds(
      setDoc(doc(verified.firestore(), 'questingGroups', 'group2'), {
        creatorId: 'vera',
        memberIds: ['vera'],
        memberManaged: false,
      })
    );
  });

  test('schedulers: link sharing still requires sign-in', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched1'), {
        creatorId: 'owner1',
        allowLinkSharing: true,
      });
    });

    const signedIn = testEnv.authenticatedContext('viewer', {
      email: 'viewer@example.com',
      email_verified: true,
    });
    const anon = testEnv.unauthenticatedContext();

    await assertSucceeds(getDoc(doc(signedIn.firestore(), 'schedulers', 'sched1')));
    await assertFails(getDoc(doc(anon.firestore(), 'schedulers', 'sched1')));
  });

  test('notifications: create requires allowed type + unread flags', async () => {
    const alice = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users', 'alice', 'notifications', 'n1'), {
        type: 'FRIEND_REQUEST',
        read: false,
        dismissed: false,
      })
    );

    await assertFails(
      setDoc(doc(alice.firestore(), 'users', 'alice', 'notifications', 'n2'), {
        type: 'FRIEND_REQUEST',
        read: true,
        dismissed: false,
      })
    );
  });
});

describe('Storage rules', () => {
  test('profile uploads enforce owner, size, and content type', async () => {
    const alice = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });
    const bob = testEnv.authenticatedContext('bob', {
      email: 'bob@example.com',
      email_verified: true,
    });

    const aliceStorage = alice.storage();
    const bobStorage = bob.storage();

    await assertSucceeds(
      uploadBytes(
        ref(aliceStorage, 'profiles/alice/avatar.png'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/png' }
      )
    );

    await assertFails(
      uploadBytes(
        ref(bobStorage, 'profiles/alice/other.png'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/png' }
      )
    );

    await assertFails(
      uploadBytes(
        ref(aliceStorage, 'profiles/alice/too-large.png'),
        new Uint8Array(2 * 1024 * 1024 + 1),
        { contentType: 'image/png' }
      )
    );

    await assertFails(
      uploadBytes(
        ref(aliceStorage, 'profiles/alice/bad-type.gif'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/gif' }
      )
    );
  });
});
