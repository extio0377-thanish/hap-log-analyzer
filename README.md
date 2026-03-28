# HAProxy Log Analyzer

A lightweight, browser-based HAProxy log dashboard — GoAccess-style dark UI with live log streaming support.

## Features

- **Instant parsing** — drag-and-drop a `haproxy.log` file and get a full dashboard in seconds
- **HTTP Traffic Log** — all HTTP frontends, colored method badges, URL paths, status codes, duration, bytes
- **Backend statistics** — connections, avg response time and bytes per backend
- **Server health events** — UP/DOWN timeline with reasons and check durations
- **Hourly traffic chart** — connections and bytes over time (Recharts)
- **Live tail** — connect to a running HAProxy log file via SSE for real-time updates
- **Supports multiple log formats**:
  - Standard HTTP with request line (`"GET /path HTTP/1.1"`)
  - mTLS/SOAP body-capture format (no request line, `{captured body}`)
  - TCP passthrough

## Project Structure

```
.
├── artifacts/
│   ├── api-server/          # Express backend — log parser + SSE endpoint
│   └── haproxy-analyzer/    # React + Vite frontend — dashboard UI
└── lib/
    ├── api-spec/            # OpenAPI contract (source of truth)
    └── api-client-react/    # Auto-generated API client (React Query)
```

## Requirements

- Node.js 20+
- pnpm 9+

## Setup

```bash
# Install dependencies
pnpm install

# Generate the API client from the OpenAPI spec (required on first run)
pnpm --filter @workspace/api-spec run codegen
```

## Running in Development

Run both servers in separate terminals:

```bash
# Terminal 1 — API server (default port from $PORT env var, falls back to 3001)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (default port from $PORT env var, falls back to 5173)
pnpm --filter @workspace/haproxy-analyzer run dev
```

Then open `http://localhost:5173` in your browser.

> **Note:** The frontend expects the API to be at the same host on `/api/*`.  
> If you run them on separate ports locally, set `VITE_API_BASE_URL=http://localhost:3001` before starting the frontend.

## Uploading a Log File

1. Open the app in your browser
2. Drag and drop your `haproxy.log` onto the upload area, or click **Browse Files**
3. The dashboard will render immediately

## Live Tail (SSE)

1. Scroll down to the **Live Stream** panel below the upload area
2. Enter the absolute path to the log file on the server (e.g. `/var/log/haproxy/haproxy.log`)
3. Click **Connect** — new lines are streamed in real time and the dashboard updates every 1.5 s

## Building for Production

```bash
# Build both API server and frontend
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/haproxy-analyzer run build

# Start the production API server
pnpm --filter @workspace/api-server run start
```

Serve the frontend `dist/` folder with any static host (nginx, Caddy, etc.) or add static middleware to the Express server.

## Log Format Support

The parser handles all common HAProxy HTTP and TCP log formats:

| Format | Example tail | Parsed fields |
|--------|-------------|---------------|
| HTTP with request line | `200 1024 - - ---- 5/1/0/0/0 0/0 "POST /api/v1 HTTP/1.1"` | method, url, status, timing |
| HTTP body capture (mTLS/SOAP) | `200 886 - - ---- 6/1/0/0/0 0/0 {<?xml...>} {cert}` | status, timing (no URL) |
| TCP passthrough | `cD 10/5/4/4/0 0/0` | timing, flags |
| Server health event | `Server bk/srv is DOWN, reason: Layer4…` | backend, server, status |
