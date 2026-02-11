import { describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { AUTO_CLEAR_RULES, applyAutoClear } = require('./auto-clear');
const { NOTIFICATION_EVENTS } = require('./constants');

const buildDbMock = (docs = []) => {
  const queryChain = {
    where: vi.fn(function () {
      return this;
    }),
    get: vi.fn(async () => ({ docs })),
  };

  const batchUpdateMock = vi.fn();
  const batchCommitMock = vi.fn();

  const db = {
    collection: vi.fn((name) => {
      if (name !== 'users') return {};
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => queryChain),
        })),
      };
    }),
    batch: vi.fn(() => ({
      update: batchUpdateMock,
      commit: batchCommitMock,
    })),
  };

  return { db, queryChain, batchUpdateMock, batchCommitMock };
};

describe('auto-clear', () => {
  test('clears poll finalize notifications for recipients', async () => {
    const { db, queryChain, batchUpdateMock, batchCommitMock } = buildDbMock([
      { ref: { id: 'n1' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_INVITE_SENT }) },
      { ref: { id: 'n2' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_FINALIZED,
      event: { resource: { id: 'poll1' } },
      recipients: { userIds: ['user1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll1');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  test('clears poll reopen notifications for recipients', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n1' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_FINALIZED }) },
      { ref: { id: 'n2' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_REOPENED,
      event: { resource: { id: 'poll2' } },
      recipients: { userIds: ['user2'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll2');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears poll cancelled notifications for recipients', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n3' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_INVITE_SENT }) },
      { ref: { id: 'n4' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_CANCELLED,
      event: { resource: { id: 'poll3' } },
      recipients: { userIds: ['user3'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll3');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears poll invite notifications on revoke for recipients', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n4' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_INVITE_SENT }) },
      { ref: { id: 'n5' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_INVITE_REVOKED,
      event: { resource: { id: 'poll4' } },
      recipients: { userIds: ['user4'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll4');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears friend request invites for actor on accept', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n5' }, data: () => ({ type: NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT }) },
      { ref: { id: 'n6' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.FRIEND_REQUEST_ACCEPTED,
      event: { resource: { id: 'friend1' }, actor: { uid: 'friendUser' } },
      recipients: { userIds: ['sender1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'friend1');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears friend request invites for actor on decline', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n6' }, data: () => ({ type: NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT }) },
      { ref: { id: 'n7' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.FRIEND_REQUEST_DECLINED,
      event: { resource: { id: 'friend2' }, actor: { uid: 'friendUser' } },
      recipients: { userIds: ['sender1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'friend2');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears group invite notifications for actor on decline', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n7' }, data: () => ({ type: NOTIFICATION_EVENTS.GROUP_INVITE_SENT }) },
      { ref: { id: 'n8' }, data: () => ({ type: 'OTHER_EVENT' }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.GROUP_INVITE_DECLINED,
      event: { resource: { id: 'group1' }, actor: { uid: 'invitee1' } },
      recipients: { userIds: ['owner1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'group1');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears poll invite notifications for actor on accept', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n9' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_INVITE_SENT }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_INVITE_ACCEPTED,
      event: { resource: { id: 'poll5' }, actor: { uid: 'invitee1' } },
      recipients: { userIds: ['owner1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll5');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears vote reminder for actor on vote submitted', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n10' }, data: () => ({ type: NOTIFICATION_EVENTS.VOTE_REMINDER }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.VOTE_SUBMITTED,
      event: { resource: { id: 'poll6' }, actor: { uid: 'voter1' } },
      recipients: { userIds: ['voter1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll6');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears basic poll reminders for actor on basic poll vote submitted', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n10b' }, data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_REMINDER }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_VOTE_SUBMITTED,
      event: { resource: { id: 'basicPoll1' }, actor: { uid: 'voter-basic' } },
      recipients: { userIds: ['owner-basic'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'basicPoll1');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears stale basic poll notices on basic poll finalization', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n11b' }, data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_REMINDER }) },
      { ref: { id: 'n12b' }, data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_REOPENED }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED,
      event: { resource: { id: 'basicPoll2' } },
      recipients: { userIds: ['user-basic-1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'basicPoll2');
    expect(batchUpdateMock).toHaveBeenCalledTimes(2);
  });

  test('clears finalized notices when a basic poll is reopened', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n12c' }, data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_REOPENED,
      event: { resource: { id: 'basicPoll2b' } },
      recipients: { userIds: ['user-basic-1'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'basicPoll2b');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears missing-required notices when required flag is changed to optional', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      {
        ref: { id: 'n13b' },
        data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES }),
      },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED,
      event: { resource: { id: 'basicPoll3' }, payload: { required: false } },
      recipients: { userIds: ['user-basic-2'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'basicPoll3');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('does not auto-clear required-change notices when poll stays required', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      {
        ref: { id: 'n14b' },
        data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES }),
      },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED,
      event: { resource: { id: 'basicPoll4' }, payload: { required: true } },
      recipients: { userIds: ['user-basic-3'] },
    });

    expect(queryChain.where).not.toHaveBeenCalled();
    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  test('clears missing-required notices when a basic poll is removed', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      {
        ref: { id: 'n15b' },
        data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED }),
      },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_REMOVED,
      event: { resource: { id: 'basicPoll5' } },
      recipients: { userIds: ['user-basic-4'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'basicPoll5');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears reminder and required-changed notices when basic poll votes are reset', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n16b' }, data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_REMINDER }) },
      {
        ref: { id: 'n17b' },
        data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED }),
      },
      {
        ref: { id: 'n18b' },
        data: () => ({ type: NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES }),
      },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_RESET,
      event: { resource: { id: 'basicPoll6' } },
      recipients: { userIds: ['user-basic-5'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'basicPoll6');
    expect(batchUpdateMock).toHaveBeenCalledTimes(3);
  });

  test('clears poll deleted notifications for recipients', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n11' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_INVITE_SENT }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_DELETED,
      event: { resource: { id: 'poll7' } },
      recipients: { userIds: ['user7'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll7');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears poll cancelled notifications on restore', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n12' }, data: () => ({ type: NOTIFICATION_EVENTS.POLL_CANCELLED }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.POLL_RESTORED,
      event: { resource: { id: 'poll8' } },
      recipients: { userIds: ['user8'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'poll8');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  test('clears group notifications for recipients on group delete', async () => {
    const { db, queryChain, batchUpdateMock } = buildDbMock([
      { ref: { id: 'n13' }, data: () => ({ type: NOTIFICATION_EVENTS.GROUP_INVITE_SENT }) },
    ]);

    await applyAutoClear({
      db,
      eventType: NOTIFICATION_EVENTS.GROUP_DELETED,
      event: { resource: { id: 'group2' } },
      recipients: { userIds: ['user9'] },
    });

    expect(queryChain.where).toHaveBeenCalledWith('resource.id', '==', 'group2');
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });
});
