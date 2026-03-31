/**
 * §4 — Data Reduction Report
 * TODO: Implement attachment analysis, JSM queue analysis
 */
export interface DataReductionReportSection {
  sectionId: '04';
  title: 'Pre-Migration Data Reduction';
  deleteProjects: string[];
  deleteSpaces: string[];
  largeAttachmentCandidates: Array<{ issueKey: string; filename: string; sizeMb: number; ageDays: number }>;
  suspectedExportFiles: Array<{ issueKey: string; filename: string }>;
  jsmDeprecatedQueues: Array<{ projectKey: string; queueName: string }>;
  summary: { attachmentCandidateCount: number; estimatedReclaimMb: number };
}
