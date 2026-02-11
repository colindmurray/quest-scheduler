import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { FinalizeEmbeddedPollsChoiceDialog } from "./finalize-embedded-polls-choice-dialog";

describe("FinalizeEmbeddedPollsChoiceDialog", () => {
  test("renders count and triggers finalize actions", () => {
    const onOpenChange = vi.fn();
    const onFinalizeAll = vi.fn();
    const onFinalizeSessionOnly = vi.fn();

    render(
      <FinalizeEmbeddedPollsChoiceDialog
        open
        onOpenChange={onOpenChange}
        unfinalizedCount={3}
        onFinalizeAll={onFinalizeAll}
        onFinalizeSessionOnly={onFinalizeSessionOnly}
      />
    );

    expect(screen.getByText(/3 embedded polls/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Finalize session only" }));
    expect(onFinalizeSessionOnly).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Finalize session + embedded polls" }));
    expect(onFinalizeAll).toHaveBeenCalledTimes(1);
  });
});
