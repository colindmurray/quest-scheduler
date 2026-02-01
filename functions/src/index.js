const legacy = require("./legacy");
const discordIngress = require("./discord/ingress");
const discordWorker = require("./discord/worker");
const discordLinkCodes = require("./discord/link-codes");
const discordOAuth = require("./discord/oauth");
const discordUnlink = require("./discord/unlink");
const discordRoles = require("./discord/roles");
const discordNudge = require("./discord/nudge");
const discordWarmup = require("./discord/warmup");
const schedulerTriggers = require("./triggers/scheduler");
const auth = require("./auth");
const notificationEvents = require("./notifications/emit");
const notificationRouter = require("./notifications/router");
const notificationReconcile = require("./notifications/reconcile");

module.exports = {
  ...legacy,
  ...discordIngress,
  ...discordWorker,
  ...discordLinkCodes,
  ...discordOAuth,
  ...discordUnlink,
  ...discordRoles,
  ...discordNudge,
  ...discordWarmup,
  ...schedulerTriggers,
  ...auth,
  ...notificationEvents,
  ...notificationRouter,
  ...notificationReconcile,
};
