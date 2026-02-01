import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function queueMail({ to, message }) {
  return setDoc(doc(collection(db, "mail")), { to, message });
}
