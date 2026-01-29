import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { getTrafficStatus, setDensity } from "./speedPrediction.js";

// Store connected users and their WebSocket connections
const users = new Map();
const messages = [];

// Generate a unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

const app = express();
const port = process.env.PORT || 3001; // ✅ Use Render's PORT or fallback

app.use(cors());
app.use(express.json());

// Create HTTP server instance
const server = createServer(app);

// Create WebSocket server with the same HTTP server
const wss = new WebSocketServer({
  server,
  perMessageDeflate: false,
  clientTracking: true,
});

// Get initial traffic status
let trafficData = getTrafficStatus();

// Helper to broadcast user list to all clients
const broadcastUserList = () => {
  const list = Array.from(users.entries()).map(([id, info]) => ({
    userId: id,
    userName: info.userName,
  }));
  users.forEach(({ ws: userWs }) => {
    try {
      userWs.send(JSON.stringify({ type: "userList", users: list }));
    } catch (e) {}
  });
};

// Helper to broadcast all users' locations to clients
const broadcastLocations = () => {
  const locations = Array.from(users.entries()).map(([id, info]) => ({
    userId: id,
    userName: info.userName,
    location: info.location || null,
  }));
  users.forEach(({ ws: userWs }) => {
    try {
      userWs.send(JSON.stringify({ type: "locations", locations }));
    } catch (e) {}
  });
};

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("New client connected, total connections:", wss.clients.size);
  let assignedId = null;

  // Send initial traffic data
  ws.send(JSON.stringify({ type: "trafficUpdate", data: trafficData }));

  // Handle incoming messages
  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (e) {
      return;
    }

    switch (message.type) {
      case "connect": {
        const userId = generateId();
        assignedId = userId;
        users.set(userId, { ws, userName: message.userName, location: null });

        ws.send(
          JSON.stringify({
            type: "connected",
            userId,
            messages: messages.slice(-50),
          })
        );

        broadcastUserList();
        broadcastLocations();
        break;
      }

      case "message": {
        const sender = users.get(message.userId);
        if (!sender) break;
        const newMessage = {
          id: generateId(),
          userId: message.userId,
          userName: sender.userName,
          content: message.content,
          timestamp: new Date(),
          type: message.messageType || "normal",
        };
        messages.push(newMessage);
        users.forEach(({ ws: userWs }) => {
          try {
            userWs.send(JSON.stringify({ type: "newMessage", message: newMessage }));
          } catch (e) {}
        });
        break;
      }

      case "emergency": {
        const sender = users.get(message.userId);
        if (!sender) break;
        const emergencyMessage = {
          id: generateId(),
          userId: message.userId,
          userName: sender.userName,
          content: "🚨 EMERGENCY ALERT: Traffic stopped for emergency vehicle",
          timestamp: new Date(),
          type: "emergency",
        };
        messages.push(emergencyMessage);
        trafficData = getTrafficStatus();
        users.forEach(({ ws: userWs }) => {
          try {
            userWs.send(
              JSON.stringify({
                type: "emergency",
                message: emergencyMessage,
                trafficData,
              })
            );
          } catch (e) {}
        });
        break;
      }

      case "location": {
        const sender = users.get(message.userId);
        if (!sender) break;
        const loc = {
          latitude: message.latitude,
          longitude: message.longitude,
          accuracy: message.accuracy || 0,
          timestamp: new Date(),
        };
        users.set(message.userId, { ...sender, location: loc });
        broadcastLocations();
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (assignedId && users.has(assignedId)) {
      const user = users.get(assignedId);
      users.delete(assignedId);
      broadcastUserList();
    }
  });

  const interval = setInterval(() => {
    trafficData = getTrafficStatus();
    try {
      ws.send(JSON.stringify({ type: "trafficUpdate", data: trafficData }));
    } catch (e) {}
  }, 1000);

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    clearInterval(interval);
  });
});

// REST endpoints
app.get("/api/traffic", (req, res) => res.json(trafficData));

app.post("/api/traffic/:direction/maxSpeed", (req, res) => {
  const { direction } = req.params;
  const { maxSpeed } = req.body;
  if (trafficData[direction]) {
    trafficData[direction].maxSpeed = maxSpeed;
    res.json({ success: true, data: trafficData[direction] });
  } else {
    res.status(400).json({ success: false, message: "Invalid direction" });
  }
});

app.post("/api/density/:direction", (req, res) => {
  const { direction } = req.params;
  const { density } = req.body;
  const ok = setDensity(direction, density);
  if (ok) {
    trafficData = getTrafficStatus();
    res.json({ success: true, direction, density });
  } else {
    res.status(400).json({ success: false, message: "Invalid direction" });
  }
});

app.post("/api/assistant", (req, res) => {
  const { prompt, userId } = req.body || {};
  const status = getTrafficStatus();

  let lines = [];
  let suggestions = [];

  Object.entries(status).forEach(([dir, info]) => {
    const density = info.density || 0;
    const vols = info.volumes || { total: 0, first: 0, second: 0 };
    const firstETA = info.firstGroup.estimatedTimeToReach;
    const secondETA = info.secondGroup.estimatedTimeToReach;
    lines.push(
      `${dir}: density ${density} veh/km, total ${vols.total} vehicles; first ETA ${firstETA}s, second ETA ${secondETA}s`
    );

    if (density >= 40 || vols.total >= 70)
      suggestions.push(`${dir}: high density — consider reducing inflow or rerouting traffic`);
    else if (density >= 25)
      suggestions.push(`${dir}: moderate density — monitor speed and volumes`);
    if (info.firstGroup.hasReached && !info.secondGroup.hasReached)
      suggestions.push(`${dir}: first group has reached; you may accelerate the second group or clear the path`);
  });

  let trafficSummary = `Traffic summary:\n${lines.join("\n")}`;
  if (suggestions.length) trafficSummary += `\n\nSuggestions:\n- ${suggestions.join("\n- ")}`;

  let reply = trafficSummary;

  if (prompt && prompt.trim()) {
    const lower = prompt.toLowerCase();
    if (lower.includes("congestion") || lower.includes("traffic jam"))
      reply = `🚨 Congestion Status:\n${lines.join("\n")}\n\n${trafficSummary}`;
  }

  res.json({ reply, suggestions, statusSnapshot: status });
});

// ✅ Start server only ONCE using Render's port
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`WebSocket server ready at ws://localhost:${port}`);
});
