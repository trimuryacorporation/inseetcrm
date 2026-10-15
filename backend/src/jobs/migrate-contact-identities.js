import mongoose from "mongoose";
import { env } from "../config/env.js";
import "../app.js";
import {
  reconcileContactIdentities,
  ensureContactIndexes,
} from "../services/contactMigration.js";
try {
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  });
  const result = await reconcileContactIdentities({ force: true });
  await ensureContactIndexes();
  console.log(
    JSON.stringify({
      database: mongoose.connection.name,
      ...result,
      indexesReady: true,
    }),
  );
} catch (e) {
  console.error(JSON.stringify({ migrationFailed: true, error: e.message }));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
