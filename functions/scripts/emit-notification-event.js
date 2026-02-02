const admin = require("firebase-admin");

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

const NOTIFICATION_EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const buildExpiresAt = () =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_EVENT_TTL_MS));

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
    throw new Error("Missing event payload JSON");
  }
  const payload = JSON.parse(raw);
  const eventPayload = {
    status: "queued",
    source: "e2e",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: buildExpiresAt(),
    ...payload,
  };

  const ref = await db.collection("notificationEvents").add(eventPayload);
  process.stdout.write(ref.id);
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
