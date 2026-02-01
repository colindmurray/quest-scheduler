import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitFeedback } from "./feedback";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(async () => ({ id: "fb_1" })),
  collection: vi.fn(),
  serverTimestamp: vi.fn(() => "serverTimestamp"),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn((_, path) => ({ path })),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve("https://download.test/file")),
}));

vi.mock("../firebase", () => ({ db: {}, storage: {} }));

describe("submitFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when user is missing", async () => {
    await expect(
      submitFeedback({
        user: null,
        title: "Title",
        issueType: "Bug",
        description: "Details",
      })
    ).rejects.toThrow("You must be signed in to submit feedback.");
  });

  it("rejects when required fields are missing", async () => {
    await expect(
      submitFeedback({
        user: { uid: "user_1", email: "a@example.com" },
        title: "",
        issueType: "Bug",
        description: "Details",
      })
    ).rejects.toThrow("Please complete all required fields.");
  });

  it("submits feedback without attachment", async () => {
    const user = {
      uid: "user_1",
      email: "a@example.com",
      displayName: "Alice",
      photoURL: "photo",
    };

    const result = await submitFeedback({
      user,
      title: "Calendar issue",
      issueType: "Bug",
      description: "Steps to reproduce",
      attachment: null,
      context: { path: "/settings" },
    });

    expect(collection).toHaveBeenCalledWith({}, "feedbackSubmissions");
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(getDownloadURL).not.toHaveBeenCalled();
    expect(result.id).toBe("fb_1");
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it("uploads attachment and includes metadata", async () => {
    const user = {
      uid: "user_1",
      email: "a@example.com",
      displayName: "Alice",
      photoURL: "photo",
    };
    const attachment = new File(["data"], "screenshot.png", {
      type: "image/png",
    });

    const result = await submitFeedback({
      user,
      title: "Feature request",
      issueType: "Feature request",
      description: "Please add export",
      attachment,
      context: {},
    });

    expect(ref).toHaveBeenCalledTimes(1);
    expect(uploadBytes).toHaveBeenCalledWith(
      expect.any(Object),
      attachment,
      { contentType: "image/png" }
    );
    expect(getDownloadURL).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(result.attachment.downloadUrl).toBe("https://download.test/file");
  });
});
