import { describe, it, expect, vi, beforeEach } from "vitest";
import { findUserIdByEmail, findUserIdsByEmails, ensureUserProfile } from "./users";
import { getDocs, getDoc, setDoc, where, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("../identity", () => ({
  buildPublicIdentifier: vi.fn(() => "public-id"),
}));

vi.mock("firebase/auth", () => ({
  updateProfile: vi.fn(),
}));

describe("findUserIdByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for empty input", async () => {
    const result = await findUserIdByEmail("  ");
    expect(result).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("returns the first matching user id", async () => {
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: "user_123" }],
    });

    const result = await findUserIdByEmail("Test@Example.com");
    expect(result).toBe("user_123");
    expect(where).toHaveBeenCalledWith("email", "==", "test@example.com");
  });

  it("returns null when no user matches", async () => {
    getDocs.mockResolvedValue({ empty: true, docs: [] });

    const result = await findUserIdByEmail("missing@example.com");
    expect(result).toBeNull();
  });
});

describe("findUserIdsByEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty object for no emails", async () => {
    const result = await findUserIdsByEmails([]);
    expect(result).toEqual({});
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("returns mapping of normalized emails to ids", async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: "user_1", data: () => ({ email: "One@Example.com" }) },
        { id: "user_2", data: () => ({ email: "two@example.com" }) },
      ],
    });

    const result = await findUserIdsByEmails(["ONE@example.com", "two@example.com"]);
    expect(result).toEqual({
      "one@example.com": "user_1",
      "two@example.com": "user_2",
    });
  });
});

describe("ensureUserProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns profileReady false when user missing", async () => {
    const result = await ensureUserProfile(null);
    expect(result).toEqual({ profileReady: false });
  });

  it("writes missing profile fields and updates auth display name", async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) })
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) });

    const result = await ensureUserProfile({
      uid: "user_1",
      email: "User@Example.com",
      displayName: null,
      photoURL: "https://example.com/avatar.png",
    });

    expect(result).toEqual({ profileReady: true });
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: "user@example.com",
        photoURL: "https://example.com/avatar.png",
        publicIdentifierType: "email",
        updatedAt: "ts",
      }),
      { merge: true }
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("updates auth display name when derived from discord", async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ discord: { username: "discord-name" } }),
      })
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) });

    await ensureUserProfile({
      uid: "user_2",
      email: "user2@example.com",
      displayName: null,
      photoURL: null,
    });

    expect(updateProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ displayName: "discord-name" })
    );
  });
});
