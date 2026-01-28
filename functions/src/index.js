const legacy = require("./legacy");
const discordIngress = require("./discord/ingress");
const discordWorker = require("./discord/worker");
const discordLinkCodes = require("./discord/link-codes");
const discordOAuth = require("./discord/oauth");
const discordUnlink = require("./discord/unlink");
const discordRoles = require("./discord/roles");
const discordNudge = require("./discord/nudge");
const schedulerTriggers = require("./triggers/scheduler");
const auth = require("./auth");

module.exports = {
  ...legacy,
  ...discordIngress,
  ...discordWorker,
  ...discordLinkCodes,
  ...discordOAuth,
  ...discordUnlink,
  ...discordRoles,
  ...discordNudge,
  ...schedulerTriggers,
  ...auth,
};
