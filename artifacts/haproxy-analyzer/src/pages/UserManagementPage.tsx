import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/Spinner';
import { PasswordStrengthMeter, type PolicyShape } from '@/components/PasswordStrengthMeter';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client';
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserRow { id: number; full_name: string; email: string; mobile: string; role_id: number; role_name: string; created_at: string; }
interface RoleRow { id: number; name: string; description: string; permissions: string[]; }
interface PermRow { id: number; name: string; description: string; }

type Tab = 'users' | 'roles';

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function UserManagementPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [policy, setPolicy] = useState<PolicyShape>({ min_length: 8, min_uppercase: 1, min_lowercase: 1, min_special: 1 });
  const [loading, setLoading] = useState(true);
  const [userModal, setUserModal] = useState<'create' | UserRow | null>(null);
  const [roleModal, setRoleModal] = useState<'create' | RoleRow | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [u, r, p, pol] = await Promise.all([
        apiGet<UserRow[]>('/users'),
        apiGet<RoleRow[]>('/roles'),
        apiGet<PermRow[]>('/roles/permissions'),
        apiGet<PolicyShape>('/password-policy'),
      ]);
      setUsers(u);
      setRoles(r);
      setPerms(p);
      setPolicy(pol);
    } catch (e: unknown) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Load failed', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Users & Roles</h1>
          <button
            onClick={() => tab === 'users' ? setUserModal('create') : setRoleModal('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> New {tab === 'users' ? 'User' : 'Role'}
          </button>
        </div>

        <div className="flex gap-1 border-b border-border">
          {(['users', 'roles'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : tab === 'users' ? (
          <UsersTab users={users} roles={roles} onEdit={u => setUserModal(u)} onDelete={async id => {
            if (!confirm('Delete this user?')) return;
            await apiDelete(`/users/${id}`); load();
          }} />
        ) : (
          <RolesTab roles={roles} onEdit={r => setRoleModal(r)} onDelete={async id => {
            if (!confirm('Delete this role?')) return;
            await apiDelete(`/roles/${id}`).catch(e => toast({ title: 'Error', description: e.message, variant: 'destructive' })); load();
          }} />
        )}
      </div>

      {userModal !== null && (
        <UserModal
          data={userModal === 'create' ? null : userModal}
          roles={roles}
          policy={policy}
          onClose={() => setUserModal(null)}
          onSave={async (data) => {
            try {
              if (userModal === 'create') await apiPost('/users', data);
              else await apiPut(`/users/${(userModal as UserRow).id}`, data);
              setUserModal(null); load();
              toast({ title: 'Saved', description: `User ${userModal === 'create' ? 'created' : 'updated'} successfully.` });
            } catch (e: unknown) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' }); }
          }}
        />
      )}

      {roleModal !== null && (
        <RoleModal
          data={roleModal === 'create' ? null : roleModal}
          perms={perms}
          onClose={() => setRoleModal(null)}
          onSave={async (data) => {
            try {
              if (roleModal === 'create') await apiPost('/roles', data);
              else await apiPut(`/roles/${(roleModal as RoleRow).id}`, data);
              setRoleModal(null); load();
              toast({ title: 'Saved', description: `Role ${roleModal === 'create' ? 'created' : 'updated'} successfully.` });
            } catch (e: unknown) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' }); }
          }}
        />
      )}
    </Layout>
  );
}

function UsersTab({ users, roles, onEdit, onDelete }: { users: UserRow[]; roles: RoleRow[]; onEdit: (u: UserRow) => void; onDelete: (id: number) => void; }) {
  if (!users.length) return <p className="text-muted-foreground text-sm py-8 text-center">No users found.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {['Full Name', 'Email', 'Mobile', 'Role', 'Created', ''].map(h => (
              <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t border-border hover:bg-accent/30 transition-colors">
              <td className="px-3 py-2.5 font-medium">{u.full_name}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{u.mobile || '—'}</td>
              <td className="px-3 py-2.5">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{u.role_name}</span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-2.5">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => onEdit(u)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                  <button onClick={() => onDelete(u.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolesTab({ roles, onEdit, onDelete }: { roles: RoleRow[]; onEdit: (r: RoleRow) => void; onDelete: (id: number) => void; }) {
  if (!roles.length) return <p className="text-muted-foreground text-sm py-8 text-center">No roles found.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map(r => (
        <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{r.name}</p>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => onEdit(r)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
              <button onClick={() => onDelete(r.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.permissions.map(p => (
              <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserModal({ data, roles, policy, onClose, onSave }: {
  data: UserRow | null; roles: RoleRow[]; policy: PolicyShape;
  onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    full_name: data?.full_name ?? '',
    email: data?.email ?? '',
    mobile: data?.mobile ?? '',
    password: '',
    role_id: data?.role_id ?? (roles[0]?.id ?? ''),
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{data ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          {[
            { id: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Jane Doe' },
            { id: 'email', label: 'Email', type: 'email', placeholder: 'jane@example.com' },
            { id: 'mobile', label: 'Mobile', type: 'tel', placeholder: '+91 98765 43210' },
          ].map(({ id, label, type, placeholder }) => (
            <div key={id} className="space-y-1">
              <label className="block text-sm font-medium">{label}</label>
              <input type={type} value={(form as Record<string, string>)[id]} onChange={f(id)} placeholder={placeholder}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          ))}
          <div className="space-y-1">
            <label className="block text-sm font-medium">{data ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={f('password')}
                placeholder={data ? 'Leave blank to keep current' : 'Min 8 chars'}
                className="w-full px-3 py-2 pr-9 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {form.password && <PasswordStrengthMeter password={form.password} policy={policy} />}
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Role</label>
            <select value={form.role_id} onChange={f('role_id')}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent transition-colors">Cancel</button>
          <button onClick={async () => { setSaving(true); await onSave({ ...form, role_id: Number(form.role_id) }); setSaving(false); }} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center gap-1.5">
            {saving ? <Spinner size="sm" text="" /> : null} Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function RoleModal({ data, perms, onClose, onSave }: {
  data: RoleRow | null; perms: PermRow[];
  onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(data?.name ?? '');
  const [desc, setDesc] = useState(data?.description ?? '');
  const [selected, setSelected] = useState<number[]>(
    data?.permissions ? perms.filter(p => data.permissions.includes(p.name)).map(p => p.id) : []
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{data ? 'Edit Role' : 'New Role'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Role Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Auditor"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Description</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Permissions</label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {perms.map(p => (
                <label key={p.id} className="flex items-start gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}
                    className="mt-0.5 accent-primary" />
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent transition-colors">Cancel</button>
          <button onClick={async () => { setSaving(true); await onSave({ name, description: desc, permissions: selected }); setSaving(false); }} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center gap-1.5">
            {saving ? <Spinner size="sm" text="" /> : null} Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
