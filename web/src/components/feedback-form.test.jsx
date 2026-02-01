import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import FeedbackForm from "./feedback-form";
import { submitFeedback } from "../lib/data/feedback";

vi.mock("../app/useAuth", () => ({
  useAuth: () => ({ user: { uid: "user_1", email: "a@example.com" } }),
}));

vi.mock("../lib/data/feedback", () => ({
  submitFeedback: vi.fn(() => Promise.resolve()),
  MAX_FEEDBACK_FILE_SIZE: 20 * 1024 * 1024,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("FeedbackForm", () => {
  it("enables submit once required fields are filled", async () => {
    render(<FeedbackForm />);

    const submitButton = screen.getByRole("button", {
      name: /submit feedback/i,
    });
    expect(submitButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Title/i), {
      target: { value: "Bug report" },
    });
    fireEvent.change(screen.getByLabelText(/Issue type/i), {
      target: { value: "Bug" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Steps to reproduce" },
    });

    expect(submitButton.disabled).toBe(false);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledTimes(1);
    });
  });
});
