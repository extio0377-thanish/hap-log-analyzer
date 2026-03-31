import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { apiGet, apiPost, apiPut, API_BASE } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  ShieldAlert, RefreshCw, Settings2, Server, Wifi, WifiOff,
  Users, Lock, AlertTriangle, CheckCircle2, XCircle, Clock,
  Activity, Terminal, Package, FileText, Eye, Plus, Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SecurityServer {
  id: number; ip: string; port: number; enabled: number;
  last_scan_at: string | null; last_scan_status: string; last_error: string | null;
}
interface Login { user: string; tty: string; from_ip: string; login_time: string; duration: string; }
interface Session { user: string; tty: string; login_time: string; idle: string; pid: string; from: string; }
interface FailedLogin { timestamp: string; event: string; detail: string; }
interface TopIp { count: number; ip: string; severity: string; }
interface SysChange { timestamp: string; event: string; severity: string; }
interface ConfigChange { path: string; modified: string; risk: string; }
interface Package { package: string; date: string; }
interface Port { address: string; process: string; risk: string; }
interface FailedSvc { unit: string; state: string; }
interface BinaryIntegrity { ok: boolean; details: string[]; }
interface ScanData {
  collected_at: string; hostname: string | null;
  raw_data: {
    user_activity: {
      active_count: number; sudo_success: number; sudo_failed: number;
      recent_logins: Login[]; active_sessions: Session[];
      sudo_events: string[]; account_changes: string[];
    };
    auth_events: {
      ssh_success: number; ssh_failed: number; ssh_root: number;
      account_lockouts: number; top_brute_force: string | null;
      failed_logins: FailedLogin[]; top_attacking_ips: TopIp[]; pam_events: string[];
    };
    infra_changes: {
      recent_packages: Package[]; dnf_history: string[];
      systemd_changes: SysChange[]; config_changes: ConfigChange[];
      cron_activity: string[]; kernel_version: string; os_release: string;
      last_boot: string; uptime: string;
    };
    security_events: {
      selinux_mode: string; selinux_denials: number; selinux_recent: string[];
      firewall_status: string; blocked_connections: number;
      auditd_status: string; audit_counts: Record<string, number>;
      recent_audit_events: string[]; listening_ports: Port[];
      failed_services: FailedSvc[]; binary_integrity: Record<string, BinaryIntegrity>;
    };
    summary: {
      active_sessions: number; sudo_failed: number; ssh_failed: number;
      ssh_success: number; account_lockouts: number; selinux_mode: string;
      selinux_denials: number; firewall_active: boolean; auditd_active: boolean;
      failed_services: number;
    };
  };
}
interface HistoryRow {
  collected_at: string; active_sessions: number; ssh_success: number;
  ssh_failed: number; selinux_denials: number; sudo_failed: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getToken = () => { try { return localStorage.getItem('msb-token'); } catch { return null; } };

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return active
    ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={12} />{label ?? 'Active'}</span>
    : <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={12} />{label ?? 'Inactive'}</span>;
}

function SeverityBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-900/60 text-red-300', HIGH: 'bg-orange-900/60 text-orange-300',
    MEDIUM: 'bg-yellow-900/60 text-yellow-300', LOW: 'bg-green-900/60 text-green-300',
    error: 'bg-red-900/60 text-red-300', warn: 'bg-yellow-900/60 text-yellow-300',
    ok: 'bg-green-900/60 text-green-300', critical: 'bg-red-900/60 text-red-300',
    REVIEW: 'bg-yellow-900/60 text-yellow-300',
  };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[sev] ?? 'bg-muted text-muted-foreground'}`}>{sev}</span>;
}

const AUDIT_LABELS: Record<string, string> = {
  file_permission_changes: 'File Permission Changes',
  root_command_executions: 'Root Command Executions',
  network_socket_creations: 'Network Socket Creations',
  login_auth_events: 'Login/Auth Events',
  account_management: 'Account Management',
  privilege_escalations: 'Privilege Escalations',
  fs_mount_events: 'Filesystem Mounts',
};

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

// ─── SSH Config Modal ─────────────────────────────────────────────────────────
function SshConfigModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ssh_user: 'root', ssh_port: '7779', ssh_auth_type: 'password', ssh_pass: '', ssh_key: '' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    apiGet<Record<string, unknown>>('/security/ssh-config').then(cfg => {
      setForm(f => ({
        ...f,
        ssh_user: String(cfg.ssh_user ?? 'root'),
        ssh_port: String(cfg.ssh_port ?? '7779'),
        ssh_auth_type: String(cfg.ssh_auth_type ?? 'password'),
      }));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiPut('/security/ssh-config', form);
      toast({ title: 'SSH config saved' });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Settings2 size={18} />SSH Credentials</h2>
        <p className="text-xs text-muted-foreground mb-4">Used to connect to all monitored servers. Credentials are stored in the backend database.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Username</label>
            <input className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm" value={form.ssh_user}
              onChange={e => setForm(f => ({ ...f, ssh_user: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SSH Port</label>
            <input type="number" className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm" value={form.ssh_port}
              onChange={e => setForm(f => ({ ...f, ssh_port: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Auth Type</label>
            <select className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm" value={form.ssh_auth_type}
              onChange={e => setForm(f => ({ ...f, ssh_auth_type: e.target.value }))}>
              <option value="password">Password</option>
              <option value="key">SSH Private Key</option>
            </select>
          </div>
          {form.ssh_auth_type === 'password' ? (
            <div>
              <label className="text-xs text-muted-foreground">Password (leave blank to keep existing)</label>
              <input type="password" className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm"
                value={form.ssh_pass} onChange={e => setForm(f => ({ ...f, ssh_pass: e.target.value }))} />
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">Private Key (PEM format)</label>
              <textarea rows={5} className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-xs font-mono"
                value={form.ssh_key} onChange={e => setForm(f => ({ ...f, ssh_key: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm border border-border hover:bg-accent">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Server Modal ─────────────────────────────────────────────────────────
function AddServerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ ip: '', port: '22' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!form.ip.trim()) return toast({ title: 'IP address is required', variant: 'destructive' });
    setSaving(true);
    try {
      await apiPost('/security/servers', { ip: form.ip.trim(), port: Number(form.port) || 22 });
      toast({ title: `Host ${form.ip} added` });
      onAdded();
      onClose();
    } catch (e: unknown) {
      toast({ title: 'Failed to add host', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Plus size={18} />Add Host</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">IP Address or Hostname</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm font-mono"
              placeholder="10.0.1.40"
              value={form.ip}
              onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && save()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SSH Port</label>
            <input
              type="number"
              className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm"
              value={form.port}
              onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm border border-border hover:bg-accent">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? 'Adding…' : 'Add Host'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string | number; ok?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${ok === false ? 'bg-red-900/30 text-red-400' : ok === true ? 'bg-green-900/30 text-green-400' : 'bg-primary/10 text-primary'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${ok === false ? 'text-red-400' : ok === true ? 'text-green-400' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const TABS = ['Overview', 'User Activity', 'Auth Events', 'Infra Changes', 'Security Events'];

export default function SecurityDashboard() {
  const [servers, setServers] = useState<SecurityServer[]>([]);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSshModal, setShowSshModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadServers = useCallback(async () => {
    try {
      const list = await apiGet<SecurityServer[]>('/security/servers');
      setServers(list);
      if (!selectedIp && list.length > 0) setSelectedIp(list[0].ip);
    } catch {}
  }, [selectedIp]);

  const loadScan = useCallback(async (ip: string) => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        apiGet<ScanData>(`/security/scan/${ip}`),
        apiGet<HistoryRow[]>(`/security/history/${ip}?limit=30`),
      ]);
      setScan(s);
      setHistory(h.reverse());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('No scan data')) {
        toast({ title: 'Could not load scan', description: msg, variant: 'destructive' });
      }
      setScan(null);
    } finally { setLoading(false); }
  }, [toast]);

  const removeServer = async (ip: string) => {
    if (!confirm(`Remove ${ip} from monitoring?`)) return;
    try {
      await apiDelete(`/security/servers/${encodeURIComponent(ip)}`);
      toast({ title: `${ip} removed` });
      if (selectedIp === ip) setSelectedIp(null);
      setScan(null);
      loadServers();
    } catch (e: unknown) {
      toast({ title: 'Remove failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const triggerScan = async (ip: string) => {
    try {
      await apiPost(`/security/scan/${ip}/trigger`, {});
      toast({ title: `Scan triggered for ${ip}` });
      setTimeout(() => loadScan(ip), 5000);
    } catch (e: unknown) {
      toast({ title: 'Trigger failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  useEffect(() => { loadServers(); }, [loadServers]);

  useEffect(() => {
    if (selectedIp) loadScan(selectedIp);
  }, [selectedIp, loadScan]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefresh || !selectedIp) return;
    intervalRef.current = setInterval(() => {
      loadServers();
      loadScan(selectedIp);
    }, 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, selectedIp, loadServers, loadScan]);

  // SSE for live updates
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const url = `${API_BASE}/security/stream`;
    const es = new EventSource(`${url}?token=${token}`);
    es.addEventListener('scan', (e) => {
      const d = JSON.parse(e.data) as { serverIp: string };
      if (d.serverIp === selectedIp) loadScan(d.serverIp);
      loadServers();
    });
    return () => es.close();
  }, [selectedIp, loadServers, loadScan]);

  const srv = scan?.raw_data;
  const summary = srv?.summary;
  const historyChartData = history.map(h => ({
    time: h.collected_at?.slice(11, 16) ?? '',
    'SSH OK': h.ssh_success,
    'SSH Fail': h.ssh_failed,
    'SELinux Denials': h.selinux_denials,
    'Active Sessions': h.active_sessions,
  }));
  const auditChartData = srv?.security_events.audit_counts
    ? Object.entries(srv.security_events.audit_counts).map(([k, v]) => ({
        name: AUDIT_LABELS[k]?.replace(' ', '\n') ?? k, value: v,
      }))
    : [];

  return (
    <Layout>
      {showSshModal && <SshConfigModal onClose={() => setShowSshModal(false)} onSaved={loadServers} />}
      {showAddModal && <AddServerModal onClose={() => setShowAddModal(false)} onAdded={loadServers} />}

      <div className="max-w-screen-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-primary" size={24} />
            <h1 className="text-xl font-bold">Security Events Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button onClick={() => setShowSshModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent">
              <Settings2 size={14} /> SSH Config
            </button>
            <button onClick={() => setAutoRefresh(a => !a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border ${autoRefresh ? 'border-primary text-primary bg-primary/10' : 'border-border hover:bg-accent'}`}>
              <Clock size={14} /> {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
            <button onClick={() => selectedIp && loadScan(selectedIp)} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Server Selector */}
        <div className="flex flex-wrap gap-2 items-center">
          {servers.map(s => {
            const statusColor = s.last_scan_status === 'ok' ? 'border-green-500/50'
              : s.last_scan_status === 'error' ? 'border-red-500/50'
              : s.last_scan_status === 'scanning' ? 'border-yellow-500/50'
              : 'border-border';
            const dotColor = s.last_scan_status === 'ok' ? 'bg-green-500'
              : s.last_scan_status === 'error' ? 'bg-red-500'
              : s.last_scan_status === 'scanning' ? 'bg-yellow-500 animate-pulse'
              : 'bg-gray-500';
            const isSelected = selectedIp === s.ip;
            return (
              <div key={s.ip}
                className={`flex items-center rounded-lg border text-sm font-medium transition-all overflow-hidden
                  ${isSelected ? 'bg-primary/10 border-primary' : `bg-card ${statusColor}`}`}>
                <button onClick={() => setSelectedIp(s.ip)}
                  className="flex items-center gap-2 px-3 py-2">
                  <Server size={13} />
                  <span className="font-mono">{s.ip}</span>
                  <span className="text-xs text-muted-foreground">:{s.port}</span>
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); removeServer(s.ip); }}
                  title="Remove host"
                  className="px-2 py-2 hover:bg-red-950/40 hover:text-red-400 text-muted-foreground/50 transition-colors border-l border-border">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}

          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm hover:bg-accent text-muted-foreground">
            <Plus size={14} /> Add Host
          </button>

          {selectedIp && (
            <button onClick={() => triggerScan(selectedIp)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent text-muted-foreground">
              <Activity size={14} /> Run Now
            </button>
          )}
        </div>

        {/* No scan data yet */}
        {!scan && !loading && selectedIp && (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <ShieldAlert size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-1">No scan data yet for <strong>{selectedIp}</strong></p>
            {servers.find(s => s.ip === selectedIp)?.last_scan_status === 'unconfigured' && (
              <p className="text-sm text-yellow-400 mb-3">SSH credentials not configured. Click <strong>SSH Config</strong> to set up.</p>
            )}
            {servers.find(s => s.ip === selectedIp)?.last_error && (
              <p className="text-xs text-red-400 mt-2 max-w-lg mx-auto">{servers.find(s => s.ip === selectedIp)?.last_error}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">Scans run automatically every minute once SSH is configured.</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="animate-spin text-primary" size={28} />
          </div>
        )}

        {scan && summary && !loading && (
          <>
            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={12} />
              Last collected: {new Date(scan.collected_at).toLocaleString()} from {scan.hostname ?? selectedIp}
              {servers.find(s => s.ip === selectedIp)?.last_scan_status === 'error' && (
                <span className="ml-2 text-red-400">⚠ Last scan failed — showing cached data</span>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryCard icon={<Users size={18} />} label="Active Sessions" value={summary.active_sessions}
                ok={summary.active_sessions === 0 ? undefined : summary.active_sessions < 5} />
              <SummaryCard icon={<Lock size={18} />} label="SSH Failed (total)" value={summary.ssh_failed}
                ok={summary.ssh_failed === 0 ? true : summary.ssh_failed < 10 ? undefined : false} />
              <SummaryCard icon={<AlertTriangle size={18} />} label="SELinux Denials" value={summary.selinux_denials}
                ok={summary.selinux_denials === 0} />
              <SummaryCard icon={summary.firewall_active ? <Wifi size={18} /> : <WifiOff size={18} />}
                label="Firewall" value={summary.firewall_active ? 'Active' : 'INACTIVE'} ok={summary.firewall_active} />
              <SummaryCard icon={<Eye size={18} />} label="Auditd" value={summary.auditd_active ? 'Active' : 'INACTIVE'}
                ok={summary.auditd_active} />
              <SummaryCard icon={<XCircle size={18} />} label="Failed Services" value={summary.failed_services}
                ok={summary.failed_services === 0} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {TABS.map((t, i) => (
                <button key={t} onClick={() => setTab(i)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                    ${tab === i ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Overview Tab ────────────────────────────────────────── */}
            {tab === 0 && (
              <div className="space-y-5">
                {historyChartData.length > 1 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={15} />SSH Auth Trend (last 30 scans)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={historyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }} />
                        <Legend />
                        <Line type="monotone" dataKey="SSH OK" stroke="#22c55e" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="SSH Fail" stroke="#ef4444" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="Active Sessions" stroke="#3b82f6" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {auditChartData.some(d => d.value > 0) && (
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldAlert size={15} />Audit Event Distribution</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={auditChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }} />
                          <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Server size={15} />System Info</h3>
                    <dl className="space-y-2">
                      {[
                        ['OS', srv?.infra_changes.os_release],
                        ['Kernel', srv?.infra_changes.kernel_version],
                        ['Last Boot', srv?.infra_changes.last_boot],
                        ['Uptime', srv?.infra_changes.uptime],
                        ['SELinux', srv?.security_events.selinux_mode],
                        ['Firewall', srv?.security_events.firewall_status],
                        ['Auditd', srv?.security_events.auditd_status],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-sm">
                          <dt className="text-muted-foreground w-24 shrink-0">{k}</dt>
                          <dd className="font-medium truncate">{v ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            )}

            {/* ── User Activity Tab ───────────────────────────────────── */}
            {tab === 1 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Active Sessions', value: summary.active_sessions },
                    { label: 'Sudo OK', value: srv.user_activity.sudo_success },
                    { label: 'Sudo Failed', value: summary.sudo_failed },
                    { label: 'Account Changes', value: srv.user_activity.account_changes.length },
                  ].map(s => (
                    <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users size={15} />Active Sessions</h3>
                  {srv.user_activity.active_sessions.length > 0 ? (
                    <DataTable headers={['User', 'TTY', 'Login Time', 'Idle', 'PID', 'From']}
                      rows={srv.user_activity.active_sessions.map(s => [s.user, s.tty, s.login_time, s.idle, s.pid, s.from])}
                      highlights={(r) => r[0] === 'root' ? 'text-red-400' : ''} />
                  ) : <p className="text-sm text-muted-foreground">No active sessions</p>}
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Terminal size={15} />Recent Logins (last 20)</h3>
                  <DataTable headers={['User', 'TTY', 'From IP', 'Login Time', 'Duration']}
                    rows={srv.user_activity.recent_logins.map(l => [l.user, l.tty, l.from_ip, l.login_time, l.duration])}
                    highlights={(r) => r[0] === 'root' ? 'text-red-400' : ''} />
                </div>

                {srv.user_activity.account_changes.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3">Account Changes (recent)</h3>
                    <div className="space-y-1">
                      {srv.user_activity.account_changes.map((line, i) => (
                        <p key={i} className={`text-xs font-mono p-1.5 rounded ${line.toLowerCase().includes('del') ? 'text-red-400 bg-red-950/20' : 'text-muted-foreground'}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Auth Events Tab ─────────────────────────────────────── */}
            {tab === 2 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'SSH Success', value: srv.auth_events.ssh_success, ok: true },
                    { label: 'SSH Failed', value: srv.auth_events.ssh_failed, ok: srv.auth_events.ssh_failed === 0 },
                    { label: 'Root Login Events', value: srv.auth_events.ssh_root, ok: srv.auth_events.ssh_root === 0 },
                    { label: 'Account Lockouts', value: srv.auth_events.account_lockouts, ok: srv.auth_events.account_lockouts === 0 },
                  ].map(s => (
                    <div key={s.label} className={`bg-card border rounded-xl p-4 text-center ${s.ok === false ? 'border-red-500/50' : 'border-border'}`}>
                      <p className={`text-2xl font-bold ${s.ok === false ? 'text-red-400' : s.ok === true ? 'text-green-400' : ''}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {srv.auth_events.top_brute_force && (
                  <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
                    ⚠ Top brute-force source: <strong>{srv.auth_events.top_brute_force}</strong>
                  </div>
                )}

                {srv.auth_events.top_attacking_ips.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={15} />Top Attacking IPs</h3>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <DataTable
                        headers={['Count', 'IP Address', 'Severity']}
                        rows={srv.auth_events.top_attacking_ips.map(ip => [String(ip.count), ip.ip, ip.severity])}
                        renderCell={(val, col) => col === 2 ? <SeverityBadge sev={val} /> : <span>{val}</span>}
                      />
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={srv.auth_events.top_attacking_ips.slice(0, 8)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="ip" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }} />
                          <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Recent Failed Auth Attempts</h3>
                  {srv.auth_events.failed_logins.length > 0 ? (
                    <DataTable headers={['Timestamp', 'Event', 'Detail']}
                      rows={srv.auth_events.failed_logins.slice(-15).map(f => [f.timestamp, f.event, f.detail])}
                      widths={['w-36', 'w-32', '']} />
                  ) : <p className="text-sm text-muted-foreground">No recent failed logins</p>}
                </div>
              </div>
            )}

            {/* ── Infra Changes Tab ───────────────────────────────────── */}
            {tab === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Package size={15} />Recent RPM Package Changes</h3>
                    {srv.infra_changes.recent_packages.length > 0 ? (
                      <DataTable headers={['Package', 'Date']}
                        rows={srv.infra_changes.recent_packages.map(p => [p.package, p.date])}
                        highlights={(r) => r[0].includes('kernel') || r[0].includes('openssl') ? 'text-yellow-400' : ''} />
                    ) : <p className="text-sm text-muted-foreground">No RPM data available</p>}
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText size={15} />Critical Config File Changes (7 days)</h3>
                    {srv.infra_changes.config_changes.length > 0 ? (
                      <DataTable headers={['File', 'Modified', 'Risk']}
                        rows={srv.infra_changes.config_changes.map(c => [c.path, c.modified, c.risk])}
                        renderCell={(val, col) => col === 2 ? <SeverityBadge sev={val} /> : <span className="font-mono text-xs">{val}</span>} />
                    ) : <p className="text-sm text-green-400 text-sm">No critical config changes detected</p>}
                  </div>
                </div>

                {srv.infra_changes.systemd_changes.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3">Systemd Service Changes (24h)</h3>
                    <DataTable headers={['Timestamp', 'Event', 'Status']}
                      rows={srv.infra_changes.systemd_changes.map(c => [c.timestamp, c.event, c.severity])}
                      renderCell={(val, col) => col === 2 ? <SeverityBadge sev={val} /> : <span>{val}</span>} />
                  </div>
                )}

                {srv.infra_changes.dnf_history.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3">DNF Transaction History</h3>
                    <div className="space-y-1">
                      {srv.infra_changes.dnf_history.map((line, i) => (
                        <p key={i} className="text-xs font-mono text-muted-foreground">{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Security Events Tab ─────────────────────────────────── */}
            {tab === 4 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`bg-card border rounded-xl p-4 text-center ${srv.security_events.selinux_mode === 'Enforcing' ? 'border-green-500/50' : 'border-red-500/50'}`}>
                    <p className={`text-lg font-bold ${srv.security_events.selinux_mode === 'Enforcing' ? 'text-green-400' : 'text-red-400'}`}>
                      {srv.security_events.selinux_mode}
                    </p>
                    <p className="text-xs text-muted-foreground">SELinux Mode</p>
                  </div>
                  <div className={`bg-card border rounded-xl p-4 text-center ${srv.security_events.selinux_denials === 0 ? 'border-border' : 'border-red-500/50'}`}>
                    <p className={`text-2xl font-bold ${srv.security_events.selinux_denials > 0 ? 'text-red-400' : ''}`}>{srv.security_events.selinux_denials}</p>
                    <p className="text-xs text-muted-foreground">SELinux Denials</p>
                  </div>
                  <div className={`bg-card border rounded-xl p-4 text-center ${srv.security_events.firewall_status === 'active' ? 'border-green-500/50' : 'border-red-500/50'}`}>
                    <p className={`text-lg font-bold ${srv.security_events.firewall_status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                      {srv.security_events.firewall_status}
                    </p>
                    <p className="text-xs text-muted-foreground">Firewall</p>
                  </div>
                  <div className={`bg-card border rounded-xl p-4 text-center ${srv.security_events.blocked_connections < 50 ? 'border-border' : 'border-red-500/50'}`}>
                    <p className={`text-2xl font-bold ${srv.security_events.blocked_connections > 50 ? 'text-red-400' : ''}`}>{srv.security_events.blocked_connections}</p>
                    <p className="text-xs text-muted-foreground">Blocked Connections</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldAlert size={15} />Audit Event Counts</h3>
                    <div className="space-y-2">
                      {Object.entries(srv.security_events.audit_counts).map(([k, v]) => {
                        const pct = Math.min(100, Math.round((v / (Math.max(...Object.values(srv.security_events.audit_counts)) || 1)) * 100));
                        const color = v > 100 ? 'bg-red-500' : v > 10 ? 'bg-yellow-500' : 'bg-green-500';
                        return (
                          <div key={k}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-muted-foreground">{AUDIT_LABELS[k] ?? k}</span>
                              <span className="font-medium">{v}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full"><div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3">Critical Binary Integrity (rpm -V)</h3>
                    <div className="space-y-2">
                      {Object.entries(srv.security_events.binary_integrity).map(([pkg, info]) => (
                        <div key={pkg} className="flex items-start gap-2 text-sm">
                          {info.ok
                            ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
                            : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
                          <div>
                            <span className={info.ok ? 'text-muted-foreground' : 'text-red-400 font-medium'}>{pkg}</span>
                            {!info.ok && info.details.map((d, i) => (
                              <p key={i} className="text-xs font-mono text-red-400/80">{d}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Listening Ports & Services</h3>
                  <DataTable headers={['Address:Port', 'Process / PID', 'Risk']}
                    rows={srv.security_events.listening_ports.map(p => [p.address, p.process, p.risk])}
                    renderCell={(val, col) => col === 2 ? <SeverityBadge sev={val} /> : <span className="font-mono text-xs">{val}</span>} />
                </div>

                {srv.security_events.failed_services.length > 0 && (
                  <div className="bg-card border border-red-500/30 rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 text-red-400 flex items-center gap-2"><XCircle size={15} />Failed Systemd Services</h3>
                    <DataTable headers={['Unit', 'State']}
                      rows={srv.security_events.failed_services.map(s => [s.unit, s.state])} />
                  </div>
                )}

                {srv.security_events.selinux_recent.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 text-red-400">Recent SELinux AVC Denials</h3>
                    <div className="space-y-1">
                      {srv.security_events.selinux_recent.map((line, i) => (
                        <p key={i} className="text-xs font-mono text-red-400/80 p-1.5 bg-red-950/20 rounded">{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ─── Reusable Data Table ──────────────────────────────────────────────────────
function DataTable({
  headers, rows, widths, highlights, renderCell,
}: {
  headers: string[];
  rows: string[][];
  widths?: string[];
  highlights?: (row: string[]) => string;
  renderCell?: (value: string, colIndex: number) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={i} className={`text-left py-1.5 px-2 text-muted-foreground font-medium ${widths?.[i] ?? ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-1.5 px-2 ${highlights?.(row) ?? ''} ${widths?.[ci] ?? ''}`}>
                  {renderCell ? renderCell(cell, ci) : cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={headers.length} className="py-4 text-center text-muted-foreground">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
