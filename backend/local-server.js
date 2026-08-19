/**
 * Local development server that mimics API Gateway → Lambda invocation.
 * Run with: node local-server.js
 * 
 * NOTE: This uses a local in-memory store instead of DynamoDB.
 * For full DynamoDB integration, use SAM CLI (sam local start-api).
 */
const http = require("http");

// Mock DynamoDB with in-memory storage
const tables = {
  EvacuationActions: [],
  MobilityAssistanceRequests: [],
  EvacuationMaps: [
    {
      emergencyId: "emergency-2026-001",
      location: "Boelter Hall",
      mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf",
      guidelines: [
        "Exit via stairwell B on the west side",
        "Proceed to Wilson Plaza assembly area",
        "Avoid elevator usage",
      ],
    },
  ],
  EvacuationAreas: [
    { areaId: "area-wilson-plaza", name: "Wilson Plaza", lat: 34.0709, lng: -118.4423, capacity: 500, description: "Central campus", mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf", isActive: true },
    { areaId: "area-drake-stadium", name: "Drake Stadium", lat: 34.0716, lng: -118.4490, capacity: 1000, description: "West campus, large capacity", mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf", isActive: true },
    { areaId: "area-intramural-field", name: "Intramural Field", lat: 34.0740, lng: -118.4415, capacity: 800, description: "North campus", mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf", isActive: true },
    { areaId: "area-court-of-sciences", name: "Court of Sciences", lat: 34.0677, lng: -118.4414, capacity: 400, description: "South campus", mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf", isActive: true },
    { areaId: "area-sunset-village", name: "Sunset Village", lat: 34.0735, lng: -118.4520, capacity: 600, description: "Residential area", mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf", isActive: true },
    { areaId: "area-parking-8", name: "Parking Structure 8 (top)", lat: 34.0690, lng: -118.4470, capacity: 300, description: "Southwest campus", mapUrl: "https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf", isActive: true },
  ],
  Buses: [
    { busId: "bus-001", busNumber: "UCLA-101", capacity: 45, currentCount: 0, status: "available", lat: 34.0700, lng: -118.4440, lastUpdated: new Date().toISOString() },
    { busId: "bus-002", busNumber: "UCLA-102", capacity: 45, currentCount: 0, status: "available", lat: 34.0710, lng: -118.4450, lastUpdated: new Date().toISOString() },
    { busId: "bus-003", busNumber: "UCLA-103", capacity: 60, currentCount: 0, status: "available", lat: 34.0720, lng: -118.4430, lastUpdated: new Date().toISOString() },
  ],
  BusAssignments: [],
  SafetyCheckNotifications: [],
  UserLocations: [],
};

// Mock AWS SDK
const mockPutCommand = (tableName, item) => {
  tables[tableName].push(item);
  return Promise.resolve();
};

const mockQueryCommand = (tableName, key, value) => {
  const items = tables[tableName].filter((item) => item[key] === value);
  return Promise.resolve({ Items: items });
};

// Override the Lambda's DynamoDB calls for local use
process.env.TABLE_NAME = "EvacuationActions";
process.env.MOBILITY_TABLE_NAME = "MobilityAssistanceRequests";
process.env.MAPS_TABLE_NAME = "EvacuationMaps";

// We need to mock the AWS SDK before requiring the handler
const { v4: uuidv4 } = require("uuid");

// Haversine distance in meters
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body, null, 2),
  };
}

// Local handler that routes requests
async function handleRequest(method, path, body) {
  // POST /action — core evacuation actions
  if (method === "POST" && path === "/action") {
    const { action, emergencyId, uid, location, notes } = body;

    if (!action) return buildResponse(400, { error: "Missing required field: action" });
    if (!emergencyId) return buildResponse(400, { error: "Missing required field: emergencyId" });
    if (!uid) return buildResponse(400, { error: "Missing required field: uid" });

    const VALID_ACTIONS = ["Off-campus", "Self Evacuating", "Guide to Evacuate Area", "Need Mobility Assistance"];
    if (!VALID_ACTIONS.includes(action)) {
      return buildResponse(400, { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` });
    }

    const actionRecord = {
      id: uuidv4(),
      emergencyId,
      uid,
      action,
      lat: location?.lat || null,
      lng: location?.lng || null,
      evacAreaId: null,
      notes: notes || null,
      timestamp: new Date().toISOString(),
      status: "pending",
    };

    tables.EvacuationActions.push(actionRecord);

    let responsePayload = { message: "Action recorded successfully", record: actionRecord };

    // Guide to Evacuate Area — return nearby evac areas
    if (action === "Guide to Evacuate Area" && location?.lat && location?.lng) {
      const areas = tables.EvacuationAreas
        .filter((a) => a.isActive)
        .map((a) => ({
          ...a,
          distanceMeters: Math.round(haversineDistance(location.lat, location.lng, a.lat, a.lng)),
          assignedBuses: tables.BusAssignments
            .filter((ba) => ba.evacAreaId === a.areaId && ba.emergencyId === emergencyId)
            .map((ba) => ba.busId),
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      responsePayload.nearbyAreas = areas;
    }

    // Need Mobility Assistance — save to mobility table
    if (action === "Need Mobility Assistance") {
      const { assistanceType, floorLevel, buildingName, roomNumber, contactPhone, specialNeeds } = body;
      if (!assistanceType) {
        return buildResponse(400, { error: "Missing required field for mobility assistance: assistanceType" });
      }
      const mobilityRecord = {
        requestId: uuidv4(),
        actionId: actionRecord.id,
        emergencyId,
        uid,
        assistanceType,
        floorLevel: floorLevel || null,
        buildingName: buildingName || null,
        roomNumber: roomNumber || null,
        contactPhone: contactPhone || null,
        specialNeeds: specialNeeds || null,
        timestamp: new Date().toISOString(),
        status: "pending",
      };
      tables.MobilityAssistanceRequests.push(mobilityRecord);
      responsePayload.mobilityRequest = mobilityRecord;
    }

    return buildResponse(200, responsePayload);
  }

  // POST /action/select-area — user confirms evac area choice
  if (method === "POST" && path === "/action/select-area") {
    const { actionId, evacAreaId } = body;
    if (!actionId || !evacAreaId) return buildResponse(400, { error: "Missing actionId or evacAreaId" });

    const record = tables.EvacuationActions.find((r) => r.id === actionId);
    if (!record) return buildResponse(404, { error: "Action record not found" });

    record.evacAreaId = evacAreaId;
    record.status = "en-route";
    return buildResponse(200, { message: "Evacuation area selected", record });
  }

  // GET /evac-areas — all active areas
  if (method === "GET" && path === "/evac-areas") {
    const areas = tables.EvacuationAreas.filter((a) => a.isActive);
    return buildResponse(200, { areas });
  }

  // GET /evac-areas/nearest?lat=...&lng=...
  if (method === "GET" && path.startsWith("/evac-areas/nearest")) {
    const url = new URL(`http://localhost${path}`);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lng = parseFloat(url.searchParams.get("lng"));
    if (isNaN(lat) || isNaN(lng)) return buildResponse(400, { error: "Missing lat/lng query params" });

    const areas = tables.EvacuationAreas
      .filter((a) => a.isActive)
      .map((a) => ({
        ...a,
        distanceMeters: Math.round(haversineDistance(lat, lng, a.lat, a.lng)),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return buildResponse(200, { userLocation: { lat, lng }, areas });
  }

  // PUT /user/location — update user position
  if (method === "PUT" && path === "/user/location") {
    const { emergencyId, uid, lat, lng } = body;
    if (!uid || !emergencyId) return buildResponse(400, { error: "Missing uid or emergencyId" });

    const existing = tables.UserLocations.find((u) => u.uid === uid && u.emergencyId === emergencyId);
    if (existing) {
      existing.lat = lat;
      existing.lng = lng;
      existing.lastUpdated = new Date().toISOString();
    } else {
      tables.UserLocations.push({ uid, emergencyId, lat, lng, evacAreaId: null, lastUpdated: new Date().toISOString() });
    }
    return buildResponse(200, { message: "Location updated" });
  }

  // POST /admin/bus-assignment
  if (method === "POST" && path === "/admin/bus-assignment") {
    const { emergencyId, busId, evacAreaId, assignedBy } = body;
    if (!emergencyId || !busId || !evacAreaId) return buildResponse(400, { error: "Missing required fields" });

    const assignment = {
      assignmentId: uuidv4(),
      emergencyId,
      busId,
      evacAreaId,
      assignedBy: assignedBy || "admin",
      assignedAt: new Date().toISOString(),
      status: "assigned",
    };
    tables.BusAssignments.push(assignment);

    const bus = tables.Buses.find((b) => b.busId === busId);
    if (bus) bus.status = "assigned";

    return buildResponse(200, { message: "Bus assigned to evacuation area", assignment });
  }

  // GET /admin/buses
  if (method === "GET" && path.startsWith("/admin/buses")) {
    return buildResponse(200, { buses: tables.Buses, assignments: tables.BusAssignments });
  }

  // GET /buses/:busId
  if (method === "GET" && path.startsWith("/buses/")) {
    const busId = path.split("/buses/")[1];
    const bus = tables.Buses.find((b) => b.busId === busId);
    if (!bus) return buildResponse(404, { error: "Bus not found" });
    return buildResponse(200, { bus });
  }

  // PUT /buses/:busId/location
  if (method === "PUT" && path.match(/^\/buses\/[^/]+\/location$/)) {
    const busId = path.split("/")[2];
    const bus = tables.Buses.find((b) => b.busId === busId);
    if (!bus) return buildResponse(404, { error: "Bus not found" });

    bus.lat = body.lat ?? bus.lat;
    bus.lng = body.lng ?? bus.lng;
    bus.currentCount = body.currentCount ?? bus.currentCount;
    bus.lastUpdated = new Date().toISOString();
    return buildResponse(200, { message: "Bus location updated", bus });
  }

  // POST /admin/safety-check
  if (method === "POST" && path === "/admin/safety-check") {
    const { emergencyId, triggeredBy } = body;
    const users = tables.EvacuationActions.filter((a) => a.emergencyId === emergencyId).map((a) => a.uid);
    const uniqueUsers = [...new Set(users)];

    const notifications = uniqueUsers.map((uid) => ({
      notificationId: uuidv4(),
      emergencyId,
      uid,
      sentAt: new Date().toISOString(),
      respondedAt: null,
      response: null,
      location: null,
    }));

    tables.SafetyCheckNotifications.push(...notifications);
    return buildResponse(200, { message: `Safety check sent to ${notifications.length} users`, notifications });
  }

  // POST /safety-check/respond
  if (method === "POST" && path === "/safety-check/respond") {
    const { emergencyId, uid, response, location } = body;
    const notification = tables.SafetyCheckNotifications.find((n) => n.emergencyId === emergencyId && n.uid === uid && !n.respondedAt);
    if (!notification) return buildResponse(404, { error: "No pending safety check found" });

    notification.respondedAt = new Date().toISOString();
    notification.response = response;
    notification.location = location || null;
    return buildResponse(200, { message: "Safety check response recorded", notification });
  }

  // GET /admin/safety-check/status
  if (method === "GET" && path.startsWith("/admin/safety-check/status")) {
    const url = new URL(`http://localhost${path}`);
    const emergencyId = url.searchParams.get("emergencyId");
    const notifications = tables.SafetyCheckNotifications.filter((n) => n.emergencyId === emergencyId);
    const summary = {
      total: notifications.length,
      safe: notifications.filter((n) => n.response === "safe").length,
      needsHelp: notifications.filter((n) => n.response === "needs-help").length,
      noResponse: notifications.filter((n) => !n.response).length,
    };
    return buildResponse(200, { summary, notifications });
  }

  return buildResponse(404, { error: `Route not found: ${method} ${path}` });
}

// HTTP Server
const PORT = 3000;
const server = http.createServer(async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const parsedBody = body ? JSON.parse(body) : {};
    const result = await handleRequest(req.method, req.url, parsedBody);

    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);

    console.log(`${req.method} ${req.url} → ${result.statusCode}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Evac Assist Local Server running at http://localhost:${PORT}\n`);
  console.log("Available endpoints:");
  console.log("  POST   /action                    - Record evacuation action");
  console.log("  POST   /action/select-area        - User selects evac area");
  console.log("  GET    /evac-areas                - List all active evac areas");
  console.log("  GET    /evac-areas/nearest?lat=&lng= - Nearest areas to user");
  console.log("  PUT    /user/location             - Update user GPS position");
  console.log("  POST   /admin/bus-assignment      - Assign bus to evac area");
  console.log("  GET    /admin/buses               - List all buses");
  console.log("  GET    /buses/:busId              - Get bus details");
  console.log("  PUT    /buses/:busId/location     - Update bus GPS/count");
  console.log("  POST   /admin/safety-check        - Send safety check to all users");
  console.log("  POST   /safety-check/respond      - User responds to safety check");
  console.log("  GET    /admin/safety-check/status  - Get safety check summary");
  console.log("");
});
