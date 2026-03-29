import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/Spinner';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { useAuth } from '@/contexts/auth-context';
import { useTheme, type ColorTheme, type DarkMode } from '@/lib/theme-context';
import { apiPut, apiGet } from '@/lib/api-client';
import { setToken } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, User, Lock, Palette, Sun, Moon } from 'lucide-react';
import type { PolicyShape } from '@/components/PasswordStrengthMeter';

interface AuthUser {
  id: number; email: string; fullName: string; role: string;
  roleId: number; permissions: string[]; colorTheme: string;
}

const COLOR_THEMES: { id: ColorTheme; label: string; color: string }[] = [
  { id: 'red',     label: 'Red (Default)', color: '#dc2626' },
  { id: 'blue',    label: 'Blue',          color: '#3b82f6' },
  { id: 'green',   label: 'Green',         color: '#22c55e' },
  { id: 'orange',  label: 'Orange',        color: '#f97316' },
  { id: 'pink',    label: 'Pink',          color: '#ec4899' },
  { id: 'default', label: 'Classic Cyan',  color: '#00cccc' },
];

type Section = 'profile' | 'password' | 'theme';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { colorTheme, setColorTheme, darkMode, toggleDarkMode } = useTheme();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>('profile');

  const [profileForm, setProfileForm] = useState({ full_name: user?.fullName ?? '', mobile: '' });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [policy, setPolicy] = useState<PolicyShape>({ min_length: 8, min_uppercase: 1, min_lowercase: 1, min_special: 1 });
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (section === 'password' && !policyLoaded) {
      apiGet<PolicyShape>('/password-policy').then(p => { setPolicy(p); setPolicyLoaded(true); }).catch(() => {});
    }
  }, [section, policyLoaded]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiPut('/profile', profileForm);
      await refreshUser();
      toast({ title: 'Profile Updated', description: 'Your details have been saved.' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Update failed', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm) {
      toast({ title: 'Mismatch', description: 'New password and confirmation do not match.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiPut('/profile/password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      setPwForm({ current_password: '', new_password: '', confirm: '' });
      toast({ title: 'Password Changed', description: 'Your password has been updated.' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Update failed', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const saveTheme = async (theme: ColorTheme) => {
    setColorTheme(theme);
    setSaving(true);
    try {
      const res = await apiPut<{ ok: boolean; token?: string; user?: AuthUser }>('/profile/theme', { color_theme: theme });
      if (res.token) { setToken(res.token); await refreshUser(); }
      toast({ title: 'Theme Saved', description: `Switched to ${COLOR_THEMES.find(t => t.id === theme)?.label ?? theme} theme.` });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Theme save failed', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User size={15} /> },
    { id: 'password', label: 'Password', icon: <Lock size={15} /> },
    { id: 'theme', label: 'Theme', icon: <Palette size={15} /> },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-black">
            {user?.fullName?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <h1 className="text-xl font-bold">{user?.fullName}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{user?.role}</span>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${section === s.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          {section === 'profile' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Personal Details</h2>
              {[
                { id: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Jane Doe' },
                { id: 'mobile', label: 'Mobile', type: 'tel', placeholder: '+91 98765 43210' },
              ].map(({ id, label, type, placeholder }) => (
                <div key={id} className="space-y-1">
                  <label className="block text-sm font-medium">{label}</label>
                  <input type={type} value={(profileForm as Record<string, string>)[id]} placeholder={placeholder}
                    onChange={e => setProfileForm(p => ({ ...p, [id]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="block text-sm font-medium">Email</label>
                <input type="email" value={user?.email ?? ''} disabled
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-muted-foreground cursor-not-allowed" />
              </div>
              <button onClick={saveProfile} disabled={saving}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
                {saving ? <Spinner size="sm" text="Thinking..." /> : 'Save Changes'}
              </button>
            </div>
          )}

          {section === 'password' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Change Password</h2>
              <div className="space-y-1">
                <label className="block text-sm font-medium">Current Password</label>
                <div className="relative">
                  <input type={showCurrent ? 'text' : 'password'} value={pwForm.current_password}
                    onChange={e => setPwForm(p => ({ ...p, current_password: e.target.value }))}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 pr-9 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">New Password</label>
                <div className="relative">
                  <input type={showNew ? 'text' : 'password'} value={pwForm.new_password}
                    onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2 pr-9 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwForm.new_password && <PasswordStrengthMeter password={pwForm.new_password} policy={policy} />}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">Confirm New Password</label>
                <input type="password" value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                {pwForm.confirm && pwForm.new_password !== pwForm.confirm && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <button onClick={savePassword} disabled={saving}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
                {saving ? <Spinner size="sm" text="Thinking..." /> : 'Update Password'}
              </button>
            </div>
          )}

          {section === 'theme' && (
            <div className="space-y-8">
              {/* Color Theme */}
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold">Color Theme</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Choose your preferred accent color. Changes apply immediately.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {COLOR_THEMES.map(t => (
                    <button key={t.id} onClick={() => saveTheme(t.id)}
                      className={`group relative flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all
                        ${colorTheme === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground bg-muted/20'}`}>
                      <div className="h-10 w-10 rounded-full shadow-md transition-transform group-hover:scale-105"
                        style={{ backgroundColor: t.color }} />
                      <span className={`text-xs font-medium ${colorTheme === t.id ? 'text-primary' : 'text-foreground'}`}>
                        {t.label}
                      </span>
                      {colorTheme === t.id && (
                        <span className="absolute top-2 right-2 text-primary text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
                {saving && <div className="flex justify-center"><Spinner size="sm" text="Thinking..." /></div>}
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Scheme Theme */}
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold">Scheme Theme</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Switch between dark and light display modes.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: 'dark' as DarkMode, label: 'Dark', icon: <Moon size={22} />, desc: 'Easy on the eyes in low light' },
                    { id: 'light' as DarkMode, label: 'Light', icon: <Sun size={22} />, desc: 'Crisp and clear in bright environments' },
                  ] as { id: DarkMode; label: string; icon: React.ReactNode; desc: string }[]).map(s => (
                    <button
                      key={s.id}
                      onClick={() => { if (darkMode !== s.id) toggleDarkMode(); }}
                      className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-center
                        ${darkMode === s.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground bg-muted/20'}`}
                    >
                      <div className={`flex items-center justify-center h-12 w-12 rounded-full transition-all
                        ${darkMode === s.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
                        {s.icon}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${darkMode === s.id ? 'text-primary' : 'text-foreground'}`}>{s.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                      </div>
                      {darkMode === s.id && (
                        <span className="absolute top-2 right-2 text-primary text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
