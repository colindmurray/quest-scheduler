const { NOTIFICATION_EVENTS } = require("./constants");

const createEmptyRule = () => ({
  inApp: null,
  email: null,
  discord: null,
  autoClear: [],
});

const NOTIFICATION_RULES = Object.freeze(
  Object.fromEntries(
    Object.values(NOTIFICATION_EVENTS).map((eventType) => [eventType, createEmptyRule()])
  )
);

module.exports = {
  NOTIFICATION_RULES,
};
