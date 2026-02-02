export const testUsers = {
  owner: {
    uid: process.env.E2E_USER_UID || 'test-owner',
    email: process.env.E2E_USER_EMAIL || 'owner@example.com',
    password: process.env.E2E_USER_PASSWORD || 'password',
    displayName: 'Owner',
  },
  participant: {
    uid: process.env.E2E_PARTICIPANT_UID || 'test-participant',
    email: process.env.E2E_PARTICIPANT_EMAIL || 'participant@example.com',
    password: process.env.E2E_PARTICIPANT_PASSWORD || 'password',
    displayName: 'Participant',
  },
  revokee: {
    uid: process.env.E2E_REVOKE_UID || 'test-revokee',
    email: process.env.E2E_REVOKE_EMAIL || 'revokee@example.com',
    password: process.env.E2E_REVOKE_PASSWORD || 'password',
    displayName: 'Revokee',
  },
  blocked: {
    uid: process.env.E2E_BLOCKED_UID || 'test-blocked',
    email: process.env.E2E_BLOCKED_EMAIL || 'blocked@example.com',
    password: process.env.E2E_BLOCKED_PASSWORD || 'password',
    displayName: 'Blocked',
  },
  notifier: {
    uid: process.env.E2E_NOTIFICATION_UID || 'test-notifier',
    email: process.env.E2E_NOTIFICATION_EMAIL || 'notifier@example.com',
    password: process.env.E2E_NOTIFICATION_PASSWORD || 'password',
    displayName: 'Notifier',
  },
};
