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
  /** True only for JSON-structured MSB/EXTIO log entries (shown in Live Traffic table) */
  isJsonLog?: boolean;
  httpMethod?: string;
  httpUrl?: string;
  httpStatusCode?: number;
  apiKey?: string;
  sslCn?: string;
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

// JSON-structured log format (MSB API Gateway / custom HAProxy log format):
// <ISO_TIMESTAMP> <host> haproxy[pid]: {"logger_type":"EXTIO","timestamp":"...","Source IP":"...","method":"...","uri":"..."}
// NOTE: Lines with large REQUEST bodies (XML/SOAP) may be truncated by syslog before the
// closing } — we intentionally do NOT require } at the end so truncated lines still parse.
const JSON_LOG_RE = /^(\S+)\s+\S+\s+haproxy\[\d+\]:\s+(\{.+)/;

/** Extract a simple string field from a (possibly malformed) JSON object string.
 *  Reliable for fields whose values contain no unescaped double-quotes — which
 *  covers all structured fields (IP, method, uri, X-API-Key, payload_size, etc.). */
function extractJsonField(jsonStr: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`);
  const m = jsonStr.match(re);
  return m ? m[1] : undefined;
}

const MONTH_IDX: Record<string, number> = {
  Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,
};

/**
 * Compute duration in ms between the request-accepted time (JSON "timestamp" field,
 * local server time in "DD/Mon/YYYY:HH:MM:SS.mmm" format) and the log-written time
 * (outer syslog ISO 8601 timestamp, includes timezone offset).
 * duration = outerTimestamp − jsonTimestamp  (both converted to UTC ms)
 */
function computeDurationMs(outerIsoTs: string, jsonHaproxyTs: string): number {
  const outerMs = new Date(outerIsoTs).getTime();
  if (isNaN(outerMs)) return 0;

  // e.g. "29/Mar/2026:09:43:46.580"
  const dm = jsonHaproxyTs.match(
    /^(\d{1,2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\.?(\d*)/
  );
  if (!dm) return 0;
  const [, day, mon, year, hr, min, sec, frac] = dm;
  const fracMs = parseInt((frac || '0').padEnd(3, '0').slice(0, 3));

  // Extract timezone offset from outer ISO timestamp (e.g. "+03:00")
  const tzMatch = outerIsoTs.match(/([+-])(\d{2}):(\d{2})$/);
  let tzOffsetMs = 0;
  if (tzMatch) {
    const sign = tzMatch[1] === '+' ? 1 : -1;
    tzOffsetMs = sign * (parseInt(tzMatch[2]) * 60 + parseInt(tzMatch[3])) * 60000;
  }

  // JSON timestamp is local server time → convert to UTC by subtracting offset
  const jsonUtcMs = Date.UTC(
    parseInt(year), MONTH_IDX[mon] ?? 0, parseInt(day),
    parseInt(hr), parseInt(min), parseInt(sec), fracMs
  ) - tzOffsetMs;

  return Math.max(0, outerMs - jsonUtcMs);
}

function tryParseJsonLine(line: string): ConnectionEntry | null {
  const m = line.match(JSON_LOG_RE);
  if (!m) return null;
  const outerTimestamp = m[1]; // ISO 8601 — used for hourly bucketing + duration
  const jsonStr = m[2];

  // Attempt 1: well-formed JSON (fast path)
  let obj: Record<string, string> | null = null;
  try { obj = JSON.parse(jsonStr); } catch { /* fall through to regex extraction */ }

  // Helper: read a field.
  // Always try regex extraction as well — JSON.parse may succeed but still
  // return wrong values for fields that appear after an unescaped quote in a
  // REQUEST/RESPONSE body (the JSON parser cuts the string there).
  const getField = (key: string, ...aliases: string[]): string | undefined => {
    for (const k of [key, ...aliases]) {
      // Regex path is authoritative: it matches the literal field pattern
      // and ignores anything inside the REQUEST/body field.
      const fromRegex = extractJsonField(jsonStr, k);
      if (fromRegex !== undefined && fromRegex !== '') return fromRegex;
      // Fallback to parsed object (covers numeric or non-string JSON values)
      if (obj) {
        const v = obj[k];
        if (v !== undefined && v !== '') return String(v);
      }
    }
    return undefined;
  };

  const clientIp   = getField('Source IP', 'source_ip', 'client_ip') ?? '?';
  const method     = getField('method', 'Method') ?? 'POST';
  const uri        = getField('uri', 'url', 'URI') ?? '/';
  const apiKey     = getField('X-API-Key', 'x-api-key', 'apikey');
  const sslSubject = getField('ssl_subject', 'ssl_cn_subject');
  const jsonTs     = getField('timestamp') ?? ''; // used for duration calc
  const payloadStr = getField('payload_size', 'bytes', 'content_length');

  // Bytes from payload_size field (string number like "618")
  const bytesTransferred = payloadStr ? (parseInt(payloadStr, 10) || 0) : 0;

  // Duration: outer syslog timestamp − JSON request-accepted timestamp
  const responseTimeMs = jsonTs ? computeDurationMs(outerTimestamp, jsonTs) : 0;

  // CN from ssl_subject  e.g. "/C=IN/.../CN=srv-stage-lbr/emailAddress=..."
  let sslCn: string | undefined;
  if (sslSubject && sslSubject !== '-') {
    const cnMatch = sslSubject.match(/\/CN=([^\/]+)/);
    if (cnMatch) sslCn = cnMatch[1].trim();
  }

  // Status code — Priority 1: "status":"500" direct field
  // Priority 2: <responseCode>NNN</responseCode> in XML body
  // Priority 3: "responseCode":404 or "responseCode":"404" in JSON body
  let statusCode: number | undefined;
  const statusField = getField('status');
  if (statusField && /^\d{3}$/.test(statusField)) {
    statusCode = parseInt(statusField, 10);
  } else {
    const xmlMatch = line.match(/<responseCode>(\d{3})<\/responseCode>/);
    if (xmlMatch) {
      statusCode = parseInt(xmlMatch[1], 10);
    } else {
      const jsonMatch = line.match(/"(?:responseCode|statusCode|httpCode)"\s*:\s*"?(\d{3})"?/);
      if (jsonMatch) statusCode = parseInt(jsonMatch[1], 10);
    }
  }

  // Backend from URI path (handles both plain /path and full https://... URLs)
  let uriPath = uri;
  try { uriPath = new URL(uri).pathname; } catch { /* uri is already a path */ }
  const uriSegment = (uriPath.startsWith('/') ? uriPath.slice(1) : uriPath).split('/')[0] || 'MSB-API';

  return {
    timestamp: outerTimestamp,
    clientIp,
    frontend: 'MSB-API',
    backend: uriSegment,
    server: '-',
    responseTimeMs,
    bytesTransferred,
    terminationState: '-',
    connStats: '-',
    isHttp: true,
    isJsonLog: true,
    httpMethod: method,
    httpUrl: uri,
    httpStatusCode: statusCode,
    apiKey,
    sslCn,
  };
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
  // 0. Try JSON-structured MSB API Gateway format first (distinct `{` after the syslog prefix)
  if (line.includes(']: {')) {
    const je = tryParseJsonLine(line);
    if (je) return je;
  }

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
