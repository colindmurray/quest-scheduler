import { PollMarkdownContent } from "./poll-markdown-content";
import { PollParticipantSummary } from "./poll-participant-summary";

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function BasicPollVotingCard({
  poll,
  participantCount = 0,
  voteCount = 0,
  hasSubmitted = false,
  myVote = null,
  draft = {},
  canVote = false,
  cardBusy = false,
  voteError = null,
  isCreator = false,
  lifecycleBusy = false,
  isHighlighted = false,
  parentCancelled = false,
  onSetRef,
  onMoveRankedOption,
  onAddRankedOption,
  onRemoveRankedOption,
  onSelectOption,
  onChangeOtherText,
  onSubmitVote,
  onClearVote,
  onFinalizePoll,
  onReopenPoll,
  onViewOptionNote,
  eligibleUsers = [],
  votedUsers = [],
  pendingUsers = [],
}) {
  const voteType = poll?.settings?.voteType || "MULTIPLE_CHOICE";
  const isRanked = voteType === "RANKED_CHOICE";
  const allowMultiple = poll?.settings?.allowMultiple === true;
  const allowWriteIn = poll?.settings?.allowWriteIn === true;
  const selectedOptionIds = Array.isArray(draft.optionIds) ? draft.optionIds : [];
  const otherText = String(draft.otherText || "");
  const rankings = Array.isArray(draft.rankings) ? draft.rankings : [];
  const sortedOptions = [...(Array.isArray(poll?.options) ? poll.options : [])].sort((left, right) => {
    const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const optionsById = new Map(
    sortedOptions.filter((option) => option?.id).map((option) => [option.id, option])
  );
  const rankedOptions = rankings
    .map((optionId) => sortedOptions.find((option) => option.id === optionId))
    .filter(Boolean);
  const unrankedOptions = sortedOptions.filter((option) => option?.id && !rankings.includes(option.id));
  const embeddedFinalResults = poll?.finalResults || null;
  const pollStatus = poll?.status || "OPEN";
  const isFinalized = pollStatus === "FINALIZED";
  const requiredPending = poll?.required && !hasSubmitted;
  const closedAt = toDate(poll?.settings?.deadlineAt || poll?.deadlineAt || null);
  const deadlinePassed = Boolean(closedAt && closedAt.getTime() <= Date.now());

  return (
    <div
      key={poll?.id}
      id={poll?.id ? `embedded-poll-${poll.id}` : undefined}
      ref={onSetRef}
      className={`rounded-2xl border bg-white p-4 transition-all dark:bg-slate-900 ${
        isHighlighted
          ? "border-brand-primary ring-2 ring-brand-primary/30 dark:border-brand-primary"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {poll?.title || "Untitled poll"}
            </h4>
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {isRanked ? "Ranked choice" : "Multiple choice"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                requiredPending
                  ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200"
                  : poll?.required
                    ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200"
                    : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {poll?.required ? "Required" : "Optional"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isFinalized
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-900/30 dark:text-emerald-200"
                  : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {isFinalized ? "Finalized" : "Open"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {voteCount}/{participantCount} voted
          </p>
          <PollParticipantSummary
            eligibleUsers={eligibleUsers}
            votedUsers={votedUsers}
            pendingUsers={pendingUsers}
            eligibleCount={participantCount}
            votedCount={voteCount}
            showPending={!isFinalized}
            className="mt-1"
          />
          <PollMarkdownContent content={poll?.description} />
        </div>
        {isCreator && (onReopenPoll || onFinalizePoll) ? (
          <div className="flex items-center gap-2">
            {isFinalized ? (
              <button
                type="button"
                onClick={onReopenPoll}
                disabled={cardBusy}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {lifecycleBusy ? "Re-opening..." : "Re-open poll"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onFinalizePoll}
                disabled={cardBusy}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {lifecycleBusy ? "Finalizing..." : "Finalize poll"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {canVote ? (
        isRanked ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Ranked
              </p>
              <div className="mt-2 space-y-2">
                {rankedOptions.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No rankings yet.</p>
                ) : (
                  rankedOptions.map((option, index) => (
                    <div
                      key={option.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                    >
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate text-slate-800 dark:text-slate-200">
                          {option.label}
                        </span>
                        {String(option?.note || "").trim() ? (
                          <button
                            type="button"
                            onClick={() => onViewOptionNote?.(poll?.title, option)}
                            aria-label={`View note for ${option.label}`}
                            className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                          >
                            View note
                          </button>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => onMoveRankedOption?.(option.id, "up")}
                        disabled={cardBusy || index === 0}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveRankedOption?.(option.id, "down")}
                        disabled={cardBusy || index === rankedOptions.length - 1}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRankedOption?.(option.id)}
                        disabled={cardBusy}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Unranked
              </p>
              <div className="mt-2 space-y-2">
                {unrankedOptions.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-800 dark:text-slate-200">
                        {option.label}
                      </span>
                      {String(option?.note || "").trim() ? (
                        <button
                          type="button"
                          onClick={() => onViewOptionNote?.(poll?.title, option)}
                          aria-label={`View note for ${option.label}`}
                          className="mt-1 text-xs font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                        >
                          View note
                        </button>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddRankedOption?.(option.id)}
                      disabled={cardBusy}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                    >
                      Rank
                    </button>
                  </div>
                ))}
                {unrankedOptions.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">All options ranked.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {sortedOptions.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <input
                  type={allowMultiple ? "checkbox" : "radio"}
                  name={`embedded-${poll?.id}`}
                  checked={selectedOptionIds.includes(option.id)}
                  onChange={() => onSelectOption?.(option.id)}
                  disabled={cardBusy}
                />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="text-slate-800 dark:text-slate-200">{option.label}</span>
                  {String(option?.note || "").trim() ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onViewOptionNote?.(poll?.title, option);
                      }}
                      aria-label={`View note for ${option.label}`}
                      className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      View note
                    </button>
                  ) : null}
                </span>
              </label>
            ))}
            {allowWriteIn ? (
              <label className="block rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                <span className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Other
                </span>
                <textarea
                  value={otherText}
                  onChange={(event) => onChangeOtherText?.(event.target.value)}
                  rows={2}
                  disabled={cardBusy}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>
            ) : null}
          </div>
        )
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          <p className="font-semibold">
            {isFinalized
              ? "Voting is closed for this poll."
              : parentCancelled
                ? "Voting is closed because this session is cancelled."
                : deadlinePassed
                  ? "Voting is closed because the deadline has passed."
                  : "Voting is closed for this poll."}
          </p>
          {isRanked ? (
            embeddedFinalResults?.voteType === "RANKED_CHOICE" ? (
              <div className="mt-2 space-y-2">
                {Array.isArray(embeddedFinalResults?.tiedIds) && embeddedFinalResults.tiedIds.length > 1 ? (
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    Final result: tie
                  </p>
                ) : Array.isArray(embeddedFinalResults?.winnerIds) &&
                  embeddedFinalResults.winnerIds.length > 0 ? (
                  <p>
                    Winner:{" "}
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {sortedOptions.find((option) => option.id === embeddedFinalResults.winnerIds[0])
                        ?.label || embeddedFinalResults.winnerIds[0]}
                    </span>
                  </p>
                ) : (
                  <p>Final result: no winner determined.</p>
                )}
                {Array.isArray(embeddedFinalResults?.rounds) && embeddedFinalResults.rounds.length > 0 ? (
                  <div className="space-y-2">
                    {embeddedFinalResults.rounds.map((roundData, index) => (
                      <div
                        key={`${poll?.id}-round-${roundData?.round || index + 1}`}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          Round {roundData?.round || index + 1}
                        </p>
                        <div className="mt-1 space-y-1">
                          {sortedOptions.map((option) => (
                            <div
                              key={`${poll?.id}-round-${roundData?.round || index + 1}-${option.id}`}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span>{option.label}</span>
                                {String(option?.note || "").trim() ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewOptionNote?.(poll?.title, option)}
                                    aria-label={`View note for ${option.label}`}
                                    className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    View note
                                  </button>
                                ) : null}
                              </span>
                              <span>{roundData?.counts?.[option.id] ?? 0}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          Exhausted ballots: {roundData?.exhausted ?? 0}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Final round data unavailable.</p>
                )}
              </div>
            ) : (
              <p className="mt-1">Final results unavailable.</p>
            )
          ) : embeddedFinalResults?.voteType === "MULTIPLE_CHOICE" &&
            Array.isArray(embeddedFinalResults?.rows) ? (
            <div className="mt-2 space-y-2">
              {embeddedFinalResults.rows.map((row, index) => {
                const optionForRow = optionsById.get(row?.key) || null;
                const hasNote = String(optionForRow?.note || "").trim().length > 0;
                return (
                  <div key={`${poll?.id}-result-${row?.key || index}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                        <span>{row?.label || `Option ${index + 1}`}</span>
                        {hasNote ? (
                          <button
                            type="button"
                            onClick={() => onViewOptionNote?.(poll?.title, optionForRow)}
                            aria-label={`View note for ${row?.label || `Option ${index + 1}`}`}
                            className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            View note
                          </button>
                        ) : null}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {(row?.count ?? 0)} vote{row?.count === 1 ? "" : "s"}
                        {Number.isFinite(row?.percentage) ? ` (${row.percentage}%)` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-1.5 rounded-full bg-slate-600 dark:bg-slate-300"
                        style={{
                          width: `${Math.max(
                            Number.isFinite(row?.percentage) ? row.percentage : 0,
                            row?.count > 0 ? 4 : 0
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-1">Final results unavailable.</p>
          )}
          {myVote ? (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Your vote is on record.
            </p>
          ) : null}
        </div>
      )}

      {canVote ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSubmitVote}
            disabled={cardBusy}
            className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {cardBusy ? "Saving..." : isRanked ? "Submit ranking" : "Submit vote"}
          </button>
          <button
            type="button"
            onClick={onClearVote}
            disabled={cardBusy}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Clear vote
          </button>
        </div>
      ) : null}

      {voteError ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{voteError}</p>
      ) : null}
    </div>
  );
}
