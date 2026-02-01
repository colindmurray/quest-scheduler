import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { InvitePanel } from "./invite-panel";
import { QuestingGroupSelect } from "./questing-group-select";

export function CloneDialog({
  open,
  onOpenChange,
  cloneTitle,
  onChangeCloneTitle,
  cloneGroupId,
  onChangeGroupId,
  groupOptions = [],
  groupHelperText = "Group members will be auto-added as invitees.",
  includedUser = null,
  groupName = null,
  groupColor = null,
  groupMembers = [],
  inviteUsers = [],
  onRemoveInvite,
  inviteEmptyLabel = "No additional invitees yet.",
  recommendedUsers = [],
  onAddInvite,
  inputValue,
  onInputChange,
  onAddInput,
  inviteError,
  cloneClearVotes,
  onToggleClearVotes,
  onClone,
  saving = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clone session poll</DialogTitle>
          <DialogDescription>
            Duplicate this poll with a fresh link and optional vote reset.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            New poll name
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={cloneTitle}
              onChange={(event) => onChangeCloneTitle(event.target.value)}
            />
          </label>

          <QuestingGroupSelect
            groups={groupOptions}
            selectedId={cloneGroupId}
            onChange={onChangeGroupId}
            labelClassName="text-xs font-semibold text-slate-500 dark:text-slate-400"
            triggerClassName="h-10 rounded-xl px-3 text-xs"
            helperText={groupHelperText}
          />

          <InvitePanel
            includedUser={includedUser}
            groupName={groupName}
            groupColor={groupColor}
            groupMembers={groupMembers}
            inviteUsers={inviteUsers}
            onRemoveInvite={onRemoveInvite}
            inviteEmptyLabel={inviteEmptyLabel}
            recommendedUsers={recommendedUsers}
            onAddInvite={onAddInvite}
            inputValue={inputValue}
            onInputChange={onInputChange}
            onAddInput={onAddInput}
            error={inviteError}
            showInviteAvatars={false}
            showRecommendedAvatars={false}
          />

          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={cloneClearVotes}
              onChange={(event) => onToggleClearVotes(event.target.checked)}
            />
            Clear votes in the cloned poll
          </label>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClone}
            disabled={saving}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {saving ? "Cloning..." : "Clone poll"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
