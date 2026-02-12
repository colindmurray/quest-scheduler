import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PollOptionNoteDialog } from "./poll-option-note-dialog";

describe("PollOptionNoteDialog", () => {
  test("does not render when note viewer is not set", () => {
    const { container } = render(<PollOptionNoteDialog noteViewer={null} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  test("renders option note metadata and invokes close", () => {
    const onClose = vi.fn();
    render(
      <PollOptionNoteDialog
        noteViewer={{
          pollTitle: "General poll",
          optionLabel: "Pizza",
          note: "## Serving note\nUse **extra** cheese.",
        }}
        onClose={onClose}
      />
    );

    expect(screen.getByText("General poll")).toBeTruthy();
    expect(screen.getByText("Option note: Pizza")).toBeTruthy();
    expect(screen.getByText("Serving note")).toBeTruthy();
    expect(screen.getByText("extra").tagName).toBe("STRONG");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
