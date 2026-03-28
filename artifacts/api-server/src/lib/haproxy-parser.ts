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

const CONNECTION_RE =
  /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+([\d.:]+):\d+\s+\[([^\]]+)\]\s+(\S+)\s+(\S+)\/(\S+)\s+[\d/]+\/[\d/]+([\d]+)\s+(\d+)\s+(\w+)\s+([\d/]+\/[\d/]+\/[\d/]+\/[\d/]+\/[\d/]+)\s+([\d/]+)/;

const SERVER_EVENT_RE =
  /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+Server\s+(\S+)\/(\S+)\s+is\s+(UP|DOWN),\s+reason:\s+([^,]+),.*check duration:\s+(\d+)ms/;

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

    const connMatch = line.match(CONNECTION_RE);
    if (connMatch) {
      const [, timestamp, clientIp, , frontend, backendServer, server, responseTimeMs, bytesStr, terminationState, connStats] = connMatch;
      const bytes = parseInt(bytesStr, 10);
      const ms = parseInt(responseTimeMs, 10);

      const entry: ConnectionEntry = {
        timestamp,
        clientIp,
        frontend,
        backend: backendServer,
        server,
        responseTimeMs: ms,
        bytesTransferred: bytes,
        terminationState,
        connStats,
      };
      connections.push(entry);
      clientSet.add(clientIp);
      backendSet.add(backendServer);

      if (!backendMap.has(backendServer)) {
        backendMap.set(backendServer, { connections: 0, totalBytes: 0, totalMs: 0, servers: new Set() });
      }
      const bstat = backendMap.get(backendServer)!;
      bstat.connections++;
      bstat.totalBytes += bytes;
      bstat.totalMs += ms;
      bstat.servers.add(server);

      const hourKey = timestamp.slice(0, 13);
      if (!hourMap.has(hourKey)) {
        hourMap.set(hourKey, { connections: 0, bytes: 0 });
      }
      const hbucket = hourMap.get(hourKey)!;
      hbucket.connections++;
      hbucket.bytes += bytes;
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

  const connMatch = line.match(CONNECTION_RE);
  if (connMatch) {
    const [, timestamp, clientIp, , frontend, backend, server, responseTimeMs, bytesStr, terminationState, connStats] = connMatch;
    return {
      timestamp,
      clientIp,
      frontend,
      backend,
      server,
      responseTimeMs: parseInt(responseTimeMs, 10),
      bytesTransferred: parseInt(bytesStr, 10),
      terminationState,
      connStats,
    };
  }

  return null;
}
