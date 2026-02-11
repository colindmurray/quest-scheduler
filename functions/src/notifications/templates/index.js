const { NOTIFICATION_EVENTS } = require("../constants");
const pollCreatedInApp = require("./in-app/poll-created");
const pollInviteSentInApp = require("./in-app/poll-invite-sent");
const pollInviteAcceptedInApp = require("./in-app/poll-invite-accepted");
const pollInviteDeclinedInApp = require("./in-app/poll-invite-declined");
const pollInviteRevokedInApp = require("./in-app/poll-invite-revoked");
const voteReminderInApp = require("./in-app/vote-reminder");
const pollReadyToFinalizeInApp = require("./in-app/poll-ready-to-finalize");
const pollAllVotesInInApp = require("./in-app/poll-all-votes-in");
const voteSubmittedInApp = require("./in-app/vote-submitted");
const pollFinalizedInApp = require("./in-app/poll-finalized");
const pollReopenedInApp = require("./in-app/poll-reopened");
const pollCancelledInApp = require("./in-app/poll-cancelled");
const pollRestoredInApp = require("./in-app/poll-restored");
const pollDeletedInApp = require("./in-app/poll-deleted");
const basicPollCreatedInApp = require("./in-app/basic-poll-created");
const basicPollFinalizedInApp = require("./in-app/basic-poll-finalized");
const basicPollReopenedInApp = require("./in-app/basic-poll-reopened");
const basicPollVoteSubmittedInApp = require("./in-app/basic-poll-vote-submitted");
const basicPollReminderInApp = require("./in-app/basic-poll-reminder");
const basicPollResetInApp = require("./in-app/basic-poll-reset");
const basicPollRemovedInApp = require("./in-app/basic-poll-removed");
const basicPollDeadlineChangedInApp = require("./in-app/basic-poll-deadline-changed");
const basicPollRequiredChangedInApp = require("./in-app/basic-poll-required-changed");
const basicPollResultsInApp = require("./in-app/basic-poll-results");
const basicPollFinalizedWithMissingRequiredVotesInApp = require("./in-app/basic-poll-finalized-with-missing-required-votes");
const slotChangedInApp = require("./in-app/slot-changed");
const discordNudgeSentInApp = require("./in-app/discord-nudge-sent");
const friendRequestSentInApp = require("./in-app/friend-request-sent");
const friendRequestAcceptedInApp = require("./in-app/friend-request-accepted");
const friendRequestDeclinedInApp = require("./in-app/friend-request-declined");
const friendRemovedInApp = require("./in-app/friend-removed");
const groupInviteSentInApp = require("./in-app/group-invite-sent");
const groupInviteAcceptedInApp = require("./in-app/group-invite-accepted");
const groupInviteDeclinedInApp = require("./in-app/group-invite-declined");
const groupMemberRemovedInApp = require("./in-app/group-member-removed");
const groupMemberLeftInApp = require("./in-app/group-member-left");
const groupDeletedInApp = require("./in-app/group-deleted");
const pollInviteSentEmail = require("./email/poll-invite-sent");
const pollInviteAcceptedEmail = require("./email/poll-invite-accepted");
const pollInviteDeclinedEmail = require("./email/poll-invite-declined");
const voteSubmittedEmail = require("./email/vote-submitted");
const pollFinalizedEmail = require("./email/poll-finalized");
const pollReopenedEmail = require("./email/poll-reopened");
const basicPollCreatedEmail = require("./email/basic-poll-created");
const basicPollFinalizedEmail = require("./email/basic-poll-finalized");
const basicPollReopenedEmail = require("./email/basic-poll-reopened");
const basicPollVoteSubmittedEmail = require("./email/basic-poll-vote-submitted");
const basicPollReminderEmail = require("./email/basic-poll-reminder");
const basicPollResetEmail = require("./email/basic-poll-reset");
const basicPollRemovedEmail = require("./email/basic-poll-removed");
const basicPollDeadlineChangedEmail = require("./email/basic-poll-deadline-changed");
const basicPollRequiredChangedEmail = require("./email/basic-poll-required-changed");
const basicPollResultsEmail = require("./email/basic-poll-results");
const basicPollFinalizedWithMissingRequiredVotesEmail = require("./email/basic-poll-finalized-with-missing-required-votes");
const slotChangedEmail = require("./email/slot-changed");
const friendRequestSentEmail = require("./email/friend-request-sent");
const friendRequestAcceptedEmail = require("./email/friend-request-accepted");
const friendRequestDeclinedEmail = require("./email/friend-request-declined");
const groupInviteSentEmail = require("./email/group-invite-sent");
const groupInviteAcceptedEmail = require("./email/group-invite-accepted");
const groupInviteDeclinedEmail = require("./email/group-invite-declined");

const IN_APP_TEMPLATES = Object.freeze({
  [NOTIFICATION_EVENTS.POLL_CREATED]: pollCreatedInApp,
  [NOTIFICATION_EVENTS.POLL_INVITE_SENT]: pollInviteSentInApp,
  [NOTIFICATION_EVENTS.POLL_INVITE_ACCEPTED]: pollInviteAcceptedInApp,
  [NOTIFICATION_EVENTS.POLL_INVITE_DECLINED]: pollInviteDeclinedInApp,
  [NOTIFICATION_EVENTS.POLL_INVITE_REVOKED]: pollInviteRevokedInApp,
  [NOTIFICATION_EVENTS.VOTE_REMINDER]: voteReminderInApp,
  [NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE]: pollReadyToFinalizeInApp,
  [NOTIFICATION_EVENTS.POLL_ALL_VOTES_IN]: pollAllVotesInInApp,
  [NOTIFICATION_EVENTS.VOTE_SUBMITTED]: voteSubmittedInApp,
  [NOTIFICATION_EVENTS.POLL_FINALIZED]: pollFinalizedInApp,
  [NOTIFICATION_EVENTS.POLL_REOPENED]: pollReopenedInApp,
  [NOTIFICATION_EVENTS.POLL_CANCELLED]: pollCancelledInApp,
  [NOTIFICATION_EVENTS.POLL_RESTORED]: pollRestoredInApp,
  [NOTIFICATION_EVENTS.POLL_DELETED]: pollDeletedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_CREATED]: basicPollCreatedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED]: basicPollFinalizedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_REOPENED]: basicPollReopenedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_VOTE_SUBMITTED]: basicPollVoteSubmittedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_REMINDER]: basicPollReminderInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_RESET]: basicPollResetInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_REMOVED]: basicPollRemovedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_DEADLINE_CHANGED]: basicPollDeadlineChangedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED]: basicPollRequiredChangedInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_RESULTS]: basicPollResultsInApp,
  [NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES]:
    basicPollFinalizedWithMissingRequiredVotesInApp,
  [NOTIFICATION_EVENTS.SLOT_CHANGED]: slotChangedInApp,
  [NOTIFICATION_EVENTS.DISCORD_NUDGE_SENT]: discordNudgeSentInApp,
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT]: friendRequestSentInApp,
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_ACCEPTED]: friendRequestAcceptedInApp,
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_DECLINED]: friendRequestDeclinedInApp,
  [NOTIFICATION_EVENTS.FRIEND_REMOVED]: friendRemovedInApp,
  [NOTIFICATION_EVENTS.GROUP_INVITE_SENT]: groupInviteSentInApp,
  [NOTIFICATION_EVENTS.GROUP_INVITE_ACCEPTED]: groupInviteAcceptedInApp,
  [NOTIFICATION_EVENTS.GROUP_INVITE_DECLINED]: groupInviteDeclinedInApp,
  [NOTIFICATION_EVENTS.GROUP_MEMBER_REMOVED]: groupMemberRemovedInApp,
  [NOTIFICATION_EVENTS.GROUP_MEMBER_LEFT]: groupMemberLeftInApp,
  [NOTIFICATION_EVENTS.GROUP_DELETED]: groupDeletedInApp,
});

const EMAIL_TEMPLATES = Object.freeze({
  [NOTIFICATION_EVENTS.POLL_INVITE_SENT]: pollInviteSentEmail,
  [NOTIFICATION_EVENTS.POLL_INVITE_ACCEPTED]: pollInviteAcceptedEmail,
  [NOTIFICATION_EVENTS.POLL_INVITE_DECLINED]: pollInviteDeclinedEmail,
  [NOTIFICATION_EVENTS.VOTE_SUBMITTED]: voteSubmittedEmail,
  [NOTIFICATION_EVENTS.POLL_FINALIZED]: pollFinalizedEmail,
  [NOTIFICATION_EVENTS.POLL_REOPENED]: pollReopenedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_CREATED]: basicPollCreatedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED]: basicPollFinalizedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_REOPENED]: basicPollReopenedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_VOTE_SUBMITTED]: basicPollVoteSubmittedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_REMINDER]: basicPollReminderEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_RESET]: basicPollResetEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_REMOVED]: basicPollRemovedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_DEADLINE_CHANGED]: basicPollDeadlineChangedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED]: basicPollRequiredChangedEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_RESULTS]: basicPollResultsEmail,
  [NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES]:
    basicPollFinalizedWithMissingRequiredVotesEmail,
  [NOTIFICATION_EVENTS.SLOT_CHANGED]: slotChangedEmail,
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT]: friendRequestSentEmail,
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_ACCEPTED]: friendRequestAcceptedEmail,
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_DECLINED]: friendRequestDeclinedEmail,
  [NOTIFICATION_EVENTS.GROUP_INVITE_SENT]: groupInviteSentEmail,
  [NOTIFICATION_EVENTS.GROUP_INVITE_ACCEPTED]: groupInviteAcceptedEmail,
  [NOTIFICATION_EVENTS.GROUP_INVITE_DECLINED]: groupInviteDeclinedEmail,
});

const getInAppTemplate = (eventType) => IN_APP_TEMPLATES[eventType] || null;
const getEmailTemplate = (eventType) => EMAIL_TEMPLATES[eventType] || null;

module.exports = {
  getInAppTemplate,
  getEmailTemplate,
  IN_APP_TEMPLATES,
  EMAIL_TEMPLATES,
};
