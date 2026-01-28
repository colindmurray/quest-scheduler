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
};
