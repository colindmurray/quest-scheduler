const admin = require("firebase-admin");
const { applyAutoClear } = require("../src/notifications/auto-clear");

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
    throw new Error("Missing auto-clear payload JSON");
  }
  const payload = JSON.parse(raw);
  const { eventType, event, recipients } = payload;
  if (!eventType) {
    throw new Error("Missing eventType");
  }

  await applyAutoClear({
    db,
    eventType,
    event: event || {},
    recipients: recipients || {},
  });
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
