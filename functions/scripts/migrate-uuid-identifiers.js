/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set(args.filter((item) => item.startsWith("--")));
  const getValue = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    return args[index + 1] || fallback;
  };

  return {
    serviceAccount: getValue("--service-account"),
    projectId: getValue("--project-id"),
    commit: flags.has("--commit"),
  };
}

function printUsage() {
  console.log(`\nUsage:
  node functions/scripts/migrate-uuid-identifiers.js [options]

Options:
  --service-account <path>  Service account JSON for qs-admin-tools
  --project-id <id>         Override Firebase project id
  --commit                  Apply changes (default is dry-run)
`);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function initializeAdmin({ serviceAccount, projectId }) {
  if (admin.apps.length) return;

  if (serviceAccount) {
    const resolved = path.resolve(serviceAccount);
    const raw = fs.readFileSync(resolved, "utf8");
    const json = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: projectId || json.project_id,
    });
    return;
  }

  admin.initializeApp({ projectId: projectId || process.env.GCLOUD_PROJECT });
}

async function findUserIdsByEmails(db, emails = []) {
  const normalized = Array.from(
    new Set((emails || []).filter(Boolean).map((email) => normalizeEmail(email)))
  );
  if (normalized.length === 0) return {};

  const results = {};
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 30) {
    chunks.push(normalized.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const snapshot = await db
        .collection("usersPublic")
        .where("email", "in", chunk)
        .get();
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.email) {
          results[normalizeEmail(data.email)] = docSnap.id;
        }
      });
    })
  );

  return results;
}

async function commitBatch(batch, count) {
  if (count > 0) {
    await batch.commit();
  }
}

async function migrateSchedulers({ db, commit }) {
  console.log("\nMigrating schedulers -> participantIds...");
  const snap = await db.collection("schedulers").get();
  let updated = 0;
  let skipped = 0;
  let missingUsers = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const participants = Array.isArray(data.participants) ? data.participants : [];
    const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
    const participantEmails = participants.map((email) => normalizeEmail(email)).filter(Boolean);

    const resolved = await findUserIdsByEmails(db, participantEmails);
    const resolvedIds = Object.values(resolved).filter(Boolean);
    missingUsers += participantEmails.length - resolvedIds.length;

    const nextIds = new Set([...(participantIds || []), ...resolvedIds]);
    const currentIds = new Set(participantIds || []);
    const isSame =
      nextIds.size === currentIds.size &&
      Array.from(nextIds).every((id) => currentIds.has(id));

    if (isSame) {
      skipped += 1;
      continue;
    }

    updated += 1;
    if (commit) {
      batch.update(docSnap.ref, {
        participantIds: Array.from(nextIds),
      });
      batchCount += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (commit) {
    await commitBatch(batch, batchCount);
  }

  console.log(
    `Schedulers: ${updated} updated, ${skipped} unchanged, ${missingUsers} emails unmatched.`
  );
}

async function migrateQuestingGroups({ db, commit }) {
  console.log("\nMigrating questing groups -> memberIds...");
  const snap = await db.collection("questingGroups").get();
  let updated = 0;
  let skipped = 0;
  let missingUsers = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const members = Array.isArray(data.members) ? data.members : [];
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
    const memberEmails = members.map((email) => normalizeEmail(email)).filter(Boolean);

    const resolved = await findUserIdsByEmails(db, memberEmails);
    const resolvedIds = Object.values(resolved).filter(Boolean);
    missingUsers += memberEmails.length - resolvedIds.length;

    const nextIds = new Set([...(memberIds || []), ...resolvedIds]);
    const currentIds = new Set(memberIds || []);
    const isSame =
      nextIds.size === currentIds.size &&
      Array.from(nextIds).every((id) => currentIds.has(id));

    if (isSame) {
      skipped += 1;
      continue;
    }

    updated += 1;
    if (commit) {
      batch.update(docSnap.ref, {
        memberIds: Array.from(nextIds),
      });
      batchCount += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (commit) {
    await commitBatch(batch, batchCount);
  }

  console.log(
    `Questing groups: ${updated} updated, ${skipped} unchanged, ${missingUsers} emails unmatched.`
  );
}

async function migrateVotes({ db, commit }) {
  console.log("\nMigrating votes -> voterId...");
  const snap = await db.collectionGroup("votes").get();
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (data.voterId) {
      skipped += 1;
      continue;
    }
    updated += 1;
    if (commit) {
      batch.update(docSnap.ref, { voterId: docSnap.id });
      batchCount += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (commit) {
    await commitBatch(batch, batchCount);
  }

  console.log(`Votes: ${updated} updated, ${skipped} unchanged.`);
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    printUsage();
    console.log("\nMissing service account path. Provide --service-account or set GOOGLE_APPLICATION_CREDENTIALS.");
    process.exit(1);
  }

  await initializeAdmin(args);
  const db = admin.firestore();

  console.log(`UUID migration ${args.commit ? "(commit)" : "(dry-run)"}`);

  await migrateSchedulers({ db, commit: args.commit });
  await migrateQuestingGroups({ db, commit: args.commit });
  await migrateVotes({ db, commit: args.commit });

  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
