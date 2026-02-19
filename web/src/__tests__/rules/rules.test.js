import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

  test('usersPublic: signed-in users can read; owners cannot write busyWindows', async () => {
    const alice = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });
    const bob = testEnv.authenticatedContext('bob', {
      email: 'bob@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'usersPublic', 'bob'), {
        email: 'bob@example.com',
        displayName: 'Bob',
        busyWindows: [
          {
            startUtc: '2026-02-10T20:00:00.000Z',
            endUtc: '2026-02-10T22:00:00.000Z',
            sourceSchedulerId: 'schedA',
            sourceWinningSlotId: 'slot1',
            priorityAtMs: 1,
          },
        ],
      });
    });

    await assertSucceeds(getDoc(doc(alice.firestore(), 'usersPublic', 'bob')));
    await assertSucceeds(
      updateDoc(doc(bob.firestore(), 'usersPublic', 'bob'), {
        displayName: 'Bob Updated',
      })
    );

    await assertFails(
      updateDoc(doc(bob.firestore(), 'usersPublic', 'bob'), {
        busyWindows: [],
      })
    );

    await assertFails(
      setDoc(doc(alice.firestore(), 'usersPublic', 'alice'), {
        email: 'alice@example.com',
        busyWindows: [],
      })
    );

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'usersPublic', 'alice'), {
        email: 'alice@example.com',
        displayName: 'Alice',
      })
    );
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
    const discordUser = testEnv.authenticatedContext('dora', {
      email: 'dora@example.com',
      email_verified: false,
      firebase: { sign_in_provider: 'custom' },
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

    await assertSucceeds(
      setDoc(doc(discordUser.firestore(), 'questingGroups', 'group3'), {
        creatorId: 'dora',
        memberIds: ['dora'],
        memberManaged: false,
      })
    );
  });

  test('questingGroups: invitee can accept or decline pending invite', async () => {
    const invitee = testEnv.authenticatedContext('invitee', {
      email: 'invitee@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-accept'), {
        name: 'Group Accept',
        creatorId: 'creator1',
        creatorEmail: 'creator@example.com',
        memberManaged: false,
        memberIds: ['creator1'],
        pendingInvites: ['invitee@example.com'],
        pendingInviteMeta: {
          'invitee@example.com': { invitedByEmail: 'creator@example.com' },
        },
      });
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-decline'), {
        name: 'Group Decline',
        creatorId: 'creator1',
        creatorEmail: 'creator@example.com',
        memberManaged: false,
        memberIds: ['creator1'],
        pendingInvites: ['invitee@example.com'],
        pendingInviteMeta: {
          'invitee@example.com': { invitedByEmail: 'creator@example.com' },
        },
      });
    });

    await assertSucceeds(
      updateDoc(doc(invitee.firestore(), 'questingGroups', 'group-accept'), {
        memberIds: ['creator1', 'invitee'],
        pendingInvites: [],
        pendingInviteMeta: {},
        updatedAt: new Date(),
      })
    );

    await assertSucceeds(
      updateDoc(doc(invitee.firestore(), 'questingGroups', 'group-decline'), {
        memberIds: ['creator1'],
        pendingInvites: [],
        pendingInviteMeta: {},
        updatedAt: new Date(),
      })
    );
  });

  test('group basic polls: member read allowed, non-member denied', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
      email_verified: true,
    });
    const member = testEnv.authenticatedContext('member', {
      email: 'member@example.com',
      email_verified: true,
    });
    const outsider = testEnv.authenticatedContext('outsider', {
      email: 'outsider@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-polls-read'), {
        creatorId: 'manager',
        memberManaged: false,
        memberIds: ['manager', 'member'],
      });
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-read', 'basicPolls', 'poll-1'),
        {
          title: 'Snack vote',
          creatorId: 'manager',
          status: 'OPEN',
          deadlineAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    });

    await assertSucceeds(
      getDoc(doc(manager.firestore(), 'questingGroups', 'group-polls-read', 'basicPolls', 'poll-1'))
    );
    await assertSucceeds(
      getDoc(doc(member.firestore(), 'questingGroups', 'group-polls-read', 'basicPolls', 'poll-1'))
    );
    await assertFails(
      getDoc(doc(outsider.firestore(), 'questingGroups', 'group-polls-read', 'basicPolls', 'poll-1'))
    );
  });

  test('group basic polls: manager can create/edit/finalize/reopen/delete, non-manager denied', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
      email_verified: true,
    });
    const member = testEnv.authenticatedContext('member', {
      email: 'member@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-polls-manage'), {
        creatorId: 'manager',
        memberManaged: false,
        memberIds: ['manager', 'member'],
      });
    });

    const managerPollRef = doc(
      manager.firestore(),
      'questingGroups',
      'group-polls-manage',
      'basicPolls',
      'poll-1'
    );
    const memberPollRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-manage',
      'basicPolls',
      'poll-2'
    );

    await assertSucceeds(
      setDoc(managerPollRef, {
        title: 'Campaign vote',
        creatorId: 'manager',
        status: 'OPEN',
        deadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    await assertFails(
      setDoc(memberPollRef, {
        title: 'Unauthorized poll',
        creatorId: 'member',
        status: 'OPEN',
        deadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    await assertSucceeds(updateDoc(managerPollRef, { title: 'Updated title', updatedAt: new Date() }));
    await assertSucceeds(updateDoc(managerPollRef, { status: 'FINALIZED', updatedAt: new Date() }));
    await assertSucceeds(updateDoc(managerPollRef, { status: 'OPEN', updatedAt: new Date() }));

    await assertFails(updateDoc(doc(member.firestore(), managerPollRef.path), { status: 'FINALIZED' }));
    await assertFails(deleteDoc(doc(member.firestore(), managerPollRef.path)));

    await assertSucceeds(deleteDoc(managerPollRef));
  });

  test('group basic polls: votes are own-write-only for members', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
      email_verified: true,
    });
    const member = testEnv.authenticatedContext('member', {
      email: 'member@example.com',
      email_verified: true,
    });
    const otherMember = testEnv.authenticatedContext('other-member', {
      email: 'other-member@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-polls-votes'), {
        creatorId: 'manager',
        memberManaged: false,
        memberIds: ['manager', 'member', 'other-member'],
      });
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-votes', 'basicPolls', 'poll-1'),
        {
          title: 'Poll',
          creatorId: 'manager',
          status: 'OPEN',
          deadlineAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    });

    const ownVoteRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-votes',
      'basicPolls',
      'poll-1',
      'votes',
      'member'
    );
    const otherVoteRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-votes',
      'basicPolls',
      'poll-1',
      'votes',
      'other-member'
    );

    await assertSucceeds(
      setDoc(ownVoteRef, {
        optionIds: ['opt-a'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(otherVoteRef, {
        optionIds: ['opt-a'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(
        doc(
          manager.firestore(),
          'questingGroups',
          'group-polls-votes',
          'basicPolls',
          'poll-1',
          'votes',
          'member'
        ),
        {
          optionIds: ['opt-a'],
          updatedAt: new Date(),
        }
      )
    );

    await assertSucceeds(deleteDoc(doc(manager.firestore(), ownVoteRef.path)));
    await assertSucceeds(
      setDoc(doc(otherMember.firestore(), otherVoteRef.path), {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );
    await assertSucceeds(deleteDoc(doc(otherMember.firestore(), otherVoteRef.path)));
  });

  test('group basic polls: vote writes are blocked when finalized or deadline has passed', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
      email_verified: true,
    });
    const member = testEnv.authenticatedContext('member', {
      email: 'member@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-polls-closed'), {
        creatorId: 'manager',
        memberManaged: false,
        memberIds: ['manager', 'member'],
      });
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-closed', 'basicPolls', 'poll-finalized'),
        {
          title: 'Finalized poll',
          creatorId: 'manager',
          status: 'FINALIZED',
          deadlineAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-closed', 'basicPolls', 'poll-finalized', 'votes', 'member'),
        {
          optionIds: ['opt-a'],
          updatedAt: new Date(),
        }
      );
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-closed', 'basicPolls', 'poll-deadline'),
        {
          title: 'Deadline poll',
          creatorId: 'manager',
          status: 'OPEN',
          deadlineAt: new Date(Date.now() - 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    });

    const finalizedVoteRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-closed',
      'basicPolls',
      'poll-finalized',
      'votes',
      'member'
    );
    const expiredVoteRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-closed',
      'basicPolls',
      'poll-deadline',
      'votes',
      'member'
    );

    await assertFails(
      setDoc(finalizedVoteRef, {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(expiredVoteRef, {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );
    await assertFails(deleteDoc(finalizedVoteRef));
    await assertFails(deleteDoc(doc(manager.firestore(), finalizedVoteRef.path)));
  });

  test('group basic polls: hidden visibility keeps own votes readable and creator can always read all votes', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
      email_verified: true,
    });
    const member = testEnv.authenticatedContext('member', {
      email: 'member@example.com',
      email_verified: true,
    });
    const otherMember = testEnv.authenticatedContext('other-member', {
      email: 'other-member@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'questingGroups', 'group-polls-hidden'), {
        creatorId: 'manager',
        memberManaged: false,
        memberIds: ['manager', 'member', 'other-member'],
      });
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-hidden', 'basicPolls', 'poll-1'),
        {
          title: 'Hidden poll',
          creatorId: 'manager',
          voteVisibility: 'hidden',
          status: 'OPEN',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-hidden', 'basicPolls', 'poll-1', 'votes', 'member'),
        {
          optionIds: ['opt-a'],
          updatedAt: new Date(),
        }
      );
      await setDoc(
        doc(context.firestore(), 'questingGroups', 'group-polls-hidden', 'basicPolls', 'poll-1', 'votes', 'other-member'),
        {
          optionIds: ['opt-b'],
          updatedAt: new Date(),
        }
      );
    });

    const ownVoteRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-hidden',
      'basicPolls',
      'poll-1',
      'votes',
      'member'
    );
    const otherVoteRef = doc(
      member.firestore(),
      'questingGroups',
      'group-polls-hidden',
      'basicPolls',
      'poll-1',
      'votes',
      'other-member'
    );

    await assertSucceeds(getDoc(ownVoteRef));
    await assertFails(getDoc(otherVoteRef));
    await assertSucceeds(getDoc(doc(manager.firestore(), otherVoteRef.path)));
    await assertSucceeds(getDoc(doc(otherMember.firestore(), otherVoteRef.path)));
  });

  test('schedulers: custom provider can create with unverified email', async () => {
    const discordUser = testEnv.authenticatedContext('dora', {
      email: 'dora@example.com',
      email_verified: false,
      firebase: { sign_in_provider: 'custom' },
    });

    await assertSucceeds(
      setDoc(doc(discordUser.firestore(), 'schedulers', 'sched1'), {
        title: 'Test Poll',
        creatorId: 'dora',
        creatorEmail: 'dora@example.com',
        status: 'OPEN',
        participantIds: [],
        pendingInvites: [],
        allowLinkSharing: false,
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

  test('schedulers: invitee can decline and remove pending invite + participantId', async () => {
    const invitee = testEnv.authenticatedContext('invitee', {
      email: 'invitee@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-invitee'), {
        title: 'Invitee Poll',
        creatorId: 'creator1',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        participantIds: ['invitee'],
        pendingInvites: ['invitee@example.com'],
        pendingInviteMeta: {
          'invitee@example.com': { invitedByEmail: 'creator@example.com' },
        },
        allowLinkSharing: false,
      });
    });

    await assertSucceeds(
      updateDoc(doc(invitee.firestore(), 'schedulers', 'sched-invitee'), {
        participantIds: [],
        pendingInvites: [],
        pendingInviteMeta: {},
        updatedAt: new Date(),
      })
    );
  });

  test('schedulers: invitee can accept when already a participant', async () => {
    const invitee = testEnv.authenticatedContext('invitee', {
      email: 'invitee@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-accept'), {
        title: 'Invitee Poll',
        creatorId: 'creator1',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        participantIds: ['invitee'],
        pendingInvites: ['invitee@example.com'],
        pendingInviteMeta: {
          'invitee@example.com': { invitedByEmail: 'creator@example.com' },
        },
        allowLinkSharing: false,
      });
    });

    await assertSucceeds(
      updateDoc(doc(invitee.firestore(), 'schedulers', 'sched-accept'), {
        pendingInvites: [],
        pendingInviteMeta: {},
        updatedAt: new Date(),
      })
    );
  });

  test('schedulers: hidden_while_voting unlocks after submitted vote while preserving own/creator access', async () => {
    const creator = testEnv.authenticatedContext('creator', {
      email: 'creator@example.com',
      email_verified: true,
    });
    const participant = testEnv.authenticatedContext('participant', {
      email: 'participant@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-hidden-while'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        voteVisibility: 'hidden_while_voting',
        participantIds: ['participant', 'other-participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-hidden-while', 'votes', 'participant'), {
        voterId: 'participant',
        noTimesWork: false,
        votes: {},
        updatedAt: new Date(),
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-hidden-while', 'votes', 'other-participant'),
        {
          voterId: 'other-participant',
          noTimesWork: true,
          votes: {},
          updatedAt: new Date(),
        }
      );
    });

    const participantOwnVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-hidden-while',
      'votes',
      'participant'
    );
    const participantOtherVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-hidden-while',
      'votes',
      'other-participant'
    );

    await assertSucceeds(getDoc(participantOwnVoteRef));
    await assertFails(getDoc(participantOtherVoteRef));
    await assertSucceeds(
      getDoc(doc(creator.firestore(), 'schedulers', 'sched-hidden-while', 'votes', 'other-participant'))
    );

    await assertSucceeds(
      setDoc(participantOwnVoteRef, {
        voterId: 'participant',
        noTimesWork: false,
        votes: { 'slot-1': 'UNAVAILABLE' },
        updatedAt: new Date(),
      })
    );
    await assertFails(getDoc(participantOtherVoteRef));

    await assertSucceeds(
      setDoc(participantOwnVoteRef, {
        voterId: 'participant',
        noTimesWork: false,
        votes: { 'slot-1': 'FEASIBLE' },
        updatedAt: new Date(),
      })
    );
    await assertSucceeds(getDoc(participantOtherVoteRef));
  });

  test('schedulers: hidden_until_all_voted and hidden_until_finalized unlock at the expected lifecycle stage', async () => {
    const participant = testEnv.authenticatedContext('participant', {
      email: 'participant@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-hidden-all'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        voteVisibility: 'hidden_until_all_voted',
        votesAllSubmitted: false,
        participantIds: ['participant', 'other-participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-hidden-all', 'votes', 'participant'), {
        voterId: 'participant',
        noTimesWork: true,
        votes: {},
        updatedAt: new Date(),
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-hidden-all', 'votes', 'other-participant'),
        {
          voterId: 'other-participant',
          noTimesWork: true,
          votes: {},
          updatedAt: new Date(),
        }
      );

      await setDoc(doc(context.firestore(), 'schedulers', 'sched-hidden-finalized'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        voteVisibility: 'hidden_until_finalized',
        participantIds: ['participant', 'other-participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-hidden-finalized', 'votes', 'other-participant'),
        {
          voterId: 'other-participant',
          noTimesWork: true,
          votes: {},
          updatedAt: new Date(),
        }
      );
    });

    const hiddenAllOtherVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-hidden-all',
      'votes',
      'other-participant'
    );
    const hiddenFinalizedOtherVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-hidden-finalized',
      'votes',
      'other-participant'
    );

    await assertFails(getDoc(hiddenAllOtherVoteRef));
    await assertFails(getDoc(hiddenFinalizedOtherVoteRef));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-hidden-all'),
        { votesAllSubmitted: true },
        { merge: true }
      );
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-hidden-finalized'),
        { status: 'FINALIZED' },
        { merge: true }
      );
    });

    await assertSucceeds(getDoc(hiddenAllOtherVoteRef));
    await assertSucceeds(getDoc(hiddenFinalizedOtherVoteRef));
  });

  test('scheduler embedded basic polls: creator can CRUD poll docs; non-creator denied', async () => {
    const creator = testEnv.authenticatedContext('creator', {
      email: 'creator@example.com',
      email_verified: true,
    });
    const participant = testEnv.authenticatedContext('participant', {
      email: 'participant@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-manage'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        participantIds: ['participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
    });

    const creatorPollRef = doc(
      creator.firestore(),
      'schedulers',
      'sched-basic-manage',
      'basicPolls',
      'poll-1'
    );
    const participantPollRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-manage',
      'basicPolls',
      'poll-2'
    );

    await assertSucceeds(
      setDoc(creatorPollRef, {
        title: 'Embedded poll',
        creatorId: 'creator',
        deadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(participantPollRef, {
        title: 'Not allowed',
        creatorId: 'participant',
        deadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    await assertSucceeds(updateDoc(creatorPollRef, { title: 'Updated', updatedAt: new Date() }));
    await assertFails(deleteDoc(doc(participant.firestore(), creatorPollRef.path)));
    await assertSucceeds(deleteDoc(creatorPollRef));
  });

  test('scheduler embedded basic polls: participant can vote, non-participant denied, own-vote-only enforced', async () => {
    const creator = testEnv.authenticatedContext('creator', {
      email: 'creator@example.com',
      email_verified: true,
    });
    const participant = testEnv.authenticatedContext('participant', {
      email: 'participant@example.com',
      email_verified: true,
    });
    const outsider = testEnv.authenticatedContext('outsider', {
      email: 'outsider@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-vote'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        participantIds: ['participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-vote', 'basicPolls', 'poll-1'), {
        title: 'Embedded poll',
        creatorId: 'creator',
        deadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    const participantVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-vote',
      'basicPolls',
      'poll-1',
      'votes',
      'participant'
    );
    const creatorVoteRefFromParticipantContext = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-vote',
      'basicPolls',
      'poll-1',
      'votes',
      'creator'
    );

    await assertSucceeds(
      getDoc(doc(participant.firestore(), 'schedulers', 'sched-basic-vote', 'basicPolls', 'poll-1'))
    );
    await assertFails(
      getDoc(doc(outsider.firestore(), 'schedulers', 'sched-basic-vote', 'basicPolls', 'poll-1'))
    );
    await assertSucceeds(
      setDoc(participantVoteRef, {
        optionIds: ['opt-a'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(creatorVoteRefFromParticipantContext, {
        optionIds: ['opt-a'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(doc(outsider.firestore(), participantVoteRef.path), {
        optionIds: ['opt-a'],
        updatedAt: new Date(),
      })
    );

    await assertSucceeds(deleteDoc(doc(creator.firestore(), participantVoteRef.path)));
  });

  test('scheduler embedded basic polls: vote writes allowed after session finalize unless poll finalized/deadline passed/cancelled', async () => {
    const creator = testEnv.authenticatedContext('creator', {
      email: 'creator@example.com',
      email_verified: true,
    });
    const participant = testEnv.authenticatedContext('participant', {
      email: 'participant@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-finalized'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'FINALIZED',
        participantIds: ['participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-basic-finalized', 'basicPolls', 'poll-1'),
        {
          title: 'Embedded poll',
          creatorId: 'creator',
          status: 'OPEN',
          deadlineAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-basic-finalized', 'basicPolls', 'poll-1', 'votes', 'participant'),
        {
          optionIds: ['opt-a'],
          updatedAt: new Date(),
        }
      );

      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-cancelled'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'CANCELLED',
        participantIds: ['participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-basic-cancelled', 'basicPolls', 'poll-1'),
        {
          title: 'Embedded poll',
          creatorId: 'creator',
          status: 'OPEN',
          deadlineAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-expired'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        participantIds: ['participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-basic-expired', 'basicPolls', 'poll-1'),
        {
          title: 'Embedded poll',
          creatorId: 'creator',
          status: 'OPEN',
          deadlineAt: new Date(Date.now() - 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      await setDoc(doc(context.firestore(), 'schedulers', 'sched-basic-poll-finalized'), {
        creatorId: 'creator',
        creatorEmail: 'creator@example.com',
        status: 'OPEN',
        participantIds: ['participant'],
        pendingInvites: [],
        allowLinkSharing: false,
      });
      await setDoc(
        doc(context.firestore(), 'schedulers', 'sched-basic-poll-finalized', 'basicPolls', 'poll-1'),
        {
          title: 'Embedded poll',
          creatorId: 'creator',
          status: 'FINALIZED',
          deadlineAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    });

    const finalizedVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-finalized',
      'basicPolls',
      'poll-1',
      'votes',
      'participant'
    );
    const cancelledVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-cancelled',
      'basicPolls',
      'poll-1',
      'votes',
      'participant'
    );
    const expiredVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-expired',
      'basicPolls',
      'poll-1',
      'votes',
      'participant'
    );
    const pollFinalizedVoteRef = doc(
      participant.firestore(),
      'schedulers',
      'sched-basic-poll-finalized',
      'basicPolls',
      'poll-1',
      'votes',
      'participant'
    );

    await assertSucceeds(
      setDoc(finalizedVoteRef, {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(cancelledVoteRef, {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(expiredVoteRef, {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );
    await assertFails(
      setDoc(pollFinalizedVoteRef, {
        optionIds: ['opt-b'],
        updatedAt: new Date(),
      })
    );

    await assertSucceeds(deleteDoc(finalizedVoteRef));
    await assertSucceeds(deleteDoc(doc(creator.firestore(), finalizedVoteRef.path)));
  });

  test('friendRequests: invitee can accept or decline pending request', async () => {
    const invitee = testEnv.authenticatedContext('invitee', {
      email: 'invitee@example.com',
      email_verified: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendRequests', 'request-accept'), {
        fromEmail: 'sender@example.com',
        fromUserId: 'sender1',
        toEmail: 'invitee@example.com',
        toUserId: null,
        status: 'pending',
      });
      await setDoc(doc(context.firestore(), 'friendRequests', 'request-decline'), {
        fromEmail: 'sender@example.com',
        fromUserId: null,
        toEmail: 'invitee@example.com',
        toUserId: null,
        status: 'pending',
      });
    });

    await assertSucceeds(
      updateDoc(doc(invitee.firestore(), 'friendRequests', 'request-accept'), {
        status: 'accepted',
        respondedAt: new Date(),
        toUserId: 'invitee',
      })
    );

    await assertSucceeds(
      updateDoc(doc(invitee.firestore(), 'friendRequests', 'request-decline'), {
        status: 'declined',
        respondedAt: new Date(),
      })
    );
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

  test('notificationEvents and pendingNotifications are server-only', async () => {
    const alice = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });

    await assertFails(
      setDoc(doc(alice.firestore(), 'notificationEvents', 'event1'), {
        eventType: 'POLL_INVITE_SENT',
      })
    );

    await assertFails(getDoc(doc(alice.firestore(), 'notificationEvents', 'event1')));

    await assertFails(
      setDoc(doc(alice.firestore(), 'pendingNotifications', 'hash1', 'events', 'event1'), {
        eventType: 'POLL_INVITE_SENT',
      })
    );

    await assertFails(
      getDoc(doc(alice.firestore(), 'pendingNotifications', 'hash1', 'events', 'event1'))
    );
  });

  test('feedbackSubmissions: create allowed for owner, read/update denied', async () => {
    const alice = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });
    const bob = testEnv.authenticatedContext('bob', {
      email: 'bob@example.com',
      email_verified: true,
    });

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'feedbackSubmissions', 'fb1'), {
        userId: 'alice',
        userEmail: 'alice@example.com',
        title: 'Bug in calendar sync',
        issueType: 'Bug',
        description: 'Steps to reproduce.',
        createdAt: new Date(),
      })
    );

    await assertFails(getDoc(doc(alice.firestore(), 'feedbackSubmissions', 'fb1')));
    await assertFails(
      updateDoc(doc(alice.firestore(), 'feedbackSubmissions', 'fb1'), {
        description: 'Updated details.',
      })
    );

    await assertFails(
      setDoc(doc(bob.firestore(), 'feedbackSubmissions', 'fb2'), {
        userId: 'alice',
        userEmail: 'bob@example.com',
        title: 'Not allowed',
        issueType: 'Other',
        description: 'Should fail.',
        createdAt: new Date(),
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

  test('feedback uploads enforce owner, size, and content type', async () => {
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
        ref(aliceStorage, 'feedback/alice/screenshot.png'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/png' }
      )
    );

    await assertSucceeds(
      uploadBytes(
        ref(aliceStorage, 'feedback/alice/clip.mp4'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'video/mp4' }
      )
    );

    await assertFails(
      uploadBytes(
        ref(bobStorage, 'feedback/alice/other.png'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/png' }
      )
    );

    await assertFails(
      uploadBytes(
        ref(aliceStorage, 'feedback/alice/too-large.mp4'),
        new Uint8Array(20 * 1024 * 1024 + 1),
        { contentType: 'video/mp4' }
      )
    );

    await assertFails(
      uploadBytes(
        ref(aliceStorage, 'feedback/alice/bad-type.txt'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'text/plain' }
      )
    );
  });
});
