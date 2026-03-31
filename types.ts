/**
 * TypeScript types for config/rules.json
 * Must stay in sync with config/rules.schema.json
 */

export interface MigrationRules {
  projects: ProjectRules;
  spaces: SpaceRules;
  users: UserRules;
  schemes: SchemeRules;
  customFields: CustomFieldRules;
  workflows: WorkflowRules;
  attachments: AttachmentRules;
  dataQuality: DataQualityRules;
  apps: AppRules;
  reporting: ReportingRules;
}

export interface InactivityThresholds {
  activeDaysThreshold: number;
  dormantDaysThreshold: number;
  archiveDaysThreshold: number;
}

export interface ProjectRules {
  inactivity: InactivityThresholds;
  minimumIssueCounts: {
    totalIssuesForAutoArchiveReview: number;
    openIssuesForDeleteReview: number;
  };
  exclusions: { byKey: string[] };
  waveAssignment: {
    activeBonus: number;
    hasJSMBonus: number;
    crossDependencyPenalty: number;
    complexWorkflowPenalty: number;
    largeIssuePenalty: { threshold: number; penalty: number };
  };
}

export interface SpaceRules {
  inactivity: InactivityThresholds;
  minimumPageCounts: { totalPagesForAutoArchiveReview: number };
  exclusions: { byKey: string[] };
}

export interface UserRules {
  inactivity: {
    activeLoginDaysThreshold: number;
    deactivateCandidateDaysThreshold: number;
    removeConsiderDaysThreshold: number;
  };
  deactivation: {
    flagUsersWithNoLoginRecord: boolean;
    flagUsersWithInvalidEmail: boolean;
    flagUsersWithDuplicateEmail: boolean;
  };
  groups: {
    reservedSystemGroups: string[];
    flagEmptyGroups: boolean;
    flagGroupsWithSingleMember: boolean;
  };
}

export interface SchemeRules {
  unusedThresholds: { flagZeroProjectReference: boolean };
  sparseUseThreshold: { projectCountThreshold: number };
}

export interface CustomFieldRules {
  unusedThresholds: { minIssuesWithValueToBeActive: number };
  flagOrphanedContexts: boolean;
  flagFieldsOnNoScreens: boolean;
}

export interface WorkflowRules {
  duplicateDetection: {
    enabled: boolean;
    compareByStatusNames: boolean;
    compareByTransitionNames: boolean;
  };
  complexityFlags: {
    flagScriptRunnerPostFunctions: boolean;
    flagGroovyConditions: boolean;
    flagCustomValidators: boolean;
    flagExternalSystemCalls: boolean;
  };
}

export interface AttachmentRules {
  largeAttachmentThresholdMb: number;
  oldAttachmentDaysThreshold: number;
  flagSuspectedExportZips: boolean;
  flagSuspectedLogFiles: boolean;
  suspectedExportExtensions: string[];
  suspectedLogExtensions: string[];
}

export interface DataQualityRules {
  cloudLimits: {
    projectKeyMaxLength: number;
    issueKeyMaxLength: number;
    customFieldNameMaxLength: number;
    workflowNameMaxLength: number;
    statusNameMaxLength: number;
    attachmentSizeLimitMb: number;
    spaceKeyMaxLength: number;
    pageBodyMaxKb: number;
  };
}

export interface AppRules {
  dataStoringCategories: string[];
  uiOnlyCategories: string[];
  flagUnlicensedApps: boolean;
  flagEndOfLifeApps: boolean;
}

export interface ReportingRules {
  includeRawCountsInSummary: boolean;
  generateHTMLReports: boolean;
  generateJSONReports: boolean;
  htmlReportTheme: 'atlassian' | 'minimal' | 'dark';
  sections: Record<string, boolean>;
}
