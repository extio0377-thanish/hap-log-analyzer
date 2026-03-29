import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/Spinner';
import { apiGet, apiPut } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Info } from 'lucide-react';

interface Policy {
  id: number;
  min_length: number;
  min_uppercase: number;
  min_lowercase: number;
  min_special: number;
  updated_at: string;
}

function RangeField({ label, hint, value, min, max, onChange }: {
  label: string; hint: string; value: number; min: number; max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium">{label}</label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <input
          type="number" min={min} max={max} value={value}
          onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className="w-20 text-center px-2 py-1.5 rounded-lg bg-input border border-border text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export default function PasswordPolicyPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState({ min_length: 8, min_uppercase: 1, min_lowercase: 1, min_special: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    apiGet<Policy>('/password-policy').then(p => {
      setPolicy(p);
      setForm({ min_length: p.min_length, min_uppercase: p.min_uppercase, min_lowercase: p.min_lowercase, min_special: p.min_special });
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiPut('/password-policy', form);
      const updated = await apiGet<Policy>('/password-policy');
      setPolicy(updated);
      toast({ title: 'Policy Updated', description: 'Password policy has been saved successfully.' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const f = (k: keyof typeof form) => (v: number) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Layout>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Password Policy</h1>
            <p className="text-sm text-muted-foreground">Set requirements for all passwords</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
              <Info size={15} className="mt-0.5 shrink-0" />
              <p>This policy is enforced when creating users or changing passwords.</p>
            </div>

            <RangeField label="Minimum Length" hint="Total number of characters required" value={form.min_length} min={4} max={128} onChange={f('min_length')} />
            <RangeField label="Uppercase Letters" hint="Minimum number of uppercase (A–Z) characters" value={form.min_uppercase} min={0} max={10} onChange={f('min_uppercase')} />
            <RangeField label="Lowercase Letters" hint="Minimum number of lowercase (a–z) characters" value={form.min_lowercase} min={0} max={10} onChange={f('min_lowercase')} />
            <RangeField label="Special Characters" hint="Minimum number of special characters (e.g. !@#$)" value={form.min_special} min={0} max={10} onChange={f('min_special')} />

            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1 font-mono">
              <p className="text-muted-foreground font-sans font-medium text-xs uppercase tracking-wider mb-2">Preview</p>
              <p>Length ≥ <span className="text-primary font-bold">{form.min_length}</span></p>
              <p>Uppercase ≥ <span className="text-primary font-bold">{form.min_uppercase}</span></p>
              <p>Lowercase ≥ <span className="text-primary font-bold">{form.min_lowercase}</span></p>
              <p>Special ≥ <span className="text-primary font-bold">{form.min_special}</span></p>
            </div>

            {policy && (
              <p className="text-xs text-muted-foreground text-right">
                Last updated: {new Date(policy.updated_at).toLocaleString()}
              </p>
            )}

            <button onClick={save} disabled={saving}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" text="Thinking..." /> : 'Save Policy'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
