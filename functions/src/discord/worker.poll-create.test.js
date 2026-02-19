import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

let worker;
let editOriginalInteractionResponseMock;
let createChannelMessageMock;
let deleteChannelMessageMock;
let queueNotificationEventMock;
let buildBasicPollCardMock;

const option = (name, value) => ({ name, value });

function buildInteraction(options = []) {
  return {
    id: "interaction-poll-create",
    token: "token",
    applicationId: "app",
    channelId: "channel-1",
    guildId: "guild-1",
    member: { user: { id: "discord-user-1" } },
    data: {
      name: "poll-create",
      options,
    },
  };
}

function buildSubcommandInteraction(subcommand, options = []) {
  return buildInteraction([
    {
      type: 1,
      name: subcommand,
      options,
    },
  ]);
}

describe("discord worker poll-create", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    editOriginalInteractionResponseMock = vi.fn().mockResolvedValue({ ok: true });
    createChannelMessageMock = vi.fn().mockResolvedValue({ id: "discord-msg-1" });
    deleteChannelMessageMock = vi.fn().mockResolvedValue({ ok: true });
    queueNotificationEventMock = vi.fn().mockResolvedValue({ eventId: "evt-1" });
    buildBasicPollCardMock = vi.fn().mockReturnValue({
      embeds: [{ title: "Poll Card" }],
      components: [],
    });

    const state = {
      linkExists: true,
      linkData: { qsUserId: "qs-user-1" },
      userExists: true,
      userData: {
        email: "manager@example.com",
        displayName: "Manager",
      },
      groupDocs: [],
      pollWrites: [],
      failPollSet: false,
    };

    function makeGroupDoc(groupId, groupData) {
      const pollRef = {
        id: "poll-1",
        set: async (payload) => {
          if (state.failPollSet) {
            throw new Error("poll set failed");
          }
          state.pollWrites.push(payload);
        },
      };
      const groupRef = {
        id: groupId,
        collection: (name) => {
          if (name !== "basicPolls") throw new Error("unexpected collection");
          return {
            doc: () => pollRef,
          };
        },
      };
      return {
        id: groupId,
        data: () => groupData,
        ref: groupRef,
      };
    }

    state.makeGroupDoc = makeGroupDoc;

    const db = {
      runTransaction: async (fn) =>
        fn({
          get: async () => ({ exists: false }),
          set: vi.fn(),
        }),
      collection: (name) => {
        if (name === "discordInteractionIds") {
          return {
            doc: () => ({
              set: vi.fn(),
              delete: vi.fn().mockResolvedValue(undefined),
            }),
          };
        }
        if (name === "discordUserLinks") {
          return {
            doc: () => ({
              get: async () => ({
                exists: state.linkExists,
                data: () => state.linkData,
              }),
            }),
          };
        }
        if (name === "users") {
          return {
            doc: () => ({
              get: async () => ({
                exists: state.userExists,
                data: () => state.userData,
              }),
            }),
          };
        }
        if (name === "questingGroups") {
          return {
            where: () => ({
              get: async () => ({
                empty: state.groupDocs.length === 0,
                docs: state.groupDocs,
              }),
            }),
          };
        }
        return { doc: () => ({}) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => db,
      auth: () => ({ getUser: vi.fn() }),
    };
    adminMock.firestore.FieldPath = { documentId: () => "__name__" };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => "server-time") };
    adminMock.firestore.Timestamp = { fromDate: vi.fn((date) => ({ toDate: () => date })) };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve("firebase-functions/v2/tasks")] = {
      exports: {
        onTaskDispatched: (opts, handler) => {
          const fn = (req) => handler(req);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve("firebase-functions")] = {
      exports: {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    };
    require.cache[require.resolve("firebase-admin")] = { exports: adminMock };
    require.cache[require.resolve("discord-api-types/v10")] = {
      exports: {
        InteractionType: { ApplicationCommand: 2, MessageComponent: 3 },
      },
    };
    require.cache[require.resolve("./config")] = {
      exports: {
        DISCORD_APPLICATION_ID: { value: () => "app" },
        DISCORD_BOT_TOKEN: { value: () => "token" },
        DISCORD_REGION: "us-central1",
        APP_URL: "https://app.example.com",
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };
    require.cache[require.resolve("./link-utils")] = {
      exports: { hashLinkCode: vi.fn(() => "hash") },
    };
    require.cache[require.resolve("../notifications/write-event")] = {
      exports: {
        queueNotificationEvent: (...args) => queueNotificationEventMock(...args),
      },
    };
    require.cache[require.resolve("./basic-poll-card")] = {
      exports: {
        buildBasicPollCard: (...args) => buildBasicPollCardMock(...args),
      },
    };
    require.cache[require.resolve("./error-messages")] = {
      exports: {
        ERROR_MESSAGES: {
          noLinkedGroupForPoll: "no linked group",
          pollCreateSubcommandRequired: "poll-create subcommand required",
          notGroupManager: "not manager",
          tooFewOptions: "too few options",
          tooManyOptionsDiscord: "too many options",
          writeInNotRanked: "write in not ranked",
          deadlineInPast: "deadline in past",
        },
        buildUserNotLinkedMessage: vi.fn(() => "link account first"),
      },
    };
    require.cache[require.resolve("./discord-client")] = {
      exports: {
        editOriginalInteractionResponse: (...args) => editOriginalInteractionResponseMock(...args),
        createChannelMessage: (...args) => createChannelMessageMock(...args),
        deleteChannelMessage: (...args) => deleteChannelMessageMock(...args),
        fetchChannel: vi.fn(),
      },
    };

    worker = await import("./worker");
    worker.__testState = state;
  });

  test("creates poll from Discord command and responds with edit link", async () => {
    const state = worker.__testState;
    state.groupDocs = [
      state.makeGroupDoc("group-1", {
        creatorId: "qs-user-1",
        memberManaged: false,
        memberIds: ["qs-user-1", "member-2"],
        discord: { guildId: "guild-1", channelId: "channel-1" },
      }),
    ];

    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("multiple", [
        option("title", "Snack vote"),
        option("options", "Pizza | Tacos | Curry"),
        option("multi", true),
        option("allow_other", true),
        option("deadline", "3d"),
      ])
    );

    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "channel-1" })
    );
    expect(buildBasicPollCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        pollId: "poll-1",
        voteCount: 0,
      })
    );

    expect(state.pollWrites).toHaveLength(1);
    expect(state.pollWrites[0]).toEqual(
      expect.objectContaining({
        title: "Snack vote",
        status: "OPEN",
        source: "discord",
        creatorId: "qs-user-1",
        voteVisibility: "full_visibility",
        votesAllSubmitted: false,
        options: expect.arrayContaining([
          expect.objectContaining({ label: "Pizza", order: 0 }),
          expect.objectContaining({ label: "Tacos", order: 1 }),
          expect.objectContaining({ label: "Curry", order: 2 }),
        ]),
        settings: expect.objectContaining({
          voteType: "MULTIPLE_CHOICE",
          allowMultiple: true,
          allowWriteIn: true,
          maxSelections: null,
        }),
      })
    );
    expect(state.pollWrites[0].options.every((entry) => entry.id.startsWith("option-"))).toBe(
      true
    );

    expect(queueNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "BASIC_POLL_CREATED",
        resource: expect.objectContaining({ id: "poll-1" }),
        recipients: {
          userIds: expect.arrayContaining(["qs-user-1", "member-2"]),
        },
      })
    );

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          content: expect.stringContaining("Poll created!"),
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "Edit on Web",
                  url: "https://app.example.com/groups/group-1/polls/poll-1",
                },
              ],
            },
          ],
        }),
      })
    );
  });

  test("returns no linked group error when channel is not linked", async () => {
    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("multiple", [
        option("title", "Snack vote"),
        option("options", "Pizza | Tacos"),
      ])
    );

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "no linked group" }),
      })
    );
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test("rejects legacy poll-create payload without subcommand", async () => {
    await worker.__test__.handlePollCreate(
      buildInteraction([
        option("title", "Legacy shape"),
        option("options", "Pizza | Tacos"),
      ])
    );

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "poll-create subcommand required" }),
      })
    );
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test("returns manager error when caller cannot manage linked group", async () => {
    const state = worker.__testState;
    state.groupDocs = [
      state.makeGroupDoc("group-1", {
        creatorId: "owner-1",
        memberManaged: false,
        memberIds: ["member-2"],
        discord: { guildId: "guild-1", channelId: "channel-1" },
      }),
    ];

    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("multiple", [
        option("title", "Snack vote"),
        option("options", "Pizza | Tacos"),
      ])
    );

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "not manager" }),
      })
    );
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test("validates option count and ranked write-in constraints", async () => {
    const state = worker.__testState;
    state.groupDocs = [
      state.makeGroupDoc("group-1", {
        creatorId: "qs-user-1",
        memberManaged: false,
        memberIds: ["qs-user-1"],
        discord: { guildId: "guild-1", channelId: "channel-1" },
      }),
    ];

    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("multiple", [
        option("title", "Snack vote"),
        option("options", "Only one"),
      ])
    );
    expect(editOriginalInteractionResponseMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "too few options" }),
      })
    );

    const tooMany = new Array(26).fill(0).map((_, index) => `Option ${index + 1}`).join(" | ");
    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("multiple", [
        option("title", "Snack vote"),
        option("options", tooMany),
      ])
    );
    expect(editOriginalInteractionResponseMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "too many options" }),
      })
    );

    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("ranked", [
        option("title", "Campaign vote"),
        option("options", "A | B"),
      ])
    );
    expect(state.pollWrites).toHaveLength(1);
    expect(state.pollWrites[0]).toEqual(
      expect.objectContaining({
        settings: expect.objectContaining({
          voteType: "RANKED_CHOICE",
          allowMultiple: false,
          allowWriteIn: false,
        }),
      })
    );

    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("ranked", [
        option("title", "Campaign vote"),
        option("options", "A | B"),
        option("allow_other", true),
      ])
    );
    expect(editOriginalInteractionResponseMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "write in not ranked" }),
      })
    );
  });

  test("returns deadline error for past deadlines", async () => {
    const state = worker.__testState;
    state.groupDocs = [
      state.makeGroupDoc("group-1", {
        creatorId: "qs-user-1",
        memberManaged: false,
        memberIds: ["qs-user-1"],
        discord: { guildId: "guild-1", channelId: "channel-1" },
      }),
    ];

    await worker.__test__.handlePollCreate(
      buildSubcommandInteraction("multiple", [
        option("title", "Snack vote"),
        option("options", "Pizza | Tacos"),
        option("deadline", "2000-01-01"),
      ])
    );

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: "deadline in past" }),
      })
    );
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });
});
