// scripts/setAdminClaim.js
// Usage: node scripts/setAdminClaim.js <USER_UID>
const admin = require("firebase-admin");

const svcJsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;

let credentialObj = null;

if (svcJsonEnv) {
  try {
    credentialObj = JSON.parse(svcJsonEnv);
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY_JSON:", e);
    process.exit(1);
  }
} else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  credentialObj = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
} else {
  console.error("No service account credentials found. Set FIREBASE_SERVICE_ACCOUNT_KEY_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in env.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(credentialObj)
});

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/setAdminClaim.js <USER_UID>");
  process.exit(1);
}

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log("Admin claim set for UID:", uid);
    console.log("Note: user must re-authenticate or call getIdToken(true) to refresh token.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error setting claim:", err);
    process.exit(1);
  });
