import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

export function QuestingGroupSelect({
  groups = [],
  selectedId = null,
  onChange,
  label = "Questing Group (optional)",
  helperText = "Group members will be auto-added as invitees.",
  placeholder = "Select a group",
  noneLabel = "No group",
  labelClassName = "text-sm font-semibold text-slate-700 dark:text-slate-200",
  triggerClassName = "h-12 rounded-2xl px-4",
}) {
  if (!groups.length) return null;

  return (
    <div className="grid gap-2">
      <span className={labelClassName}>{label}</span>
      <Select value={selectedId || "none"} onValueChange={onChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{noneLabel}</SelectItem>
          {groups.map((group) => {
            const memberCount = (() => {
              if (typeof group.members === "number") return group.members;
              if (Array.isArray(group.members)) return group.members.length;
              if (Array.isArray(group.memberIds)) return group.memberIds.length;
              return 0;
            })();
            return (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
                {memberCount ? ` (${memberCount} members)` : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {selectedId && helperText && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      )}
    </div>
  );
}
