import { describe, expect, it, vi } from "vitest";
import { InteractionType } from "discord-api-types/v10";
import * as commandDispatch from "./command-dispatch";

const {
  dispatchApplicationCommand,
  dispatchMessageComponent,
  dispatchInteraction,
} = commandDispatch;

describe("discord command dispatch", () => {
  it("dispatches supported application commands", async () => {
    const handlePollCreate = vi.fn().mockResolvedValue(undefined);
    const handled = await dispatchApplicationCommand({
      interaction: {
        type: InteractionType.ApplicationCommand,
        data: { name: "poll-create" },
      },
      handlers: { handlePollCreate },
    });

    expect(handled).toBe(true);
    expect(handlePollCreate).toHaveBeenCalledTimes(1);
  });

  it("dispatches message component actions with extra fixed args", async () => {
    const handleVotePage = vi.fn().mockResolvedValue(undefined);
    const handled = await dispatchMessageComponent({
      interaction: {
        type: InteractionType.MessageComponent,
        data: { custom_id: "page_prev:scheduler-1" },
      },
      handlers: { handleVotePage },
      respondWithError: vi.fn(),
      errorMessages: { missingPollId: "missing" },
    });

    expect(handled).toBe(true);
    expect(handleVotePage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: InteractionType.MessageComponent,
      }),
      "scheduler-1",
      "prev"
    );
  });

  it("returns handled and responds with error when component id is missing", async () => {
    const respondWithError = vi.fn().mockResolvedValue(undefined);
    const handled = await dispatchMessageComponent({
      interaction: {
        type: InteractionType.MessageComponent,
        data: { custom_id: "bp_submit:" },
      },
      handlers: {
        handleBasicPollSubmit: vi.fn(),
      },
      respondWithError,
      errorMessages: { missingPollId: "Missing poll id" },
    });

    expect(handled).toBe(true);
    expect(respondWithError).toHaveBeenCalledWith(
      expect.objectContaining({ type: InteractionType.MessageComponent }),
      "Missing poll id"
    );
  });

  it("returns false for unknown interactions", async () => {
    const handled = await dispatchInteraction({
      interaction: {
        type: InteractionType.ApplicationCommand,
        data: { name: "unknown" },
      },
      handlers: {},
      respondWithError: vi.fn(),
      errorMessages: {},
    });

    expect(handled).toBe(false);
  });
});
