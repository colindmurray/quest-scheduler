import { describe, expect, test } from "vitest";
import {
  addRankedOptionToVoteDraft,
  moveRankedOptionInVoteDraft,
  removeRankedOptionFromVoteDraft,
  setMultipleChoiceOptionOnVoteDraft,
  setOtherTextOnVoteDraft,
} from "./vote-draft";

describe("basic poll vote draft helpers", () => {
  test("toggles single-select options", () => {
    const first = setMultipleChoiceOptionOnVoteDraft({}, "opt-1", { allowMultiple: false });
    expect(first.limitReached).toBe(false);
    expect(first.draft.optionIds).toEqual(["opt-1"]);

    const cleared = setMultipleChoiceOptionOnVoteDraft(first.draft, "opt-1", { allowMultiple: false });
    expect(cleared.limitReached).toBe(false);
    expect(cleared.draft.optionIds).toEqual([]);
  });

  test("toggles multi-select options with max selection enforcement", () => {
    const baseDraft = { optionIds: ["opt-1"] };
    const added = setMultipleChoiceOptionOnVoteDraft(baseDraft, "opt-2", { allowMultiple: true });
    expect(added.limitReached).toBe(false);
    expect(added.draft.optionIds).toEqual(["opt-1", "opt-2"]);

    const removed = setMultipleChoiceOptionOnVoteDraft(added.draft, "opt-1", { allowMultiple: true });
    expect(removed.limitReached).toBe(false);
    expect(removed.draft.optionIds).toEqual(["opt-2"]);

    const limited = setMultipleChoiceOptionOnVoteDraft(
      { optionIds: ["opt-1", "opt-2"] },
      "opt-3",
      { allowMultiple: true, maxSelections: 2 }
    );
    expect(limited.limitReached).toBe(true);
    expect(limited.draft).toEqual({ optionIds: ["opt-1", "opt-2"] });
  });

  test("updates other text without forcing a re-write when unchanged", () => {
    const initial = { otherText: "hello" };
    expect(setOtherTextOnVoteDraft(initial, "hello")).toBe(initial);
    expect(setOtherTextOnVoteDraft(initial, "updated")).toEqual({ otherText: "updated" });
  });

  test("adds, reorders, and removes ranked options", () => {
    const added = addRankedOptionToVoteDraft({}, "opt-1");
    expect(added.rankings).toEqual(["opt-1"]);
    expect(addRankedOptionToVoteDraft(added, "opt-1")).toBe(added);

    const second = addRankedOptionToVoteDraft(added, "opt-2");
    const movedUp = moveRankedOptionInVoteDraft(second, "opt-2", "up");
    expect(movedUp.rankings).toEqual(["opt-2", "opt-1"]);

    const movedPastEdge = moveRankedOptionInVoteDraft(movedUp, "opt-2", "up");
    expect(movedPastEdge).toBe(movedUp);

    const removed = removeRankedOptionFromVoteDraft(movedUp, "opt-2");
    expect(removed.rankings).toEqual(["opt-1"]);
    expect(removeRankedOptionFromVoteDraft(removed, "missing")).toBe(removed);
  });
});
