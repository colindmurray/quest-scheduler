const legacy = require("./legacy");
const discordIngress = require("./discord/ingress");
const discordWorker = require("./discord/worker");
const discordLinkCodes = require("./discord/link-codes");
const discordOAuth = require("./discord/oauth");
const schedulerTriggers = require("./triggers/scheduler");

module.exports = {
  ...legacy,
  ...discordIngress,
  ...discordWorker,
  ...discordLinkCodes,
  ...discordOAuth,
  ...schedulerTriggers,
};
