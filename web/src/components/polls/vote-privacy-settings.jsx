import { CircleHelp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DEFAULT_VOTE_ANONYMIZATION,
  DEFAULT_VOTE_VISIBILITY,
  VOTE_ANONYMIZATION_OPTIONS,
  VOTE_VISIBILITY,
  VOTE_VISIBILITY_OPTIONS,
  resolveVoteAnonymization,
  resolveVoteVisibility,
} from "../../lib/vote-visibility";

const HIDE_VOTE_LIST_TOOLTIP =
  "Participants still see vote totals. This hides the participant list showing who has or has not voted. Organizer visibility is unchanged.";

export function VotePrivacySettings({
  expanded = false,
  onExpandedChange,
  voteVisibility = DEFAULT_VOTE_VISIBILITY,
  onVoteVisibilityChange,
  hideVoterIdentities = false,
  onHideVoterIdentitiesChange,
  voteAnonymization = DEFAULT_VOTE_ANONYMIZATION,
  onVoteAnonymizationChange,
  className = "",
}) {
  const normalizedVoteVisibility = resolveVoteVisibility(voteVisibility);
  const normalizedVoteAnonymization = resolveVoteAnonymization(voteAnonymization);
  const voteVisibilityOption = VOTE_VISIBILITY_OPTIONS.find(
    (option) => option.value === normalizedVoteVisibility
  );
  const voteAnonymizationOption = VOTE_ANONYMIZATION_OPTIONS.find(
    (option) => option.value === normalizedVoteAnonymization
  );
  const hideVoterIdentitiesLocked = normalizedVoteVisibility === VOTE_VISIBILITY.FULL;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => onExpandedChange?.(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200/80 px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Advanced settings
        </span>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {expanded ? "Hide" : "Show"}
        </span>
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800">
          Vote privacy: {voteVisibilityOption?.label || "Vote visibility"}
        </span>
        {!hideVoterIdentitiesLocked && hideVoterIdentities ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800">
            Participant vote list hidden
          </span>
        ) : null}
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800">
          Identity labels: {voteAnonymizationOption?.label || "No anonymization"}
        </span>
      </div>
      {expanded ? (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="grid gap-2.5 rounded-md border border-slate-200/70 bg-white/80 p-2.5 dark:border-slate-700 dark:bg-slate-900/70 sm:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Vote privacy</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {voteVisibilityOption?.description}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
                <div className="w-full lg:max-w-xs">
                  <Select
                    value={normalizedVoteVisibility}
                    onValueChange={(value) => onVoteVisibilityChange?.(resolveVoteVisibility(value))}
                  >
                    <SelectTrigger className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs dark:border-slate-600 dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOTE_VISIBILITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!hideVoterIdentitiesLocked ? (
                  <label className="flex min-w-0 items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                      className="mt-0.5"
                      type="checkbox"
                      checked={hideVoterIdentities}
                      onChange={(event) => onHideVoterIdentitiesChange?.(event.target.checked)}
                    />
                    <span className="inline-flex min-w-0 items-start gap-1 font-semibold leading-snug text-slate-700 dark:text-slate-200">
                      <span>Hide list of participants who have already voted</span>
                      <span
                        className="inline-flex shrink-0 cursor-help items-center text-slate-500 dark:text-slate-400"
                        title={HIDE_VOTE_LIST_TOOLTIP}
                        aria-label={HIDE_VOTE_LIST_TOOLTIP}
                      >
                        <CircleHelp className="h-3.5 w-3.5" />
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>
              {!hideVoterIdentitiesLocked && hideVoterIdentities ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Participants still see vote totals, but not who has or has not voted.
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2.5 rounded-md border border-slate-200/70 bg-white/80 p-2.5 dark:border-slate-700 dark:bg-slate-900/70 sm:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Identity labels
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {voteAnonymizationOption?.description}
              </p>
            </div>
            <div className="w-full sm:max-w-xs">
              <Select
                value={normalizedVoteAnonymization}
                onValueChange={(value) => onVoteAnonymizationChange?.(resolveVoteAnonymization(value))}
              >
                <SelectTrigger className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs dark:border-slate-600 dark:bg-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOTE_ANONYMIZATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
