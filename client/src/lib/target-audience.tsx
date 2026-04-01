import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Target Audience Filter
 * 
 * Default: Women, VP+ seniority, at medtech organizations
 * VP+ = VP, SVP/EVP, C-Suite, Board, President/GM
 * 
 * "Show All" toggle overrides to show entire database
 */

export const VP_PLUS_SENIORITIES = ['VP', 'SVP/EVP', 'C-Suite', 'Board', 'President/GM'];

interface TargetAudienceContextType {
  /** When true, only show target audience (women VP+ at medtech). When false, show all. */
  filterActive: boolean;
  setFilterActive: (active: boolean) => void;
}

const TargetAudienceContext = createContext<TargetAudienceContextType | undefined>(undefined);

export function TargetAudienceProvider({ children }: { children: ReactNode }) {
  const [filterActive, setFilterActive] = useState(true); // ON by default

  return (
    <TargetAudienceContext.Provider value={{ filterActive, setFilterActive }}>
      {children}
    </TargetAudienceContext.Provider>
  );
}

export function useTargetAudience() {
  const context = useContext(TargetAudienceContext);
  if (context === undefined) {
    throw new Error('useTargetAudience must be used within a TargetAudienceProvider');
  }
  return context;
}

/**
 * Apply target audience filters to a Supabase query.
 * Requires a join with organizations (for is_medtech).
 * 
 * For contacts queries that already select organizations(...)
 * the medtech filter needs to be applied via the organizations relation.
 */
export function applyTargetFilters(query: any, active: boolean) {
  if (!active) return query;
  
  query = query.eq('gender', 'Female');
  query = query.in('seniority', VP_PLUS_SENIORITIES);
  // medtech filter via the organizations join
  query = query.eq('organizations.is_medtech', true);
  
  return query;
}
