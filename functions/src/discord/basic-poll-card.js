const { APP_URL } = require("./config");
const { formatEmbedDescription } = require("./card-description");

const CARD_COLORS = Object.freeze({
  OPEN: 0x3b82f6,
  FINALIZED: 0x16a34a,
  CANCELLED: 0x64748b,
  DEFAULT: 0x3b82f6,
});

function normalizeStatus(status) {
  const normalized = String(status || "OPEN").trim().toUpperCase();
  if (normalized === "FINALIZED") return "FINALIZED";
  if (normalized === "CANCELLED") return "CANCELLED";
  return "OPEN";
}

function statusLabel(status) {
  if (status === "FINALIZED") return "Finalized";
  if (status === "CANCELLED") return "Cancelled";
  return "Open";
}

function voteTypeLabel(poll) {
  const voteType = poll?.settings?.voteType;
  return voteType === "RANKED_CHOICE" ? "Ranked Choice" : "Multiple Choice";
}

function toUnixSeconds(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    const epochMs = date?.getTime?.();
    return Number.isFinite(epochMs) ? Math.floor(epochMs / 1000) : null;
  }
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
}

function resolvePollUrl({ groupId, pollId }) {
  if (!groupId || !pollId) return APP_URL;
  return `${APP_URL}/groups/${groupId}/polls/${pollId}`;
}

function formatOptionsValue(options = []) {
  if (!Array.isArray(options) || options.length === 0) {
    return "No options configured.";
  }

  const lines = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index] || {};
    const label = String(option.label || `Option ${index + 1}`).trim() || `Option ${index + 1}`;
    const hasNote = String(option.note || "").trim().length > 0;
    const line = `${index + 1}. ${label}${hasNote ? " ℹ️" : ""}`;
    if (lines.join("\n").length + line.length + 1 > 1024) {
      lines.push("…");
      break;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

function formatResultsValue(poll = {}) {
  const finalResults = poll?.finalResults;
  if (!finalResults) return "Results unavailable.";

  if (finalResults.voteType === "RANKED_CHOICE") {
    const rounds = Array.isArray(finalResults.rounds) ? finalResults.rounds.length : 0;
    const winners = Array.isArray(finalResults.winnerIds) ? finalResults.winnerIds : [];
    const tied = Array.isArray(finalResults.tiedIds) ? finalResults.tiedIds : [];
    if (winners.length > 0) {
      return `Winner: **${winners.join(", ")}** (${rounds} round${rounds === 1 ? "" : "s"}).`;
    }
    if (tied.length > 0) {
      return `Tie: ${tied.join(", ")} (${rounds} round${rounds === 1 ? "" : "s"}).`;
    }
    return `No winner (${rounds} round${rounds === 1 ? "" : "s"}).`;
  }

  const rows = Array.isArray(finalResults.rows) ? finalResults.rows : [];
  if (rows.length === 0) return "No votes yet.";

  const winnerSet = new Set(Array.isArray(finalResults.winnerIds) ? finalResults.winnerIds : []);
  const sortedRows = [...rows]
    .sort((left, right) => {
      const countDiff = (right?.count || 0) - (left?.count || 0);
      if (countDiff !== 0) return countDiff;
      return (left?.order || 0) - (right?.order || 0);
    })
    .slice(0, 5);

  return sortedRows
    .map((row) => {
      const label = row?.label || row?.key || "Option";
      const count = Number.isFinite(row?.count) ? row.count : 0;
      const prefix = winnerSet.has(row?.key) ? "**" : "";
      const suffix = winnerSet.has(row?.key) ? "**" : "";
      return `${prefix}${label}${suffix}: ${count}`;
    })
    .join("\n");
}

function buildBasicPollCard({ groupId, pollId, poll, voteCount, totalParticipants }) {
  const status = normalizeStatus(poll?.status);
  const pollUrl = resolvePollUrl({ groupId, pollId });
  const unixDeadline = toUnixSeconds(poll?.settings?.deadlineAt || poll?.deadlineAt || null);
  const pending =
    Number.isFinite(totalParticipants) && Number.isFinite(voteCount)
      ? Math.max(0, totalParticipants - voteCount)
      : null;

  const fields = [
    {
      name: "Type",
      value: voteTypeLabel(poll),
      inline: true,
    },
    {
      name: "Status",
      value: statusLabel(status),
      inline: true,
    },
    {
      name: "Options",
      value: formatOptionsValue(poll?.options || []),
    },
    {
      name: "Votes",
      value:
        Number.isFinite(voteCount) && Number.isFinite(totalParticipants)
          ? `${voteCount}/${totalParticipants} voted${pending > 0 ? ` (${pending} pending)` : ""}`
          : "Unknown",
      inline: true,
    },
    {
      name: "Deadline",
      value: unixDeadline ? `<t:${unixDeadline}:R>` : "None",
      inline: true,
    },
    {
      name: "View on web",
      value: `[Open poll](${pollUrl})`,
    },
  ];

  if (status === "FINALIZED") {
    fields.push({
      name: "Results",
      value: formatResultsValue(poll),
    });
  }

  const components =
    status === "OPEN"
      ? [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                custom_id: `bp_vote:${pollId}`,
                label: "Vote",
              },
              {
                type: 2,
                style: 2,
                custom_id: `bp_finalize:${pollId}`,
                label: "Finalize",
              },
            ],
          },
        ]
      : [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                custom_id: `bp_closed:${pollId}`,
                label: "Voting Closed",
                disabled: true,
              },
              {
                type: 2,
                style: 5,
                label: "View Results",
                url: pollUrl,
              },
            ],
          },
        ];

  return {
    embeds: [
      {
        color: CARD_COLORS[status] || CARD_COLORS.DEFAULT,
        title: `📊 ${poll?.title || "Untitled Poll"}`,
        description: formatEmbedDescription({
          description: poll?.description,
          pollUrl,
        }),
        fields,
        footer: {
          text: "Quest Scheduler",
        },
      },
    ],
    components,
  };
}

module.exports = {
  CARD_COLORS,
  buildBasicPollCard,
  __test__: {
    formatOptionsValue,
    formatResultsValue,
    normalizeStatus,
    resolvePollUrl,
    toUnixSeconds,
  },
};
