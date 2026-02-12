import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { GeneralPollsSection } from "./general-polls-section";

vi.mock("../../../components/polls/basic-poll-card", () => ({
  BasicPollCard: ({ poll, onOpen }) => (
    <button type="button" onClick={onOpen}>
      Open {poll.title}
    </button>
  ),
}));

function buildProps(overrides = {}) {
  return {
    hasQuestingGroupMembership: true,
    canCreateGeneralPoll: true,
    onCreateGeneralPoll: vi.fn(),
    basicPollTab: "needs-vote",
    setBasicPollTab: vi.fn(),
    basicPollBuckets: {
      "needs-vote": [{ parentType: "group", parentId: "g", pollId: "p1", title: "Need vote" }],
      "open-voted": [],
      closed: [],
      archived: [],
    },
    basicPollLoading: false,
    visibleBasicPolls: [{ parentType: "group", parentId: "g", pollId: "p1", title: "Need vote" }],
    basicPollArchiveBusy: {},
    basicPollActionBusy: {},
    onOpenBasicPoll: vi.fn(),
    onToggleBasicPollArchive: vi.fn(),
    onFinalizeBasicPoll: vi.fn(),
    onReopenBasicPoll: vi.fn(),
    onEditBasicPoll: vi.fn(),
    onDeleteBasicPoll: vi.fn(),
    ...overrides,
  };
}

describe("GeneralPollsSection", () => {
  test("shows loading state", () => {
    render(<GeneralPollsSection {...buildProps({ basicPollLoading: true, visibleBasicPolls: [] })} />);
    expect(screen.getByText("Loading general polls...")).toBeTruthy();
  });

  test("renders create action and poll card callbacks", () => {
    const props = buildProps();
    render(<GeneralPollsSection {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /create new general poll/i }));
    fireEvent.click(screen.getByRole("button", { name: /open need vote/i }));
    fireEvent.click(screen.getByRole("button", { name: /open voted \(0\)/i }));

    expect(props.onCreateGeneralPoll).toHaveBeenCalledTimes(1);
    expect(props.onOpenBasicPoll).toHaveBeenCalledWith(props.visibleBasicPolls[0]);
    expect(props.setBasicPollTab).toHaveBeenCalledWith("open-voted");
  });

  test("shows empty-state text for selected tab", () => {
    render(
      <GeneralPollsSection
        {...buildProps({
          basicPollTab: "archived",
          visibleBasicPolls: [],
          basicPollBuckets: { "needs-vote": [], "open-voted": [], closed: [], archived: [] },
        })}
      />
    );

    expect(screen.getByText("No archived general polls yet.")).toBeTruthy();
  });
});
