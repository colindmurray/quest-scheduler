import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  documentId,
} from "firebase/firestore";
import { db } from "../firebase";
import { chunkArray } from "../utils";
import { deleteEmbeddedBasicPoll, fetchEmbeddedBasicPolls } from "./basicPolls";

export const schedulerRef = (id) => doc(db, "schedulers", id);
export const schedulerSlotsCollectionRef = (id) =>
  collection(db, "schedulers", id, "slots");
export const schedulerSlotsRef = (id) =>
  collection(db, "schedulers", id, "slots");
export const schedulerVotesRef = (id) =>
  collection(db, "schedulers", id, "votes");
export const schedulerVoteDocRef = (schedulerId, voteId) =>
  doc(db, "schedulers", schedulerId, "votes", voteId);
export const schedulerSlotRef = (schedulerId, slotId) =>
  doc(db, "schedulers", schedulerId, "slots", slotId);

export const schedulersRef = () => collection(db, "schedulers");

export const schedulersByParticipantQuery = (userId) =>
  userId
    ? query(schedulersRef(), where("participantIds", "array-contains", userId))
    : null;

export const schedulersByCreatorQuery = (userId) =>
  userId ? query(schedulersRef(), where("creatorId", "==", userId)) : null;

export function subscribeSchedulersByGroupIds(groupIds, onUpdate, onError) {
  const ids = (groupIds || []).filter(Boolean);
  if (ids.length === 0) {
    if (onUpdate) onUpdate([]);
    return () => {};
  }

  const chunks = chunkArray(ids, 10);
  const byChunk = new Map();
  const loadedChunks = new Set();

  const notify = () => {
    const merged = Array.from(byChunk.values()).flat();
    const deduped = new Map();
    merged.forEach((docSnap) => {
      deduped.set(docSnap.id, docSnap);
    });
    if (onUpdate) {
      onUpdate(Array.from(deduped.values()), loadedChunks.size === chunks.length);
    }
  };

  const unsubscribes = chunks.map((chunk, index) => {
    const q = query(schedulersRef(), where("questingGroupId", "in", chunk));
    return onSnapshot(
      q,
      (snapshot) => {
        byChunk.set(
          index,
          snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        );
        loadedChunks.add(index);
        notify();
      },
      (err) => {
        if (onError) onError(err);
        loadedChunks.add(index);
        notify();
      }
    );
  });

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export async function fetchSchedulerSlots(schedulerId) {
  if (!schedulerId) return [];
  const snapshot = await getDocs(collection(db, "schedulers", schedulerId, "slots"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function fetchSchedulerVotes(schedulerId) {
  if (!schedulerId) return [];
  const snapshot = await getDocs(collection(db, "schedulers", schedulerId, "votes"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function fetchUserSchedulerVote(schedulerId, userId) {
  if (!schedulerId || !userId) return null;
  const snap = await getDoc(doc(db, "schedulers", schedulerId, "votes", userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function fetchSchedulersByIds(ids = []) {
  const normalized = Array.from(new Set((ids || []).filter(Boolean)));
  if (normalized.length === 0) return {};
  const results = {};
  await Promise.all(
    chunkArray(normalized, 10).map(async (chunk) => {
      const q = query(collection(db, "schedulers"), where(documentId(), "in", chunk));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((docSnap) => {
        results[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
    })
  );
  return results;
}

export async function updateScheduler(schedulerId, updates) {
  if (!schedulerId) return;
  return updateDoc(schedulerRef(schedulerId), updates);
}

export async function setScheduler(schedulerId, data, options = { merge: true }) {
  if (!schedulerId) return;
  return setDoc(schedulerRef(schedulerId), data, options);
}

export async function deleteScheduler(schedulerId) {
  if (!schedulerId) return;
  return deleteDoc(schedulerRef(schedulerId));
}

export async function addSchedulerSlot(schedulerId, data) {
  if (!schedulerId) return null;
  return addDoc(schedulerSlotsCollectionRef(schedulerId), data);
}

export async function upsertSchedulerSlot(schedulerId, slotId, data) {
  if (!schedulerId || !slotId) return;
  return setDoc(schedulerSlotRef(schedulerId, slotId), data, { merge: true });
}

export async function deleteSchedulerSlot(schedulerId, slotId) {
  if (!schedulerId || !slotId) return;
  return deleteDoc(schedulerSlotRef(schedulerId, slotId));
}

export async function upsertSchedulerVote(schedulerId, voteId, data) {
  if (!schedulerId || !voteId) return;
  return setDoc(schedulerVoteDocRef(schedulerId, voteId), data, { merge: true });
}

export async function deleteSchedulerVote(schedulerId, voteId) {
  if (!schedulerId || !voteId) return;
  return deleteDoc(schedulerVoteDocRef(schedulerId, voteId));
}

export async function deleteSchedulerWithRelatedData(schedulerId) {
  if (!schedulerId) return;

  const [slots, votes, embeddedBasicPolls] = await Promise.all([
    fetchSchedulerSlots(schedulerId),
    fetchSchedulerVotes(schedulerId),
    fetchEmbeddedBasicPolls(schedulerId),
  ]);

  await Promise.all(slots.map((slot) => deleteSchedulerSlot(schedulerId, slot.id)));
  await Promise.all(votes.map((vote) => deleteSchedulerVote(schedulerId, vote.id)));
  await Promise.all(
    embeddedBasicPolls.map((poll) => deleteEmbeddedBasicPoll(schedulerId, poll.id))
  );

  await deleteScheduler(schedulerId);
}

export { deleteField };
