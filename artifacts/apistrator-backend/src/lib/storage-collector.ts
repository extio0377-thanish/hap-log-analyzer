import { Client } from 'ssh2';

const CEPH_SCRIPT = `
import json, subprocess, sys

def r(cmd, timeout=30):
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return res.stdout.strip()
    except Exception:
        return ''

def rj(cmd, timeout=30):
    out = r(cmd, timeout)
    if not out:
        return None
    try:
        return json.loads(out)
    except Exception:
        return {'_raw': out}

result = {}

# Hostname
result['hostname'] = r('hostname -s') or r('hostname') or 'unknown'

# Cluster status
result['status'] = rj('ceph -s --format json 2>/dev/null')

# OSD stat
result['osd_stat'] = rj('ceph osd stat --format json 2>/dev/null')

# OSD tree
result['osd_tree'] = rj('ceph osd tree --format json 2>/dev/null')

# OSD status (text for compatibility)
result['osd_status_text'] = r('ceph osd status 2>/dev/null') or r('ceph osd status --format plain 2>/dev/null')

# Cluster DF
result['df'] = rj('ceph df --format json 2>/dev/null')

# Pool stats
result['pool_stats'] = rj('ceph osd pool stats --format json 2>/dev/null')

# PG stats
result['pg_stat'] = rj('ceph pg stat --format json 2>/dev/null')

# Monitor stat
result['mon_stat'] = rj('ceph mon stat --format json 2>/dev/null')

# Health detail
result['health_detail'] = rj('ceph health detail --format json 2>/dev/null')

# RADOS df (text)
result['rados_df_text'] = r('rados df 2>/dev/null')

# OSD dump (get replication/EC info)
result['osd_dump'] = rj('ceph osd dump --format json 2>/dev/null')

# Pool list
pools_raw = rj('ceph osd pool ls --format json 2>/dev/null')
if isinstance(pools_raw, list):
    pools = pools_raw
elif isinstance(pools_raw, dict) and '_raw' in pools_raw:
    try:
        pools = json.loads(pools_raw['_raw'])
    except Exception:
        pools = []
else:
    pools = []
result['pools'] = pools

# Per-pool RBD data
rbd_data = {}
for pool in pools[:12]:
    pool_str = str(pool)
    entry = {}

    # List RBD images
    images_raw = r(f'rbd ls -p {pool_str} --format json 2>/dev/null')
    images = []
    try:
        images = json.loads(images_raw) if images_raw else []
    except Exception:
        pass
    entry['images'] = images

    # Mirror pool status
    mirror = rj(f'rbd mirror pool status {pool_str} --format json 2>/dev/null')
    entry['mirror_status'] = mirror

    # Mirror pool status verbose (for libvirt-pool specifically)
    mirror_verbose = rj(f'rbd mirror pool status {pool_str} --verbose --format json 2>/dev/null')
    entry['mirror_status_verbose'] = mirror_verbose

    # Mirror pool info
    mirror_info = rj(f'rbd mirror pool info {pool_str} --format json 2>/dev/null')
    entry['mirror_info'] = mirror_info

    # Image details (first 8 images)
    image_details = []
    for img in images[:8]:
        info = rj(f'rbd info {pool_str}/{img} --format json 2>/dev/null')
        du = rj(f'rbd du {pool_str}/{img} --format json 2>/dev/null')
        if info:
            image_details.append({'name': img, 'info': info, 'du': du})
    entry['image_details'] = image_details

    rbd_data[pool_str] = entry

result['rbd'] = rbd_data

# Versions
result['versions'] = rj('ceph versions --format json 2>/dev/null')

# Ceph features
result['features'] = rj('ceph features --format json 2>/dev/null')

print(json.dumps(result))
sys.stdout.flush()
`;

export interface StorageCollectorOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  timeoutMs?: number;
}

export function collectStorageData(opts: StorageCollectorOptions): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const deadline = opts.timeoutMs ?? 90_000;

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
            return reject(new Error(`No output from ceph script (exit ${code}): ${errOut.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Failed to parse ceph JSON: ${raw.slice(0, 200)}`));
          }
        });

        stream.write(CEPH_SCRIPT);
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
