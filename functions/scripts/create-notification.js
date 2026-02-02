const admin = require("firebase-admin");
const { getInAppTemplate } = require("../src/notifications/templates");

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  "studio-473406021-87ead";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

const readInput = async () => {
  const arg = process.argv[2];
  if (arg) return arg;
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
};

const main = async () => {
  const raw = await readInput();
  if (!raw) {
    throw new Error("Missing notification payload JSON");
  }
  const payload = JSON.parse(raw);
  const { eventType, userId, event } = payload;
  if (!eventType || !userId) {
    throw new Error("Missing eventType or userId");
  }

  const template = getInAppTemplate(eventType);
  if (!template) {
    throw new Error(`Missing in-app template for ${eventType}`);
  }

  const rendered = template(event || {});
  const metadata = event?.metadata || event?.payload?.metadata || {};
  const docId = event?.dedupeKey ? `dedupe:${event.dedupeKey}` : null;

  const notificationsRef = db.collection("users").doc(userId).collection("notifications");
  const docRef = docId ? notificationsRef.doc(docId) : notificationsRef.doc();

  await docRef.set({
    type: eventType,
    title: rendered.title,
    body: rendered.body,
    actionUrl: rendered.actionUrl || null,
    resource: event?.resource || null,
    actor: event?.actor || null,
    metadata,
    dedupeKey: event?.dedupeKey || null,
    read: false,
    dismissed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  process.stdout.write(docRef.id);
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
