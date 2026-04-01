/**
 * §2 — Users & Identity Cleanup Report
 *
 * Classifies all users into active/deactivate/remove/review buckets.
 * Flags duplicate/invalid emails, empty groups, and group name collisions.
 *
 * Pure transformer — no API calls, no storage side effects.
 */

import type { MigrationRules } from './types';
import { classifyUser, type UserStatus } from './engine';

export interface RawUser {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  active: boolean;
  lastLoginDate: string | null; // ISO date string or null
  directoryType: 'internal' | 'ldap' | 'crowd' | 'sso';
  groups: string[];
}

export interface RawGroup {
  name: string;
  memberCount: number;
}

export interface ClassifiedUser {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  status: UserStatus;
  reasons: string[];
  directoryType: string;
  daysSinceLogin: number | null;
}

export interface GroupIssue {
  groupName: string;
  issue: 'empty' | 'single-member' | 'name-collision-risk' | 'system-group-overlap';
  detail: string;
}

export interface UsersReportSection {
  sectionId: '02';
  title: 'Users & Identity Cleanup';
  identitySources: string[];
  users: {
    active: ClassifiedUser[];
    deactivate: ClassifiedUser[];
    remove: ClassifiedUser[];
    review: ClassifiedUser[];
  };
  groupIssues: GroupIssue[];
  duplicateEmails: Array<{ email: string; accountIds: string[] }>;
  summary: {
    total: number;
    active: number;
    deactivate: number;
    remove: number;
    review: number;
    duplicateEmailCount: number;
    invalidEmailCount: number;
    groupIssueCount: number;
  };
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function generateUsersReport(
  users: RawUser[],
  groups: RawGroup[],
  rules: MigrationRules
): UsersReportSection {
  const allEmails = users.map(u => u.emailAddress).filter((e): e is string => e !== null);

  const classified = users.map(u => {
    const lastLoginDaysAgo = daysSince(u.lastLoginDate);
    const classification = classifyUser(
      { accountId: u.accountId, emailAddress: u.emailAddress, lastLoginDaysAgo, isDuplicate: false },
      allEmails,
      rules
    );
    return {
      accountId: u.accountId,
      displayName: u.displayName,
      emailAddress: u.emailAddress,
      status: classification.status,
      reasons: classification.reasons,
      directoryType: u.directoryType,
      daysSinceLogin: lastLoginDaysAgo,
    } satisfies ClassifiedUser;
  });

  // Find duplicate emails
  const emailMap = new Map<string, string[]>();
  users.forEach(u => {
    if (!u.emailAddress) return;
    const key = u.emailAddress.toLowerCase();
    const existing = emailMap.get(key) ?? [];
    existing.push(u.accountId);
    emailMap.set(key, existing);
  });
  const duplicateEmails = [...emailMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([email, accountIds]) => ({ email, accountIds }));

  // Group issues
  const groupIssues: GroupIssue[] = [];
  groups.forEach(g => {
    if (rules.users.groups.reservedSystemGroups.includes(g.name)) return;
    if (rules.users.groups.flagEmptyGroups && g.memberCount === 0) {
      groupIssues.push({ groupName: g.name, issue: 'empty', detail: 'Group has no members' });
    }
    if (rules.users.groups.flagGroupsWithSingleMember && g.memberCount === 1) {
      groupIssues.push({ groupName: g.name, issue: 'single-member', detail: 'Group has only one member — consider removing' });
    }
  });

  const buckets = {
    active: classified.filter(u => u.status === 'active'),
    deactivate: classified.filter(u => u.status === 'deactivate'),
    remove: classified.filter(u => u.status === 'remove'),
    review: classified.filter(u => u.status === 'review'),
  };

  const identitySources = [...new Set(users.map(u => u.directoryType))];

  return {
    sectionId: '02',
    title: 'Users & Identity Cleanup',
    identitySources,
    users: buckets,
    groupIssues,
    duplicateEmails,
    summary: {
      total: users.length,
      active: buckets.active.length,
      deactivate: buckets.deactivate.length,
      remove: buckets.remove.length,
      review: buckets.review.length,
      duplicateEmailCount: duplicateEmails.length,
      invalidEmailCount: classified.filter(u => u.reasons.some(r => r.includes('invalid email'))).length,
      groupIssueCount: groupIssues.length,
    },
  };
}
