import { Switch } from "../../../components/ui/switch";

export function VoteToggle({ checked, disabled, onChange, label = null }) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-label={label || undefined}
    />
  );
}
