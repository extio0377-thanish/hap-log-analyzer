import React from 'react';

export interface PolicyShape {
  min_length: number;
  min_uppercase: number;
  min_lowercase: number;
  min_special: number;
}

interface Check {
  label: string;
  ok: boolean;
}

function getChecks(password: string, policy: PolicyShape): Check[] {
  const upper = (password.match(/[A-Z]/g) || []).length;
  const lower = (password.match(/[a-z]/g) || []).length;
  const special = (password.match(/[^A-Za-z0-9]/g) || []).length;

  return [
    { label: `At least ${policy.min_length} characters`, ok: password.length >= policy.min_length },
    { label: `${policy.min_uppercase} uppercase letter(s)`, ok: upper >= policy.min_uppercase },
    { label: `${policy.min_lowercase} lowercase letter(s)`, ok: lower >= policy.min_lowercase },
    { label: `${policy.min_special} special character(s)`, ok: special >= policy.min_special },
  ];
}

function getStrength(checks: Check[]): number {
  return checks.filter(c => c.ok).length;
}

const STRENGTH_COLORS = ['bg-destructive', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

interface Props {
  password: string;
  policy: PolicyShape;
}

export function PasswordStrengthMeter({ password, policy }: Props) {
  if (!password) return null;
  const checks = getChecks(password, policy);
  const strength = getStrength(checks);
  const pct = Math.round((strength / checks.length) * 100);
  const colorClass = STRENGTH_COLORS[strength - 1] || 'bg-muted';
  const label = strength > 0 ? STRENGTH_LABELS[strength - 1] : '';

  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${colorClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {label && (
          <span className={`text-xs font-medium ${strength === 4 ? 'text-green-500' : 'text-muted-foreground'}`}>
            {label}
          </span>
        )}
      </div>
      <ul className="space-y-0.5">
        {checks.map(c => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-green-500' : 'text-muted-foreground'}`}>
            <span>{c.ok ? '✓' : '○'}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
