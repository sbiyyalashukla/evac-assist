# EvacAssist

Emergency evacuation assistance app for UCLA campus. Launched via BruinAlert to help users report status, navigate to evacuation areas, and request mobility assistance.

## Structure

```
evac-assist/
├── frontend/       React + TypeScript + Vite (user-facing app)
├── backend/        AWS Lambda + DynamoDB (API + data layer)
└── .kiro/steering/ Design docs and rebuild instructions
```

## Quick Start (Local Development)

**Backend** (Terminal 1):
```bash
cd backend
npm install
node local-server.js        # http://localhost:3000
```

**Frontend** (Terminal 2):
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

**Test with BruinAlert params:**
```
http://localhost:5173/?UCLA_ID=123456789&emergencyId=emergency-2026-001&name=John
```

## Deploy to AWS

See `.kiro/steering/hackathon-rebuild-instructions.md` for full deployment guide.

## Tech Stack

- Frontend: React 19 + TypeScript + Vite + Leaflet (OpenStreetMap)
- Backend: AWS Lambda (Node.js 20) + API Gateway + DynamoDB
- Routing: OSRM (free walking directions)
- IaC: AWS SAM
