import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

const DISCORD_USERNAME_REGEX = /^[a-z0-9_.]{2,32}$/i;
const LEGACY_DISCORD_TAG_REGEX = /^.+#\d{4}$/;
const DISCORD_ID_REGEX = /^\d{17,20}$/;

function normalizeValue(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeValue(value).toLowerCase();
}

function isDiscordUsername(value) {
  if (!DISCORD_USERNAME_REGEX.test(value)) return false;
  if (value.startsWith(".") || value.endsWith(".")) return false;
  if (value.includes("..")) return false;
  return true;
}

export function detectIdentifierType(input) {
  const trimmed = normalizeValue(input);
  if (!trimmed) return { type: "unknown", value: "" };

  if (trimmed.startsWith("@")) {
    return { type: "qsUsername", value: trimmed.slice(1) };
  }

  if (trimmed.includes("@") && !trimmed.startsWith("@") && trimmed.includes(".")) {
    return { type: "email", value: normalizeEmail(trimmed) };
  }

  if (DISCORD_ID_REGEX.test(trimmed)) {
    return { type: "discordId", value: trimmed };
  }

  if (LEGACY_DISCORD_TAG_REGEX.test(trimmed)) {
    return { type: "legacyDiscordTag", value: trimmed };
  }

  if (isDiscordUsername(trimmed)) {
    return { type: "discordUsername", value: trimmed.toLowerCase() };
  }

  return { type: "unknown", value: trimmed };
}

export async function resolveIdentifier(input) {
  const parsed = detectIdentifierType(input);
  if (!parsed.value) {
    throw new Error("Please enter a valid email address or Discord username.");
  }

  if (parsed.type === "qsUsername") {
    const usernameLower = parsed.value.toLowerCase();
    const usernameDoc = await getDoc(doc(db, "qsUsernames", usernameLower));
    if (!usernameDoc.exists()) {
      throw new Error(`No user found with username @${usernameLower}.`);
    }
    const userId = usernameDoc.data()?.uid;
    if (!userId) {
      throw new Error(`No user found with username @${usernameLower}.`);
    }
    const userSnap = await getDoc(doc(db, "usersPublic", userId));
    if (!userSnap.exists()) {
      throw new Error(`No user found with username @${usernameLower}.`);
    }
    const data = userSnap.data() || {};
    if (!data.email) {
      throw new Error(`No user found with username @${usernameLower}.`);
    }
    return {
      type: parsed.type,
      email: normalizeEmail(data.email),
      userId,
      userData: data,
    };
  }

  if (parsed.type === "discordId") {
    throw new Error("Discord IDs are not supported. Ask for their Discord username or email.");
  }

  if (parsed.type === "legacyDiscordTag") {
    throw new Error(
      "Legacy Discord tags (name#1234) are not supported. Use their current Discord username or email."
    );
  }

  if (parsed.type === "email") {
    const email = parsed.value;
    const snapshot = await getDocs(
      query(collection(db, "usersPublic"), where("email", "==", email))
    );
    const docSnap = snapshot.docs[0];
    return {
      type: parsed.type,
      email,
      userId: docSnap?.id || null,
      userData: docSnap?.data() || null,
    };
  }

  if (parsed.type === "discordUsername") {
    const snapshot = await getDocs(
      query(
        collection(db, "usersPublic"),
        where("discordUsernameLower", "==", parsed.value)
      )
    );
    if (snapshot.empty) {
      throw new Error(
        `No Quest Scheduler user found with Discord username "${parsed.value}". They may not have linked Discord yet.`
      );
    }
    const docSnap = snapshot.docs[0];
    const data = docSnap.data() || {};
    if (!data.email) {
      throw new Error("That Discord account is missing a Quest Scheduler email.");
    }
    return {
      type: parsed.type,
      email: normalizeEmail(data.email),
      userId: docSnap.id,
      userData: data,
    };
  }

  throw new Error("Please enter a valid email address or Discord username.");
}
