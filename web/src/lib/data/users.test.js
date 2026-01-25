import { describe, it, expect, vi, beforeEach } from "vitest";
import { findUserIdByEmail } from "./users";
import { getDocs, where } from "firebase/firestore";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));

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
