import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Accessible on/off switch (Radix). Label is optional and sits to the right of
 * the track. Controlled: pass `checked` + `onChange`.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm text-foreground",
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
      )}
    >
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export default ToggleSwitch;
