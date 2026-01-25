const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { DISCORD_BOT_TOKEN } = require("./config");

function createDiscordRestClient() {
  return new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN.value());
}

async function editOriginalInteractionResponse({ applicationId, token, body }) {
  const rest = createDiscordRestClient();
  return rest.patch(Routes.webhookMessage(applicationId, token, "@original"), { body });
}

async function createChannelMessage({ channelId, body }) {
  const rest = createDiscordRestClient();
  return rest.post(Routes.channelMessages(channelId), { body });
}

async function editChannelMessage({ channelId, messageId, body }) {
  const rest = createDiscordRestClient();
  return rest.patch(Routes.channelMessage(channelId, messageId), { body });
}

async function fetchChannel({ channelId }) {
  const rest = createDiscordRestClient();
  return rest.get(Routes.channel(channelId));
}

module.exports = {
  createDiscordRestClient,
  editOriginalInteractionResponse,
  createChannelMessage,
  editChannelMessage,
  fetchChannel,
};
