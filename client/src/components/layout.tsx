import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import {
  LayoutDashboard,
  Users,
  Building2,
  Tag,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/organizations', label: 'Organizations', icon: Building2 },
  { path: '/tags', label: 'Tags', icon: Tag },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" className="shrink-0" aria-label="MedExecWomen">
            <rect x="4" y="4" width="40" height="40" rx="10" stroke="hsl(4, 72%, 65%)" strokeWidth="2.5" fill="none"/>
            <path d="M14 32V18l5 8 5-8v14" stroke="hsl(220, 15%, 88%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M29 18h7M29 25h5M29 32h7" stroke="hsl(4, 72%, 65%)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight whitespace-nowrap">MedExecWomen</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            const Icon = item.icon;
            const link = (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                } ${collapsed ? 'justify-center' : ''}`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {!collapsed && user && (
            <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50 truncate">
              {user.email}
            </div>
          )}
          <div className="flex items-center gap-1">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  onClick={() => setDark(!dark)}
                  data-testid="button-theme"
                >
                  {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{dark ? 'Light mode' : 'Dark mode'}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  onClick={() => setCollapsed(!collapsed)}
                  data-testid="button-collapse"
                >
                  {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{collapsed ? 'Expand' : 'Collapse'}</TooltipContent>
            </Tooltip>

            {!collapsed && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 ml-auto"
                    onClick={signOut}
                    data-testid="button-signout"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
