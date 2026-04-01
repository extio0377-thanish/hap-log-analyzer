import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { apiGet, apiPost, apiDelete, API_BASE } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts';
import {
  Server, Plus, Trash2, RefreshCw, Activity,
  Cpu, MemoryStick, HardDrive, Clock, AlertTriangle, Settings2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiskEntry { mount: string; used_pct: number; }

interface MetricsRow {
  ip: string;
  port: number;
  hostname: string;
  last_scan_status: string;
  last_scan_at: string | null;
  last_error: string | null;
  cpu_usage: number | null;
  mem_usage: number | null;
  disks: DiskEntry[];
}

interface HistoryPoint {
  id: number;
  collected_at: string;
  cpu_usage: number;
  mem_usage: number;
  disks: DiskEntry[];
}

const getToken = () => { try { return localStorage.getItem('msb-token'); } catch { return null; } };

// ─── Color helpers ────────────────────────────────────────────────────────────

function usageColor(pct: number | null): { bg: string; text: string } {
  if (pct === null) return { bg: 'bg-muted/30', text: 'text-muted-foreground' };
  if (pct < 30)  return { bg: 'bg-green-900/80',  text: 'text-green-200' };
  if (pct < 50)  return { bg: 'bg-green-800/80',  text: 'text-green-100' };
  if (pct < 75)  return { bg: 'bg-yellow-800/80', text: 'text-yellow-100' };
  if (pct < 85)  return { bg: 'bg-orange-800/80', text: 'text-orange-100' };
  return              { bg: 'bg-red-900/80',     text: 'text-red-200' };
}

function UsageCell({ pct, width = 'w-20' }: { pct: number | null; width?: string }) {
  const { bg, text } = usageColor(pct);
  return (
    <td className="px-1 py-0.5">
      <div className={`${bg} ${text} ${width} text-center text-xs font-medium rounded px-2 py-1 tabular-nums`}>
        {pct === null ? '—' : `${pct.toFixed(2)}%`}
      </div>
    </td>
  );
}

function statusDot(status: string) {
  if (status === 'ok')          return 'bg-green-500';
  if (status === 'scanning')    return 'bg-yellow-500 animate-pulse';
  if (status === 'error')       return 'bg-red-500';
  if (status === 'unconfigured') return 'bg-gray-400';
  return 'bg-gray-500';
}

// ─── Add Host Modal ───────────────────────────────────────────────────────────

function AddHostModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ ip: '', port: '22' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!form.ip.trim()) { toast({ title: 'IP address is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await apiPost('/metrics/servers', { ip: form.ip.trim(), port: Number(form.port) || 22 });
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
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Server size={18} />Add Metrics Host</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">IP Address</label>
            <input className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm font-mono"
              placeholder="10.0.1.10" value={form.ip}
              onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && save()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SSH Port</label>
            <input type="number" className="w-full mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm"
              value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">SSH credentials are shared with the Security Events config.</p>
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm border border-border hover:bg-accent">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? 'Adding…' : 'Add Host'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap Table ────────────────────────────────────────────────────────────

function HeatmapTable({ rows, allMounts, onRemove, onTrigger, canManage }: {
  rows: MetricsRow[];
  allMounts: string[];
  onRemove: (ip: string) => void;
  onTrigger: (ip: string) => void;
  canManage: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <Server size={40} className="mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No hosts added yet.</p>
        {canManage && <p className="text-sm text-muted-foreground mt-1">Click "Add Host" to get started.</p>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground sticky left-0 bg-muted/40 min-w-[160px]">Hostname</th>
              <th className="text-center px-1 py-2.5 font-medium text-muted-foreground min-w-[90px]">CPU Usage</th>
              <th className="text-center px-1 py-2.5 font-medium text-muted-foreground min-w-[90px]">Memory Usage</th>
              {allMounts.map(m => (
                <th key={m} className="text-center px-1 py-2.5 font-medium text-muted-foreground min-w-[70px]">{m}</th>
              ))}
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground min-w-[90px]">Last Scan</th>
              <th className="px-2 py-2.5 min-w-[70px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const diskMap = new Map(row.disks.map(d => [d.mount, d.used_pct]));
              const ago = row.last_scan_at
                ? Math.round((Date.now() - new Date(row.last_scan_at).getTime()) / 60000)
                : null;
              return (
                <tr key={row.ip} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-1.5 sticky left-0 bg-card font-mono font-medium">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(row.last_scan_status)}`} />
                      <div>
                        <div className="text-foreground">{row.hostname || row.ip}</div>
                        {row.hostname && row.hostname !== row.ip && (
                          <div className="text-muted-foreground text-[10px]">{row.ip}</div>
                        )}
                      </div>
                    </div>
                    {row.last_error && (
                      <div className="text-red-400 text-[10px] mt-0.5 max-w-[140px] truncate" title={row.last_error}>
                        ⚠ {row.last_error}
                      </div>
                    )}
                  </td>
                  <UsageCell pct={row.cpu_usage} />
                  <UsageCell pct={row.mem_usage} />
                  {allMounts.map(m => (
                    <UsageCell key={m} pct={diskMap.has(m) ? (diskMap.get(m) ?? null) : null} width="w-16" />
                  ))}
                  <td className="px-2 py-1.5 text-center text-muted-foreground text-[10px]">
                    {ago === null ? '—' : ago < 1 ? 'just now' : `${ago}m ago`}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onTrigger(row.ip)} title="Refresh now"
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <RefreshCw size={11} />
                      </button>
                      {canManage && (
                        <button onClick={() => onRemove(row.ip)} title="Remove host"
                          className="p-1 rounded hover:bg-red-950/40 hover:text-red-400 text-muted-foreground/50 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-border flex flex-wrap gap-3 items-center text-[10px] text-muted-foreground">
        <span className="font-medium">Usage legend:</span>
        {[
          { label: '< 30%', bg: 'bg-green-900/80' },
          { label: '30–50%', bg: 'bg-green-800/80' },
          { label: '50–75%', bg: 'bg-yellow-800/80' },
          { label: '75–85%', bg: 'bg-orange-800/80' },
          { label: '≥ 85%', bg: 'bg-red-900/80' },
        ].map(({ label, bg }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${bg} inline-block`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── CPU & Memory Chart ───────────────────────────────────────────────────────

function CpuMemChart({ rows }: { rows: MetricsRow[] }) {
  const data = rows
    .filter(r => r.cpu_usage !== null || r.mem_usage !== null)
    .map(r => ({
      name: (r.hostname || r.ip).slice(0, 15),
      full: r.hostname || r.ip,
      cpu: r.cpu_usage ?? 0,
      mem: r.mem_usage ?? 0,
    }));

  if (data.length === 0) return <p className="text-center text-muted-foreground py-12">No data yet.</p>;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Cpu size={15} className="text-primary" />CPU & Memory Usage Across All Hosts
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ left: 0, right: 20, top: 4, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === 'cpu' ? 'CPU' : 'Memory']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
          />
          <Legend formatter={v => v === 'cpu' ? 'CPU %' : 'Memory %'} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="cpu" fill="#6366f1" radius={[4, 4, 0, 0]} name="cpu" maxBarSize={40} />
          <Bar dataKey="mem" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="mem" maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Disk Usage Chart ─────────────────────────────────────────────────────────

function DiskChart({ rows, allMounts }: { rows: MetricsRow[]; allMounts: string[] }) {
  const [selectedMount, setSelectedMount] = useState<string>(allMounts[0] ?? '/');

  const data = rows
    .map(r => {
      const d = r.disks.find(x => x.mount === selectedMount);
      return { name: (r.hostname || r.ip).slice(0, 15), full: r.hostname || r.ip, pct: d?.used_pct ?? null };
    })
    .filter(r => r.pct !== null);

  const mounts = allMounts.length > 0 ? allMounts : ['/'];

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <HardDrive size={15} className="text-primary" />Disk Usage by Mount Point
        </h3>
        <select
          value={selectedMount}
          onChange={e => setSelectedMount(e.target.value)}
          className="px-3 py-1.5 rounded-md bg-muted border border-border text-xs">
          {mounts.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No data for {selectedMount}.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ left: 0, right: 20, top: 4, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${v}%`, `${selectedMount} usage`]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
            />
            <Bar dataKey="pct" fill="#22c55e" radius={[4, 4, 0, 0]} name="pct" maxBarSize={50}
              label={{ position: 'top', fontSize: 10, formatter: (v: number) => `${v}%` }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── History Chart ────────────────────────────────────────────────────────────

function HistoryChart({ rows }: { rows: MetricsRow[] }) {
  const [selectedIp, setSelectedIp] = useState<string>(rows[0]?.ip ?? '');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedIp) return;
    setLoading(true);
    apiGet<HistoryPoint[]>(`/metrics/history/${selectedIp}?limit=60`)
      .then(data => setHistory(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedIp]);

  const chartData = history.map(h => ({
    time: new Date(h.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: h.cpu_usage,
    mem: h.mem_usage,
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity size={15} className="text-primary" />CPU & Memory History
        </h3>
        <select value={selectedIp} onChange={e => setSelectedIp(e.target.value)}
          className="px-3 py-1.5 rounded-md bg-muted border border-border text-xs">
          {rows.map(r => (
            <option key={r.ip} value={r.ip}>{r.hostname || r.ip}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading…</p>
      ) : chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No history data yet for this host.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 0, right: 20, top: 4, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === 'cpu' ? 'CPU' : 'Memory']}
            />
            <Legend formatter={v => v === 'cpu' ? 'CPU %' : 'Memory %'} wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="cpu" stroke="#6366f1" strokeWidth={2} dot={false} name="cpu" />
            <Line type="monotone" dataKey="mem" stroke="#8b5cf6" strokeWidth={2} dot={false} name="mem" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Per-Server Disk History Chart ────────────────────────────────────────────

function DiskHistoryChart({ rows }: { rows: MetricsRow[] }) {
  const [selectedIp, setSelectedIp] = useState<string>(rows[0]?.ip ?? '');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedIp) return;
    setLoading(true);
    apiGet<HistoryPoint[]>(`/metrics/history/${selectedIp}?limit=60`)
      .then(data => setHistory(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedIp]);

  const mounts = [...new Set(history.flatMap(h => h.disks.map(d => d.mount)))].sort();
  const COLORS = ['#6366f1','#8b5cf6','#22c55e','#f59e0b','#ef4444','#3b82f6','#10b981','#f97316','#ec4899','#06b6d4'];

  const chartData = history.map(h => {
    const point: Record<string, unknown> = {
      time: new Date(h.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    for (const d of h.disks) point[d.mount] = d.used_pct;
    return point;
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <HardDrive size={15} className="text-primary" />Disk Usage History per Mount
        </h3>
        <select value={selectedIp} onChange={e => setSelectedIp(e.target.value)}
          className="px-3 py-1.5 rounded-md bg-muted border border-border text-xs">
          {rows.map(r => <option key={r.ip} value={r.ip}>{r.hostname || r.ip}</option>)}
        </select>
      </div>
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading…</p>
      ) : chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No history data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 0, right: 20, top: 4, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number, name: string) => [`${v}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {mounts.map((m, i) => (
              <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.5} dot={false} name={m} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const TABS = ['Heatmap', 'CPU & Memory', 'Disk Usage', 'History'];

export default function ServerMetricsDashboard() {
  const [rows, setRows] = useState<MetricsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canManage = hasPermission('manage_metrics');

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<MetricsRow[]>('/metrics/latest');
      setRows(data);
    } catch (e: unknown) {
      toast({ title: 'Failed to load metrics', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  const removeHost = async (ip: string) => {
    try {
      await apiDelete(`/metrics/servers/${ip}`);
      toast({ title: `Host ${ip} removed` });
      await loadLatest();
    } catch (e: unknown) {
      toast({ title: 'Remove failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const triggerScan = async (ip: string) => {
    try {
      await apiPost(`/metrics/trigger/${ip}`, {});
      toast({ title: `Collection triggered for ${ip}` });
      setTimeout(loadLatest, 6000);
    } catch (e: unknown) {
      toast({ title: 'Trigger failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  // Initial load
  useEffect(() => { loadLatest(); }, [loadLatest]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!autoRefresh) return;
    intervalRef.current = setInterval(loadLatest, 5 * 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, loadLatest]);

  // SSE for live push updates
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`${API_BASE}/metrics/stream?token=${token}`);
    es.addEventListener('metrics', () => { loadLatest(); });
    es.addEventListener('metrics-error', () => { loadLatest(); });
    return () => es.close();
  }, [loadLatest]);

  // Compute all mounts across all servers
  const allMounts = [...new Set(rows.flatMap(r => r.disks.map(d => d.mount)))].sort();

  // Summary stats
  const avgCpu = rows.filter(r => r.cpu_usage !== null).reduce((s, r) => s + (r.cpu_usage ?? 0), 0) / (rows.filter(r => r.cpu_usage !== null).length || 1);
  const avgMem = rows.filter(r => r.mem_usage !== null).reduce((s, r) => s + (r.mem_usage ?? 0), 0) / (rows.filter(r => r.mem_usage !== null).length || 1);
  const highUsage = rows.filter(r => (r.cpu_usage ?? 0) > 75 || (r.mem_usage ?? 0) > 75).length;

  return (
    <Layout>
      {showAddModal && <AddHostModal onClose={() => setShowAddModal(false)} onAdded={loadLatest} />}

      <div className="max-w-screen-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Server size={20} className="text-primary" />Server Metrics
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">SSH-collected CPU, memory and disk metrics — updated every 5 minutes</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setAutoRefresh(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors ${autoRefresh ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
              <Clock size={12} />{autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
            <button onClick={loadLatest} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border hover:bg-accent text-muted-foreground disabled:opacity-50">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Refresh All
            </button>
            {canManage && (
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus size={12} />Add Host
              </button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Server size={16} />, label: 'Total Hosts', value: rows.length },
              { icon: <Cpu size={16} />, label: 'Avg CPU', value: `${avgCpu.toFixed(1)}%` },
              { icon: <MemoryStick size={16} />, label: 'Avg Memory', value: `${avgMem.toFixed(1)}%` },
              { icon: <AlertTriangle size={16} />, label: 'High Usage (>75%)', value: highUsage, ok: highUsage === 0 ? true : false },
            ].map(({ icon, label, value, ok }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${ok === false ? 'bg-red-900/30 text-red-400' : ok === true ? 'bg-green-900/30 text-green-400' : 'bg-primary/10 text-primary'}`}>
                  {icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-xl font-bold ${ok === false ? 'text-red-400' : ok === true ? 'text-green-400' : ''}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SSH Config hint if no credentials */}
        {rows.some(r => r.last_scan_status === 'unconfigured') && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-yellow-800/50 bg-yellow-950/20 text-yellow-300 text-sm">
            <Settings2 size={15} />
            SSH credentials not configured. Go to <strong>Security Events</strong> dashboard → SSH Config to set up credentials.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === i ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && (
          <HeatmapTable rows={rows} allMounts={allMounts} onRemove={removeHost} onTrigger={triggerScan} canManage={canManage} />
        )}

        {tab === 1 && <CpuMemChart rows={rows} />}

        {tab === 2 && <DiskChart rows={rows} allMounts={allMounts} />}

        {tab === 3 && rows.length > 0 && (
          <div className="space-y-4">
            <HistoryChart rows={rows} />
            <DiskHistoryChart rows={rows} />
          </div>
        )}

        {tab === 3 && rows.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <Server size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Add hosts to see history charts.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
