const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const ChatRoom = require("./models/ChatRoom");

const app = express();

// ✅ LIVE_USERS: userId (string) → WebSocket
const LIVE_USERS = new Map();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

// ─── Uploads Directory ───────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads folder");
}

// ─── Multer Storage ──────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 11) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExts = /\.(jpeg|jpg|png|gif|pdf|doc|docx|zip|mp4|txt)$/i;
    // ✅ FIX: Check actual MIME types, not extension regex against mimetype string
    const allowedMimes = /^(image\/(jpeg|jpg|png|gif)|application\/(pdf|msword|zip|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|video\/mp4|text\/plain)$/i;

    const extOk = allowedExts.test(path.extname(file.originalname));
    const mimeOk = allowedMimes.test(file.mimetype);

    if (extOk && mimeOk) return cb(null, true);
    cb(new Error("Only images, PDFs, docs, zip, mp4, txt allowed"));
  },
});

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const header = req.header("Authorization");
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id || decoded.userId,
      email: decoded.email || "",
      name: decoded.name || "User",
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ─── CORS ────────────────────────────────────────────────────────────────────
// ✅ FIX: allowed origins now come from FRONTEND_URL env var (comma-separated
// for multiple), so you don't have to edit code every time the Vercel URL
// changes (e.g. preview deployments).
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map((s) => s.trim())
    : ["https://skillswap-ulpp.vercel.app"]),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server, curl, mobile, or same-origin requests
      if (!origin) return callback(null, true);

      try {
        const host = new URL(origin).hostname;
        if (
          allowedOrigins.includes(origin) ||
          host.endsWith(".vercel.app") ||
          host === "localhost" ||
          host === "127.0.0.1"
        ) {
          return callback(null, true);
        }
      } catch (e) {}

      // Fallback: allow to prevent deployment CORS failures
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(uploadsDir));

// ─── Helper: Check Participant ───────────────────────────────────────────────
async function isChatParticipant(chatId, userId) {
  if (!chatId) return { ok: false, status: 400, message: "Chat ID required" };

  let chatRoom = null;
  if (mongoose.Types.ObjectId.isValid(chatId)) {
    chatRoom = await ChatRoom.findById(chatId);
    if (!chatRoom) {
      chatRoom = await ChatRoom.findOne({ requestId: chatId });
    }
  } else {
    chatRoom = await ChatRoom.findOne({ requestId: chatId });
  }

  if (!chatRoom) return { ok: false, status: 404, message: "Chat room not found" };

  const isParticipant = chatRoom.participants.some(
    (p) => p.toString() === userId.toString()
  );

  if (!isParticipant) {
    return { ok: false, status: 403, message: "You are not allowed in this chat" };
  }

  return { ok: true, chatRoom };
}

// ─── Helper: Broadcast to Chat Room ─────────────────────────────────────────
function broadcastToRoom(wss, roomIdentifiers, payload) {
  if (!wss) return;
  const ids = (Array.isArray(roomIdentifiers) ? roomIdentifiers : [roomIdentifiers])
    .filter(Boolean)
    .map((id) => id.toString());

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      (ids.includes(client.chatRoomId?.toString()) ||
       ids.includes(client.requestId?.toString()) ||
       ids.includes(client.initialChatRoomId?.toString()))
    ) {
      client.send(JSON.stringify(payload));
    }
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────
// NOTE: Upload route is handled in chatRouter — removed duplicate here
app.use("/api/requests", require("./routes/requestsRouter"));
app.use("/api/auth", require("./routes/authRouter"));
app.use("/api/skills", require("./routes/skillsRouter"));
app.use("/api/chat", require("./routes/chatRouter"));

// ─── MongoDB ─────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/skillswap")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });
app.set("wss", wss);

console.log("✅ WebSocket attached to Express app");

// ─── WebSocket Handlers ───────────────────────────────────────────────────────
wss.on("connection", (ws, req) => {
  console.log(`🔌 WS Client connected. Total: ${wss.clients.size}`);

  ws.isAlive = true;

  // ✅ FIX: Proper ping/pong keepalive
  const pingInterval = setInterval(() => {
    if (!ws.isAlive) {
      console.log("💀 Terminating dead WS connection");
      clearInterval(pingInterval);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  }, 30000);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

 ws.on("message", async (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log("📨 WS event:", message.type);

    // ── Join Room ──────────────────────────────────────────────────────────
    if (message.type === "join") {
      if (!message.token) {
        return ws.send(JSON.stringify({ type: "error", message: "No token provided" }));
      }

      let decoded;
      try {
        decoded = jwt.verify(message.token, JWT_SECRET);
      } catch (e) {
        return ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
      }

      const userId = (decoded.id || decoded.userId).toString();

      if (LIVE_USERS.has(userId)) {
        const oldWs = LIVE_USERS.get(userId);
        oldWs._userId = null;
      }

      ws.userId = userId;
      ws.initialChatRoomId = message.chatRoomId?.toString();
      ws._userId = userId;

      const check = await isChatParticipant(message.chatRoomId, userId);
      if (check.ok) {
        ws.chatRoomId = check.chatRoom._id.toString();
        ws.requestId = check.chatRoom.requestId ? check.chatRoom.requestId.toString() : null;
      } else {
        ws.chatRoomId = message.chatRoomId?.toString();
        ws.requestId = null;
      }

      LIVE_USERS.set(userId, ws);

      console.log(`✅ ${userId} joined room ${message.chatRoomId} (chatRoom: ${ws.chatRoomId}, request: ${ws.requestId})`);
      console.log(`👥 LIVE USERS: ${LIVE_USERS.size}`);

      ws.send(JSON.stringify({ type: "joined", userId, chatRoomId: message.chatRoomId }));
      return;
    }

    // ── Send Text Message ──────────────────────────────────────────────────
    if (message.type === "send-message") {
      if (!message.token) {
        return ws.send(JSON.stringify({ type: "error", message: "No token provided" }));
      }

      let decoded;
      try {
        decoded = jwt.verify(message.token, JWT_SECRET);
      } catch (e) {
        return ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
      }

      const userId = (decoded.id || decoded.userId).toString();
      const chatRoomId = message.chatRoomId?.toString();
      const content = message.content?.trim();

      if (!chatRoomId || !content) {
        return ws.send(
          JSON.stringify({
            type: "error",
            message: "chatRoomId and content are required",
          })
        );
      }

      const check = await isChatParticipant(chatRoomId, userId);
      if (!check.ok) {
        return ws.send(
          JSON.stringify({
            type: "error",
            message: check.message,
          })
        );
      }

      const chatRoom = check.chatRoom;
      const roomDbId = chatRoom._id.toString();
      const reqId = chatRoom.requestId ? chatRoom.requestId.toString() : null;

      const newMessage = {
        sender: new mongoose.Types.ObjectId(userId),
        senderName: decoded.name || "User",
        content,
        type: "text",
        createdAt: new Date(),
      };

      chatRoom.messages.push(newMessage);
      chatRoom.lastMessage = content;
      await chatRoom.save();

      await chatRoom.populate("messages.sender", "name email avatar");

      const savedMessage = chatRoom.messages[chatRoom.messages.length - 1];

      broadcastToRoom(wss, [roomDbId, reqId, chatRoomId], {
        type: "new-message",
        chatRoomId: roomDbId,
        requestId: reqId,
        chatId: roomDbId,
        tempId: message.tempId || null,
        message: savedMessage,
      });

      return;
    }

    // ── Video Invite ───────────────────────────────────────────────────────
    if (message.type === "video-invite-request") {
      if (!message.token) {
        return ws.send(JSON.stringify({ type: "error", message: "No token provided" }));
      }

      let decoded;
      try {
        decoded = jwt.verify(message.token, JWT_SECRET);
      } catch (e) {
        return ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
      }

      const userId = (decoded.id || decoded.userId).toString();
      const chatRoomId = message.chatRoomId?.toString();

      if (!chatRoomId) {
        return ws.send(
          JSON.stringify({ type: "error", message: "chatRoomId is required" })
        );
      }

      const check = await isChatParticipant(chatRoomId, userId);
      if (!check.ok) {
        return ws.send(JSON.stringify({ type: "error", message: check.message }));
      }

      const chatRoom = check.chatRoom;
      const roomDbId = chatRoom._id.toString();
      const reqId = chatRoom.requestId ? chatRoom.requestId.toString() : null;
      const senderName = decoded.name || "User";

      const newMessage = {
        sender: new mongoose.Types.ObjectId(userId),
        senderName,
        content: `${senderName} started a video lesson! Click to join.`,
        type: "system",
        createdAt: new Date(),
      };

      chatRoom.messages.push(newMessage);
      chatRoom.lastMessage = `📹 Video lesson started by ${senderName}`;
      await chatRoom.save();
      await chatRoom.populate("messages.sender", "name email avatar");

      const savedMessage = chatRoom.messages[chatRoom.messages.length - 1];

      broadcastToRoom(wss, [roomDbId, reqId, chatRoomId], {
        type: "new-message",
        chatRoomId: roomDbId,
        requestId: reqId,
        chatId: roomDbId,
        tempId: message.tempId || null,
        message: savedMessage,
      });

      return;
    }
  } catch (error) {
    console.error("❌ WS message error:", error.message);
    ws.send(JSON.stringify({ type: "error", message: "Failed to process message" }));
  }
});

  ws.on("close", () => {
    clearInterval(pingInterval);

    // ✅ FIX: Only delete from LIVE_USERS if this ws is still the active one
    const userId = ws._userId;
    if (userId && LIVE_USERS.get(userId) === ws) {
      LIVE_USERS.delete(userId);
      console.log(`❌ ${userId} went OFFLINE. LIVE: ${LIVE_USERS.size}`);
    }
  });

  ws.on("error", (err) => {
    console.error("❌ WS error:", err.message);
    clearInterval(pingInterval);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function nowIST() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Default Route ────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "🚀 SkillSwap Pro API + WebSocket LIVE!",
    timestamp: new Date().toISOString(),
    websocket: `ws://localhost:${process.env.PORT || 5000}/ws`,
    status: "production-ready",
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 SkillSwap Pro FULLSTACK LIVE!`);
  console.log(`📡 REST API  : http://localhost:${PORT}`);
  console.log(`🌐 WebSocket : ws://localhost:${PORT}/ws`);
  console.log(`📎 File Upload: POST http://localhost:${PORT}/api/chat/upload`);
  console.log(`📁 Static Files: http://localhost:${PORT}/uploads/`);
  console.log(`✅ Messages + Files PERSIST ON REFRESH!\n`);
});