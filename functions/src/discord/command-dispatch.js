const { InteractionType } = require("discord-api-types/v10");

const APPLICATION_COMMAND_HANDLERS = {
  "link-group": "handleLinkGroup",
  "unlink-group": "handleUnlinkGroup",
  "poll-create": "handlePollCreate",
};

const MESSAGE_COMPONENT_ROUTES = [
  { prefix: "vote_btn:", handler: "handleVoteButton" },
  { prefix: "submit_vote:", handler: "handleSubmitVote" },
  { prefix: "page_prev:", handler: "handleVotePage", fixedArgs: ["prev"] },
  { prefix: "page_next:", handler: "handleVotePage", fixedArgs: ["next"] },
  { prefix: "clear_votes:", handler: "handleClearVotes", fixedArgs: [false] },
  { prefix: "none_work:", handler: "handleClearVotes", fixedArgs: [true] },
  { prefix: "vote_pref:", handler: "handleVoteSelect", fixedArgs: ["preferred"] },
  { prefix: "vote_feasible:", handler: "handleVoteSelect", fixedArgs: ["feasible"] },
  { prefix: "bp_vote:", handler: "handleBasicPollVoteButton" },
  { prefix: "bp_mc_select:", handler: "handleBasicPollMcSelect" },
  { prefix: "bp_submit:", handler: "handleBasicPollSubmit" },
  { prefix: "bp_clear:", handler: "handleBasicPollClear" },
  { prefix: "bp_finalize:", handler: "handleBasicPollFinalize" },
  { prefix: "bp_rank_select:", handler: "handleBasicPollRankSelect" },
  { prefix: "bp_rank_prev:", handler: "handleBasicPollRankPage", fixedArgs: ["prev"] },
  { prefix: "bp_rank_next:", handler: "handleBasicPollRankPage", fixedArgs: ["next"] },
  { prefix: "bp_rank_undo:", handler: "handleBasicPollRankUndo" },
  { prefix: "bp_rank_reset:", handler: "handleBasicPollRankReset" },
  { prefix: "bp_rank_submit:", handler: "handleBasicPollRankSubmit" },
];

function parseIdFromCustomId(customId, prefix) {
  return String(customId || "").slice(prefix.length).trim();
}

async function dispatchApplicationCommand({
  interaction,
  handlers,
}) {
  if (interaction?.type !== InteractionType.ApplicationCommand) return false;

  const commandName = String(interaction?.data?.name || "").trim();
  const handlerName = APPLICATION_COMMAND_HANDLERS[commandName];
  if (!handlerName || typeof handlers?.[handlerName] !== "function") return false;

  await handlers[handlerName](interaction);
  return true;
}

async function dispatchMessageComponent({
  interaction,
  handlers,
  respondWithError,
  errorMessages,
}) {
  if (interaction?.type !== InteractionType.MessageComponent) return false;

  const customId = String(interaction?.data?.custom_id || "");
  const route = MESSAGE_COMPONENT_ROUTES.find((entry) => customId.startsWith(entry.prefix));
  if (!route) return false;

  const handler = handlers?.[route.handler];
  if (typeof handler !== "function") return false;

  const parsedId = parseIdFromCustomId(customId, route.prefix);
  if (!parsedId) {
    await respondWithError(interaction, errorMessages?.missingPollId || "Missing poll ID.");
    return true;
  }

  const fixedArgs = Array.isArray(route.fixedArgs) ? route.fixedArgs : [];
  await handler(interaction, parsedId, ...fixedArgs);
  return true;
}

async function dispatchInteraction(context) {
  const handledAppCommand = await dispatchApplicationCommand(context);
  if (handledAppCommand) return true;
  return dispatchMessageComponent(context);
}

module.exports = {
  APPLICATION_COMMAND_HANDLERS,
  MESSAGE_COMPONENT_ROUTES,
  dispatchApplicationCommand,
  dispatchMessageComponent,
  dispatchInteraction,
};
