import { describe, expect, test } from 'vitest';
import {
  NOTIFICATION_PREFERENCES,
  SIMPLE_DEFAULT_EVENTS,
  getDefaultPreference,
  resolveNotificationPreference,
  preferenceToChannels,
} from './preferences';
import { NOTIFICATION_EVENTS } from './constants';

describe('notification preference resolution', () => {
  test('default preference respects simple defaults and email toggle', () => {
    const sampleEvent = NOTIFICATION_EVENTS.POLL_INVITE_SENT;
    expect(SIMPLE_DEFAULT_EVENTS.has(sampleEvent)).toBe(true);
    expect(getDefaultPreference(sampleEvent, { emailNotifications: true })).toBe(
      NOTIFICATION_PREFERENCES.IN_APP_EMAIL
    );
    expect(getDefaultPreference(sampleEvent, { emailNotifications: false })).toBe(
      NOTIFICATION_PREFERENCES.IN_APP
    );

    const inAppOnlyEvent = NOTIFICATION_EVENTS.GROUP_MEMBER_REMOVED;
    expect(SIMPLE_DEFAULT_EVENTS.has(inAppOnlyEvent)).toBe(true);
    expect(getDefaultPreference(inAppOnlyEvent, { emailNotifications: true })).toBe(
      NOTIFICATION_PREFERENCES.IN_APP
    );

    const mutedEvent = NOTIFICATION_EVENTS.POLL_INVITE_ACCEPTED;
    expect(SIMPLE_DEFAULT_EVENTS.has(mutedEvent)).toBe(false);
    expect(getDefaultPreference(mutedEvent, { emailNotifications: true })).toBe(
      NOTIFICATION_PREFERENCES.MUTED
    );

    const basicPollEvent = NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED;
    expect(SIMPLE_DEFAULT_EVENTS.has(basicPollEvent)).toBe(true);
    expect(getDefaultPreference(basicPollEvent, { emailNotifications: true })).toBe(
      NOTIFICATION_PREFERENCES.IN_APP_EMAIL
    );
    expect(getDefaultPreference(basicPollEvent, { emailNotifications: false })).toBe(
      NOTIFICATION_PREFERENCES.IN_APP
    );

    const mutedBasicPollEvent = NOTIFICATION_EVENTS.BASIC_POLL_VOTE_SUBMITTED;
    expect(SIMPLE_DEFAULT_EVENTS.has(mutedBasicPollEvent)).toBe(false);
    expect(getDefaultPreference(mutedBasicPollEvent, { emailNotifications: true })).toBe(
      NOTIFICATION_PREFERENCES.MUTED
    );
  });

  test('advanced preferences override defaults when valid', () => {
    const eventType = NOTIFICATION_EVENTS.POLL_FINALIZED;
    const settings = {
      notificationMode: 'advanced',
      notificationPreferences: {
        [eventType]: NOTIFICATION_PREFERENCES.MUTED,
      },
    };

    expect(resolveNotificationPreference(eventType, settings)).toBe(
      NOTIFICATION_PREFERENCES.MUTED
    );
  });

  test('invalid advanced preferences fall back to simple defaults', () => {
    const eventType = NOTIFICATION_EVENTS.POLL_FINALIZED;
    const settings = {
      notificationMode: 'advanced',
      notificationPreferences: {
        [eventType]: 'unknown',
      },
      emailNotifications: false,
    };

    expect(resolveNotificationPreference(eventType, settings)).toBe(
      NOTIFICATION_PREFERENCES.IN_APP
    );
  });

  test('email preference is downgraded for in-app only events', () => {
    const eventType = NOTIFICATION_EVENTS.GROUP_MEMBER_REMOVED;
    const settings = {
      notificationMode: 'advanced',
      notificationPreferences: {
        [eventType]: NOTIFICATION_PREFERENCES.IN_APP_EMAIL,
      },
    };

    expect(resolveNotificationPreference(eventType, settings)).toBe(
      NOTIFICATION_PREFERENCES.IN_APP
    );
  });

  test('advanced preferences support basic poll events', () => {
    const eventType = NOTIFICATION_EVENTS.BASIC_POLL_RESULTS;
    const settings = {
      notificationMode: 'advanced',
      notificationPreferences: {
        [eventType]: NOTIFICATION_PREFERENCES.IN_APP_EMAIL,
      },
    };

    expect(resolveNotificationPreference(eventType, settings)).toBe(
      NOTIFICATION_PREFERENCES.IN_APP_EMAIL
    );
  });

  test('preference to channel mapping', () => {
    expect(preferenceToChannels(NOTIFICATION_PREFERENCES.MUTED)).toEqual({
      inApp: false,
      email: false,
    });
    expect(preferenceToChannels(NOTIFICATION_PREFERENCES.IN_APP)).toEqual({
      inApp: true,
      email: false,
    });
    expect(preferenceToChannels(NOTIFICATION_PREFERENCES.IN_APP_EMAIL)).toEqual({
      inApp: true,
      email: true,
    });
  });
});
