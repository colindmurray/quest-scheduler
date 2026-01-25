/* eslint-disable no-console */
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const getValue = (flag, fallback) => {
    const index = argv.indexOf(flag);
    if (index === -1) return fallback;
    return argv[index + 1] || fallback;
  };
  return {
    commit: args.has("--commit"),
    all: args.has("--all"),
    batchSize: Number(getValue("--batch-size", 400)),
  };
}

async function run() {
  const { commit, all, batchSize } = parseArgs(process.argv);

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const schedulersRef = db.collection("schedulers");
  const fieldPath = admin.firestore.FieldPath.documentId();

  let totalScanned = 0;
  let totalUpdated = 0;
  let lastDoc = null;

  console.log(
    `Starting migration (commit=${commit}, all=${all}, batchSize=${batchSize})`
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = schedulersRef.orderBy(fieldPath).limit(batchSize);
    if (!all) {
      query = query.where("allowLinkSharing", "==", null);
    }
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    snapshot.docs.forEach((doc) => {
      totalScanned += 1;
      const data = doc.data() || {};
      if (all || data.allowLinkSharing === undefined || data.allowLinkSharing === null) {
        batch.update(doc.ref, { allowLinkSharing: false });
        batchCount += 1;
      }
    });

    if (batchCount > 0) {
      if (commit) {
        await batch.commit();
      }
      totalUpdated += batchCount;
      console.log(
        `${commit ? "Committed" : "Planned"} batch: ${batchCount} updates`
      );
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  console.log(
    `Migration complete. Scanned=${totalScanned}, Updated=${totalUpdated}, commit=${commit}`
  );
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
