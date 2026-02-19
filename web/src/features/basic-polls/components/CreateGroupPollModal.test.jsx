import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { CreateGroupPollModal } from "./CreateGroupPollModal";

const createBasicPollMock = vi.fn();
const updateBasicPollMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args) => toastSuccessMock(...args),
  },
}));

vi.mock("../../../lib/data/basicPolls", () => ({
  createBasicPoll: (...args) => createBasicPollMock(...args),
  updateBasicPoll: (...args) => updateBasicPollMock(...args),
}));

describe("CreateGroupPollModal", () => {
  beforeEach(() => {
    createBasicPollMock.mockReset();
    updateBasicPollMock.mockReset();
    toastSuccessMock.mockReset();
    createBasicPollMock.mockResolvedValue("poll-created");
    updateBasicPollMock.mockResolvedValue(undefined);
  });

  test("supports edit mode with locked questing group and saves via updateBasicPoll", async () => {
    const onOpenChange = vi.fn();
    const onEdited = vi.fn();

    render(
      <CreateGroupPollModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        groupId="group-1"
        groupName="Fellowship"
        initialPoll={{
          id: "poll-1",
          title: "Snack Vote",
          description: "Pick food",
          options: [
            { id: "opt-1", label: "Pizza", order: 0, note: "" },
            { id: "opt-2", label: "Burgers", order: 1, note: "" },
          ],
          settings: {
            voteType: "MULTIPLE_CHOICE",
            allowMultiple: false,
            allowWriteIn: false,
          },
        }}
        onEdited={onEdited}
      />
    );

    expect(screen.getByText("Edit poll")).toBeTruthy();
    expect(screen.queryByText("Select a questing group")).toBeNull();
    expect(screen.getByDisplayValue("Snack Vote")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("What should we decide?"), {
      target: { value: "Snack Vote Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateBasicPollMock).toHaveBeenCalledWith(
        "group-1",
        "poll-1",
        expect.objectContaining({
          title: "Snack Vote Updated",
          description: "Pick food",
        })
      );
    });
    expect(onEdited).toHaveBeenCalledWith("poll-1", "group-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccessMock).toHaveBeenCalledWith("Poll updated");
  });

  test("shows customization chips and allows removing them", () => {
    const onOpenChange = vi.fn();

    render(
      <CreateGroupPollModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        groupId="group-1"
        groupName="Fellowship"
        initialPoll={{
          id: "poll-1",
          title: "Snack Vote",
          description: "Pick food",
          options: [
            { id: "opt-1", label: "Pizza", order: 0, note: "" },
            { id: "opt-2", label: "Burgers", order: 1, note: "" },
            { id: "opt-3", label: "Tacos", order: 2, note: "" },
            { id: "opt-4", label: "Sushi", order: 3, note: "" },
          ],
          settings: {
            voteType: "MULTIPLE_CHOICE",
            allowMultiple: true,
            maxSelections: 3,
            allowWriteIn: false,
          },
        }}
      />
    );

    expect(screen.getByText("Allow multiple")).toBeTruthy();
    expect(screen.getByText("Max selections: 3")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Remove max selections customization"));
    expect(screen.queryByText("Max selections: 3")).toBeNull();

    fireEvent.click(screen.getByLabelText("Remove allow multiple customization"));
    expect(screen.queryByText("Allow multiple")).toBeNull();
  });

  test("validates max selections bounds against option count", async () => {
    const onOpenChange = vi.fn();

    render(
      <CreateGroupPollModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        groupId="group-1"
        groupName="Fellowship"
        initialPoll={{
          id: "poll-1",
          title: "Snack Vote",
          description: "Pick food",
          options: [
            { id: "opt-1", label: "Pizza", order: 0, note: "" },
            { id: "opt-2", label: "Burgers", order: 1, note: "" },
            { id: "opt-3", label: "Tacos", order: 2, note: "" },
            { id: "opt-4", label: "Sushi", order: 3, note: "" },
          ],
          settings: {
            voteType: "MULTIPLE_CHOICE",
            allowMultiple: true,
            maxSelections: 2,
            allowWriteIn: false,
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Max selections must be greater than 2 and less than the total option count.")
      ).toBeTruthy();
    });
    expect(updateBasicPollMock).not.toHaveBeenCalled();
  });

  test("persists hide voter identities toggle", async () => {
    render(
      <CreateGroupPollModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        groupId="group-1"
        groupName="Fellowship"
        initialPoll={{
          id: "poll-1",
          title: "Snack Vote",
          description: "Pick food",
          options: [
            { id: "opt-1", label: "Pizza", order: 0, note: "" },
            { id: "opt-2", label: "Burgers", order: 1, note: "" },
          ],
          settings: {
            voteType: "MULTIPLE_CHOICE",
            allowMultiple: false,
            allowWriteIn: false,
          },
          voteVisibility: "hidden",
          hideVoterIdentities: false,
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Hide voter names from participants/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateBasicPollMock).toHaveBeenCalledWith(
        "group-1",
        "poll-1",
        expect.objectContaining({
          hideVoterIdentities: true,
          voteAnonymization: "none",
        })
      );
    });
  });

  test("hides identity toggle when vote visibility is full", () => {
    render(
      <CreateGroupPollModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        groupId="group-1"
        groupName="Fellowship"
        initialPoll={{
          id: "poll-1",
          title: "Snack Vote",
          description: "Pick food",
          options: [
            { id: "opt-1", label: "Pizza", order: 0, note: "" },
            { id: "opt-2", label: "Burgers", order: 1, note: "" },
          ],
          voteVisibility: "full_visibility",
          hideVoterIdentities: true,
          settings: {
            voteType: "MULTIPLE_CHOICE",
            allowMultiple: false,
            allowWriteIn: false,
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/i }));
    const checkbox = screen.queryByRole("checkbox", { name: /Hide voter names from participants/i });
    expect(checkbox).toBeNull();
  });
});
