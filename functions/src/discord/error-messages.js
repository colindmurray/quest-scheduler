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
  channelAlreadyLinked:
    "This Discord channel is already linked to a different Quest Scheduler group. Run /qs unlink-group in this channel first.",
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
  noLinkedGroupForPoll:
    "No Quest Scheduler group is linked to this channel. Use `/link-group` first.",
  pollCreateSubcommandRequired:
    "Use `/poll-create multiple` or `/poll-create ranked`.",
  notGroupManager: "Only group managers can create or finalize polls.",
  tooFewOptions: "A poll needs at least 2 options.",
  tooManyOptionsDiscord:
    "Discord supports up to 25 options. Create polls with more options on the web.",
  writeInNotRanked: "Write-in is not supported for ranked-choice polls.",
  deadlineInPast: "Deadline must be in the future.",
  pollAlreadyFinalized: "This poll is already finalized.",
  pollTieBreakWeb:
    "This ranked-choice poll has a tie. Please finalize on the web to pick a winner.",
  basicPollNotFound: "This poll no longer exists. It may have been deleted.",
  basicPollClosed: "Voting is closed for this poll.",
  noSlots: "No available slots to vote on.",
  noOptions: "No options are available for this poll.",
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
