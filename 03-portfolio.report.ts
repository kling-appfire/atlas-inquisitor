/**
 * §3 — Project/Space Portfolio Report
 *
 * Classifies every Jira project and Confluence space.
 * Produces the "virtual deletion set" used by §6 config-cleanup.
 *
 * Pure transformer — no API calls, no storage side effects.
 */

import type { MigrationRules } from '../rules/types';
import {
  classifyProject,
  isProjectInScope,
  isSpaceInScope,
  type ProjectStatus,
  type MigrationWave,
} from '../rules/engine';

export interface RawProject {
  key: string;
  name: string;
  projectTypeKey: 'software' | 'service_desk' | 'business';
  leadDisplayName: string;
  totalIssues: number;
  openIssues: number;
  lastIssueUpdatedDate: string | null;
  lastIssueCreatedDate: string | null;
  hasComplexWorkflows: boolean;
  hasCrossDependencies: boolean;
}

export interface RawSpace {
  key: string;
  name: string;
  type: 'global' | 'personal';
  creatorDisplayName: string;
  totalPages: number;
  lastPageUpdatedDate: string | null;
}

export interface ClassifiedProject {
  key: string;
  name: string;
  type: string;
  lead: string;
  totalIssues: number;
  openIssues: number;
  lastActivityDaysAgo: number | null;
  status: ProjectStatus;
  wave: MigrationWave;
  isJSM: boolean;
  reasons: string[];
}

export interface ClassifiedSpace {
  key: string;
  name: string;
  type: string;
  creator: string;
  totalPages: number;
  lastActivityDaysAgo: number | null;
  status: ProjectStatus;
}

export interface PortfolioReportSection {
  sectionId: '03';
  title: 'Project & Space Portfolio';
  projects: ClassifiedProject[];
  spaces: ClassifiedSpace[];
  /** Keys of all projects classified as 'delete' — used as the virtual deletion set in §6 */
  virtuallyDeletedProjectKeys: string[];
  virtuallyDeletedSpaceKeys: string[];
  waveSummary: Record<MigrationWave, string[]>;
  summary: {
    totalProjects: number;
    active: number;
    dormant: number;
    archive: number;
    delete: number;
    outOfScope: number;
    totalSpaces: number;
    wave1Count: number;
    wave2Count: number;
    wave3Count: number;
    noMigrateCount: number;
  };
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export function generatePortfolioReport(
  projects: RawProject[],
  spaces: RawSpace[],
  rules: MigrationRules
): PortfolioReportSection {
  const classifiedProjects: ClassifiedProject[] = projects
    .filter(p => isProjectInScope(p.key, rules))
    .map(p => {
      const lastIssueUpdatedDaysAgo = daysSince(p.lastIssueUpdatedDate);
      const lastIssueCreatedDaysAgo = daysSince(p.lastIssueCreatedDate);
      const isJSM = p.projectTypeKey === 'service_desk';

      const classification = classifyProject(
        {
          key: p.key,
          totalIssues: p.totalIssues,
          openIssues: p.openIssues,
          lastIssueUpdatedDaysAgo,
          lastIssueCreatedDaysAgo,
          isJSM,
          hasComplexWorkflows: p.hasComplexWorkflows,
          hasCrossDependencies: p.hasCrossDependencies,
        },
        rules
      );

      const lastActivityDaysAgo =
        lastIssueUpdatedDaysAgo !== null && lastIssueCreatedDaysAgo !== null
          ? Math.min(lastIssueUpdatedDaysAgo, lastIssueCreatedDaysAgo)
          : lastIssueUpdatedDaysAgo ?? lastIssueCreatedDaysAgo;

      return {
        key: p.key,
        name: p.name,
        type: p.projectTypeKey,
        lead: p.leadDisplayName,
        totalIssues: p.totalIssues,
        openIssues: p.openIssues,
        lastActivityDaysAgo,
        status: classification.status,
        wave: classification.wave,
        isJSM,
        reasons: classification.reasons,
      };
    });

  const classifiedSpaces: ClassifiedSpace[] = spaces
    .filter(s => isSpaceInScope(s.key, rules))
    .map(s => {
      const lastActivityDaysAgo = daysSince(s.lastPageUpdatedDate);
      const thresholds = rules.spaces.inactivity;

      let status: ProjectStatus;
      if (lastActivityDaysAgo === null) {
        status = 'delete';
      } else if (lastActivityDaysAgo <= thresholds.activeDaysThreshold) {
        status = 'active';
      } else if (lastActivityDaysAgo <= thresholds.dormantDaysThreshold) {
        status = 'dormant';
      } else if (lastActivityDaysAgo <= thresholds.archiveDaysThreshold) {
        status = 'archive';
      } else {
        status = 'delete';
      }

      return {
        key: s.key,
        name: s.name,
        type: s.type,
        creator: s.creatorDisplayName,
        totalPages: s.totalPages,
        lastActivityDaysAgo,
        status,
      };
    });

  const virtuallyDeletedProjectKeys = classifiedProjects
    .filter(p => p.status === 'delete')
    .map(p => p.key);

  const virtuallyDeletedSpaceKeys = classifiedSpaces
    .filter(s => s.status === 'delete')
    .map(s => s.key);

  const waveSummary: Record<MigrationWave, string[]> = {
    'wave-1': classifiedProjects.filter(p => p.wave === 'wave-1').map(p => p.key),
    'wave-2': classifiedProjects.filter(p => p.wave === 'wave-2').map(p => p.key),
    'wave-3': classifiedProjects.filter(p => p.wave === 'wave-3').map(p => p.key),
    'no-migrate': classifiedProjects.filter(p => p.wave === 'no-migrate').map(p => p.key),
  };

  const outOfScope = projects.filter(p => !isProjectInScope(p.key, rules)).length;

  return {
    sectionId: '03',
    title: 'Project & Space Portfolio',
    projects: classifiedProjects,
    spaces: classifiedSpaces,
    virtuallyDeletedProjectKeys,
    virtuallyDeletedSpaceKeys,
    waveSummary,
    summary: {
      totalProjects: classifiedProjects.length,
      active: classifiedProjects.filter(p => p.status === 'active').length,
      dormant: classifiedProjects.filter(p => p.status === 'dormant').length,
      archive: classifiedProjects.filter(p => p.status === 'archive').length,
      delete: classifiedProjects.filter(p => p.status === 'delete').length,
      outOfScope,
      totalSpaces: classifiedSpaces.length,
      wave1Count: waveSummary['wave-1'].length,
      wave2Count: waveSummary['wave-2'].length,
      wave3Count: waveSummary['wave-3'].length,
      noMigrateCount: waveSummary['no-migrate'].length,
    },
  };
}
