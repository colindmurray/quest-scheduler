import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VoteToggle } from "./vote-toggle";

describe("VoteToggle", () => {
  it("renders a switch with the checked state", () => {
    const { getByRole } = render(
      <VoteToggle checked disabled={false} onChange={() => {}} />
    );

    const toggle = getByRole("switch");
    expect(toggle.getAttribute("data-state")).toBe("checked");
  });
});
