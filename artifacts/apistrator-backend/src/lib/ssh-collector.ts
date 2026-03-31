import { Client } from 'ssh2';
import { logger } from './logger';

// Python collector script embedded at build time — piped via SSH stdin to python3
const COLLECTOR_SCRIPT = `#!/usr/bin/env python3
"""
Security & Infrastructure JSON Collector
Runs on remote RHEL/Linux servers via SSH.
Outputs a single JSON object to stdout — no ANSI, no banners.
"""
import subprocess, json, datetime, os, sys

def run(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ""

def run_lines(cmd, timeout=10):
    return [l for l in run(cmd, timeout).splitlines() if l.strip()]

def safe_int(s, default=0):
    try:
        return int(str(s).strip())
    except Exception:
        return default

# --- SECTION 1: User Activity -------------------------------------------------
def collect_user_activity():
    last_lines = run_lines("last -n 20 --time-format iso 2>/dev/null | grep -v '^$' | grep -v 'wtmp'") or \\
                 run_lines("last -n 20 2>/dev/null | grep -v '^$' | grep -v 'wtmp'")
    recent_logins = []
    for line in last_lines[:15]:
        parts = line.split()
        if len(parts) >= 3:
            recent_logins.append({
                "user":     parts[0],
                "tty":      parts[1] if len(parts) > 1 else "-",
                "from_ip":  parts[2] if len(parts) > 2 else "-",
                "login_time": " ".join(parts[3:7]) if len(parts) > 3 else "-",
                "duration": parts[-1] if parts[-1].startswith("(") else "-",
            })

    active_sessions = []
    for line in run_lines("who -u 2>/dev/null"):
        parts = line.split()
        active_sessions.append({
            "user":       parts[0] if len(parts) > 0 else "-",
            "tty":        parts[1] if len(parts) > 1 else "-",
            "login_time": " ".join(parts[2:4]) if len(parts) > 3 else "-",
            "idle":       parts[4] if len(parts) > 4 else "-",
            "pid":        parts[5] if len(parts) > 5 else "-",
            "from":       parts[6] if len(parts) > 6 else "local",
        })

    sudo_ok  = safe_int(run("grep 'sudo.*COMMAND' /var/log/secure 2>/dev/null | grep -v 'incorrect password' | wc -l"))
    sudo_bad = safe_int(run("grep -E 'sudo.*incorrect password|sudo.*authentication failure' /var/log/secure 2>/dev/null | wc -l"))

    sudo_events = []
    for line in run_lines("grep 'sudo' /var/log/secure 2>/dev/null | tail -10") or \\
                 run_lines("journalctl -u sudo --since '24 hours ago' --no-pager 2>/dev/null | tail -10"):
        sudo_events.append(line[-200:])

    account_changes = []
    for line in run_lines(
        "grep -E 'useradd|userdel|usermod|passwd|chage|groupadd|groupdel' "
        "/var/log/secure /var/log/messages 2>/dev/null | tail -15"
    ) or run_lines(
        "journalctl --since '7 days ago' --no-pager 2>/dev/null | "
        "grep -E 'useradd|userdel|usermod|chage' | tail -10"
    ):
        account_changes.append(line[-200:])

    return {
        "recent_logins":    recent_logins,
        "active_sessions":  active_sessions,
        "active_count":     len(active_sessions),
        "sudo_success":     sudo_ok,
        "sudo_failed":      sudo_bad,
        "sudo_events":      sudo_events[-5:],
        "account_changes":  account_changes[-8:],
    }

# --- SECTION 2: Auth & Authorization Events -----------------------------------
def collect_auth_events():
    ssh_ok   = safe_int(run("grep 'Accepted' /var/log/secure 2>/dev/null | wc -l"))
    ssh_fail = safe_int(run("grep -E 'Failed|Invalid|preauth' /var/log/secure 2>/dev/null | wc -l"))
    ssh_root = safe_int(run("grep 'root' /var/log/secure 2>/dev/null | grep -E 'Accepted|Failed' | wc -l"))
    locked   = safe_int(run("grep -E 'account.*locked|pam_tally|pam_faillock.*locked' /var/log/secure 2>/dev/null | wc -l"))
    brute    = run("grep 'Failed password' /var/log/secure 2>/dev/null | awk '{print $11}' | sort | uniq -c | sort -rn | head -1")

    failed_logins = []
    for line in run_lines(
        "grep -E 'Failed password|Invalid user|authentication failure' "
        "/var/log/secure 2>/dev/null | tail -15"
    ) or run_lines(
        "journalctl --since '24 hours ago' --no-pager 2>/dev/null | "
        "grep -iE 'failed|invalid user|auth failure' | tail -15"
    ):
        parts = line.split()
        failed_logins.append({
            "timestamp": " ".join(parts[:3]) if len(parts) >= 3 else "-",
            "event":     "Failed password" if "Failed" in line else "Invalid user" if "Invalid" in line else "Auth failure",
            "detail":    line[-150:],
        })

    top_ips = []
    for line in run_lines(
        "grep 'Failed password' /var/log/secure 2>/dev/null | "
        "awk '{for(i=1;i<=NF;i++) if($i==\\\"from\\\") print $(i+1)}' | "
        "sort | uniq -c | sort -rn | head -10"
    ):
        parts = line.split()
        count = safe_int(parts[0])
        ip    = parts[1] if len(parts) > 1 else "-"
        sev   = "CRITICAL" if count > 100 else "HIGH" if count > 20 else "MEDIUM" if count > 5 else "LOW"
        top_ips.append({"count": count, "ip": ip, "severity": sev})

    pam_events = []
    for line in run_lines(
        "journalctl -u sshd -u su -u sudo --since '24 hours ago' "
        "--no-pager --output=short 2>/dev/null | tail -10"
    ):
        pam_events.append(line[-200:])

    return {
        "ssh_success":       ssh_ok,
        "ssh_failed":        ssh_fail,
        "ssh_root":          ssh_root,
        "account_lockouts":  locked,
        "top_brute_force":   brute[:80] if brute else None,
        "failed_logins":     failed_logins[-15:],
        "top_attacking_ips": top_ips,
        "pam_events":        pam_events[-10:],
    }

# --- SECTION 3: Infra & Config Changes ----------------------------------------
def collect_infra_changes():
    rpm_lines = run_lines("rpm -qa --last 2>/dev/null | head -20")
    recent_packages = []
    for line in rpm_lines:
        parts = line.rsplit(None, 5)
        recent_packages.append({
            "package": parts[0] if len(parts) > 1 else line,
            "date":    " ".join(parts[1:]) if len(parts) > 1 else "-",
        })

    dnf_history = run_lines("dnf history list 2>/dev/null | head -15")

    systemd_changes = []
    for line in run_lines(
        "journalctl --since '24 hours ago' --no-pager 2>/dev/null | "
        "grep -E 'systemd.*Started|systemd.*Stopped|systemd.*Failed|systemd.*Changed' | "
        "grep -v 'session-' | tail -20"
    ):
        parts = line.split()
        systemd_changes.append({
            "timestamp": " ".join(parts[:3]) if len(parts) >= 3 else "-",
            "event":     " ".join(parts[3:])[-200:],
            "severity":  "error" if "Failed" in line else "warn" if "Stopped" in line else "ok",
        })

    config_changes = []
    for f in run_lines(
        "find /etc -type f \\( -name '*.conf' -o -name 'sshd_config' -o -name 'sudoers' "
        "-o -name 'hosts' -o -name 'passwd' -o -name 'shadow' -o -name 'group' \\) "
        "-newer /etc/motd -mtime -7 2>/dev/null | head -20"
    ):
        mtime = run(f"stat -c '%y' '{f}' 2>/dev/null | cut -d'.' -f1")
        risk  = "critical" if any(x in f for x in ["shadow", "passwd", "sudoers", "sshd"]) else "warn"
        config_changes.append({"path": f, "modified": mtime, "risk": risk})

    cron_activity = run_lines(
        "grep -E 'CRON|crond|anacron' /var/log/cron /var/log/messages 2>/dev/null | tail -10"
    ) or run_lines(
        "journalctl -u crond --since '24 hours ago' --no-pager 2>/dev/null | tail -10"
    )

    return {
        "recent_packages": recent_packages[:20],
        "dnf_history":     dnf_history[:15],
        "systemd_changes": systemd_changes[-12:],
        "config_changes":  config_changes[:20],
        "cron_activity":   [l[-200:] for l in cron_activity[-8:]],
        "kernel_version":  run("uname -r"),
        "os_release":      run("grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'=' -f2 | tr -d '\\\"'"),
        "last_boot":       run("who -b 2>/dev/null | awk '{print $3, $4}'"),
        "uptime":          run("uptime -p 2>/dev/null"),
    }

# --- SECTION 4: Security Events -----------------------------------------------
def collect_security_events():
    selinux_mode    = run("getenforce 2>/dev/null || sestatus 2>/dev/null | head -1")
    selinux_denials = safe_int(run("grep 'avc:.*denied' /var/log/audit/audit.log 2>/dev/null | wc -l"))
    recent_denials  = [l[-200:] for l in run_lines(
        "grep 'avc:.*denied' /var/log/audit/audit.log 2>/dev/null | tail -5"
    )]

    fw_status = run("systemctl is-active firewalld 2>/dev/null || systemctl is-active iptables 2>/dev/null")
    fw_zones  = run("firewall-cmd --list-all-zones 2>/dev/null | grep -E 'active|interfaces' | head -5")
    blocked   = safe_int(run("grep -E 'REJECT|DROP' /var/log/messages /var/log/kern.log 2>/dev/null | wc -l"))

    auditd_status = run("systemctl is-active auditd 2>/dev/null")
    audit_cats = {
        "file_permission_changes":  safe_int(run("grep -c 'type=SYSCALL.*chmod\\|chown\\|setattr' /var/log/audit/audit.log 2>/dev/null")),
        "root_command_executions":  safe_int(run("grep -c 'uid=0.*type=SYSCALL.*execve' /var/log/audit/audit.log 2>/dev/null")),
        "network_socket_creations": safe_int(run("grep -c 'type=SYSCALL.*bind\\|connect\\|socket' /var/log/audit/audit.log 2>/dev/null")),
        "login_auth_events":        safe_int(run("grep -c 'type=USER_AUTH\\|type=USER_LOGIN\\|type=USER_START' /var/log/audit/audit.log 2>/dev/null")),
        "account_management":       safe_int(run("grep -c 'type=ADD_USER\\|type=DEL_USER\\|type=ADD_GROUP\\|type=CHUSER_ID' /var/log/audit/audit.log 2>/dev/null")),
        "privilege_escalations":    safe_int(run("grep -c 'type=USER_CMD' /var/log/audit/audit.log 2>/dev/null")),
        "fs_mount_events":          safe_int(run("grep -c 'type=SYSCALL.*mount\\|umount' /var/log/audit/audit.log 2>/dev/null")),
    }

    recent_audit = [l[-200:] for l in run_lines(
        "ausearch -ts today -m USER_CMD,USER_AUTH,ADD_USER,DEL_USER,USER_CHAUTHTOK "
        "--interpret 2>/dev/null | grep 'type=' | tail -10"
    ) or run_lines(
        "grep -E 'type=USER_CMD|type=ADD_USER|type=DEL_USER|type=USER_LOGIN' "
        "/var/log/audit/audit.log 2>/dev/null | tail -10"
    )]

    ports_raw = run_lines("ss -tlnp 2>/dev/null | grep LISTEN") or \\
                run_lines("netstat -tlnp 2>/dev/null | grep LISTEN")
    known_safe = {22, 80, 443, 8080, 8443, 9200, 5601, 6443, 2379, 2380, 10250}
    listening_ports = []
    for line in ports_raw:
        parts = line.split()
        addr  = parts[3] if len(parts) > 3 else "-"
        proc  = parts[-1] if parts else "-"
        try:
            port_n = int(addr.split(":")[-1])
        except Exception:
            port_n = 0
        listening_ports.append({
            "address": addr,
            "process": proc,
            "risk":    "LOW" if port_n in known_safe else "REVIEW",
        })

    failed_svcs = []
    for line in run_lines("systemctl list-units --state=failed --no-legend 2>/dev/null | head -15"):
        parts = line.split()
        failed_svcs.append({
            "unit":  parts[0] if parts else "-",
            "state": parts[2] if len(parts) > 2 else "failed",
        })

    binary_integrity = {}
    for pkg in ["openssh", "sudo", "bash", "passwd", "login", "coreutils"]:
        result = run(f"rpm -V {pkg} 2>/dev/null")
        binary_integrity[pkg] = {"ok": not bool(result.strip()), "details": result.splitlines()[:5]}

    return {
        "selinux_mode":          selinux_mode or "unknown",
        "selinux_denials":       selinux_denials,
        "selinux_recent":        recent_denials,
        "firewall_status":       fw_status or "unknown",
        "firewall_zones":        fw_zones[:200] if fw_zones else None,
        "blocked_connections":   blocked,
        "auditd_status":         auditd_status or "unknown",
        "audit_counts":          audit_cats,
        "recent_audit_events":   recent_audit[-10:],
        "listening_ports":       listening_ports,
        "failed_services":       failed_svcs,
        "binary_integrity":      binary_integrity,
    }

# --- MAIN ---------------------------------------------------------------------
def main():
    user_activity   = collect_user_activity()
    auth_events     = collect_auth_events()
    infra_changes   = collect_infra_changes()
    security_events = collect_security_events()

    result = {
        "collected_at":    datetime.datetime.now().isoformat(),
        "hostname":        run("hostname -f 2>/dev/null || hostname"),
        "user_activity":   user_activity,
        "auth_events":     auth_events,
        "infra_changes":   infra_changes,
        "security_events": security_events,
        "summary": {
            "active_sessions":   user_activity["active_count"],
            "sudo_failed":       user_activity["sudo_failed"],
            "ssh_failed":        auth_events["ssh_failed"],
            "ssh_success":       auth_events["ssh_success"],
            "account_lockouts":  auth_events["account_lockouts"],
            "selinux_mode":      security_events["selinux_mode"],
            "selinux_denials":   security_events["selinux_denials"],
            "firewall_active":   security_events["firewall_status"] == "active",
            "auditd_active":     security_events["auditd_status"] == "active",
            "failed_services":   len(security_events["failed_services"]),
        },
    }
    print(json.dumps(result, default=str))

if __name__ == "__main__":
    main()
`;

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

        stream.stdin.write(COLLECTOR_SCRIPT);
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
