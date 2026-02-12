import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  test("renders title/description and triggers callbacks", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete poll?"
        description="This removes all votes."
        confirmLabel="Delete poll"
        onConfirm={onConfirm}
        variant="destructive"
      />
    );

    expect(screen.getByText("Delete poll?")).toBeTruthy();
    expect(screen.getByText("This removes all votes.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
