import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, Users, ShieldCheck, LogOut, User, ChevronDown, Settings, ShieldAlert, Server } from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={16} /> },
  { label: 'Security Events', path: '/security', icon: <ShieldAlert size={16} /> },
  { label: 'Server Metrics', path: '/metrics', icon: <Server size={16} />, permission: 'view_metrics' },
  { label: 'Users & Roles', path: '/users', icon: <Users size={16} />, permission: 'manage_users' },
  { label: 'Password Policy', path: '/password-policy', icon: <ShieldCheck size={16} />, permission: 'manage_policy' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter(n => !n.permission || hasPermission(n.permission));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-4 px-4 h-14">
          <span className="font-bold text-primary tracking-tight mr-2 whitespace-nowrap text-lg">
            APISTRATOR
          </span>

          <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
            {visibleNav.map(n => {
              const active = n.path === '/' ? location === '/' : location.startsWith(n.path);
              return (
                <Link key={n.path} href={n.path}>
                  <a className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                    ${active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}>
                    {n.icon}
                    {n.label}
                  </a>
                </Link>
              );
            })}
          </nav>

          <div className="relative ml-auto">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                {user?.fullName?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">{user?.fullName}</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium truncate">{user?.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    <span className="inline-block mt-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{user?.role}</span>
                  </div>
                  <Link href="/profile">
                    <a className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                       onClick={() => setMenuOpen(false)}>
                      <User size={14} /> My Profile
                    </a>
                  </Link>
                  <Link href="/log-config">
                    <a className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                       onClick={() => setMenuOpen(false)}>
                      <Settings size={14} /> Log Configuration
                    </a>
                  </Link>
                  <div className="border-t border-border mt-1">
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
