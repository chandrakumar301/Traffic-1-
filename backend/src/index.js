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
const port = 3001;

app.use(cors());
app.use(express.json());

// Create HTTP server instance
const server = createServer(app);

// Create WebSocket server with CORS
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
    } catch (e) {
      // ignore send errors
    }
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
    } catch (e) {
      // ignore send errors
    }
  });
};

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("New client connected, total connections:", wss.clients.size);
  let assignedId = null;

  // Send initial traffic data (as typed message)
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
        // store ws, name and (optional) last known location
        users.set(userId, { ws, userName: message.userName, location: null });

        // Send connected confirmation with recent messages
        ws.send(
          JSON.stringify({
            type: "connected",
            userId,
            messages: messages.slice(-50),
          }),
        );

        // Broadcast updated user list
        broadcastUserList();
        // broadcast locations (initially none)
        broadcastLocations();
        break;
      }

      case "message": {
        const sender = users.get(message.userId);
        if (!sender) {
          console.log(`Sender not found for userId: ${message.userId}`);
          break;
        }
        const newMessage = {
          id: generateId(),
          userId: message.userId,
          userName: sender.userName,
          content: message.content,
          timestamp: new Date(),
          type: message.messageType || "normal",
        };
        messages.push(newMessage);
        console.log(`Message sent by ${sender.userName}: ${message.content}`);
        // Broadcast to all connected users
        users.forEach(({ ws: userWs }) => {
          try {
            userWs.send(
              JSON.stringify({ type: "newMessage", message: newMessage }),
            );
          } catch (e) {
            console.error("Error broadcasting message:", e);
          }
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

        // Update traffic data and broadcast emergency + traffic
        trafficData = getTrafficStatus();
        users.forEach(({ ws: userWs }) => {
          try {
            userWs.send(
              JSON.stringify({
                type: "emergency",
                message: emergencyMessage,
                trafficData,
              }),
            );
          } catch (e) {}
        });
        break;
      }

      case "location": {
        // message: { type: 'location', userId, latitude, longitude, accuracy }
        const sender = users.get(message.userId);
        if (!sender) break;
        const loc = {
          latitude: message.latitude,
          longitude: message.longitude,
          accuracy: message.accuracy || 0,
          timestamp: new Date(),
        };
        // update user's stored location
        users.set(message.userId, { ...sender, location: loc });

        // broadcast new locations list to all clients
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
      console.log(`User ${user.userName} (${assignedId}) disconnected`);
      users.delete(assignedId);
      // Broadcast updated user list when someone disconnects
      broadcastUserList();
    }
  });

  // Update traffic data every second and push updates as typed message
  const interval = setInterval(() => {
    trafficData = getTrafficStatus();
    try {
      ws.send(JSON.stringify({ type: "trafficUpdate", data: trafficData }));
    } catch (e) {}
  }, 1000);

  ws.on("error", () => {
    clearInterval(interval);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    clearInterval(interval);
  });
});

// REST endpoints
app.get("/api/traffic", (req, res) => {
  res.json(trafficData);
});

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

// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

app.post("/api/density/:direction", (req, res) => {
  const { direction } = req.params;
  const { density } = req.body;
  const ok = setDensity(direction, density);
  if (ok) {
    // refresh trafficData immediately so clients get updated values
    trafficData = getTrafficStatus();
    res.json({ success: true, direction, density });
  } else {
    res.status(400).json({ success: false, message: "Invalid direction" });
  }
});

// Simple assistant endpoint that inspects current traffic status and returns
// a heuristic, project-aware reply. This is a lightweight, rule-based "AI"
// assistant that can be extended later to call a real ML/LLM service.
app.post("/api/assistant", (req, res) => {
  const { prompt, userId } = req.body || {};
  const status = getTrafficStatus();

  // Build a short summary and suggestions
  const lines = [];
  const suggestions = [];

  Object.entries(status).forEach(([dir, info]) => {
    const density = info.density || 0;
    const vols = info.volumes || { total: 0, first: 0, second: 0 };
    const firstETA = info.firstGroup.estimatedTimeToReach;
    const secondETA = info.secondGroup.estimatedTimeToReach;
    lines.push(
      `${dir}: density ${density} veh/km, total ${vols.total} vehicles; first ETA ${firstETA}s, second ETA ${secondETA}s`,
    );

    if (density >= 40 || vols.total >= 70) {
      suggestions.push(
        `${dir}: high density — consider reducing inflow or rerouting traffic`,
      );
    } else if (density >= 25) {
      suggestions.push(`${dir}: moderate density — monitor speed and volumes`);
    }
    if (info.firstGroup.hasReached && !info.secondGroup.hasReached) {
      suggestions.push(
        `${dir}: first group has reached; you may accelerate the second group or clear the path`,
      );
    }
  });

  // Build traffic summary
  let trafficSummary = `Traffic summary:\n${lines.join("\n")}`;
  if (suggestions.length)
    trafficSummary += `\n\nSuggestions:\n- ${suggestions.join("\n- ")}`;

  // Enhanced AI response based on user prompt
  let reply = trafficSummary;

  if (prompt && prompt.trim()) {
    const promptLower = prompt.toLowerCase();

    // Traffic-related question detection and intelligent responses
    if (
      promptLower.includes("congestion") ||
      promptLower.includes("traffic jam") ||
      promptLower.includes("blocked")
    ) {
      const highDensityDirs = Object.entries(status)
        .filter(([_, info]) => (info.density || 0) >= 40)
        .map(([dir, info]) => `${dir} (${info.density} veh/km)`);

      reply = `🚨 Congestion Status:\n${highDensityDirs.length ? `High congestion detected in: ${highDensityDirs.join(", ")}` : "No major congestion detected."}\n\n${trafficSummary}`;
    } else if (
      promptLower.includes("eta") ||
      promptLower.includes("time") ||
      promptLower.includes("when")
    ) {
      reply = `⏱️ Estimated Times:\n${lines.join("\n")}\n\n${suggestions.length ? "Suggestions:\n- " + suggestions.join("\n- ") : ""}`;
    } else if (
      promptLower.includes("emergency") ||
      promptLower.includes("accident") ||
      promptLower.includes("incident")
    ) {
      reply = `🚨 Emergency Protocol:\n- All lanes in affected directions have reduced speed\n- Emergency vehicles have priority\n- Please follow traffic control instructions\n\n${trafficSummary}`;
    } else if (
      promptLower.includes("density") ||
      promptLower.includes("vehicles") ||
      promptLower.includes("volume")
    ) {
      const totalVehicles = Object.values(status).reduce(
        (sum, info) => sum + (info.volumes?.total || 0),
        0,
      );
      const avgDensity = (
        Object.values(status).reduce(
          (sum, info) => sum + (info.density || 0),
          0,
        ) / Object.keys(status).length
      ).toFixed(1);
      reply = `📊 Traffic Volume Report:\nTotal Vehicles: ${totalVehicles}\nAverage Density: ${avgDensity} veh/km\n\n${trafficSummary}`;
    } else if (
      promptLower.includes("speed") ||
      promptLower.includes("fast") ||
      promptLower.includes("slow")
    ) {
      reply = `🚗 Speed Advisory:\nMonitor speed limits based on current traffic conditions. Current status:\n${trafficSummary}`;
    } else if (
      promptLower.includes("route") ||
      promptLower.includes("direction") ||
      promptLower.includes("way")
    ) {
      const lessCongestedDirs = Object.entries(status)
        .filter(([_, info]) => (info.density || 0) < 25)
        .map(([dir]) => dir);

      reply = `🗺️ Route Recommendation:\n${lessCongestedDirs.length ? `Recommended directions: ${lessCongestedDirs.join(", ")}` : "Monitor all directions for best route."}\n\n${trafficSummary}`;
    } else {
      // Default response for any other question
      reply = `📍 Traffic Information:\nYour Question: "${prompt}"\n\n${trafficSummary}`;
    }
  }

  return res.json({ reply, suggestions, statusSnapshot: status });
});

// Start the server
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log(`WebSocket server ready at ws://localhost:${port}`);
});
