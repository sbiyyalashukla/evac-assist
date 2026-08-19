const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "EvacuationActions";
const MOBILITY_TABLE_NAME = process.env.MOBILITY_TABLE_NAME || "MobilityAssistanceRequests";
const MAPS_TABLE_NAME = process.env.MAPS_TABLE_NAME || "EvacuationMaps";

// Valid action types this Lambda supports
const VALID_ACTIONS = [
  "Off-campus",
  "Self Evacuating",
  "Guide to Evacuate Area",
  "Need Mobility Assistance",
];

/**
 * Single Lambda handler for all evacuation assistance actions.
 * - All actions write to EvacuationActions table
 * - "Guide to Evacuate Area" also returns map + guidelines
 * - "Need Mobility Assistance" also writes to MobilityAssistanceRequests table
 */
exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || event;

    const { action, emergencyId, uid, location, notes } = body;

    // Validate required fields
    if (!action) {
      return buildResponse(400, { error: "Missing required field: action" });
    }

    if (!VALID_ACTIONS.includes(action)) {
      return buildResponse(400, {
        error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      });
    }

    if (!emergencyId) {
      return buildResponse(400, { error: "Missing required field: emergencyId" });
    }

    if (!uid) {
      return buildResponse(400, { error: "Missing required field: uid" });
    }

    // Build the EvacuationActions record
    const actionRecord = {
      id: uuidv4(),
      emergencyId,
      uid,
      action,
      location: location || null,
      notes: notes || null,
      timestamp: new Date().toISOString(),
      status: "pending",
    };

    // Write to EvacuationActions table (all actions do this)
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: actionRecord,
      })
    );

    // Handle action-specific logic
    let responsePayload = {
      message: "Action recorded successfully",
      record: actionRecord,
    };

    if (action === "Guide to Evacuate Area") {
      const mapData = await getEvacuationMap(emergencyId, location);
      responsePayload.map = mapData.map || null;
      responsePayload.guidelines = mapData.guidelines || [];
    }

    if (action === "Need Mobility Assistance") {
      const mobilityRecord = await saveMobilityRequest(body, actionRecord.id);
      responsePayload.mobilityRequest = mobilityRecord;
    }

    return buildResponse(200, responsePayload);
  } catch (error) {
    console.error("Error processing evacuation action:", error);

    if (error instanceof SyntaxError) {
      return buildResponse(400, { error: "Invalid JSON in request body" });
    }

    return buildResponse(500, { error: "Internal server error" });
  }
};

/**
 * Saves a mobility assistance request to the MobilityAssistanceRequests table.
 * Links back to the EvacuationActions record via actionId.
 */
async function saveMobilityRequest(body, actionId) {
  const { emergencyId, uid, assistanceType, floorLevel, buildingName, roomNumber, contactPhone, specialNeeds } = body;

  // Validate mobility-specific required fields
  if (!assistanceType) {
    throw new ValidationError("Missing required field for mobility assistance: assistanceType");
  }

  const mobilityRecord = {
    requestId: uuidv4(),
    actionId,
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

  await docClient.send(
    new PutCommand({
      TableName: MOBILITY_TABLE_NAME,
      Item: mobilityRecord,
    })
  );

  return mobilityRecord;
}

/**
 * Fetches evacuation map and guidelines for the given emergency and location.
 * Queries the EvacuationMaps table by emergencyId.
 */
async function getEvacuationMap(emergencyId, location) {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: MAPS_TABLE_NAME,
        KeyConditionExpression: "emergencyId = :eid",
        ExpressionAttributeValues: {
          ":eid": emergencyId,
        },
      })
    );

    if (result.Items && result.Items.length > 0) {
      // If location provided, try to find a location-specific map
      const specificMap = location
        ? result.Items.find((item) => item.location === location)
        : null;

      const mapItem = specificMap || result.Items[0];

      return {
        map: mapItem.mapUrl || null,
        guidelines: mapItem.guidelines || [],
      };
    }

    return { map: null, guidelines: ["Follow posted evacuation signs", "Proceed to nearest exit"] };
  } catch (error) {
    console.error("Error fetching evacuation map:", error);
    // Return default guidelines if map lookup fails
    return { map: null, guidelines: ["Follow posted evacuation signs", "Proceed to nearest exit"] };
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}
