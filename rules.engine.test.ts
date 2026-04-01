/**
 * Rules Engine Unit Tests
 *
 * Tests boundary conditions for all classifier functions.
 * Uses the default rules from config/rules.json as baseline.
 * Never calls real Atlassian APIs.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyProject,
  classifyUser,
  isProjectInScope,
  isSpaceInScope,
  getEffectiveSchemeProjectCount,
  isSchemeEffectivelyUnused,
  isAttachmentBulkTrashCandidate,
} from './engine';
import type { MigrationRules } from './types';

// ─── Test Fixture: Rules ──────────────────────────────────────────────────────

const defaultRules: MigrationRules = {
  projects: {
    inactivity: { activeDaysThreshold: 90, dormantDaysThreshold: 180, archiveDaysThreshold: 365 },
    minimumIssueCounts: { totalIssuesForAutoArchiveReview: 10, openIssuesForDeleteReview: 0 },
    exclusions: { byKey: ['EXCLUDED', 'TEMPLATE'] },
    waveAssignment: {
      activeBonus: 30,
      hasJSMBonus: 20,
      crossDependencyPenalty: -15,
      complexWorkflowPenalty: -10,
      largeIssuePenalty: { threshold: 10000, penalty: -20 },
    },
  },
  spaces: {
    inactivity: { activeDaysThreshold: 90, dormantDaysThreshold: 180, archiveDaysThreshold: 365 },
    minimumPageCounts: { totalPagesForAutoArchiveReview: 5 },
    exclusions: { byKey: ['ARCHIVE', '~ADMIN'] },
  },
  users: {
    inactivity: {
      activeLoginDaysThreshold: 90,
      deactivateCandidateDaysThreshold: 180,
      removeConsiderDaysThreshold: 365,
    },
    deactivation: {
      flagUsersWithNoLoginRecord: true,
      flagUsersWithInvalidEmail: true,
      flagUsersWithDuplicateEmail: true,
    },
    groups: {
      reservedSystemGroups: ['jira-administrators'],
      flagEmptyGroups: true,
      flagGroupsWithSingleMember: true,
    },
  },
  schemes: {
    unusedThresholds: { flagZeroProjectReference: true },
    sparseUseThreshold: { projectCountThreshold: 2 },
  },
  customFields: {
    unusedThresholds: { minIssuesWithValueToBeActive: 100 },
    flagOrphanedContexts: true,
    flagFieldsOnNoScreens: true,
  },
  workflows: {
    duplicateDetection: { enabled: true, compareByStatusNames: true, compareByTransitionNames: true },
    complexityFlags: {
      flagScriptRunnerPostFunctions: true,
      flagGroovyConditions: true,
      flagCustomValidators: true,
      flagExternalSystemCalls: true,
    },
  },
  attachments: {
    largeAttachmentThresholdMb: 25,
    oldAttachmentDaysThreshold: 730,
    flagSuspectedExportZips: true,
    flagSuspectedLogFiles: true,
    suspectedExportExtensions: ['.zip', '.tar.gz'],
    suspectedLogExtensions: ['.log'],
  },
  dataQuality: {
    cloudLimits: {
      projectKeyMaxLength: 10,
      issueKeyMaxLength: 255,
      customFieldNameMaxLength: 255,
      workflowNameMaxLength: 255,
      statusNameMaxLength: 60,
      attachmentSizeLimitMb: 250,
      spaceKeyMaxLength: 255,
      pageBodyMaxKb: 5120,
    },
  },
  apps: {
    dataStoringCategories: ['custom_fields', 'reporting'],
    uiOnlyCategories: ['themes'],
    flagUnlicensedApps: true,
    flagEndOfLifeApps: true,
  },
  reporting: {
    includeRawCountsInSummary: true,
    generateHTMLReports: true,
    generateJSONReports: true,
    htmlReportTheme: 'atlassian',
    sections: {},
  },
};

const baseProject = {
  key: 'TEST',
  totalIssues: 100,
  openIssues: 10,
  lastIssueUpdatedDaysAgo: 30,
  lastIssueCreatedDaysAgo: 30,
  isJSM: false,
  hasComplexWorkflows: false,
  hasCrossDependencies: false,
};

// ─── Scope Tests ──────────────────────────────────────────────────────────────

describe('isProjectInScope', () => {
  it('returns true for normal projects', () => {
    expect(isProjectInScope('MYPROJECT', defaultRules)).toBe(true);
  });

  it('returns false for excluded project key', () => {
    expect(isProjectInScope('EXCLUDED', defaultRules)).toBe(false);
    expect(isProjectInScope('TEMPLATE', defaultRules)).toBe(false);
  });
});

describe('isSpaceInScope', () => {
  it('returns false for excluded space keys', () => {
    expect(isSpaceInScope('ARCHIVE', defaultRules)).toBe(false);
    expect(isSpaceInScope('~ADMIN', defaultRules)).toBe(false);
  });
});

// ─── Project Classification Tests ────────────────────────────────────────────

describe('classifyProject', () => {
  it('classifies active project (exactly at threshold)', () => {
    const result = classifyProject({ ...baseProject, lastIssueUpdatedDaysAgo: 90, lastIssueCreatedDaysAgo: 90 }, defaultRules);
    expect(result.status).toBe('active');
    expect(result.inScope).toBe(true);
  });

  it('classifies dormant project (1 day over active threshold)', () => {
    const result = classifyProject({ ...baseProject, lastIssueUpdatedDaysAgo: 91, lastIssueCreatedDaysAgo: 91 }, defaultRules);
    expect(result.status).toBe('dormant');
  });

  it('classifies archive project (exactly at dormant threshold)', () => {
    const result = classifyProject({ ...baseProject, lastIssueUpdatedDaysAgo: 180, lastIssueCreatedDaysAgo: 180 }, defaultRules);
    expect(result.status).toBe('dormant');
  });

  it('classifies archive project (1 day over dormant threshold)', () => {
    const result = classifyProject({ ...baseProject, lastIssueUpdatedDaysAgo: 181, lastIssueCreatedDaysAgo: 181 }, defaultRules);
    expect(result.status).toBe('archive');
  });

  it('classifies delete project (over archive threshold)', () => {
    const result = classifyProject({ ...baseProject, lastIssueUpdatedDaysAgo: 366, lastIssueCreatedDaysAgo: 366 }, defaultRules);
    expect(result.status).toBe('delete');
    expect(result.wave).toBe('no-migrate');
  });

  it('classifies out-of-scope project as no-migrate', () => {
    const result = classifyProject({ ...baseProject, key: 'EXCLUDED' }, defaultRules);
    expect(result.inScope).toBe(false);
    expect(result.wave).toBe('no-migrate');
  });

  it('uses most recent of lastUpdated and lastCreated', () => {
    // Created recently but updated long ago — should use the recent creation date
    const result = classifyProject({ ...baseProject, lastIssueUpdatedDaysAgo: 400, lastIssueCreatedDaysAgo: 30 }, defaultRules);
    expect(result.status).toBe('active');
  });

  it('assigns wave-1 to active JSM project', () => {
    const result = classifyProject({ ...baseProject, isJSM: true, lastIssueUpdatedDaysAgo: 10 }, defaultRules);
    // activeBonus(30) + hasJSMBonus(20) = 50 → wave-1
    expect(result.wave).toBe('wave-1');
  });

  it('downgrades wave for complex workflows', () => {
    const result = classifyProject({
      ...baseProject,
      lastIssueUpdatedDaysAgo: 10,
      hasComplexWorkflows: true,
      hasCrossDependencies: true,
    }, defaultRules);
    // activeBonus(30) + complexWorkflow(-10) + crossDep(-15) = 5 → wave-3
    expect(result.wave).toBe('wave-3');
  });
});

// ─── User Classification Tests ────────────────────────────────────────────────

describe('classifyUser', () => {
  const allEmails = ['user@example.com', 'other@example.com'];

  it('classifies active user', () => {
    const result = classifyUser(
      { accountId: '1', emailAddress: 'user@example.com', lastLoginDaysAgo: 30, isDuplicate: false },
      allEmails,
      defaultRules
    );
    expect(result.status).toBe('active');
  });

  it('classifies deactivate candidate (over active threshold)', () => {
    const result = classifyUser(
      { accountId: '1', emailAddress: 'user@example.com', lastLoginDaysAgo: 91, isDuplicate: false },
      allEmails,
      defaultRules
    );
    expect(result.status).toBe('deactivate');
  });

  it('flags user with no login record as review', () => {
    const result = classifyUser(
      { accountId: '1', emailAddress: 'user@example.com', lastLoginDaysAgo: null, isDuplicate: false },
      allEmails,
      defaultRules
    );
    expect(result.status).toBe('review');
  });

  it('flags user with invalid email', () => {
    const result = classifyUser(
      { accountId: '1', emailAddress: 'not-an-email', lastLoginDaysAgo: 10, isDuplicate: false },
      allEmails,
      defaultRules
    );
    expect(result.status).toBe('review');
    expect(result.reasons.some((r: string) => r.includes('invalid email'))).toBe(true);
  });
});

// ─── Virtual Deletion / Scheme Tests ─────────────────────────────────────────

describe('getEffectiveSchemeProjectCount', () => {
  it('subtracts virtually deleted projects from count', () => {
    const deleted = new Set(['PROJ-A', 'PROJ-B']);
    const referencing = ['PROJ-A', 'PROJ-B', 'PROJ-C'];
    expect(getEffectiveSchemeProjectCount(referencing, deleted)).toBe(1);
  });

  it('returns zero when all referencing projects are deleted', () => {
    const deleted = new Set(['PROJ-A', 'PROJ-B']);
    expect(getEffectiveSchemeProjectCount(['PROJ-A', 'PROJ-B'], deleted)).toBe(0);
  });
});

describe('isSchemeEffectivelyUnused', () => {
  it('flags scheme as unused when all projects deleted', () => {
    const deleted = new Set(['PROJ-A']);
    expect(isSchemeEffectivelyUnused(['PROJ-A'], deleted, defaultRules)).toBe(true);
  });

  it('does not flag scheme still referenced by live projects', () => {
    const deleted = new Set(['PROJ-A']);
    expect(isSchemeEffectivelyUnused(['PROJ-A', 'PROJ-B'], deleted, defaultRules)).toBe(false);
  });
});

// ─── Attachment Tests ─────────────────────────────────────────────────────────

describe('isAttachmentBulkTrashCandidate', () => {
  it('flags large old attachment', () => {
    expect(isAttachmentBulkTrashCandidate(
      { sizeBytes: 30 * 1024 * 1024, createdDaysAgo: 800, filename: 'report.pdf' },
      defaultRules
    )).toBe(true);
  });

  it('does not flag small recent attachment', () => {
    expect(isAttachmentBulkTrashCandidate(
      { sizeBytes: 1024, createdDaysAgo: 10, filename: 'screenshot.png' },
      defaultRules
    )).toBe(false);
  });

  it('flags suspected export zip regardless of size', () => {
    expect(isAttachmentBulkTrashCandidate(
      { sizeBytes: 1024, createdDaysAgo: 1, filename: 'export.zip' },
      defaultRules
    )).toBe(true);
  });
});
