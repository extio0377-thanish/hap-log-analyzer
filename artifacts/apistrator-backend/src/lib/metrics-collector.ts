import { Client } from 'ssh2';
import { logger } from './logger';

// Python script piped via SSH stdin to python3
const METRICS_SCRIPT = `
import json, time, subprocess, sys

def r(cmd, timeout=10):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except Exception:
        return ''

# Hostname
hostname = r('hostname -s') or r('hostname') or 'unknown'

# CPU usage via /proc/stat (two samples, 1 second apart)
def read_stat():
    with open('/proc/stat') as f:
        parts = f.readline().split()[1:8]
    vals = [int(x) for x in parts]
    idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
    return idle, sum(vals)

try:
    i1, t1 = read_stat()
    time.sleep(1)
    i2, t2 = read_stat()
    dt = t2 - t1
    cpu = round((1 - (i2 - i1) / dt) * 100, 2) if dt > 0 else 0.0
except Exception:
    cpu = 0.0

# Memory usage via /proc/meminfo (MemAvailable for accurate free)
try:
    with open('/proc/meminfo') as f:
        m = {}
        for line in f:
            parts = line.split(':')
            if len(parts) == 2:
                m[parts[0].strip()] = int(parts[1].split()[0])
    total = m.get('MemTotal', 1)
    avail = m.get('MemAvailable', m.get('MemFree', 0))
    mem = round((1 - avail / total) * 100, 2) if total > 0 else 0.0
except Exception:
    mem = 0.0

# Disk usage via df -P (POSIX format, no line wrapping)
disks = []
try:
    out = subprocess.run(['df', '-P'], capture_output=True, text=True).stdout
    for line in out.splitlines()[1:]:
        p = line.split()
        if len(p) >= 6:
            mount = p[5]
            pct_str = p[4].rstrip('%')
            if mount.startswith('/') and pct_str.isdigit():
                disks.append({'mount': mount, 'used_pct': int(pct_str)})
except Exception:
    pass

print(json.dumps({
    'hostname': hostname,
    'cpu_usage': cpu,
    'mem_usage': mem,
    'disks': disks,
}))
sys.stdout.flush()
`;

export interface DiskEntry {
  mount: string;
  used_pct: number;
}

export interface MetricsResult {
  hostname: string;
  cpu_usage: number;
  mem_usage: number;
  disks: DiskEntry[];
  collected_at: string;
}

export interface MetricsCollectorOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  timeoutMs?: number;
}

export function collectMetrics(opts: MetricsCollectorOptions): Promise<MetricsResult> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const deadline = opts.timeoutMs ?? 30_000;

    const timer = setTimeout(() => {
      client.end();
      reject(new Error('SSH connection timed out'));
    }, deadline);

    client.on('ready', () => {
      client.exec('python3 -', { pty: false }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          client.end();
          return reject(err);
        }

        let out = '';
        let errOut = '';
        stream.on('data', (chunk: Buffer) => { out += chunk.toString(); });
        stream.stderr.on('data', (chunk: Buffer) => { errOut += chunk.toString(); });

        stream.on('close', (code: number) => {
          clearTimeout(timer);
          client.end();
          const raw = out.trim();
          if (!raw) {
            return reject(new Error(`No output from script (exit ${code}): ${errOut.slice(0, 300)}`));
          }
          try {
            const parsed = JSON.parse(raw);
            resolve({ ...parsed, collected_at: new Date().toISOString() });
          } catch {
            reject(new Error(`Failed to parse JSON: ${raw.slice(0, 200)}`));
          }
        });

        stream.write(METRICS_SCRIPT);
        stream.end();
      });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const connectOpts: Parameters<typeof client.connect>[0] = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      readyTimeout: deadline,
    };
    if (opts.privateKey) {
      connectOpts.privateKey = opts.privateKey;
    } else if (opts.password) {
      connectOpts.password = opts.password;
    }

    client.connect(connectOpts);
  });
}
