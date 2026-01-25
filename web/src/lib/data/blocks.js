import { collection, query, orderBy } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";

export const blockedUsersRef = (userId) =>
  collection(db, "users", userId, "blockedUsers");

export const blockedUsersQuery = (userId) =>
  query(blockedUsersRef(userId), orderBy("blockedAt", "desc"));

export async function blockUserByEmail(email) {
  const functions = getFunctions();
  const blockUser = httpsCallable(functions, "blockUser");
  const response = await blockUser({ email });
  return response.data;
}

export async function unblockUserByEmail(email) {
  const functions = getFunctions();
  const unblockUser = httpsCallable(functions, "unblockUser");
  const response = await unblockUser({ email });
  return response.data;
}
