import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTargetAudience, VP_PLUS_SENIORITIES } from '@/lib/target-audience';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, UserCheck, TrendingUp, Flame, Target, Eye, Calendar } from 'lucide-react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

interface Stats {
  totalContacts: number;
  targetAudience: number;
  totalOrgs: number;
  medtechOrgs: number;
  verifiedContacts: number;
  warmContacts: number;
  hotContacts: number;
  registeredCount: number;
}

interface RecentContact {
  id: number;
  full_name: string;
  title: string | null;
  warmth: string | null;
  relationship_status: string | null;
  seniority: string | null;
  created_at: string;
  organizations: { name: string } | null;
}

const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  warm: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function DashboardPage() {
  const { filterActive } = useTargetAudience();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [seniorityBreakdown, setSeniorityBreakdown] = useState<{ seniority: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [filterActive]);

  async function loadData() {
    setLoading(true);

    // Base queries for target audience (always computed for the campaign tracker)
    const [
      { count: totalContacts },
      { count: targetAudience },
      { count: totalOrgs },
      { count: medtechOrgs },
      { count: warmContacts },
      { count: hotContacts },
      { count: registeredCount },
    ] = await Promise.all([
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      // Target audience: women VP+ at medtech orgs
      supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
        .eq('gender', 'Female')
        .in('seniority', VP_PLUS_SENIORITIES)
        .eq('organizations.is_medtech', true),
      supabase.from('organizations').select('*', { count: 'exact', head: true }),
      supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('is_medtech', true),
      // Warm/hot from target audience
      supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
        .eq('gender', 'Female')
        .in('seniority', VP_PLUS_SENIORITIES)
        .eq('organizations.is_medtech', true)
        .in('warmth', ['warm', 'hot']),
      supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
        .eq('gender', 'Female')
        .in('seniority', VP_PLUS_SENIORITIES)
        .eq('organizations.is_medtech', true)
        .eq('warmth', 'hot'),
      // "Registered" = has relationship_status of 'engaged' or 'active' or 'vip' or 'speaker'
      supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
        .eq('gender', 'Female')
        .in('seniority', VP_PLUS_SENIORITIES)
        .eq('organizations.is_medtech', true)
        .in('relationship_status', ['engaged', 'active', 'vip', 'speaker']),
    ]);

    // Verified count based on filter
    let verifiedQuery = supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true }).eq('is_verified', true);
    if (filterActive) {
      verifiedQuery = verifiedQuery.eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true);
    }
    const { count: verifiedContacts } = await verifiedQuery;

    // Seniority breakdown for target audience
    const seniorityData: { seniority: string; count: number }[] = [];
    for (const s of VP_PLUS_SENIORITIES) {
      const { count } = await supabase.from('contacts')
        .select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
        .eq('gender', 'Female')
        .eq('seniority', s)
        .eq('organizations.is_medtech', true);
      seniorityData.push({ seniority: s, count: count ?? 0 });
    }
    setSeniorityBreakdown(seniorityData.sort((a, b) => b.count - a.count));

    // Recent contacts based on filter
    let recentQuery = supabase.from('contacts')
      .select('id, full_name, title, warmth, relationship_status, seniority, created_at, organizations!inner(name, is_medtech)')
      .order('created_at', { ascending: false })
      .limit(8);
    if (filterActive) {
      recentQuery = recentQuery.eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true);
    }
    const { data: contacts } = await recentQuery;

    setStats({
      totalContacts: totalContacts ?? 0,
      targetAudience: targetAudience ?? 0,
      totalOrgs: totalOrgs ?? 0,
      medtechOrgs: medtechOrgs ?? 0,
      verifiedContacts: verifiedContacts ?? 0,
      warmContacts: warmContacts ?? 0,
      hotContacts: hotContacts ?? 0,
      registeredCount: registeredCount ?? 0,
    });
    setRecentContacts((contacts ?? []) as unknown as RecentContact[]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const CAMPAIGN_GOAL = 79;
  const registered = stats?.registeredCount ?? 0;
  const progressPct = Math.min((registered / CAMPAIGN_GOAL) * 100, 100);
  const daysLeft = 26; // Campaign countdown

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filterActive ? 'Showing target audience — women VP+ at medtech' : 'Showing all contacts'}
          </p>
        </div>
      </div>

      {/* Campaign Progress Card */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Campaign: 79 Women in 26 Days</h2>
              <p className="text-xs text-muted-foreground">Get 79 women VP+ executives to register</p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium tabular-nums">{daysLeft} days left</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{registered}</span>
                <span className="text-sm text-muted-foreground">/ {CAMPAIGN_GOAL} registered</span>
              </div>
              <span className="text-sm font-medium tabular-nums">{Math.round(progressPct)}%</span>
            </div>
            <Progress value={progressPct} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {CAMPAIGN_GOAL - registered > 0
                ? `${CAMPAIGN_GOAL - registered} more registrations needed`
                : 'Goal reached!'
              } — {(stats?.targetAudience ?? 0).toLocaleString()} contacts in target audience pipeline
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {filterActive ? (
          <>
            <KpiCard
              label="Target Audience"
              value={stats?.targetAudience ?? 0}
              icon={Target}
              color="text-primary"
              subtitle="Women VP+ at MedTech"
            />
            <KpiCard
              label="Warm / Hot"
              value={stats?.warmContacts ?? 0}
              icon={Flame}
              color="text-orange-600 dark:text-orange-400"
              subtitle={`${stats?.hotContacts ?? 0} hot`}
            />
            <KpiCard
              label="Verified"
              value={stats?.verifiedContacts ?? 0}
              icon={UserCheck}
              color="text-green-600 dark:text-green-400"
            />
            <KpiCard
              label="MedTech Orgs"
              value={stats?.medtechOrgs ?? 0}
              icon={Building2}
              color="text-violet-600 dark:text-violet-400"
              subtitle={`of ${stats?.totalOrgs ?? 0} total`}
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Total Contacts"
              value={stats?.totalContacts ?? 0}
              icon={Users}
              color="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              label="Target Audience"
              value={stats?.targetAudience ?? 0}
              icon={Target}
              color="text-primary"
              subtitle="Women VP+ MedTech"
            />
            <KpiCard
              label="Organizations"
              value={stats?.totalOrgs ?? 0}
              icon={Building2}
              color="text-violet-600 dark:text-violet-400"
            />
            <KpiCard
              label="Warm / Hot"
              value={stats?.warmContacts ?? 0}
              icon={Flame}
              color="text-orange-600 dark:text-orange-400"
            />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Seniority Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Target Audience by Seniority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {seniorityBreakdown.map((s) => {
                const maxCount = Math.max(...seniorityBreakdown.map(x => x.count), 1);
                return (
                  <div key={s.seniority} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-24 text-right text-muted-foreground shrink-0">{s.seniority}</span>
                    <div className="flex-1 h-6 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-primary/20 rounded flex items-center px-2"
                        style={{ width: `${Math.max((s.count / maxCount) * 100, 8)}%` }}
                      >
                        <span className="text-xs font-semibold tabular-nums">{s.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent contacts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {filterActive ? 'Recent Target Contacts' : 'Recent Contacts'}
              </CardTitle>
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
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {contact.seniority && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{contact.seniority}</Badge>
                    )}
                    {contact.warmth && (
                      <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${warmthColor[contact.warmth] ?? ''}`}>
                        {contact.warmth}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, subtitle }: {
  label: string;
  value: number;
  icon: any;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString()}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <Icon className={`w-8 h-8 ${color} opacity-80`} />
        </div>
      </CardContent>
    </Card>
  );
}
