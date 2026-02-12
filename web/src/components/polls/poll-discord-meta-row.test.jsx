import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PollDiscordMetaRow } from "./poll-discord-meta-row";

describe("PollDiscordMetaRow", () => {
  test("returns nothing when there is no discord metadata", () => {
    const { container } = render(<PollDiscordMetaRow />);
    expect(container.innerHTML).toBe("");
  });

  test("renders status and discord link", () => {
    render(
      <PollDiscordMetaRow
        statusLabel="Posted in Discord"
        messageUrl="https://discord.com/channels/guild/channel/message"
      />
    );

    expect(screen.getByText("Posted in Discord")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View in Discord" })).toBeTruthy();
  });

  test("renders pending sync chip", () => {
    render(<PollDiscordMetaRow pendingSync />);
    expect(screen.getByText("Sync pending")).toBeTruthy();
  });
});
