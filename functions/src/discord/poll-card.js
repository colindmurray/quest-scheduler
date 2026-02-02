const { APP_URL } = require("./config");
const { formatDateTime, formatDateTimeRange } = require("./time-utils");

function buildPollCard({ schedulerId, scheduler, slots, voteCount, totalParticipants }) {
  const title = scheduler.title || "Quest Session";
  const description = `Vote in Quest Scheduler: ${APP_URL}/scheduler/${schedulerId}`;
  const pollTimeZone = scheduler.timezone || null;

  const sortedSlots = [...slots].sort((a, b) => new Date(a.start) - new Date(b.start));
  const firstSlot = sortedSlots[0];
  const lastSlot = sortedSlots[sortedSlots.length - 1];

  const fields = [
    {
      name: "Slots",
      value: `${sortedSlots.length} available`,
      inline: true,
    },
    {
      name: "Status",
      value: scheduler.status || "OPEN",
      inline: true,
    },
  ];

  if (typeof voteCount === "number" && typeof totalParticipants === "number" && totalParticipants > 0) {
    const pending = totalParticipants - voteCount;
    fields.push({
      name: "Votes",
      value: `${voteCount}/${totalParticipants} voted${pending > 0 ? ` (${pending} pending)` : ""}`,
      inline: true,
    });
  }

  if (firstSlot && lastSlot) {
    const rangeLabel = formatDateTimeRange(firstSlot.start, lastSlot.end, pollTimeZone);
    if (rangeLabel) {
      fields.push({
        name: "Range",
        value: rangeLabel,
      });
    }
  }

  if (scheduler.status === "FINALIZED" && scheduler.winningSlotId) {
    const winning = sortedSlots.find((slot) => slot.id === scheduler.winningSlotId);
    const winLabel = formatDateTime(winning?.start, pollTimeZone);
    if (winLabel) {
      fields.push({
        name: "Winning slot",
        value: winLabel,
      });
    }
  }

  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          custom_id: `vote_btn:${schedulerId}`,
          label: scheduler.status === "FINALIZED" ? "Voting closed" : "Vote",
          disabled: scheduler.status === "FINALIZED",
        },
      ],
    },
  ];

  return {
    embeds: [
      {
        title,
        description,
        fields,
      },
    ],
    components,
  };
}

function buildPollStatusCard({ title, status, description }) {
  return {
    embeds: [
      {
        title: title || "Quest Session",
        description,
        fields: [
          {
            name: "Status",
            value: status,
          },
        ],
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: status,
            disabled: true,
          },
        ],
      },
    ],
  };
}

module.exports = { buildPollCard, buildPollStatusCard };
