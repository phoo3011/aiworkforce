const fs = require('fs');
const path = require('path');
const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const { createApp } = require('./app');
const { initializeDatabase, openDatabase } = require('./database');

function initializeFirebaseAdmin() {
  if (getApps().length > 0) return;

  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      const serviceAccount = JSON.parse(envJson);
      initializeApp({ credential: cert(serviceAccount) });
      return;
    } catch (e) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON environment variable.", e.message);
    }
  }

  const configuredCredentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const credentialPath = configuredCredentialPath
    ? (path.isAbsolute(configuredCredentialPath)
      ? configuredCredentialPath
      : path.resolve(__dirname, configuredCredentialPath))
    : path.resolve(__dirname, 'serviceAccountKey.json');

  if (fs.existsSync(credentialPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
    return;
  }

  // Production hosts can provide Application Default Credentials instead of a file.
  initializeApp({ credential: applicationDefault() });
}

async function startServer() {
  initializeFirebaseAdmin();
  const database = await openDatabase();
  await initializeDatabase(database);

  const app = createApp({
    database,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    verifyIdToken: (idToken) => getAuth().verifyIdToken(idToken)
  });

  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, () => {
    console.log(`AI Workforce API listening on port ${port}`);
    console.log(`Database: ${database.databasePath}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => {
      await database.close();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((error) => {
  console.error('Unable to start AI Workforce API:', error.message);
  process.exit(1);
});
