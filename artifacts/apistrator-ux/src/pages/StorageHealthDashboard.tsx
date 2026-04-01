import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/Spinner';
import { apiGet, apiPost, apiPut, apiDelete, API_BASE } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  Database, Plus, RefreshCw, Trash2, Pencil, X, Eye, EyeOff,
  CheckCircle2, AlertTriangle, XCircle, HardDrive, Server,
  Activity, Layers, ChevronDown, ChevronRight, Circle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts';

const getToken = () => { try { return localStorage.getItem('msb-token'); } catch { return null; } };

// ── Types ──────────────────────────────────────────────────────────────────────

interface StorageHost {
  ip: string;
  port: number;
  label: string | null;
  hostname: string;
  ssh_user: string;
  ssh_auth_type: string;
  has_password: boolean;
  has_key: boolean;
  last_scan_status: string;
  last_scan_at: string | null;
  last_error: string | null;
}

interface CephStatus {
  health?: { status?: string; checks?: Record<string, { severity?: string; summary?: { message?: string } }>; mutes?: unknown[] };
  quorum?: number[];
  quorum_names?: string[];
  monmap?: { num_mons?: number; mons?: { name: string }[] };
  osdmap?: { num_osds?: number; num_up_osds?: number; num_in_osds?: number };
  pgmap?: {
    num_pgs?: number; num_pools?: number; num_objects?: number;
    bytes_used?: number; bytes_avail?: number; bytes_total?: number;
    read_bytes_sec?: number; write_bytes_sec?: number;
    pgs_by_state?: { state_name: string; count: number }[];
  };
}

interface CephDfPool {
  name: string; id: number;
  stats: { stored?: number; objects?: number; kb_used?: number; bytes_used?: number; percent_used?: number; max_avail?: number };
}

interface CephDf {
  stats?: { total_bytes?: number; total_used_bytes?: number; total_avail_bytes?: number; total_used_raw_bytes?: number; total_used_raw_ratio?: number };
  pools?: CephDfPool[];
}

interface OsdTreeNode {
  id: number; type: string; name: string;
  status?: string; reweight?: number; crush_weight?: number;
  kb?: number; kb_used?: number; kb_avail?: number;
  utilization?: number;
  children?: number[];
}

interface RbdImageDetail {
  name: string;
  info?: { size?: number; order?: number; format?: number; features?: string[]; object_size?: number; block_name_prefix?: string; create_timestamp?: string };
  du?: { images?: { name: string; provisioned_size?: number; used_size?: number }[] };
}

interface RbdPoolData {
  images: string[];
  image_details: RbdImageDetail[];
  mirror_status?: { summary?: { health?: string; daemon_health?: string }; images?: { name: string; state?: string; description?: string }[] } | null;
  mirror_status_verbose?: unknown;
  mirror_info?: { mode?: string; peers?: unknown[] } | null;
}

interface CephData {
  hostname?: string;
  status?: CephStatus;
  osd_stat?: { num_osds?: number; num_up_osds?: number; num_in_osds?: number };
  osd_tree?: { nodes?: OsdTreeNode[] };
  osd_status_text?: string;
  df?: CephDf;
  pool_stats?: unknown[];
  pg_stat?: { num_pgs?: number; num_pg_unknown?: number; pgs_by_state?: { state_name: string; count: number }[] };
  mon_stat?: { num_mons?: number; quorum?: number[] };
  health_detail?: { status?: string; checks?: Record<string, { severity?: string; summary?: { message?: string }; detail?: { message: string }[] }> };
  rados_df_text?: string;
  osd_dump?: { pools?: { pool_name: string; size?: number; type?: string }[] };
  pools?: string[];
  rbd?: Record<string, RbdPoolData>;
  versions?: unknown;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(b?: number): string {
  if (b == null || b === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function pct(used?: number, total?: number): number {
  if (!total || !used) return 0;
  return Math.round((used / total) * 100);
}

const HEALTH_COLOR: Record<string, string> = {
  HEALTH_OK: 'text-green-500',
  HEALTH_WARN: 'text-yellow-500',
  HEALTH_ERR: 'text-red-500',
};

const STATUS_BADGE: Record<string, string> = {
  ok: 'bg-green-500/15 text-green-600 border-green-500/30',
  scanning: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  error: 'bg-red-500/15 text-red-600 border-red-500/30',
  unconfigured: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-muted text-muted-foreground border-border',
};

function HealthIcon({ status }: { status?: string }) {
  if (status === 'HEALTH_OK') return <CheckCircle2 size={18} className="text-green-500" />;
  if (status === 'HEALTH_WARN') return <AlertTriangle size={18} className="text-yellow-500" />;
  return <XCircle size={18} className="text-red-500" />;
}

function UsageBar({ pct: p }: { pct: number }) {
  const color = p >= 90 ? 'bg-red-500' : p >= 75 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums w-8 text-right">{p}%</span>
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────

type AuthType = 'password' | 'key';

interface SshFormState {
  label: string; ip: string; port: string;
  ssh_user: string; ssh_auth_type: AuthType;
  ssh_pass: string; ssh_key: string;
}

function SshModal({ title, initial, onClose, onSave }: {
  title: string;
  initial: Partial<SshFormState>;
  onClose: () => void;
  onSave: (f: SshFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<SshFormState>({
    label: initial.label ?? '',
    ip: initial.ip ?? '',
    port: initial.port ?? '22',
    ssh_user: initial.ssh_user ?? 'root',
    ssh_auth_type: (initial.ssh_auth_type as AuthType) ?? 'password',
    ssh_pass: '',
    ssh_key: initial.ssh_key ?? '',
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const f = (k: keyof SshFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">{title}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="block text-xs font-medium text-muted-foreground">Label (optional)</label>
                <input value={form.label} onChange={f('label')} placeholder="e.g. Ceph Cluster 1"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">IP Address</label>
                <input value={form.ip} onChange={f('ip')} placeholder="10.0.1.5" disabled={!!initial.ip}
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">SSH Port</label>
                <input type="number" value={form.port} onChange={f('port')} placeholder="22"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">SSH User</label>
                <input value={form.ssh_user} onChange={f('ssh_user')} placeholder="root"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">Auth Type</label>
                <select value={form.ssh_auth_type} onChange={f('ssh_auth_type')}
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="password">Password</option>
                  <option value="key">Private Key</option>
                </select>
              </div>
            </div>
            {form.ssh_auth_type === 'password' ? (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Password {initial.ip ? '(leave blank to keep)' : ''}
                </label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.ssh_pass} onChange={f('ssh_pass')}
                    placeholder={initial.ip ? 'Leave blank to keep current' : 'SSH password'}
                    className="w-full px-3 py-2 pr-9 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Private Key (PEM) {initial.ip ? '— leave blank to keep' : ''}
                </label>
                <textarea value={form.ssh_key} onChange={f('ssh_key')} rows={5}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent transition-colors">Cancel</button>
            <button
              onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center gap-1.5">
              {saving ? <Spinner size="sm" text="" /> : null} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ceph Section Components ──────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">{icon}{title}</h3>
      {children}
    </div>
  );
}

function PoolUsageSection({ df, poolStats }: { df?: CephDf; poolStats?: unknown[] }) {
  const pools = df?.pools ?? [];
  const stats = df?.stats;

  const chartData = pools.map(p => ({
    name: p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name,
    fullName: p.name,
    usedPct: Math.round((p.stats.percent_used ?? 0) * 100 * 10) / 10,
    usedBytes: p.stats.bytes_used ?? 0,
    maxAvail: p.stats.max_avail ?? 0,
    objects: p.stats.objects ?? 0,
  }));

  const barColor = (pct: number) => pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#22c55e';

  return (
    <SectionCard title="Pool Usage" icon={<Layers size={14} className="text-primary" />}>
      {/* Global stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 text-center mb-2">
          {[
            { label: 'Total', val: fmtBytes(stats.total_bytes) },
            { label: 'Used', val: fmtBytes(stats.total_used_bytes) },
            { label: 'Available', val: fmtBytes(stats.total_avail_bytes) },
          ].map(c => (
            <div key={c.label} className="bg-muted/40 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="font-semibold text-sm">{c.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pool table */}
      {pools.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {['Pool', 'Objects', 'Used', 'Max Avail', '% Used'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pools.map(p => {
                const usedPct = Math.round((p.stats.percent_used ?? 0) * 100);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{(p.stats.objects ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtBytes(p.stats.bytes_used)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtBytes(p.stats.max_avail)}</td>
                    <td className="px-3 py-2 min-w-[100px]"><UsageBar pct={usedPct} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pool bar chart */}
      {chartData.length > 0 && (
        <div className="mt-2" style={{ height: Math.max(120, chartData.length * 28) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, _n: string, p: { payload: typeof chartData[0] }) => [
                  `${v}% — ${fmtBytes(p.payload.usedBytes)} / max ${fmtBytes(p.payload.maxAvail)}`,
                  p.payload.fullName,
                ]}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              />
              <Bar dataKey="usedPct" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={barColor(d.usedPct)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {pools.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No pool data available</p>}
    </SectionCard>
  );
}

function OsdTreeSection({ osdTree }: { osdTree?: { nodes?: OsdTreeNode[] } }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([-1]));
  const nodes = osdTree?.nodes ?? [];
  const nodeMap = new Map<number, OsdTreeNode>(nodes.map(n => [n.id, n]));

  const roots = nodes.filter(n => n.type === 'root');

  function toggle(id: number) {
    setExpanded(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  }

  function renderNode(id: number, depth = 0): React.ReactNode {
    const n = nodeMap.get(id);
    if (!n) return null;
    const isLeaf = n.type === 'osd';
    const hasChildren = !isLeaf && (n.children?.length ?? 0) > 0;
    const isExp = expanded.has(n.id);

    const statusColor = n.status === 'up' ? 'text-green-500' : n.status === 'down' ? 'text-red-500' : 'text-muted-foreground';

    return (
      <div key={n.id} style={{ marginLeft: depth * 16 }}>
        <div
          className={`flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/30 transition-colors text-xs ${!isLeaf ? 'cursor-pointer' : ''}`}
          onClick={() => !isLeaf && toggle(n.id)}
        >
          {!isLeaf && hasChildren && (
            isExp ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />
          )}
          {(isLeaf || !hasChildren) && <span className="w-3 shrink-0" />}
          <Circle size={6} className={`shrink-0 ${statusColor} fill-current`} />
          <span className="font-medium text-foreground">{n.name}</span>
          <span className="text-muted-foreground capitalize px-1.5 py-0.5 rounded bg-muted/50">{n.type}</span>
          {n.status && <span className={`font-medium ${statusColor}`}>{n.status}</span>}
          {n.reweight != null && n.type === 'osd' && <span className="text-muted-foreground">rw:{n.reweight}</span>}
          {n.utilization != null && (
            <span className={n.utilization >= 90 ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
              {n.utilization.toFixed(1)}%
            </span>
          )}
          {n.kb != null && <span className="text-muted-foreground ml-auto">{fmtBytes((n.kb ?? 0) * 1024)}</span>}
        </div>
        {!isLeaf && isExp && n.children?.map(childId => renderNode(childId, depth + 1))}
      </div>
    );
  }

  if (nodes.length === 0) return (
    <SectionCard title="OSD Tree" icon={<HardDrive size={14} className="text-primary" />}>
      <p className="text-xs text-muted-foreground py-4 text-center">No OSD tree data available</p>
    </SectionCard>
  );

  return (
    <SectionCard title="OSD Tree" icon={<HardDrive size={14} className="text-primary" />}>
      <div className="bg-muted/20 rounded-lg p-2 max-h-72 overflow-y-auto space-y-0.5 font-mono">
        {roots.length > 0
          ? roots.map(r => renderNode(r.id, 0))
          : nodes.filter(n => n.type !== 'osd').slice(0, 1).map(r => renderNode(r.id, 0))
        }
      </div>
    </SectionCard>
  );
}

function OsdStatusSection({ text, nodes }: { text?: string; nodes?: OsdTreeNode[] }) {
  const osds = nodes?.filter(n => n.type === 'osd') ?? [];

  if (osds.length === 0 && !text) return null;

  if (osds.length > 0) {
    return (
      <SectionCard title="OSD Status" icon={<Activity size={14} className="text-primary" />}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {['OSD', 'Status', 'Reweight', 'Crush Weight', 'Size', 'Used', 'Avail', 'Use%'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {osds.map(n => {
                const usedPct = n.utilization ?? (n.kb && n.kb_used ? Math.round(n.kb_used / n.kb * 100) : 0);
                const statusColor = n.status === 'up' ? 'text-green-600 bg-green-500/10' : 'text-red-600 bg-red-500/10';
                return (
                  <tr key={n.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium">{n.name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor}`}>{n.status ?? 'unknown'}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{n.reweight?.toFixed(2) ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{n.crush_weight?.toFixed(3) ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{n.kb ? fmtBytes(n.kb * 1024) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{n.kb_used ? fmtBytes(n.kb_used * 1024) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{n.kb_avail ? fmtBytes(n.kb_avail * 1024) : '—'}</td>
                    <td className="px-3 py-2 min-w-[80px]"><UsageBar pct={usedPct} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="OSD Status" icon={<Activity size={14} className="text-primary" />}>
      <pre className="text-xs font-mono bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48">{text}</pre>
    </SectionCard>
  );
}

function RbdSection({ pools, rbd }: { pools?: string[]; rbd?: Record<string, RbdPoolData> }) {
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  if (!rbd || !pools?.length) return null;
  const rbdPools = pools.filter(p => rbd[p]?.images?.length);
  if (!rbdPools.length) return (
    <SectionCard title="RBD Images" icon={<Database size={14} className="text-primary" />}>
      <p className="text-xs text-muted-foreground py-4 text-center">No RBD images found in any pool</p>
    </SectionCard>
  );

  return (
    <SectionCard title="RBD Images" icon={<Database size={14} className="text-primary" />}>
      <div className="space-y-2">
        {rbdPools.map(pool => {
          const poolData = rbd[pool];
          const isExp = expandedPool === pool;
          return (
            <div key={pool} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setExpandedPool(isExp ? null : pool)}
                className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
              >
                <span className="flex items-center gap-2 font-medium">
                  {isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {pool}
                  <span className="text-xs text-muted-foreground font-normal">({poolData.images.length} images)</span>
                </span>
              </button>
              {isExp && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20 text-muted-foreground">
                      <tr>
                        {['Image', 'Size', 'Used', 'Object Size', 'Format', 'Created'].map(h => (
                          <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {poolData.image_details.length > 0 ? poolData.image_details.map(d => (
                        <tr key={d.name} className="border-t border-border hover:bg-accent/20">
                          <td className="px-3 py-1.5 font-medium">{d.name}</td>
                          <td className="px-3 py-1.5 tabular-nums">{d.info?.size ? fmtBytes(d.info.size) : '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {d.du?.images?.[0]?.used_size ? fmtBytes(d.du.images[0].used_size) : '—'}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">{d.info?.object_size ? fmtBytes(d.info.object_size) : '—'}</td>
                          <td className="px-3 py-1.5">{d.info?.format ?? '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {d.info?.create_timestamp ? new Date(d.info.create_timestamp).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      )) : poolData.images.slice(0, 20).map(img => (
                        <tr key={img} className="border-t border-border hover:bg-accent/20">
                          <td className="px-3 py-1.5 font-medium">{img}</td>
                          <td className="px-3 py-1.5 text-muted-foreground" colSpan={5}>detail unavailable</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {poolData.images.length > poolData.image_details.length && (
                    <p className="text-xs text-muted-foreground px-3 py-1.5">
                      … and {poolData.images.length - poolData.image_details.length} more images
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function MirrorSection({ pools, rbd }: { pools?: string[]; rbd?: Record<string, RbdPoolData> }) {
  if (!rbd || !pools?.length) return null;
  const mirrored = pools.filter(p => rbd[p]?.mirror_status);
  if (!mirrored.length) return null;

  return (
    <SectionCard title="Mirror Pool Status" icon={<Server size={14} className="text-primary" />}>
      <div className="space-y-3">
        {mirrored.map(pool => {
          const ms = rbd[pool]?.mirror_status;
          const mi = rbd[pool]?.mirror_info;
          const summary = ms?.summary;
          const healthColor = summary?.health === 'OK' ? 'text-green-600 bg-green-500/10' : 'text-yellow-600 bg-yellow-500/10';
          return (
            <div key={pool} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{pool}</span>
                <div className="flex items-center gap-2">
                  {mi?.mode && <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">{mi.mode}</span>}
                  {summary?.health && (
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${healthColor}`}>{summary.health}</span>
                  )}
                </div>
              </div>
              {ms?.images && ms.images.length > 0 && (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Image</th>
                        <th className="px-3 py-1.5 text-left">State</th>
                        <th className="px-3 py-1.5 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ms.images.map((img, i) => (
                        <tr key={i} className="border-t border-border hover:bg-accent/20">
                          <td className="px-3 py-1.5 font-medium">{img.name}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${img.state === 'up+replaying' || img.state === 'up+synced' ? 'text-green-600 bg-green-500/10' : 'text-muted-foreground bg-muted'}`}>
                              {img.state ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{img.description ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function HealthChecksSection({ healthDetail }: { healthDetail?: CephData['health_detail'] }) {
  const checks = healthDetail?.checks ?? {};
  const entries = Object.entries(checks);
  if (!entries.length) return null;

  return (
    <SectionCard title="Health Checks" icon={<AlertTriangle size={14} className="text-yellow-500" />}>
      <div className="space-y-2">
        {entries.map(([code, check]) => {
          const isErr = check.severity === 'HEALTH_ERR';
          const bg = isErr ? 'border-red-500/30 bg-red-500/5' : 'border-yellow-500/30 bg-yellow-500/5';
          const textColor = isErr ? 'text-red-600' : 'text-yellow-600';
          return (
            <div key={code} className={`rounded-lg border p-3 space-y-1 ${bg}`}>
              <div className="flex items-center gap-2">
                {isErr ? <XCircle size={13} className="text-red-500" /> : <AlertTriangle size={13} className="text-yellow-500" />}
                <span className={`text-xs font-semibold font-mono ${textColor}`}>{code}</span>
              </div>
              {check.summary?.message && <p className="text-xs text-foreground pl-5">{check.summary.message}</p>}
              {check.detail && check.detail.length > 0 && (
                <ul className="pl-5 space-y-0.5">
                  {check.detail.slice(0, 5).map((d, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {d.message}</li>
                  ))}
                  {check.detail.length > 5 && <li className="text-xs text-muted-foreground">…and {check.detail.length - 5} more</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function PgStatsSection({ pgmap }: { pgmap?: CephStatus['pgmap'] }) {
  if (!pgmap) return null;
  const states = pgmap.pgs_by_state ?? [];
  const total = states.reduce((s, x) => s + x.count, 0);

  return (
    <SectionCard title="PG States" icon={<Activity size={14} className="text-primary" />}>
      <div className="space-y-1.5">
        {states.map(s => {
          const p = total ? Math.round((s.count / total) * 100) : 0;
          const isHealthy = s.state_name.includes('active+clean');
          return (
            <div key={s.state_name} className="flex items-center gap-2 text-xs">
              <span className={`w-3 h-3 rounded-full shrink-0 ${isHealthy ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="flex-1 font-mono">{s.state_name}</span>
              <span className="tabular-nums font-semibold">{s.count.toLocaleString()}</span>
              <span className="text-muted-foreground w-8 text-right">{p}%</span>
            </div>
          );
        })}
        {pgmap.read_bytes_sec != null && (
          <div className="flex gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
            <span>Read: <b className="text-foreground">{fmtBytes(pgmap.read_bytes_sec)}/s</b></span>
            <span>Write: <b className="text-foreground">{fmtBytes(pgmap.write_bytes_sec)}/s</b></span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function StorageHealthDashboard() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const canManage = hasPermission('manage_storage');

  const [hosts, setHosts] = useState<StorageHost[]>([]);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [scanData, setScanData] = useState<{ ceph: CephData; collected_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editHost, setEditHost] = useState<StorageHost | null>(null);

  const loadHosts = useCallback(async () => {
    try {
      const data = await apiGet<StorageHost[]>('/storage/hosts');
      setHosts(data);
      if (data.length > 0 && !selectedIp) setSelectedIp(data[0].ip);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [selectedIp]);

  const loadScan = useCallback(async (ip: string) => {
    setScanData(null);
    try {
      const data = await apiGet<{ ceph: CephData; collected_at?: string }>(`/storage/scan/${ip}`);
      setScanData(data);
    } catch { /* no scan yet */ }
  }, []);

  useEffect(() => { loadHosts(); }, []);
  useEffect(() => { if (selectedIp) loadScan(selectedIp); }, [selectedIp]);

  // SSE
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`${API_BASE}/storage/stream?token=${token}`);
    es.addEventListener('storage', () => { if (selectedIp) loadScan(selectedIp); });
    return () => es.close();
  }, [selectedIp]);

  const triggerScan = async () => {
    if (!selectedIp) return;
    setScanning(true);
    try {
      await apiPost(`/storage/trigger/${selectedIp}`, {});
      toast({ title: 'Scan Started', description: 'Ceph data collection in progress (may take ~30–90s)' });
      setTimeout(() => { loadScan(selectedIp); setScanning(false); }, 3000);
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Scan failed', variant: 'destructive' });
      setScanning(false);
    }
  };

  const addHost = async (f: SshFormState) => {
    try {
      await apiPost('/storage/hosts', {
        ip: f.ip, port: f.port, label: f.label,
        ssh_user: f.ssh_user, ssh_auth_type: f.ssh_auth_type,
        ssh_pass: f.ssh_auth_type === 'password' ? f.ssh_pass : undefined,
        ssh_key: f.ssh_auth_type === 'key' ? f.ssh_key : undefined,
      });
      setShowAddModal(false);
      await loadHosts();
      setSelectedIp(f.ip);
      toast({ title: 'Host Added', description: `${f.ip} added successfully.` });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to add host', variant: 'destructive' });
    }
  };

  const editSsh = async (f: SshFormState) => {
    if (!editHost) return;
    try {
      await apiPut(`/storage/hosts/${editHost.ip}/ssh`, {
        label: f.label,
        ssh_user: f.ssh_user, ssh_auth_type: f.ssh_auth_type,
        ssh_pass: f.ssh_auth_type === 'password' ? f.ssh_pass : '',
        ssh_key: f.ssh_auth_type === 'key' ? f.ssh_key : '',
      });
      setEditHost(null);
      await loadHosts();
      toast({ title: 'Saved', description: 'SSH config updated.' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' });
    }
  };

  const deleteHost = async (ip: string) => {
    if (!confirm(`Remove ${ip} from Storage Health?`)) return;
    try {
      await apiDelete(`/storage/hosts/${ip}`);
      await loadHosts();
      if (selectedIp === ip) setSelectedIp(hosts.find(h => h.ip !== ip)?.ip ?? null);
      toast({ title: 'Removed', description: `${ip} removed.` });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Delete failed', variant: 'destructive' });
    }
  };

  const ceph = scanData?.ceph;
  const status = ceph?.status;
  const health = status?.health;
  const pgmap = status?.pgmap;
  const osdmap = status?.osdmap;
  const selectedHost = hosts.find(h => h.ip === selectedIp);

  if (loading) return <Layout><div className="flex justify-center py-24"><Spinner /></div></Layout>;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Database size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Storage Health</h1>
              <p className="text-xs text-muted-foreground">Ceph cluster 360° view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIp && (
              <button
                onClick={triggerScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors disabled:opacity-60"
              >
                <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
                {scanning ? 'Scanning…' : 'Refresh'}
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus size={14} /> Add Host
              </button>
            )}
          </div>
        </div>

        {hosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Database size={48} className="text-muted-foreground/30" />
            <div>
              <p className="font-semibold text-muted-foreground">No storage hosts configured</p>
              <p className="text-sm text-muted-foreground mt-1">Add a Ceph host to start monitoring</p>
            </div>
            {canManage && (
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                <Plus size={14} /> Add Host
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Host tabs */}
            <div className="flex gap-2 flex-wrap">
              {hosts.map(h => {
                const isSelected = h.ip === selectedIp;
                const st = h.last_scan_status;
                return (
                  <div key={h.ip} className={`flex items-center gap-1.5 rounded-lg border transition-all ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/30'}`}>
                    <button onClick={() => setSelectedIp(h.ip)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
                      <span className={`w-2 h-2 rounded-full ${st === 'ok' ? 'bg-green-500' : st === 'error' ? 'bg-red-500' : st === 'scanning' ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
                      <span className="font-medium">{h.label ?? h.hostname ?? h.ip}</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{h.ip}</span>
                    </button>
                    {canManage && (
                      <>
                        <button onClick={() => setEditHost(h)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={11} /></button>
                        <button onClick={() => deleteHost(h.ip)} className="p-1.5 pr-2 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={11} /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status / error for selected host */}
            {selectedHost && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded border text-xs font-medium ${STATUS_BADGE[selectedHost.last_scan_status] ?? STATUS_BADGE.pending}`}>
                  {selectedHost.last_scan_status}
                </span>
                {selectedHost.last_scan_at && (
                  <span className="text-muted-foreground">Last scan: {new Date(selectedHost.last_scan_at).toLocaleString()}</span>
                )}
                {selectedHost.last_error && (
                  <span className="text-red-500 truncate max-w-xs">{selectedHost.last_error}</span>
                )}
              </div>
            )}

            {!scanData ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <HardDrive size={40} className="text-muted-foreground/30" />
                <p className="text-muted-foreground">No scan data yet for this host.</p>
                {selectedHost?.last_scan_status === 'unconfigured' ? (
                  <p className="text-sm text-muted-foreground">Configure SSH credentials first, then refresh.</p>
                ) : (
                  <button onClick={triggerScan} disabled={scanning}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
                    <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
                    {scanning ? 'Scanning…' : 'Scan Now'}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Health Banner */}
                {health?.status && (
                  <div className={`rounded-xl border p-4 flex items-center gap-3 ${
                    health.status === 'HEALTH_OK' ? 'bg-green-500/5 border-green-500/30' :
                    health.status === 'HEALTH_WARN' ? 'bg-yellow-500/5 border-yellow-500/30' :
                    'bg-red-500/5 border-red-500/30'
                  }`}>
                    <HealthIcon status={health.status} />
                    <div>
                      <p className={`font-bold text-base ${HEALTH_COLOR[health.status] ?? 'text-foreground'}`}>{health.status}</p>
                      {ceph?.hostname && <p className="text-xs text-muted-foreground">Host: {ceph.hostname}</p>}
                    </div>
                    <div className="ml-auto text-right text-xs text-muted-foreground">
                      {scanData.collected_at && <p>Collected: {new Date(scanData.collected_at).toLocaleString()}</p>}
                    </div>
                  </div>
                )}

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Monitors',
                      value: status?.quorum_names?.length
                        ? `${status.quorum?.length ?? 0}/${status.monmap?.num_mons ?? status.quorum_names.length}`
                        : (ceph?.mon_stat?.num_mons ?? '—'),
                      sub: status?.quorum_names?.slice(0, 3).join(', '),
                      icon: <Server size={16} className="text-primary" />,
                    },
                    {
                      label: 'OSDs',
                      value: osdmap?.num_up_osds != null ? `${osdmap.num_up_osds}↑ / ${osdmap.num_osds}` : (ceph?.osd_stat?.num_osds ?? '—'),
                      sub: osdmap?.num_in_osds != null ? `${osdmap.num_in_osds} in` : undefined,
                      icon: <HardDrive size={16} className="text-primary" />,
                    },
                    {
                      label: 'PGs',
                      value: pgmap?.num_pgs?.toLocaleString() ?? ceph?.pg_stat?.num_pgs?.toLocaleString() ?? '—',
                      sub: (pgmap?.pgs_by_state?.find(s => s.state_name === 'active+clean')?.count ?? 0) + ' clean',
                      icon: <Layers size={16} className="text-primary" />,
                    },
                    {
                      label: 'Storage',
                      value: pgmap?.bytes_total ? fmtBytes(pgmap.bytes_total) : (ceph?.df?.stats?.total_bytes ? fmtBytes(ceph.df.stats.total_bytes) : '—'),
                      sub: pgmap?.bytes_used ? `${fmtBytes(pgmap.bytes_used)} used` : (ceph?.df?.stats?.total_used_bytes ? `${fmtBytes(ceph.df.stats.total_used_bytes)} used` : undefined),
                      icon: <Database size={16} className="text-primary" />,
                    },
                  ].map(c => (
                    <div key={c.label} className="bg-card border border-border rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
                        {c.icon}
                      </div>
                      <p className="text-lg font-bold tabular-nums">{String(c.value)}</p>
                      {c.sub && <p className="text-xs text-muted-foreground truncate">{c.sub}</p>}
                    </div>
                  ))}
                </div>

                {/* Health checks */}
                <HealthChecksSection healthDetail={ceph?.health_detail} />

                {/* Pool usage */}
                <PoolUsageSection df={ceph?.df} poolStats={ceph?.pool_stats as unknown[]} />

                {/* PG states */}
                <PgStatsSection pgmap={pgmap} />

                {/* OSD tree */}
                <OsdTreeSection osdTree={ceph?.osd_tree} />

                {/* OSD status */}
                <OsdStatusSection text={ceph?.osd_status_text} nodes={ceph?.osd_tree?.nodes} />

                {/* RBD images */}
                <RbdSection pools={ceph?.pools} rbd={ceph?.rbd} />

                {/* Mirror status */}
                <MirrorSection pools={ceph?.pools} rbd={ceph?.rbd} />

                {/* RADOS df raw */}
                {ceph?.rados_df_text && (
                  <SectionCard title="RADOS Pool Stats" icon={<Layers size={14} className="text-primary" />}>
                    <pre className="text-xs font-mono bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre max-h-64">{ceph.rados_df_text}</pre>
                  </SectionCard>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <SshModal
          title="Add Storage Host"
          initial={{}}
          onClose={() => setShowAddModal(false)}
          onSave={addHost}
        />
      )}

      {editHost && (
        <SshModal
          title={`Edit SSH — ${editHost.ip}`}
          initial={{
            ip: editHost.ip,
            label: editHost.label ?? '',
            port: String(editHost.port),
            ssh_user: editHost.ssh_user,
            ssh_auth_type: editHost.ssh_auth_type as AuthType,
          }}
          onClose={() => setEditHost(null)}
          onSave={editSsh}
        />
      )}
    </Layout>
  );
}
