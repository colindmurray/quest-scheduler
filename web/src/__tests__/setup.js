import { afterEach, vi } from "vitest";

let rtlCleanup;
async function getRtlCleanup() {
  if (rtlCleanup !== undefined) return rtlCleanup;
  try {
    const mod = await import("@testing-library/react");
    rtlCleanup = mod.cleanup;
  } catch {
    rtlCleanup = null;
  }
  return rtlCleanup;
}

afterEach(async () => {
  const cleanup = await getRtlCleanup();
  if (cleanup) cleanup();
});

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({ name: "app" })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: "app" })),
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    static credentialFromResult() {
      return null;
    }

    static credential() {
      return null;
    }

    setCustomParameters() {}
  },
  EmailAuthProvider: class {
    static credential() {
      return null;
    }
  },
  getAuth: vi.fn(() => ({ currentUser: null })),
  onAuthStateChanged: vi.fn(() => () => {}),
  signInWithPopup: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithCustomToken: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  fetchSignInMethodsForEmail: vi.fn(() => []),
  linkWithPopup: vi.fn(),
  linkWithCredential: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  documentId: vi.fn(() => "documentId"),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
  serverTimestamp: vi.fn(() => "serverTimestamp"),
  arrayUnion: vi.fn((...values) => values),
  arrayRemove: vi.fn((...values) => values),
  deleteField: vi.fn(() => "deleteField"),
  onSnapshot: vi.fn(() => () => {}),
  runTransaction: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: null }))),
}));
