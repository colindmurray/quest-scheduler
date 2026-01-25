import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export async function findUserIdByEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return null;

  const q = query(
    collection(db, "usersPublic"),
    where("email", "==", normalized)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0]?.id || null;
}
