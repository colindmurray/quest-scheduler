import { Check } from "lucide-react";
import { GROUP_COLORS } from "../../../lib/data/questingGroups";

export function GroupColorPicker({ selectedColor, onColorChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GROUP_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onColorChange(color)}
          className="relative h-8 w-8 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ backgroundColor: color, focusRingColor: color }}
          aria-label={`Select color ${color}`}
        >
          {selectedColor === color && (
            <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md" />
          )}
        </button>
      ))}
    </div>
  );
}
