import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { VotePrivacySettings } from "./vote-privacy-settings";

describe("VotePrivacySettings", () => {
  test("renders compact summary while collapsed", () => {
    render(
      <VotePrivacySettings
        expanded={false}
        voteVisibility="hidden_until_finalized"
        hideVoterIdentities
        voteAnonymization="creator_excluded"
      />
    );

    expect(screen.getByText(/Vote privacy: Visible after finalization/i)).toBeTruthy();
    expect(screen.getByText(/Identity labels: Anonymous for participants/i)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Hide identity of voters/i })).toBeNull();
  });

  test("shows organizer-only label when visibility is organizer-only", () => {
    const onHideVoterIdentitiesChange = vi.fn();

    render(
      <VotePrivacySettings
        expanded
        voteVisibility="hidden"
        hideVoterIdentities={false}
        onHideVoterIdentitiesChange={onHideVoterIdentitiesChange}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /Hide identity of voters/i });
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText(/Hide identity of voters from participants/i)).toBeTruthy();
    expect(
      screen.getByTitle(/Participants still see vote totals\./i)
    ).toBeTruthy();
    fireEvent.click(checkbox);
    expect(onHideVoterIdentitiesChange).toHaveBeenCalledWith(true);
  });

  test("shows unlock-based label for non-organizer-only hidden modes", () => {
    render(<VotePrivacySettings expanded voteVisibility="hidden_until_all_voted" />);
    expect(screen.getByText(/Hide identity of voters until votes revealed/i)).toBeTruthy();
  });

  test("hides hide voter identities checkbox under full visibility", () => {
    render(
      <VotePrivacySettings
        expanded
        voteVisibility="full_visibility"
        hideVoterIdentities
        voteAnonymization="all_participants"
      />
    );

    expect(screen.queryByRole("checkbox", { name: /Hide identity of voters/i })).toBeNull();
    expect(screen.getByText(/Identity labels: Anonymous for everyone/i)).toBeTruthy();
  });
});
