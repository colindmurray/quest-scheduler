import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

const MAX_FEEDBACK_FILE_SIZE = 20 * 1024 * 1024;

const sanitizeFileName = (name) =>
  name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120) || "attachment";

const isSupportedAttachment = (file) =>
  file?.type?.startsWith("image/") || file?.type?.startsWith("video/");

export async function submitFeedback({
  user,
  title,
  issueType,
  description,
  attachment,
  context,
}) {
  if (!user?.uid) {
    throw new Error("You must be signed in to submit feedback.");
  }

  if (!title?.trim() || !issueType?.trim() || !description?.trim()) {
    throw new Error("Please complete all required fields.");
  }

  let attachmentData = null;
  if (attachment) {
    if (attachment.size > MAX_FEEDBACK_FILE_SIZE) {
      throw new Error("Attachment must be 20 MB or less.");
    }
    if (!isSupportedAttachment(attachment)) {
      throw new Error("Only image or video attachments are supported.");
    }

    const safeName = sanitizeFileName(attachment.name);
    const timestamp = Date.now();
    const storagePath = `feedback/${user.uid}/${timestamp}-${safeName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, attachment, { contentType: attachment.type });
    const downloadUrl = await getDownloadURL(storageRef);

    attachmentData = {
      storagePath,
      downloadUrl,
      fileName: attachment.name,
      contentType: attachment.type,
      size: attachment.size,
    };
  }

  const payload = {
    title: title.trim(),
    issueType: issueType.trim(),
    description: description.trim(),
    createdAt: serverTimestamp(),
    userId: user.uid,
    userEmail: user.email || null,
    userDisplayName: user.displayName || null,
    userPhotoURL: user.photoURL || null,
    attachment: attachmentData,
    context: context || {},
  };

  const docRef = await addDoc(collection(db, "feedbackSubmissions"), payload);
  return { id: docRef.id, attachment: attachmentData };
}

export { MAX_FEEDBACK_FILE_SIZE };
