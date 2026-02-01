import { useState } from "react";
import { toast } from "sonner";
import {
  SimpleModal,
  SimpleModalDescription,
  SimpleModalFooter,
  SimpleModalHeader,
  SimpleModalTitle,
} from "../../../components/ui/simple-modal";

const toggleBaseClasses =
  "peer inline-flex h-5 w-10 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-slate-500 dark:focus-visible:ring-offset-slate-950";
const toggleThumbClasses =
  "pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-slate-100";

function SimpleToggle({ checked, onCheckedChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`${toggleBaseClasses} ${checked ? "bg-brand-accent" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      <span
        className={`${toggleThumbClasses} ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export function CreateGroupModal({ open, onOpenChange, onCreateGroup }) {
  const [name, setName] = useState("");
  const [memberManaged, setMemberManaged] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    setSaving(true);
    try {
      await onCreateGroup(name.trim(), memberManaged);
      setName("");
      setMemberManaged(false);
      onOpenChange(false);
      toast.success("Questing group created!");
    } catch (err) {
      console.error("Failed to create group:", err);
      toast.error(err.message || "Failed to create group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SimpleModal open={open} onOpenChange={onOpenChange}>
      <div className="max-w-md">
        <SimpleModalHeader>
          <SimpleModalTitle>Create Questing Group</SimpleModalTitle>
          <SimpleModalDescription>
            Create a named group for your adventuring party. You can invite members after creation.
          </SimpleModalDescription>
        </SimpleModalHeader>

        <form onSubmit={handleSubmit}>
          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
              Group name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tuesday Night Crew"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                autoFocus
              />
            </label>

            <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Member-managed
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Allow any member to invite or remove others
                </p>
              </div>
              <SimpleToggle checked={memberManaged} onCheckedChange={setMemberManaged} />
            </div>
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create group"}
            </button>
          </SimpleModalFooter>
        </form>
      </div>
    </SimpleModal>
  );
}
