/**
 * §1 — Scope Report
 *
 * Defines the migration perimeter based on config/rules.json exclusions.
 * Outputs the list of in-scope projects and spaces.
 *
 * Pure transformer — no API calls, no storage side effects.
 */

import type { MigrationRules } from './types';
import { isProjectInScope, isSpaceInScope } from './engine';

export interface ScopeReportInput {
  allProjectKeys: string[];
  allSpaceKeys: string[];
  jiraProducts: string[]; // e.g. ['jira-software', 'jira-servicedesk']
  confluenceEnabled: boolean;
}

export interface ScopeReportSection {
  sectionId: '01';
  title: 'Migration Scope';
  inScopeProjects: string[];
  outOfScopeProjects: string[];
  inScopeSpaces: string[];
  outOfScopeSpaces: string[];
  productsInScope: string[];
  summary: {
    totalProjects: number;
    inScopeProjectCount: number;
    totalSpaces: number;
    inScopeSpaceCount: number;
  };
}

export function generateScopeReport(
  input: ScopeReportInput,
  rules: MigrationRules
): ScopeReportSection {
  const inScopeProjects = input.allProjectKeys.filter(k => isProjectInScope(k, rules));
  const outOfScopeProjects = input.allProjectKeys.filter(k => !isProjectInScope(k, rules));
  const inScopeSpaces = input.allSpaceKeys.filter(k => isSpaceInScope(k, rules));
  const outOfScopeSpaces = input.allSpaceKeys.filter(k => !isSpaceInScope(k, rules));

  return {
    sectionId: '01',
    title: 'Migration Scope',
    inScopeProjects,
    outOfScopeProjects,
    inScopeSpaces,
    outOfScopeSpaces,
    productsInScope: [
      ...input.jiraProducts,
      ...(input.confluenceEnabled ? ['confluence'] : []),
    ],
    summary: {
      totalProjects: input.allProjectKeys.length,
      inScopeProjectCount: inScopeProjects.length,
      totalSpaces: input.allSpaceKeys.length,
      inScopeSpaceCount: inScopeSpaces.length,
    },
  };
}
