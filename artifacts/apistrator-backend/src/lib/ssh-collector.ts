import { Client } from 'ssh2';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';

const SCRIPT_PATH = path.join(__dirname, '../scripts/srv_collector_json.py');

function getScript(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}

export interface CollectOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  timeoutMs?: number;
}

export async function collectFromServer(opts: CollectOptions): Promise<Record<string, unknown>> {
  const { host, port = 7779, username, password, privateKey, timeoutMs = 60000 } = opts;
  const script = getScript();

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        reject(new Error(`SSH connection to ${host} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    function done(err?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      if (err) return reject(err);
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (e) {
        reject(new Error(`Failed to parse JSON from ${host}: ${stdout.slice(0, 200)}\nSTDERR: ${stderr.slice(0, 200)}`));
      }
    }

    conn.on('ready', () => {
      // Pipe script via stdin to python3 on the remote
      conn.exec('python3 -', { pty: false }, (err, stream) => {
        if (err) return done(err);

        stream.on('close', (code: number) => {
          if (code !== 0) {
            done(new Error(`Remote script exited with code ${code}. STDERR: ${stderr.slice(0, 300)}`));
          } else {
            done();
          }
        });

        stream.on('data', (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

        // Write script to stdin then close it
        stream.stdin.write(script);
        stream.stdin.end();
      });
    });

    conn.on('error', (err) => {
      done(err);
    });

    const connectOpts: Parameters<Client['connect']>[0] = {
      host,
      port,
      username,
      readyTimeout: timeoutMs,
      algorithms: {
        kex: ['ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
      },
    };

    if (privateKey) {
      connectOpts.privateKey = privateKey;
    } else if (password) {
      connectOpts.password = password;
    }

    conn.connect(connectOpts);
  });
}
