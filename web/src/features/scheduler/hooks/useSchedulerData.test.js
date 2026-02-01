import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSchedulerData } from "./useSchedulerData";
import { questingGroupRef } from "../../../lib/data/questingGroups";
import { useFirestoreDoc } from "../../../hooks/useFirestoreDoc";

vi.mock("../../../hooks/useFirestoreDoc", () => ({
  useFirestoreDoc: vi.fn(),
}));

vi.mock("../../../hooks/useFirestoreCollection", () => ({
  useFirestoreCollection: vi.fn(() => ({ data: [] })),
}));

vi.mock("../../../lib/data/schedulers", () => ({
  schedulerRef: vi.fn(() => "schedulerRef"),
  schedulerSlotsRef: vi.fn(() => "slotsRef"),
  schedulerVoteDocRef: vi.fn(() => "voteDocRef"),
  schedulerVotesRef: vi.fn(() => "votesRef"),
}));

vi.mock("../../../lib/data/users", () => ({
  userRef: vi.fn(() => "userRef"),
}));

vi.mock("../../../lib/data/questingGroups", () => ({
  questingGroupRef: vi.fn(() => "groupRef"),
}));

const mockUseFirestoreDoc = vi.mocked(useFirestoreDoc);
const mockQuestingGroupRef = vi.mocked(questingGroupRef);

describe("useSchedulerData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not look up a questing group when none is set", () => {
    mockUseFirestoreDoc.mockReturnValue({ data: { questingGroupId: null } });

    renderHook(() =>
      useSchedulerData({ schedulerId: "scheduler-1", user: { uid: "user-1" } })
    );

    expect(mockQuestingGroupRef).not.toHaveBeenCalled();
  });

  it("fetches a questing group when one is set", () => {
    mockUseFirestoreDoc
      .mockReturnValueOnce({ data: { questingGroupId: "group-1" } })
      .mockReturnValue({ data: null });

    renderHook(() =>
      useSchedulerData({ schedulerId: "scheduler-1", user: { uid: "user-1" } })
    );

    expect(mockQuestingGroupRef).toHaveBeenCalledWith("group-1");
  });
});
