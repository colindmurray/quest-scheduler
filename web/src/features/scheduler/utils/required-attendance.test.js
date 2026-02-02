import { describe, expect, it } from "vitest";
import {
  buildAttendanceSetFromVoters,
  filterSlotsByRequiredAttendance,
} from "./required-attendance";

describe("required attendance helpers", () => {
  it("builds an attendance set from feasible voters", () => {
    const voters = {
      feasible: [
        { email: "DM@Example.com" },
        { email: "player@example.com" },
        { email: null },
      ],
    };

    const set = buildAttendanceSetFromVoters(voters);

    expect(set.has("dm@example.com")).toBe(true);
    expect(set.has("player@example.com")).toBe(true);
    expect(set.has("DM@Example.com")).toBe(false);
    expect(set.size).toBe(2);
  });

  it("filters slots by required attendance", () => {
    const slots = [{ id: "slot-a" }, { id: "slot-b" }, { id: "slot-c" }];
    const slotVotersById = {
      "slot-a": {
        feasible: [{ email: "dm@example.com" }],
      },
      "slot-b": {
        feasible: [{ email: "dm@example.com" }, { email: "player@example.com" }],
      },
      "slot-c": {
        feasible: [{ email: "player@example.com" }],
      },
    };

    const dmOnly = filterSlotsByRequiredAttendance({
      slots,
      slotVotersById,
      requiredEmails: ["DM@Example.com"],
    });

    expect(dmOnly.map((slot) => slot.id)).toEqual(["slot-a", "slot-b"]);

    const dmAndPlayer = filterSlotsByRequiredAttendance({
      slots,
      slotVotersById,
      requiredEmails: ["dm@example.com", "player@example.com"],
    });

    expect(dmAndPlayer.map((slot) => slot.id)).toEqual(["slot-b"]);

    const emptyRequired = filterSlotsByRequiredAttendance({
      slots,
      slotVotersById,
      requiredEmails: [],
    });

    expect(emptyRequired.map((slot) => slot.id)).toEqual([
      "slot-a",
      "slot-b",
      "slot-c",
    ]);
  });
});
