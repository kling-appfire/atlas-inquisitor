/**
 * Rules Engine
 *
 * All deterministic classification logic lives here.
 * Reads from config/rules.json (passed in as a typed object).
 * Never hardcodes thresholds — always reads from the rules config.
 *
 * This module is pure: no side effects, no API calls, no storage.
 */

import type { MigrationRules } from './types';

export type ProjectStatus = 'active' | 'dormant' | 'archive' | 'delete';
export type UserStatus = 'active' | 'deactivate' | 'remove' | 'review';
export type MigrationWave = 'wave-1' | 'wave-2' | 'wave-3' | 'no-migrate';

export interface ProjectClassification {
  status: ProjectStatus;
  wave: MigrationWave;
  reasons: string[];
  inScope: boolean;
}

export interface UserClassification {
  status: UserStatus;
  reasons: string[];
}

// ─── Scope ───────────────────────────────────────────────────────────────────

export function isProjectInScope(projectKey: string, rules: MigrationRules): boolean {
  return !rules.projects.exclusions.byKey.includes(projectKey);
}

export function isSpaceInScope(spaceKey: string, rules: MigrationRules): boolean {
  return !rules.spaces.exclusions.byKey.includes(spaceKey);
}

// ─── Project Classification ───────────────────────────────────────────────────

export function classifyProject(
  project: {
    key: string;
    totalIssues: number;
    openIssues: number;
    lastIssueUpdatedDaysAgo: number | null;
    lastIssueCreatedDaysAgo: number | null;
    isJSM: boolean;
    hasComplexWorkflows: boolean;
    hasCrossDependencies: boolean;
  },
  rules: MigrationRules
): ProjectClassification {
  const reasons: string[] = [];

  if (!isProjectInScope(project.key, rules)) {
    return { status: 'active', wave: 'no-migrate', reasons: ['Excluded by configuration'], inScope: false };
  }

  const thresholds = rules.projects.inactivity;
  const minCounts = rules.projects.minimumIssueCounts;

  // Use the most recent of lastUpdated and lastCreated
  const daysSinceActivity = Math.min(
    project.lastIssueUpdatedDaysAgo ?? Infinity,
    project.lastIssueCreatedDaysAgo ?? Infinity
  );

  let status: ProjectStatus;

  if (daysSinceActivity === Infinity) {
    status = 'delete';
    reasons.push('No issue activity ever recorded');
  } else if (daysSinceActivity <= thresholds.activeDaysThreshold) {
    status = 'active';
    reasons.push(`Last activity ${daysSinceActivity} days ago (≤ ${thresholds.activeDaysThreshold} day threshold)`);
  } else if (daysSinceActivity <= thresholds.dormantDaysThreshold) {
    status = 'dormant';
    reasons.push(`Last activity ${daysSinceActivity} days ago (${thresholds.activeDaysThreshold}–${thresholds.dormantDaysThreshold} day range)`);
  } else if (daysSinceActivity <= thresholds.archiveDaysThreshold) {
    status = 'archive';
    reasons.push(`Last activity ${daysSinceActivity} days ago (${thresholds.dormantDaysThreshold}–${thresholds.archiveDaysThreshold} day range)`);
  } else {
    status = 'delete';
    reasons.push(`Last activity ${daysSinceActivity} days ago (> ${thresholds.archiveDaysThreshold} day threshold)`);
  }

  // Override to archive/delete based on minimum issue counts
  if (project.totalIssues < minCounts.totalIssuesForAutoArchiveReview && status === 'active') {
    reasons.push(`Flagged for review: only ${project.totalIssues} total issues (< ${minCounts.totalIssuesForAutoArchiveReview} threshold)`);
  }

  if (project.openIssues === minCounts.openIssuesForDeleteReview && status !== 'active') {
    reasons.push('Zero open issues — delete candidate if inactive');
  }

  const wave = computeWave(project, status, rules);

  return { status, wave, reasons, inScope: true };
}

function computeWave(
  project: {
    isJSM: boolean;
    hasComplexWorkflows: boolean;
    hasCrossDependencies: boolean;
    totalIssues: number;
  },
  status: ProjectStatus,
  rules: MigrationRules
): MigrationWave {
  if (status === 'delete') return 'no-migrate';

  const w = rules.projects.waveAssignment;
  let score = 0;

  if (status === 'active') score += w.activeBonus;
  if (project.isJSM) score += w.hasJSMBonus;
  if (project.hasCrossDependencies) score += w.crossDependencyPenalty;
  if (project.hasComplexWorkflows) score += w.complexWorkflowPenalty;
  if (project.totalIssues > w.largeIssuePenalty.threshold) score += w.largeIssuePenalty.penalty;

  if (score >= 40) return 'wave-1';
  if (score >= 20) return 'wave-2';
  return 'wave-3';
}

// ─── User Classification ──────────────────────────────────────────────────────

export function classifyUser(
  user: {
    accountId: string;
    emailAddress: string | null;
    lastLoginDaysAgo: number | null;
    isDuplicate: boolean;
  },
  allEmails: string[],
  rules: MigrationRules
): UserClassification {
  const reasons: string[] = [];
  const thresholds = rules.users.inactivity;
  const flags = rules.users.deactivation;

  if (flags.flagUsersWithInvalidEmail && (!user.emailAddress || !isValidEmail(user.emailAddress))) {
    reasons.push('Missing or invalid email address');
  }

  if (flags.flagUsersWithDuplicateEmail && user.emailAddress && isDuplicateEmail(user.emailAddress, allEmails)) {
    reasons.push(`Duplicate email address: ${user.emailAddress}`);
  }

  if (flags.flagUsersWithNoLoginRecord && user.lastLoginDaysAgo === null) {
    reasons.push('No login record found');
    return { status: 'review', reasons };
  }

  const daysSinceLogin = user.lastLoginDaysAgo ?? Infinity;

  if (daysSinceLogin <= thresholds.activeLoginDaysThreshold) {
    if (reasons.length > 0) return { status: 'review', reasons };
    return { status: 'active', reasons: [`Last login ${daysSinceLogin} days ago`] };
  }

  if (daysSinceLogin <= thresholds.deactivateCandidateDaysThreshold) {
    reasons.push(`Last login ${daysSinceLogin} days ago (${thresholds.activeLoginDaysThreshold}–${thresholds.deactivateCandidateDaysThreshold} day range)`);
    return { status: 'deactivate', reasons };
  }

  reasons.push(`Last login ${daysSinceLogin} days ago (> ${thresholds.deactivateCandidateDaysThreshold} days)`);
  if (daysSinceLogin > thresholds.removeConsiderDaysThreshold) {
    reasons.push(`Exceeds removal threshold of ${thresholds.removeConsiderDaysThreshold} days`);
    return { status: 'remove', reasons };
  }

  return { status: 'deactivate', reasons };
}

// ─── Scheme Usage (Virtual Deletion) ─────────────────────────────────────────

/**
 * Given a list of project keys that reference a scheme, and the set of
 * projects flagged for deletion in §3, returns the "effective" reference count
 * used in §6 config-cleanup analysis.
 *
 * This implements the cascade logic: §6 must treat §3 delete candidates
 * as already deleted when computing scheme usage.
 */
export function getEffectiveSchemeProjectCount(
  referencingProjectKeys: string[],
  virtuallyDeletedProjectKeys: Set<string>
): number {
  return referencingProjectKeys.filter(key => !virtuallyDeletedProjectKeys.has(key)).length;
}

export function isSchemeEffectivelyUnused(
  referencingProjectKeys: string[],
  virtuallyDeletedProjectKeys: Set<string>,
  rules: MigrationRules
): boolean {
  if (!rules.schemes.unusedThresholds.flagZeroProjectReference) return false;
  return getEffectiveSchemeProjectCount(referencingProjectKeys, virtuallyDeletedProjectKeys) === 0;
}

export function isSchemeSparslyUsed(
  referencingProjectKeys: string[],
  virtuallyDeletedProjectKeys: Set<string>,
  rules: MigrationRules
): boolean {
  const count = getEffectiveSchemeProjectCount(referencingProjectKeys, virtuallyDeletedProjectKeys);
  return count > 0 && count < rules.schemes.sparseUseThreshold.projectCountThreshold;
}

// ─── Attachment Classification ────────────────────────────────────────────────

export function isAttachmentBulkTrashCandidate(
  attachment: {
    sizeBytes: number;
    createdDaysAgo: number;
    filename: string;
  },
  rules: MigrationRules
): boolean {
  const sizeMb = attachment.sizeBytes / (1024 * 1024);
  const isLarge = sizeMb > rules.attachments.largeAttachmentThresholdMb;
  const isOld = attachment.createdDaysAgo > rules.attachments.oldAttachmentDaysThreshold;
  const ext = getFileExtension(attachment.filename);

  const isSuspectedExport =
    rules.attachments.flagSuspectedExportZips &&
    rules.attachments.suspectedExportExtensions.includes(ext);

  const isSuspectedLog =
    rules.attachments.flagSuspectedLogFiles &&
    rules.attachments.suspectedLogExtensions.includes(ext);

  return (isLarge && isOld) || isSuspectedExport || isSuspectedLog;
}

// ─── Cloud Limit Violations ───────────────────────────────────────────────────

export function checkCloudLimitViolations(
  entity: { type: string; name: string; key?: string },
  rules: MigrationRules
): string[] {
  const limits = rules.dataQuality.cloudLimits;
  const violations: string[] = [];

  if (entity.type === 'project' && entity.key && entity.key.length > limits.projectKeyMaxLength) {
    violations.push(`Project key "${entity.key}" exceeds Cloud limit of ${limits.projectKeyMaxLength} characters`);
  }

  if (entity.name.length > limits.customFieldNameMaxLength) {
    violations.push(`Name "${entity.name}" exceeds Cloud limit of ${limits.customFieldNameMaxLength} characters`);
  }

  return violations;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isDuplicateEmail(email: string, allEmails: string[]): boolean {
  return allEmails.filter(e => e.toLowerCase() === email.toLowerCase()).length > 1;
}

function getFileExtension(filename: string): string {
  const match = filename.match(/(\.[^.]+)$/);
  return match?.[1]?.toLowerCase() ?? '';
}
