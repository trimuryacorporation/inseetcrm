import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User, Notification, Session } from "../models/index.js";
let io;
export function attachRealtime(server) {
  io = new Server(server, {
    cors: { origin: env.FRONTEND_URL, credentials: true },
    maxHttpBufferSize: 10000,
  });
  io.use(async (socket, next) => {
    try {
      const p = jwt.verify(
        socket.handshake.auth?.token,
        env.JWT_ACCESS_SECRET,
        { issuer: "inseet", audience: "inseet-web", algorithms: ["HS256"] },
      );
      const user = await User.findOne({
        _id: p.sub,
        active: true,
        authVersion: p.version,
      });
      if (
        !user ||
        (p.sid &&
          !(await Session.exists({
            _id: p.sid,
            user: p.sub,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
            authVersion: p.version,
          })))
      )
        return next(new Error("Unauthorized"));
      socket.data.userId = String(user._id);
      socket.data.expiresAt = p.exp;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.join("user:" + socket.data.userId);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.expiresAt * 1000 - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(timer));
  });
  return io;
}
export async function notify(user, title) {
  const record = await Notification.create({ user, title });
  io?.to("user:" + String(user)).emit("notification", {
    id: record._id,
    title: record.title,
    createdAt: record.createdAt,
  });
  return record;
}
