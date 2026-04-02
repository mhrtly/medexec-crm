import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTargetAudience, VP_PLUS_SENIORITIES } from '@/lib/target-audience';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Link } from 'wouter';
import {
  Users, Building2, UserCheck, TrendingUp, Flame, Target, Eye,
  Calendar, CreditCard, Gift, History, ArrowRight, Repeat,
  ChevronDown, ChevronUp, Star
} from 'lucide-react';

interface CampaignStats {
  paidRegistered: number;
  compedRegistered: number;
  totalRegistered: number;
  pastAttendees: number;
  pastAttendeesRegistered: number;
  multiYearTotal: number;
  multiYearNotRegistered: number;
  eventTargets: number;
  eventTargetsNotRegistered: number;
  targetAudiencePipeline: number;
}

interface GeneralStats {
  totalContacts: number;
  totalOrgs: number;
  medtechOrgs: number;
  warmContacts: number;
  hotContacts: number;
  verifiedContacts: number;
}

interface MultiYearContact {
  id: number;
  full_name: string;
  title: string | null;
  seniority: string | null;
  warmth: string | null;
  email: string | null;
  org_name: string | null;
  is_medtech: boolean | null;
  years_attended: number;
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
  cool: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const CAMPAIGN_GOAL = 120;
const CAMPAIGN_DEADLINE = new Date('2026-04-24T23:59:59');

function getDaysUntil(deadline: Date): number {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function DashboardPage() {
  const { filterActive } = useTargetAudience();
  const [campaign, setCampaign] = useState<CampaignStats | null>(null);
  const [general, setGeneral] = useState<GeneralStats | null>(null);
  const [multiYearList, setMultiYearList] = useState<MultiYearContact[]>([]);
  const [seniorityBreakdown, setSeniorityBreakdown] = useState<{ seniority: string; count: number }[]>([]);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllMultiYear, setShowAllMultiYear] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterActive]);

  async function loadData() {
    setLoading(true);
    try {
      // ── Step 1: Get all tags we need (single query) ──
      const { data: tags } = await supabase
        .from('tags')
        .select('id, name')
        .in('name', [
          'mdxw-2026', 'mdxw-2026-paid', 'mdxw-2026-comped',
          'mdxw-attendee', 'mdxw-multi-year', '2026-event-target'
        ]);

      const tagMap: Record<string, number> = {};
      (tags ?? []).forEach(t => { tagMap[t.name] = t.id; });

      // ── Step 2: Run ALL count queries and data queries in parallel ──
      const [
        paidRes, compedRes, totalRegRes,
        pastAttendeesRes, multiYearRes, eventTargetsRes,
        regContactIdsRes, pastAttendeeIdsRes, multiYearIdsRes, targetIdsRes,
        targetPipelineRes,
        totalContactsRes, totalOrgsRes, medtechOrgsRes,
        warmRes, hotRes, verifiedRes,
        recentRes,
        yearTagsRes
      ] = await Promise.all([
        // Campaign counts
        supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagMap['mdxw-2026-paid'] ?? -1),
        supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagMap['mdxw-2026-comped'] ?? -1),
        supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagMap['mdxw-2026'] ?? -1),
        supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagMap['mdxw-attendee'] ?? -1),
        supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagMap['mdxw-multi-year'] ?? -1),
        supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagMap['2026-event-target'] ?? -1),
        // Contact IDs for intersections
        supabase.from('contact_tags').select('contact_id').eq('tag_id', tagMap['mdxw-2026'] ?? -1),
        supabase.from('contact_tags').select('contact_id').eq('tag_id', tagMap['mdxw-attendee'] ?? -1),
        supabase.from('contact_tags').select('contact_id').eq('tag_id', tagMap['mdxw-multi-year'] ?? -1),
        supabase.from('contact_tags').select('contact_id').eq('tag_id', tagMap['2026-event-target'] ?? -1),
        // Target pipeline
        supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
          .eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true),
        // General stats
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('is_medtech', true),
        // Warm/hot/verified (with filter)
        (() => {
          let q = supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true }).in('warmth', ['warm', 'hot']);
          if (filterActive) q = q.eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true);
          return q;
        })(),
        (() => {
          let q = supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true }).eq('warmth', 'hot');
          if (filterActive) q = q.eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true);
          return q;
        })(),
        (() => {
          let q = supabase.from('contacts').select('*, organizations!inner(is_medtech)', { count: 'exact', head: true }).eq('is_verified', true);
          if (filterActive) q = q.eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true);
          return q;
        })(),
        // Recent contacts
        (() => {
          let q = supabase.from('contacts')
            .select('id, full_name, title, warmth, relationship_status, seniority, created_at, organizations!inner(name, is_medtech)')
            .order('created_at', { ascending: false }).limit(8);
          if (filterActive) q = q.eq('gender', 'Female').in('seniority', VP_PLUS_SENIORITIES).eq('organizations.is_medtech', true);
          return q;
        })(),
        // Year tags for multi-year count
        supabase.from('tags').select('id, name').like('name', 'mdxw-20%')
          .not('name', 'in', '("mdxw-2026","mdxw-2026-paid","mdxw-2026-comped")'),
      ]);

      // ── Compute intersections ──
      const regIds = new Set((regContactIdsRes.data ?? []).map(r => r.contact_id));
      const pastIds = (pastAttendeeIdsRes.data ?? []).map(r => r.contact_id);
      const pastRegistered = pastIds.filter(id => regIds.has(id)).length;
      const multiNotReg = (multiYearIdsRes.data ?? []).filter(r => !regIds.has(r.contact_id));
      const targetsNotReg = (targetIdsRes.data ?? []).filter(r => !regIds.has(r.contact_id));

      setCampaign({
        paidRegistered: paidRes.count ?? 0,
        compedRegistered: compedRes.count ?? 0,
        totalRegistered: totalRegRes.count ?? 0,
        pastAttendees: pastAttendeesRes.count ?? 0,
        pastAttendeesRegistered: pastRegistered,
        multiYearTotal: multiYearRes.count ?? 0,
        multiYearNotRegistered: multiNotReg.length,
        eventTargets: eventTargetsRes.count ?? 0,
        eventTargetsNotRegistered: targetsNotReg.length,
        targetAudiencePipeline: targetPipelineRes.count ?? 0,
      });

      setGeneral({
        totalContacts: totalContactsRes.count ?? 0,
        totalOrgs: totalOrgsRes.count ?? 0,
        medtechOrgs: medtechOrgsRes.count ?? 0,
        warmContacts: warmRes.count ?? 0,
        hotContacts: hotRes.count ?? 0,
        verifiedContacts: verifiedRes.count ?? 0,
      });

      setRecentContacts((recentRes.data ?? []) as unknown as RecentContact[]);

      // ── Seniority breakdown - batch query ──
      const yearTagIds = (yearTagsRes.data ?? []).filter(t => /^mdxw-20\d{2}$/.test(t.name)).map(t => t.id);

      const seniorityPromises = VP_PLUS_SENIORITIES.map(s =>
        supabase.from('contacts')
          .select('*, organizations!inner(is_medtech)', { count: 'exact', head: true })
          .eq('gender', 'Female').eq('seniority', s).eq('organizations.is_medtech', true)
      );
      const seniorityResults = await Promise.all(seniorityPromises);
      const seniorityData = VP_PLUS_SENIORITIES.map((s, i) => ({
        seniority: s,
        count: seniorityResults[i].count ?? 0,
      })).sort((a, b) => b.count - a.count);
      setSeniorityBreakdown(seniorityData);

      // ── Multi-year contacts not registered ──
      if (multiNotReg.length > 0) {
        const notRegIds = multiNotReg.map(r => r.contact_id);
        // Fetch contacts in parallel batches
        const batchSize = 50;
        const batches: number[][] = [];
        for (let i = 0; i < notRegIds.length; i += batchSize) {
          batches.push(notRegIds.slice(i, i + batchSize));
        }
        const batchResults = await Promise.all(
          batches.map(batch =>
            supabase.from('contacts')
              .select('id, full_name, title, seniority, warmth, email, org_id, organizations(name, is_medtech)')
              .in('id', batch)
          )
        );
        const allContacts: MultiYearContact[] = [];
        for (const res of batchResults) {
          for (const c of (res.data ?? [])) {
            allContacts.push({
              id: c.id,
              full_name: c.full_name,
              title: c.title,
              seniority: c.seniority,
              warmth: c.warmth,
              email: c.email,
              org_name: (c.organizations as any)?.name ?? null,
              is_medtech: (c.organizations as any)?.is_medtech ?? null,
              years_attended: 0,
            });
          }
        }

        // Batch year count: get all contact_tags for these contacts + year tags in one query
        if (yearTagIds.length > 0 && allContacts.length > 0) {
          const { data: yearTagData } = await supabase
            .from('contact_tags')
            .select('contact_id, tag_id')
            .in('contact_id', notRegIds)
            .in('tag_id', yearTagIds);
          
          const yearCountMap = new Map<number, number>();
          for (const row of (yearTagData ?? [])) {
            yearCountMap.set(row.contact_id, (yearCountMap.get(row.contact_id) ?? 0) + 1);
          }
          for (const contact of allContacts) {
            contact.years_attended = yearCountMap.get(contact.id) ?? 0;
          }
        }

        const warmthOrder: Record<string, number> = { hot: 0, warm: 1, cool: 2, cold: 3 };
        allContacts.sort((a, b) => {
          const wa = warmthOrder[a.warmth ?? 'cold'] ?? 4;
          const wb = warmthOrder[b.warmth ?? 'cold'] ?? 4;
          if (wa !== wb) return wa - wb;
          return b.years_attended - a.years_attended;
        });
        setMultiYearList(allContacts);
      } else {
        setMultiYearList([]);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const daysLeft = getDaysUntil(CAMPAIGN_DEADLINE);
  const paidPct = campaign ? Math.min((campaign.paidRegistered / CAMPAIGN_GOAL) * 100, 100) : 0;
  const needed = campaign ? Math.max(CAMPAIGN_GOAL - campaign.paidRegistered, 0) : 0;
  const perDay = daysLeft > 0 ? (needed / daysLeft).toFixed(1) : '—';
  const visibleMultiYear = showAllMultiYear ? multiYearList : multiYearList.slice(0, 10);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filterActive ? 'Showing target audience — women VP+ at medtech' : 'Showing all contacts'}
          </p>
        </div>
      </div>

      {/* Campaign Progress */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold">Registration Campaign</h2>
              <p className="text-xs text-muted-foreground">Goal: {CAMPAIGN_GOAL} paid registrations by April 24</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-semibold tabular-nums">{daysLeft}</span>
                  <span className="text-muted-foreground text-xs">days left</span>
                </div>
                {needed > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">~{perDay}/day needed</p>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{campaign?.paidRegistered ?? 0}</span>
                <span className="text-sm text-muted-foreground">/ {CAMPAIGN_GOAL} paid</span>
              </div>
              <span className="text-sm font-medium tabular-nums">{Math.round(paidPct)}%</span>
            </div>
            <Progress value={paidPct} className="h-3" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border/50">
            <MiniMetric icon={CreditCard} label="Paid" value={campaign?.paidRegistered ?? 0} color="text-green-600 dark:text-green-400" />
            <MiniMetric icon={Gift} label="Comped" value={campaign?.compedRegistered ?? 0} color="text-violet-600 dark:text-violet-400" />
            <MiniMetric icon={Users} label="Total Registered" value={campaign?.totalRegistered ?? 0} color="text-blue-600 dark:text-blue-400" subtitle="paid + comped" />
            <MiniMetric icon={TrendingUp} label="Still Needed" value={needed} color={needed > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'} />
          </div>
        </CardContent>
      </Card>

      {/* Outreach Pipeline */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Outreach Pipeline</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Target Audience" value={campaign?.targetAudiencePipeline ?? 0} icon={Target} color="text-primary" subtitle="Women VP+ at MedTech" />
          <KpiCard label="Event Targets" value={campaign?.eventTargets ?? 0} icon={Eye} color="text-indigo-600 dark:text-indigo-400" subtitle={`${campaign?.eventTargetsNotRegistered ?? 0} not yet registered`} />
          <KpiCard label="Past Attendees" value={campaign?.pastAttendees ?? 0} icon={History} color="text-sky-600 dark:text-sky-400" subtitle={`${campaign?.pastAttendeesRegistered ?? 0} registered for 2026`} />
          <KpiCard label="Multi-Year Attendees" value={campaign?.multiYearTotal ?? 0} icon={Repeat} color="text-amber-600 dark:text-amber-400" subtitle={`${campaign?.multiYearNotRegistered ?? 0} not registered`} />
        </div>
      </div>

      {/* Multi-Year Not Registered */}
      {multiYearList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Multi-Year Attendees — Not Registered for 2026
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {multiYearList.length} loyal attendees who haven't registered yet — high-priority outreach
                </p>
              </div>
              <Badge variant="outline" className="tabular-nums">{multiYearList.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Title</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Organization</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Years</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warmth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {visibleMultiYear.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/contacts/${c.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                          {c.full_name}
                        </Link>
                        {c.email && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.email}</p>}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground truncate block max-w-[220px]">{c.title ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{c.org_name ?? '—'}</span>
                          {c.is_medtech && <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/30 text-primary">MT</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center"><span className="text-xs font-semibold tabular-nums">{c.years_attended}</span></td>
                      <td className="px-4 py-2.5 text-center">
                        {c.warmth ? (
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${warmthColor[c.warmth] ?? ''}`}>{c.warmth}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {multiYearList.length > 10 && (
              <button
                onClick={() => setShowAllMultiYear(!showAllMultiYear)}
                className="w-full py-2.5 text-xs font-medium text-primary hover:bg-muted/30 transition-colors flex items-center justify-center gap-1 border-t border-border/50"
              >
                {showAllMultiYear ? <>Show less <ChevronUp className="w-3.5 h-3.5" /></> : <>Show all {multiYearList.length} <ChevronDown className="w-3.5 h-3.5" /></>}
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* General KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {filterActive ? 'Target Audience Overview' : 'Database Overview'}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {filterActive ? (
            <>
              <KpiCard label="Target Audience" value={campaign?.targetAudiencePipeline ?? 0} icon={Target} color="text-primary" subtitle="Women VP+ at MedTech" />
              <KpiCard label="Warm / Hot" value={general?.warmContacts ?? 0} icon={Flame} color="text-orange-600 dark:text-orange-400" subtitle={`${general?.hotContacts ?? 0} hot`} />
              <KpiCard label="Verified" value={general?.verifiedContacts ?? 0} icon={UserCheck} color="text-green-600 dark:text-green-400" />
              <KpiCard label="MedTech Orgs" value={general?.medtechOrgs ?? 0} icon={Building2} color="text-violet-600 dark:text-violet-400" subtitle={`of ${general?.totalOrgs ?? 0} total`} />
            </>
          ) : (
            <>
              <KpiCard label="Total Contacts" value={general?.totalContacts ?? 0} icon={Users} color="text-blue-600 dark:text-blue-400" />
              <KpiCard label="Target Audience" value={campaign?.targetAudiencePipeline ?? 0} icon={Target} color="text-primary" subtitle="Women VP+ MedTech" />
              <KpiCard label="Organizations" value={general?.totalOrgs ?? 0} icon={Building2} color="text-violet-600 dark:text-violet-400" />
              <KpiCard label="Warm / Hot" value={general?.warmContacts ?? 0} icon={Flame} color="text-orange-600 dark:text-orange-400" />
            </>
          )}
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
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
                      <div className="h-full bg-primary/20 rounded flex items-center px-2" style={{ width: `${Math.max((s.count / maxCount) * 100, 8)}%` }}>
                        <span className="text-xs font-semibold tabular-nums">{s.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{filterActive ? 'Recent Target Contacts' : 'Recent Contacts'}</CardTitle>
              <Link href="/contacts" className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentContacts.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{contact.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{contact.title ?? 'No title'} {contact.organizations ? `· ${(contact.organizations as any).name}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {contact.warmth && contact.warmth !== 'cold' && (
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${warmthColor[contact.warmth] ?? ''}`}>{contact.warmth}</Badge>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
              {recentContacts.length === 0 && (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">No contacts found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Helper Components ── */
function MiniMetric({ icon: Icon, label, value, color, subtitle }: {
  icon: any; label: string; value: number; color: string; subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`w-4 h-4 ${color} shrink-0`} />
      <div>
        <p className="text-lg font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
        {subtitle && <p className="text-[9px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, subtitle }: {
  label: string; value: number; icon: any; color: string; subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
            <p className="text-xs font-medium text-muted-foreground mt-1">{label}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={`w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
