import { getFunctions, httpsCallable } from "firebase/functions";
import { normalizeEmail } from "../utils";

export async function emitNotificationEvent(event) {
  const functions = getFunctions();
  const emit = httpsCallable(functions, "emitNotificationEvent");
  const response = await emit(event);
  return response.data;
}

export function buildNotificationActor(user) {
  return {
    uid: user?.uid || null,
    email: normalizeEmail(user?.email) || null,
    displayName: user?.displayName || user?.email || "Someone",
  };
}

export async function emitPollEvent({
  eventType,
  schedulerId,
  pollTitle,
  actor,
  payload,
  recipients,
  dedupeKey,
}) {
  return emitNotificationEvent({
    eventType,
    resource: { type: "poll", id: schedulerId, title: pollTitle },
    actor,
    payload: { pollTitle, ...(payload || {}) },
    recipients,
    dedupeKey,
  });
}

export async function reconcilePendingNotifications() {
  const functions = getFunctions();
  const reconcile = httpsCallable(functions, "reconcilePendingNotifications");
  const response = await reconcile();
  return response.data;
}
