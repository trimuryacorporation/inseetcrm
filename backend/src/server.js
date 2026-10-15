import { ensureClientOptions } from "./services/clientOptions.js";
import {
  reconcileContactIdentities,
  ensureContactIndexes,
} from "./services/contactMigration.js";
import { createServer } from "node:http";
import { attachRealtime } from "./services/realtime.js";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { app } from "./app.js";
await mongoose.connect(env.MONGODB_URI, {
  dbName: env.MONGODB_DB_NAME,
  autoIndex: false,
  serverSelectionTimeoutMS: 10000,
});
await reconcileContactIdentities();
await ensureContactIndexes();
await ensureClientOptions();
const server = createServer(app);
const io = attachRealtime(server);
server.listen(env.PORT, () =>
  console.log("INSEET API listening on port " + env.PORT),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    io.close();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
