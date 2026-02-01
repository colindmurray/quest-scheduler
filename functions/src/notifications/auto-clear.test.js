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
});
