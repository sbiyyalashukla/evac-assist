# Evacuation Assistance Services

A single AWS Lambda function that handles all evacuation assistance actions and persists them to DynamoDB.

## Supported Actions

| Action | Description |
|--------|-------------|
| `Off-campus` | User is off-campus and reporting their status |
| `Self evacuating` | User is self-evacuating without assistance |
| `Guide to evacuate area` | User needs guidance to the nearest evacuation area |
| `Need mobility assistance` | User requires mobility assistance for evacuation |

## Architecture

```
Client → API Gateway (POST /action) → Lambda → DynamoDB (EvacuationActions table)
```

## API Usage

**Endpoint:** `POST /action`

**Request Body:**

```json
{
  "action": "Off-campus",
  "userId": "user-123",
  "location": "Westwood Blvd",
  "notes": "Left campus 10 minutes ago"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `action` | Yes | One of the 4 supported actions listed above |
| `userId` | Yes | Unique identifier for the user |
| `location` | No | User's current location |
| `notes` | No | Additional context |

**Success Response (200):**

```json
{
  "message": "Action recorded successfully",
  "record": {
    "id": "generated-uuid",
    "userId": "user-123",
    "action": "Off-campus",
    "location": "Westwood Blvd",
    "notes": "Left campus 10 minutes ago",
    "timestamp": "2026-08-17T12:00:00.000Z",
    "status": "pending"
  }
}
```

**Error Response (400):**

```json
{
  "error": "Invalid action. Must be one of: Off-campus, Self evacuating, Guide to evacuate area, Need mobility assistance"
}
```

## Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Node.js 20.x](https://nodejs.org/)
- AWS credentials configured

## Deploy

```bash
# Install dependencies
npm install

# Build
sam build

# Deploy (first time - guided)
sam deploy --guided

# Deploy (subsequent)
sam deploy
```

## Local Testing

```bash
# Start local API
sam local start-api

# Invoke directly
sam local invoke EvacActionFunction -e events/sample-event.json
```

## Project Structure

```
evac-assist-services/
├── src/
│   └── index.js          # Lambda handler
├── template.yaml         # SAM/CloudFormation template
├── package.json          # Node.js dependencies
└── README.md
```
