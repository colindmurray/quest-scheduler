import { collection, doc } from "firebase/firestore";
import { db } from "../firebase";

export const schedulerRef = (id) => doc(db, "schedulers", id);
export const schedulerSlotsRef = (id) =>
  collection(db, "schedulers", id, "slots");
export const schedulerVotesRef = (id) =>
  collection(db, "schedulers", id, "votes");
