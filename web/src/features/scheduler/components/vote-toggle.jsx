import { Switch } from "../../../components/ui/switch";

export function VoteToggle({ checked, disabled, onChange }) {
  return <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />;
}
