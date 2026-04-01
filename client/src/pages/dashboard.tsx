import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, Eye, UserCheck, TrendingUp, Flame } from 'lucide-react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  totalContacts: number;
  womenContacts: number;
  totalOrgs: number;
  totalSightings: number;
  verifiedContacts: number;
  warmContacts: number;
}

interface RecentSighting {
  id: number;
  contact_id: number;
  source_type: string;
  source_name: string | null;
  context: string | null;
  found_at: string;
  contacts: { full_name: string; title: string | null } | null;
}

interface RecentContact {
  id: number;
  full_name: string;
  title: string | null;
  warmth: string | null;
  relationship_status: string | null;
  created_at: string;
  organizations: { name: string } | null;
}

const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  warm: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSightings, setRecentSightings] = useState<RecentSighting[]>([]);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [
      { count: totalContacts },
      { count: womenContacts },
      { count: totalOrgs },
      { count: totalSightings },
      { count: verifiedContacts },
      { count: warmContacts },
      { data: sightings },
      { data: contacts },
    ] = await Promise.all([
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('gender', 'Female'),
      supabase.from('organizations').select('*', { count: 'exact', head: true }),
      supabase.from('sightings').select('*', { count: 'exact', head: true }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('is_verified', true),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).in('warmth', ['warm', 'hot']),
      supabase.from('sightings').select('id, contact_id, source_type, source_name, context, found_at, contacts(full_name, title)').order('found_at', { ascending: false }).limit(8),
      supabase.from('contacts').select('id, full_name, title, warmth, relationship_status, created_at, organizations(name)').order('created_at', { ascending: false }).limit(8),
    ]);

    setStats({
      totalContacts: totalContacts ?? 0,
      womenContacts: womenContacts ?? 0,
      totalOrgs: totalOrgs ?? 0,
      totalSightings: totalSightings ?? 0,
      verifiedContacts: verifiedContacts ?? 0,
      warmContacts: warmContacts ?? 0,
    });
    setRecentSightings((sightings ?? []) as unknown as RecentSighting[]);
    setRecentContacts((contacts ?? []) as unknown as RecentContact[]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Contacts', value: stats?.totalContacts ?? 0, icon: Users, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Women Executives', value: stats?.womenContacts ?? 0, icon: UserCheck, color: 'text-primary' },
    { label: 'Organizations', value: stats?.totalOrgs ?? 0, icon: Building2, color: 'text-violet-600 dark:text-violet-400' },
    { label: 'Sightings', value: stats?.totalSightings ?? 0, icon: Eye, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Verified', value: stats?.verifiedContacts ?? 0, icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
    { label: 'Warm / Hot', value: stats?.warmContacts ?? 0, icon: Flame, color: 'text-orange-600 dark:text-orange-400' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">MedExecWomen executive intelligence overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{kpi.value.toLocaleString()}</p>
                  </div>
                  <Icon className={`w-8 h-8 ${kpi.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two-column content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent contacts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Contacts</CardTitle>
              <Link href="/contacts" className="text-xs text-primary hover:underline" data-testid="link-all-contacts">View all</Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentContacts.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  data-testid={`recent-contact-${contact.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{contact.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.title}{contact.organizations ? ` at ${(contact.organizations as any).name}` : ''}
                    </p>
                  </div>
                  {contact.warmth && (
                    <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 shrink-0 ml-2 ${warmthColor[contact.warmth] ?? ''}`}>
                      {contact.warmth}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent sightings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Sightings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentSightings.map((s) => (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{s.source_type}</Badge>
                    <p className="text-sm font-medium truncate">
                      {s.contacts ? (s.contacts as any).full_name : `Contact #${s.contact_id}`}
                    </p>
                  </div>
                  {(s.context || s.source_name) && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {s.source_name}{s.context ? ` — ${s.context}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
