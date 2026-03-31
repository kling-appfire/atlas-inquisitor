/**
 * §6 — Configuration Cleanup Report
 *
 * CRITICAL: This section applies virtual deletion from §3.
 * All scheme/field reference counts MUST use getEffectiveSchemeProjectCount()
 * so that projects flagged for deletion are treated as non-existent.
 *
 * Steps run in order:
 *   6.1 Projects/Spaces (confirmation of §3 decisions)
 *   6.2 Unreferenced schemes
 *   6.3 Custom fields (low-use, orphaned)
 *   6.4 Workflows & statuses (duplicates, DC-only patterns)
 *   6.5 Permission & notification scheme consolidation
 *   6.6 Boards, filters, dashboards (orphaned/unused)
 *
 * Pure transformer — no API calls, no storage side effects.
 */

import type { MigrationRules } from '../rules/types';
import {
  getEffectiveSchemeProjectCount,
  isSchemeEffectivelyUnused,
  isSchemeSparslyUsed,
} from '../rules/engine';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface RawScheme {
  id: string | number;
  name: string;
  type: 'permission' | 'notification' | 'issueType' | 'workflow' | 'fieldConfiguration' | 'screen';
  referencingProjectKeys: string[];
}

export interface RawCustomField {
  id: string;
  name: string;
  fieldType: string;
  screensCount: number;
  contextsCount: number;
  projectsCount: number;
  issuesWithValueCount: number;
  lastUpdated: string | null;
}

export interface RawWorkflow {
  name: string;
  statusNames: string[];
  transitionNames: string[];
  hasScriptRunnerPostFunctions: boolean;
  hasGroovyConditions: boolean;
  hasCustomValidators: boolean;
  hasExternalSystemCalls: boolean;
  referencingProjectKeys: string[];
}

export interface RawBoard {
  id: number;
  name: string;
  type: 'scrum' | 'kanban';
  ownerAccountId: string;
  ownerIsActive: boolean;
  lastViewedDaysAgo: number | null;
  isFavoritedCount: number;
}

export interface RawFilter {
  id: number;
  name: string;
  ownerAccountId: string;
  ownerIsActive: boolean;
  lastViewedDaysAgo: number | null;
  sharedWithCount: number;
}

export interface RawDashboard {
  id: number;
  name: string;
  ownerAccountId: string;
  ownerIsActive: boolean;
  lastViewedDaysAgo: number | null;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export type SchemeRecommendation = 'remove' | 'consolidate' | 'keep';
export type FieldRecommendation = 'remove' | 'review' | 'keep';
export type WorkflowRecommendation = 'consolidate' | 'rewrite-for-cloud' | 'keep' | 'remove';

export interface SchemeAnalysis {
  id: string | number;
  name: string;
  type: string;
  totalReferencingProjects: number;
  effectiveReferencingProjects: number;
  recommendation: SchemeRecommendation;
  reasons: string[];
}

export interface FieldAnalysis {
  id: string;
  name: string;
  fieldType: string;
  issuesWithValueCount: number;
  screensCount: number;
  contextsCount: number;
  recommendation: FieldRecommendation;
  reasons: string[];
}

export interface WorkflowAnalysis {
  name: string;
  effectiveProjectCount: number;
  duplicateOf: string | null;
  hasCloudIncompatibleFeatures: boolean;
  incompatibleFeatures: string[];
  recommendation: WorkflowRecommendation;
}

export interface BoardFilterDashboardItem {
  id: number;
  name: string;
  type: string;
  ownerIsActive: boolean;
  lastViewedDaysAgo: number | null;
  recommendation: 'reassign' | 'delete' | 'keep';
  reason: string;
}

export interface ConfigCleanupReportSection {
  sectionId: '06';
  title: 'Configuration Cleanup';
  step61_projectSpaceConfirmation: {
    deleteProjects: string[];
    deleteSpaces: string[];
  };
  step62_unusedSchemes: SchemeAnalysis[];
  step63_customFields: FieldAnalysis[];
  step64_workflows: WorkflowAnalysis[];
  step65_permissionAndNotificationSchemes: SchemeAnalysis[];
  step66_boardsFiltersDashboards: BoardFilterDashboardItem[];
  summary: {
    schemesToRemove: number;
    schemesToConsolidate: number;
    fieldsToRemove: number;
    fieldsToReview: number;
    workflowsToConsolidate: number;
    workflowsNeedingCloudRewrite: number;
    orphanedBoardsFiltersDashboards: number;
  };
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateConfigCleanupReport(
  input: {
    virtuallyDeletedProjectKeys: string[];
    virtuallyDeletedSpaceKeys: string[];
    schemes: RawScheme[];
    customFields: RawCustomField[];
    workflows: RawWorkflow[];
    boards: RawBoard[];
    filters: RawFilter[];
    dashboards: RawDashboard[];
  },
  rules: MigrationRules
): ConfigCleanupReportSection {
  const deleted = new Set(input.virtuallyDeletedProjectKeys);

  // ── 6.2 Scheme Analysis ──────────────────────────────────────────────────
  const schemeAnalyses: SchemeAnalysis[] = input.schemes.map(scheme => {
    const effectiveCount = getEffectiveSchemeProjectCount(scheme.referencingProjectKeys, deleted);
    const reasons: string[] = [];
    let recommendation: SchemeRecommendation = 'keep';

    if (isSchemeEffectivelyUnused(scheme.referencingProjectKeys, deleted, rules)) {
      recommendation = 'remove';
      reasons.push(`Zero effective project references (${scheme.referencingProjectKeys.length} total, all flagged for deletion)`);
    } else if (isSchemeSparslyUsed(scheme.referencingProjectKeys, deleted, rules)) {
      recommendation = 'consolidate';
      reasons.push(
        `Only ${effectiveCount} effective project reference(s) — below sparse-use threshold of ${rules.schemes.sparseUseThreshold.projectCountThreshold}`
      );
    } else {
      reasons.push(`${effectiveCount} active project references`);
    }

    return {
      id: scheme.id,
      name: scheme.name,
      type: scheme.type,
      totalReferencingProjects: scheme.referencingProjectKeys.length,
      effectiveReferencingProjects: effectiveCount,
      recommendation,
      reasons,
    };
  });

  const permissionAndNotificationSchemes = schemeAnalyses.filter(
    s => s.type === 'permission' || s.type === 'notification'
  );

  // ── 6.3 Custom Field Analysis ────────────────────────────────────────────
  const fieldAnalyses: FieldAnalysis[] = input.customFields.map(field => {
    const reasons: string[] = [];
    let recommendation: FieldRecommendation = 'keep';

    if (field.screensCount === 0 && rules.customFields.flagFieldsOnNoScreens) {
      recommendation = 'review';
      reasons.push('Field is not on any screen — invisible to users');
    }

    if (field.contextsCount === 0 && rules.customFields.flagOrphanedContexts) {
      recommendation = 'review';
      reasons.push('Field has no contexts defined — orphaned');
    }

    if (field.issuesWithValueCount < rules.customFields.unusedThresholds.minIssuesWithValueToBeActive) {
      if (recommendation === 'keep') recommendation = 'review';
      reasons.push(
        `Only ${field.issuesWithValueCount} issues have a value (< ${rules.customFields.unusedThresholds.minIssuesWithValueToBeActive} threshold)`
      );
    }

    if (field.screensCount === 0 && field.issuesWithValueCount === 0) {
      recommendation = 'remove';
      reasons.push('No screen usage and no issue values — safe to remove');
    }

    if (reasons.length === 0) {
      reasons.push('Actively used');
    }

    return {
      id: field.id,
      name: field.name,
      fieldType: field.fieldType,
      issuesWithValueCount: field.issuesWithValueCount,
      screensCount: field.screensCount,
      contextsCount: field.contextsCount,
      recommendation,
      reasons,
    };
  });

  // ── 6.4 Workflow Analysis ────────────────────────────────────────────────
  const workflowAnalyses: WorkflowAnalysis[] = input.workflows.map((workflow, idx) => {
    const effectiveProjectCount = getEffectiveSchemeProjectCount(
      workflow.referencingProjectKeys,
      deleted
    );

    // Detect duplicates: compare statusNames and transitionNames
    const duplicateOf = findDuplicateWorkflow(workflow, input.workflows.slice(0, idx), rules);

    const incompatibleFeatures: string[] = [];
    const flags = rules.workflows.complexityFlags;

    if (flags.flagScriptRunnerPostFunctions && workflow.hasScriptRunnerPostFunctions) {
      incompatibleFeatures.push('ScriptRunner post-functions (requires Forge/Connect rewrite)');
    }
    if (flags.flagGroovyConditions && workflow.hasGroovyConditions) {
      incompatibleFeatures.push('Groovy conditions (not supported in Cloud)');
    }
    if (flags.flagCustomValidators && workflow.hasCustomValidators) {
      incompatibleFeatures.push('Custom validators (evaluate for Cloud equivalents)');
    }
    if (flags.flagExternalSystemCalls && workflow.hasExternalSystemCalls) {
      incompatibleFeatures.push('External system calls in post-functions');
    }

    const hasCloudIncompatibleFeatures = incompatibleFeatures.length > 0;

    let recommendation: WorkflowRecommendation = 'keep';
    if (effectiveProjectCount === 0) recommendation = 'remove';
    else if (duplicateOf) recommendation = 'consolidate';
    else if (hasCloudIncompatibleFeatures) recommendation = 'rewrite-for-cloud';

    return {
      name: workflow.name,
      effectiveProjectCount,
      duplicateOf,
      hasCloudIncompatibleFeatures,
      incompatibleFeatures,
      recommendation,
    };
  });

  // ── 6.6 Boards, Filters, Dashboards ──────────────────────────────────────
  const bfdItems: BoardFilterDashboardItem[] = [
    ...input.boards.map(b => classifyBoardFilterDashboard(b.id, b.name, 'board', b.ownerIsActive, b.lastViewedDaysAgo)),
    ...input.filters.map(f => classifyBoardFilterDashboard(f.id, f.name, 'filter', f.ownerIsActive, f.lastViewedDaysAgo)),
    ...input.dashboards.map(d => classifyBoardFilterDashboard(d.id, d.name, 'dashboard', d.ownerIsActive, d.lastViewedDaysAgo)),
  ];

  return {
    sectionId: '06',
    title: 'Configuration Cleanup',
    step61_projectSpaceConfirmation: {
      deleteProjects: input.virtuallyDeletedProjectKeys,
      deleteSpaces: input.virtuallyDeletedSpaceKeys,
    },
    step62_unusedSchemes: schemeAnalyses,
    step63_customFields: fieldAnalyses,
    step64_workflows: workflowAnalyses,
    step65_permissionAndNotificationSchemes: permissionAndNotificationSchemes,
    step66_boardsFiltersDashboards: bfdItems,
    summary: {
      schemesToRemove: schemeAnalyses.filter(s => s.recommendation === 'remove').length,
      schemesToConsolidate: schemeAnalyses.filter(s => s.recommendation === 'consolidate').length,
      fieldsToRemove: fieldAnalyses.filter(f => f.recommendation === 'remove').length,
      fieldsToReview: fieldAnalyses.filter(f => f.recommendation === 'review').length,
      workflowsToConsolidate: workflowAnalyses.filter(w => w.recommendation === 'consolidate').length,
      workflowsNeedingCloudRewrite: workflowAnalyses.filter(w => w.recommendation === 'rewrite-for-cloud').length,
      orphanedBoardsFiltersDashboards: bfdItems.filter(i => i.recommendation !== 'keep').length,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findDuplicateWorkflow(
  target: RawWorkflow,
  candidates: RawWorkflow[],
  rules: MigrationRules
): string | null {
  if (!rules.workflows.duplicateDetection.enabled) return null;

  for (const candidate of candidates) {
    const sameStatuses =
      rules.workflows.duplicateDetection.compareByStatusNames &&
      arraysEqual(target.statusNames.sort(), candidate.statusNames.sort());

    const sameTransitions =
      rules.workflows.duplicateDetection.compareByTransitionNames &&
      arraysEqual(target.transitionNames.sort(), candidate.transitionNames.sort());

    if (sameStatuses && sameTransitions) return candidate.name;
  }

  return null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function classifyBoardFilterDashboard(
  id: number,
  name: string,
  type: string,
  ownerIsActive: boolean,
  lastViewedDaysAgo: number | null
): BoardFilterDashboardItem {
  if (!ownerIsActive) {
    return { id, name, type, ownerIsActive, lastViewedDaysAgo, recommendation: 'reassign', reason: 'Owner account is deactivated' };
  }
  if (lastViewedDaysAgo !== null && lastViewedDaysAgo > 365) {
    return { id, name, type, ownerIsActive, lastViewedDaysAgo, recommendation: 'delete', reason: `Not viewed in ${lastViewedDaysAgo} days` };
  }
  return { id, name, type, ownerIsActive, lastViewedDaysAgo, recommendation: 'keep', reason: 'Recently used' };
}
