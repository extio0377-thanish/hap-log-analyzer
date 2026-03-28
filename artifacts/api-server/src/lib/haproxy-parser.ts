export interface ConnectionEntry {
  timestamp: string;
  clientIp: string;
  frontend: string;
  backend: string;
  server: string;
  responseTimeMs: number;
  bytesTransferred: number;
  terminationState: string;
  connStats: string;
  isHttp: boolean;
  httpMethod?: string;
  httpUrl?: string;
  httpStatusCode?: number;
}

export interface ServerEvent {
  timestamp: string;
  backend: string;
  server: string;
  status: "UP" | "DOWN";
  reason: string;
  checkDurationMs: number;
}

export interface BackendStat {
  name: string;
  connections: number;
  totalBytes: number;
  avgResponseTimeMs: number;
  servers: string[];
}

export interface HourlyBucket {
  hour: string;
  connections: number;
  bytes: number;
}

export interface LogSummary {
  totalConnections: number;
  totalBytes: number;
  serverEvents: number;
  downEvents: number;
  upEvents: number;
  uniqueClients: number;
  uniqueBackends: number;
  avgResponseTimeMs: number;
  timeRange: { start: string; end: string };
}

export interface LogReport {
  summary: LogSummary;
  connections: ConnectionEntry[];
  serverEvents: ServerEvent[];
  backendStats: BackendStat[];
  hourlyDistribution: HourlyBucket[];
}

// HAProxy HTTP log format WITH request line (standard HTTP logging):
// timestamp host haproxy[pid]: ip:port [date] frontend backend/server Tq/Tw/Tc/Tr/Ta STATUS BYTES [cookie_req] [cookie_resp] term actconn/feconn/beconn/srv/ret q/q [{headers}] "METHOD URL HTTP/x.x"
// Cookie fields (- -) are optional — 0, 1, or 2 single-dash captures may appear before the termination flags
const HTTP_WITH_REQUEST_RE =
  /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+([\d.:]+):\d+\s+\[[^\]]+\]\s+(\S+)\s+(\S+)\/(\S+)\s+\d+\/\d+\/\d+\/\d+\/(\d+)\s+(\d+)\s+(\d+)(?:\s+-){0,2}\s+(\S+)\s+(\d+\/\d+\/\d+\/\d+\/\d+)\s+\d+\/\d+(?:\s+\{[^}]*\})*\s+"([A-Z]+)\s+(\S+)\s+HTTP\/[\d.]+"/;

// HAProxy HTTP log format WITH captured body but WITHOUT request line (mTLS/SOAP APIs):
// These entries have 2 extra cookie fields (- -) before termination flags, and large captured body blocks
// frontend~ (tilde = TLS frontend) backend/server Tq/Tw/Tc/Tr/Ta STATUS BYTES - - TERM actconn/... q/q {BODY} {CERT}
const HTTP_BODY_CAPTURE_RE =
  /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+([\d.:]+):\d+\s+\[[^\]]+\]\s+(\S+)\s+(\S+)\/(\S+)\s+\d+\/\d+\/\d+\/\d+\/(\d+)\s+(\d+)\s+(\d+)\s+-\s+-\s+(\S+)\s+(\d+\/\d+\/\d+\/\d+\/\d+)\s+\d+\/\d+\s+\{([^}]*)\}/;

// HAProxy TCP log format:
// timestamp host haproxy[pid]: ip:port [date] frontend backend/server Tc/Tw/Td BYTES flags actconn/feconn/beconn/srv/retries q/q
const TCP_RE =
  /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+([\d.:]+):\d+\s+\[[^\]]+\]\s+(\S+)\s+(\S+)\/(\S+)\s+\d+\/\d+\/(\d+)\s+(\d+)\s+(\S+)\s+(\d+\/\d+\/\d+\/\d+\/\d+)\s+\d+\/\d+/;

const SERVER_EVENT_RE =
  /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+Server\s+(\S+)\/(\S+)\s+is\s+(UP|DOWN),\s+reason:\s+([^,]+),.*check duration:\s+(\d+)ms/;


function tryParseConnection(line: string): ConnectionEntry | null {
  // 1. Try standard HTTP format with request line at end
  const hm = line.match(HTTP_WITH_REQUEST_RE);
  if (hm) {
    const [, timestamp, clientIp, frontend, backend, server, responseTotalMs, statusCode, bytes, terminationState, connStats, method, url] = hm;
    return {
      timestamp,
      clientIp,
      frontend,
      backend,
      server,
      responseTimeMs: parseInt(responseTotalMs, 10) || 0,
      bytesTransferred: parseInt(bytes, 10) || 0,
      terminationState,
      connStats,
      isHttp: true,
      httpMethod: method,
      httpUrl: url,
      httpStatusCode: parseInt(statusCode, 10),
    };
  }

  // 2. Try mTLS/SOAP body-capture format (no request line, has captured body blocks)
  const bm = line.match(HTTP_BODY_CAPTURE_RE);
  if (bm) {
    const [, timestamp, clientIp, frontend, backend, server, responseTotalMs, statusCode, bytes, terminationState, connStats] = bm;
    return {
      timestamp,
      clientIp,
      frontend,
      backend,
      server,
      responseTimeMs: parseInt(responseTotalMs, 10) || 0,
      bytesTransferred: parseInt(bytes, 10) || 0,
      terminationState,
      connStats,
      isHttp: true,
      httpMethod: "POST",
      httpStatusCode: parseInt(statusCode, 10),
    };
  }

  // 3. Fall back to TCP format
  const tm = line.match(TCP_RE);
  if (tm) {
    const [, timestamp, clientIp, frontend, backend, server, responseTimeMs, bytes, terminationState, connStats] = tm;
    return {
      timestamp,
      clientIp,
      frontend,
      backend,
      server,
      responseTimeMs: parseInt(responseTimeMs, 10) || 0,
      bytesTransferred: parseInt(bytes, 10) || 0,
      terminationState,
      connStats,
      isHttp: false,
    };
  }

  return null;
}

export function parseLogs(content: string): LogReport {
  const lines = content.split("\n");
  const connections: ConnectionEntry[] = [];
  const serverEvents: ServerEvent[] = [];
  const backendMap = new Map<string, { connections: number; totalBytes: number; totalMs: number; servers: Set<string> }>();
  const hourMap = new Map<string, { connections: number; bytes: number }>();
  const clientSet = new Set<string>();
  const backendSet = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;

    const srvMatch = line.match(SERVER_EVENT_RE);
    if (srvMatch) {
      const [, timestamp, backend, server, status, reason, checkDuration] = srvMatch;
      serverEvents.push({
        timestamp,
        backend,
        server,
        status: status as "UP" | "DOWN",
        reason: reason.trim(),
        checkDurationMs: parseInt(checkDuration, 10),
      });
      continue;
    }

    const entry = tryParseConnection(line);
    if (entry) {
      connections.push(entry);
      clientSet.add(entry.clientIp);
      backendSet.add(entry.backend);

      if (!backendMap.has(entry.backend)) {
        backendMap.set(entry.backend, { connections: 0, totalBytes: 0, totalMs: 0, servers: new Set() });
      }
      const bstat = backendMap.get(entry.backend)!;
      bstat.connections++;
      bstat.totalBytes += entry.bytesTransferred;
      bstat.totalMs += entry.responseTimeMs;
      bstat.servers.add(entry.server);

      const hourKey = entry.timestamp.slice(0, 13);
      if (!hourMap.has(hourKey)) {
        hourMap.set(hourKey, { connections: 0, bytes: 0 });
      }
      const hbucket = hourMap.get(hourKey)!;
      hbucket.connections++;
      hbucket.bytes += entry.bytesTransferred;
    }
  }

  const allTimestamps = [
    ...connections.map((c) => c.timestamp),
    ...serverEvents.map((e) => e.timestamp),
  ].sort();

  const totalBytes = connections.reduce((s, c) => s + c.bytesTransferred, 0);
  const totalMs = connections.reduce((s, c) => s + c.responseTimeMs, 0);
  const avgResponseTimeMs = connections.length > 0 ? totalMs / connections.length : 0;

  const summary: LogSummary = {
    totalConnections: connections.length,
    totalBytes,
    serverEvents: serverEvents.length,
    downEvents: serverEvents.filter((e) => e.status === "DOWN").length,
    upEvents: serverEvents.filter((e) => e.status === "UP").length,
    uniqueClients: clientSet.size,
    uniqueBackends: backendSet.size,
    avgResponseTimeMs: Math.round(avgResponseTimeMs),
    timeRange: {
      start: allTimestamps[0] ?? "",
      end: allTimestamps[allTimestamps.length - 1] ?? "",
    },
  };

  const backendStats: BackendStat[] = Array.from(backendMap.entries()).map(([name, stat]) => ({
    name,
    connections: stat.connections,
    totalBytes: stat.totalBytes,
    avgResponseTimeMs: stat.connections > 0 ? Math.round(stat.totalMs / stat.connections) : 0,
    servers: Array.from(stat.servers),
  }));

  const hourlyDistribution: HourlyBucket[] = Array.from(hourMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, data]) => ({ hour, ...data }));

  return {
    summary,
    connections,
    serverEvents,
    backendStats,
    hourlyDistribution,
  };
}

export function parseLine(line: string): ConnectionEntry | ServerEvent | null {
  const srvMatch = line.match(SERVER_EVENT_RE);
  if (srvMatch) {
    const [, timestamp, backend, server, status, reason, checkDuration] = srvMatch;
    return {
      timestamp,
      backend,
      server,
      status: status as "UP" | "DOWN",
      reason: reason.trim(),
      checkDurationMs: parseInt(checkDuration, 10),
    };
  }
  return tryParseConnection(line);
}
