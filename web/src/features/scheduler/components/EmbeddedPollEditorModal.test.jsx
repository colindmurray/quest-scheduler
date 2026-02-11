import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { EmbeddedPollEditorModal } from "./EmbeddedPollEditorModal";

describe("EmbeddedPollEditorModal", () => {
  test("submits normalized embedded poll payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <EmbeddedPollEditorModal
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "  Food poll  " },
    });
    const optionInputs = screen.getAllByPlaceholderText(/Option /i);
    fireEvent.change(optionInputs[0], { target: { value: " Pizza " } });
    fireEvent.change(optionInputs[1], { target: { value: " Tacos " } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Required poll" }));
    fireEvent.click(screen.getByRole("button", { name: "Add poll" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.title).toBe("Food poll");
    expect(payload.required).toBe(true);
    expect(payload.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Pizza", order: 0 }),
        expect.objectContaining({ label: "Tacos", order: 1 }),
      ])
    );
    expect(payload.settings).toEqual(
      expect.objectContaining({
        voteType: "MULTIPLE_CHOICE",
        allowMultiple: false,
        allowWriteIn: false,
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test("loads initial embedded poll values for editing", () => {
    render(
      <EmbeddedPollEditorModal
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        initialPoll={{
          id: "poll-1",
          title: "Existing poll",
          description: "Existing description",
          required: true,
          options: [
            { id: "opt-1", label: "One", order: 0, note: "" },
            { id: "opt-2", label: "Two", order: 1, note: "" },
          ],
          settings: { voteType: "RANKED_CHOICE" },
        }}
      />
    );

    expect(screen.getByDisplayValue("Existing poll")).toBeTruthy();
    expect(screen.getByDisplayValue("Existing description")).toBeTruthy();
    expect(screen.getByRole("combobox").value).toBe("RANKED_CHOICE");
    expect(screen.getByRole("checkbox", { name: "Required poll" }).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Save poll" })).toBeTruthy();
  });
});
