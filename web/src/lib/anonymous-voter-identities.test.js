import { describe, expect, test } from "vitest";

import {
  ANONYMOUS_VOTER_NAMES,
  anonymizeUsers,
  buildAnonymousIdentityMap,
} from "./anonymous-voter-identities";

describe("anonymous voter identities", () => {
  test("provides a pool of 50 themed aliases", () => {
    expect(ANONYMOUS_VOTER_NAMES).toHaveLength(50);
    expect(new Set(ANONYMOUS_VOTER_NAMES).size).toBe(50);
  });

  test("assignments are deterministic for a given scope and identity set", () => {
    const users = [
      { id: "u-1", email: "one@example.com" },
      { id: "u-2", email: "two@example.com" },
      { id: "u-3", email: "three@example.com" },
    ];

    const firstMap = buildAnonymousIdentityMap(users, { scopeKey: "poll-1" });
    const secondMap = buildAnonymousIdentityMap([...users].reverse(), { scopeKey: "poll-1" });

    expect(firstMap.get("id:u-1")?.displayName).toBe(secondMap.get("id:u-1")?.displayName);
    expect(firstMap.get("id:u-2")?.displayName).toBe(secondMap.get("id:u-2")?.displayName);
    expect(firstMap.get("id:u-3")?.displayName).toBe(secondMap.get("id:u-3")?.displayName);
  });

  test("anonymizeUsers replaces labels and avatars with anonymous identities", () => {
    const users = [
      {
        id: "u-1",
        email: "one@example.com",
        displayName: "One",
        avatar: "https://example.com/avatar.png",
      },
    ];
    const identityMap = buildAnonymousIdentityMap(users, { scopeKey: "poll-2" });
    const [anonymousUser] = anonymizeUsers(users, identityMap, { keyPrefix: "test" });

    expect(anonymousUser.displayName).toMatch(/^Anonymous /);
    expect(anonymousUser.publicIdentifier).toBe(anonymousUser.displayName);
    expect(anonymousUser.isAnonymous).toBe(true);
    expect(anonymousUser.avatar).toBe(null);
    expect(anonymousUser.photoURL).toBe(null);
    expect(anonymousUser.email.startsWith("anon:anonymous ")).toBe(true);
  });
});
