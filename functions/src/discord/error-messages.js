function buildSettingsUrl(appUrl) {
  const base = String(appUrl || "").replace(/\/$/, "");
  return `${base}/settings`;
}

function buildUserNotLinkedMessage(appUrl) {
  return `Link your Discord account to Quest Scheduler to vote. If you already have an account, visit ${buildSettingsUrl(appUrl)}. If you don't have one yet, create an account first.`;
}

const ERROR_MESSAGES = {
  missingLinkCode: "Missing link code. Paste the code from Quest Scheduler.",
  linkChannelOnly: "This command must be run in a server channel.",
  linkPermissions: "You need Manage Channels or Administrator permissions to link.",
  linkCodeInvalidOrExpired: "Invalid or expired link code.",
  linkCodeInvalid: "Invalid link code.",
  linkCodeExpired: "Link code expired. Generate a new one in Quest Scheduler.",
  noLinkedGroup: "No Quest Scheduler group is linked to this channel.",
  pollNotFound: "This poll no longer exists. It may have been deleted.",
  pollFinalized: "Voting is closed for this session.",
  channelMismatch: "This poll is linked to a different channel.",
  guildMismatch: "This poll is linked to a different server.",
  missingDiscordUser: "Unable to identify your Discord account.",
  notParticipant:
    "You're not a participant in this poll. Ask the organizer to invite you.",
  notInvited: "You're not invited to this poll. Ask the organizer to add you.",
  notGroupMember:
    "You're not a member of the questing group for this poll. Ask the host to add you.",
  pendingInvite:
    "You've been invited but haven't accepted yet. Open Quest Scheduler to accept the invite, then vote here.",
  groupMissing:
    "This poll's questing group no longer exists. Ask the host to re-share the poll.",
  noSlots: "No available slots to vote on.",
  sessionExpired: "Voting session expired. Click Vote again.",
  staleSlots: "The poll was updated. Please tap Vote again.",
  selectAtLeastOne: "Select at least one slot before submitting.",
  missingPollId: "Missing poll id.",
  genericError: "Something went wrong. Please try again or vote on the web.",
};

module.exports = {
  ERROR_MESSAGES,
  buildUserNotLinkedMessage,
};
