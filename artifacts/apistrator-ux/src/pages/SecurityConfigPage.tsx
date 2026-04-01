import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { UserManagementContent } from './UserManagementPage';
import { PasswordPolicyContent } from './PasswordPolicyPage';
import { Users, ShieldCheck } from 'lucide-react';

const TABS = [
  { id: 'users', label: 'Users & Roles', icon: <Users size={15} /> },
  { id: 'policy', label: 'Password Policy', icon: <ShieldCheck size={15} /> },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SecurityConfigPage() {
  const [tab, setTab] = useState<TabId>('users');

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold">Security Configuration</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage users, roles and password requirements</p>
        </div>

        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div>
          {tab === 'users' && <UserManagementContent />}
          {tab === 'policy' && <PasswordPolicyContent />}
        </div>
      </div>
    </Layout>
  );
}
