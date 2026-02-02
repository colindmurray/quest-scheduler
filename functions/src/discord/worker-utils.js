const { ComponentType } = require("discord-api-types/v10");
const { getTimeZoneAbbr, resolveTimeZone } = require("./time-utils");

const DISCORD_EPOCH = 1420070400000n;
const MAX_SELECT_OPTIONS = 25;
const PERMISSION_ADMIN = 0x8n;
const PERMISSION_MANAGE_CHANNELS = 0x10n;

function parseSnowflakeTimestamp(id) {
  try {
    return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
  } catch (err) {
    return null;
  }
}

function isTokenExpired(interactionId) {
  const timestamp = parseSnowflakeTimestamp(interactionId);
  if (!timestamp) return false;
  return Date.now() - timestamp > 15 * 60 * 1000;
}

function getDiscordUserId(interaction) {
  return interaction?.member?.user?.id || interaction?.user?.id || null;
}

function hasLinkPermissions(memberPermissions) {
  if (!memberPermissions) return false;
  try {
    const perms = BigInt(memberPermissions);
    return (perms & PERMISSION_ADMIN) === PERMISSION_ADMIN ||
      (perms & PERMISSION_MANAGE_CHANNELS) === PERMISSION_MANAGE_CHANNELS;
  } catch (err) {
    return false;
  }
}

function clampPageIndex(pageIndex, pageCount) {
  if (pageCount <= 0) return 0;
  if (pageIndex < 0) return 0;
  if (pageIndex >= pageCount) return pageCount - 1;
  return pageIndex;
}

function getVotePage(slots, pageIndex) {
  const pageCount = Math.max(1, Math.ceil(slots.length / MAX_SELECT_OPTIONS));
  const safeIndex = clampPageIndex(pageIndex || 0, pageCount);
  const start = safeIndex * MAX_SELECT_OPTIONS;
  const pageSlots = slots.slice(start, start + MAX_SELECT_OPTIONS);
  return { pageIndex: safeIndex, pageCount, pageSlots };
}

function formatVoteContent(base, pageIndex, pageCount) {
  if (pageCount > 1) {
    return `${base} (Page ${pageIndex + 1} of ${pageCount})`;
  }
  return base;
}

function buildSessionId(schedulerId, discordUserId) {
  return `${schedulerId}:${discordUserId}`;
}

function formatSlotLabel(startIso, endIso, timezone) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const zone = resolveTimeZone(timezone);
  const dateOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: zone,
  };
  const timeOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  };
  const datePart = start.toLocaleDateString("en-US", dateOptions);
  const timePart = `${start.toLocaleTimeString("en-US", timeOptions)} - ${end.toLocaleTimeString("en-US", timeOptions)}`;
  const tzAbbr = getTimeZoneAbbr(start, zone);
  return tzAbbr ? `${datePart} ${timePart} ${tzAbbr}` : `${datePart} ${timePart}`;
}

function buildVoteComponents({
  schedulerId,
  slots,
  preferredIds,
  feasibleIds,
  timezone,
  pageIndex,
  pageCount,
}) {
  const options = slots.map((slot) => ({
    label: formatSlotLabel(slot.start, slot.end, timezone),
    value: slot.id,
  }));

  const preferredSet = new Set(preferredIds || []);
  const feasibleSet = new Set(feasibleIds || []);

  const preferredOptions = options.map((option) => ({
    ...option,
    default: preferredSet.has(option.value),
  }));

  const feasibleOptions = options.map((option) => ({
    ...option,
    default: feasibleSet.has(option.value),
  }));

  const showPagination = pageCount > 1;
  const actionButtons = [];
  if (showPagination) {
    actionButtons.push(
      {
        type: ComponentType.Button,
        custom_id: `page_prev:${schedulerId}`,
        style: 2,
        label: "Previous",
        disabled: pageIndex <= 0,
      },
      {
        type: ComponentType.Button,
        custom_id: `page_next:${schedulerId}`,
        style: 2,
        label: "Next",
        disabled: pageIndex >= pageCount - 1,
      }
    );
  }
  actionButtons.push(
    {
      type: ComponentType.Button,
      custom_id: `submit_vote:${schedulerId}`,
      style: 1,
      label: "Submit",
    },
    {
      type: ComponentType.Button,
      custom_id: `clear_votes:${schedulerId}`,
      style: 2,
      label: "Clear my votes",
    },
    {
      type: ComponentType.Button,
      custom_id: `none_work:${schedulerId}`,
      style: 4,
      label: "None work for me",
    }
  );

  return [
    {
      type: 1,
      components: [
        {
          type: ComponentType.Button,
          custom_id: `label_pref:${schedulerId}`,
          style: 2,
          label: "Preferred times",
          disabled: true,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: `vote_pref:${schedulerId}`,
          placeholder: "Select preferred times",
          min_values: 0,
          max_values: Math.min(preferredOptions.length, MAX_SELECT_OPTIONS),
          options: preferredOptions,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: ComponentType.Button,
          custom_id: `label_feasible:${schedulerId}`,
          style: 2,
          label: "Feasible times",
          disabled: true,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: `vote_feasible:${schedulerId}`,
          placeholder: "Select feasible times",
          min_values: 0,
          max_values: Math.min(feasibleOptions.length, MAX_SELECT_OPTIONS),
          options: feasibleOptions,
        },
      ],
    },
    {
      type: 1,
      components: actionButtons,
    },
  ];
}

module.exports = {
  parseSnowflakeTimestamp,
  isTokenExpired,
  getDiscordUserId,
  hasLinkPermissions,
  clampPageIndex,
  getVotePage,
  formatVoteContent,
  buildSessionId,
  formatSlotLabel,
  buildVoteComponents,
};
