const { APP_URL } = require("./config");

function unixSeconds(iso) {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return null;
  return Math.floor(value / 1000);
}

function buildPollCard({ schedulerId, scheduler, slots }) {
  const title = scheduler.title || "Quest Session";
  const description = `Vote in Quest Scheduler: ${APP_URL}/scheduler/${schedulerId}`;

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

  if (firstSlot && lastSlot) {
    const startUnix = unixSeconds(firstSlot.start);
    const endUnix = unixSeconds(lastSlot.end);
    if (startUnix && endUnix) {
      fields.push({
        name: "Range",
        value: `<t:${startUnix}:F> -> <t:${endUnix}:F>`,
      });
    }
  }

  if (scheduler.status === "FINALIZED" && scheduler.winningSlotId) {
    const winning = sortedSlots.find((slot) => slot.id === scheduler.winningSlotId);
    const winUnix = unixSeconds(winning?.start);
    if (winUnix) {
      fields.push({
        name: "Winning slot",
        value: `<t:${winUnix}:F>`,
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

module.exports = { buildPollCard };
