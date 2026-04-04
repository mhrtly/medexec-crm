import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Building2, Users, UserCheck, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';

// Map promo code prefixes to canonical sponsor names
const PROMO_TO_SPONSOR: Record<string, string> = {
  JANDJ: 'Johnson & Johnson',
  PHILIPS: 'Philips',
  BSCI: 'Boston Scientific',
  ZS: 'ZS Associates',
  PWC: 'PwC',
  BCG: 'Boston Consulting Group',
  GE: 'GE HealthCare',
  BAXTER: 'Baxter',
  INTEGRA: 'Integra LifeSciences',
  INSULET: 'Insulet',
  OLYMPUS: 'Olympus',
  SOLVENTUM: 'Solventum',
  SOLV: 'Solventum',
  MCKINSEY: 'McKinsey',
  VIZIENT: 'Vizient',
  DLAPIPER: 'DLA Piper',
  GOODWIN: 'Goodwin',
  LANDW: 'Latham & Watkins',
  HALLORAN: 'Halloran',
  MEDIVANTAGE: 'MediVantage',
  LSI: 'LSI',
  MASSMEDIC: 'MassMEDIC',
  MLSC: 'Mass Life Sciences Center',
  SMITHNEPHEW: 'Smith+Nephew',
  AVANIA: 'Avania',
  SPONSOR2021: '(2021 Sponsors)',
  CHAMELEON: 'Chameleon Strategies',
};

// Ticket type keywords that indicate sponsorship tiers
const TIER_KEYWORDS: Record<string, string> = {
  diamond: 'Diamond',
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  emerald: 'Emerald',
  ruby: 'Ruby',
  sapphire: 'Sapphire',
  'industry partner': 'Industry Partner',
};

interface SponsorReg {
  id: number;
  order_number: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  conference_year: number;
  ticket_type: string | null;
  promo_code: string | null;
  is_paid: boolean;
  amount_paid: number;
  contact_id: number | null;
  contacts: { id: number; full_name: string; warmth: string | null } | null;
}

interface SponsorGroup {
  name: string;
  tier: string | null;
  attendees: SponsorReg[];
  totalPaid: number;
  compCount: number;
  paidCount: number;
}

function getCanonicalSponsor(promoCode: string | null, company: string | null): string {
  if (promoCode) {
    const base = promoCode.toUpperCase().replace(/\d+$/, '');
    if (PROMO_TO_SPONSOR[base]) return PROMO_TO_SPONSOR[base];
  }
  return company || 'Unknown Sponsor';
}

function getTier(ticketType: string | null): string | null {
  if (!ticketType) return null;
  const lower = ticketType.toLowerCase();
  for (const [keyword, tier] of Object.entries(TIER_KEYWORDS)) {
    if (lower.includes(keyword)) return tier;
  }
  return null;
}

const tierColors: Record<string, string> = {
  Diamond: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  Platinum: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  Gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Silver: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  Bronze: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Ruby: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Sapphire: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Industry Partner': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

export default function SponsorsPage() {
  const [allRegs, setAllRegs] = useState<SponsorReg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState<string>('2026');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [expandedSponsors, setExpandedSponsors] = useState<Set<string>>(new Set());

  const loadSponsors = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('registrations')
      .select('*, contacts(id, full_name, warmth)')
      .eq('comp_type', 'sponsor')
      .order('order_number', { ascending: false });

    if (error) {
      console.error('Error loading sponsors:', error);
      setAllRegs([]);
    } else {
      setAllRegs(data || []);
      const years = [...new Set((data || []).map(r => r.conference_year))].sort((a, b) => b - a);
      setAvailableYears(years);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSponsors(); }, [loadSponsors]);

  // Filter and group
  const filteredRegs = allRegs.filter(r => {
    if (filterYear !== 'all' && r.conference_year !== parseInt(filterYear)) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = getCanonicalSponsor(r.promo_code, r.company).toLowerCase();
      const company = (r.company || '').toLowerCase();
      const person = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
      return name.includes(q) || company.includes(q) || person.includes(q);
    }
    return true;
  });

  // Group by canonical sponsor
  const sponsorMap = new Map<string, SponsorGroup>();
  for (const reg of filteredRegs) {
    const name = getCanonicalSponsor(reg.promo_code, reg.company);
    if (!sponsorMap.has(name)) {
      sponsorMap.set(name, {
        name,
        tier: getTier(reg.ticket_type),
        attendees: [],
        totalPaid: 0,
        compCount: 0,
        paidCount: 0,
      });
    }
    const group = sponsorMap.get(name)!;
    group.attendees.push(reg);
    group.totalPaid += Number(reg.amount_paid) || 0;
    if (reg.is_paid) group.paidCount++;
    else group.compCount++;
    // Upgrade tier if found
    const regTier = getTier(reg.ticket_type);
    if (regTier && !group.tier) group.tier = regTier;
  }

  const sponsors = Array.from(sponsorMap.values()).sort((a, b) => {
    // Sort by total paid desc, then attendee count desc
    if (b.totalPaid !== a.totalPaid) return b.totalPaid - a.totalPaid;
    return b.attendees.length - a.attendees.length;
  });

  const toggleExpand = (name: string) => {
    setExpandedSponsors(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalSponsors = sponsors.length;
  const totalAttendees = filteredRegs.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sponsors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sponsorship registrations and attendees by company
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSponsors}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Building2 className="w-3.5 h-3.5" /> Sponsor Companies
            </div>
            <p className="text-2xl font-bold">{totalSponsors}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Users className="w-3.5 h-3.5" /> Sponsor Attendees
            </div>
            <p className="text-2xl font-bold">{totalAttendees}</p>
          </CardContent>
        </Card>
      </div>

      {/* Year Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Tabs value={filterYear} onValueChange={setFilterYear}>
          <TabsList>
            <TabsTrigger value="all">All Years</TabsTrigger>
            {availableYears.map(y => (
              <TabsTrigger key={y} value={String(y)}>{y}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative ml-auto max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search sponsors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      {/* Sponsor List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : sponsors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sponsors found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sponsors.map((sponsor) => {
            const isExpanded = expandedSponsors.has(sponsor.name);
            return (
              <Card key={sponsor.name} className="overflow-hidden">
                <button
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(sponsor.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{sponsor.name}</span>
                      {sponsor.tier && (
                        <Badge className={`text-[10px] font-medium border-0 ${
                          tierColors[sponsor.tier] || 'bg-gray-100 text-gray-700'
                        }`}>
                          {sponsor.tier}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{sponsor.attendees.length} attendee{sponsor.attendees.length !== 1 ? 's' : ''}</span>
                      {sponsor.compCount > 0 && (
                        <span>{sponsor.compCount} comp</span>
                      )}
                      {sponsor.paidCount > 0 && (
                        <span>{sponsor.paidCount} paid</span>
                      )}
                      {sponsor.totalPaid > 0 && (
                        <span className="font-mono">${sponsor.totalPaid.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/20">
                          <th className="text-left px-5 py-2 font-medium text-xs">Name</th>
                          <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell">Title</th>
                          <th className="text-left px-4 py-2 font-medium text-xs hidden lg:table-cell">Company</th>
                          <th className="text-left px-4 py-2 font-medium text-xs">Promo</th>
                          <th className="text-left px-4 py-2 font-medium text-xs hidden sm:table-cell">CRM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sponsor.attendees.map((reg) => (
                          <tr key={reg.id} className="border-t border-muted/30 hover:bg-muted/10">
                            <td className="px-5 py-2.5">
                              <div className="font-medium text-xs">
                                {reg.first_name} {reg.last_name}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                                {reg.email}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                              {reg.title || '—'}
                            </td>
                            <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">
                              {reg.company || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              {reg.promo_code ? (
                                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                  {reg.promo_code}
                                </code>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  {reg.ticket_type || '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 hidden sm:table-cell">
                              {reg.contact_id ? (
                                <Link
                                  href={`/contacts/${reg.contact_id}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  {reg.contacts?.full_name || `#${reg.contact_id}`}
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">No match</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Year-over-year summary */}
      {filterYear === 'all' && availableYears.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sponsors by Year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 font-medium">Year</th>
                    <th className="text-right px-3 py-2 font-medium">Companies</th>
                    <th className="text-right px-3 py-2 font-medium">Attendees</th>
                  </tr>
                </thead>
                <tbody>
                  {availableYears.map(year => {
                    const yearRegs = allRegs.filter(r => r.conference_year === year);
                    const yearCompanies = new Set(yearRegs.map(r => getCanonicalSponsor(r.promo_code, r.company)));
                    return (
                      <tr key={year} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{year}</td>
                        <td className="px-3 py-2 text-right">{yearCompanies.size}</td>
                        <td className="px-3 py-2 text-right">{yearRegs.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
