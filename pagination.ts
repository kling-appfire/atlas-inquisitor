/**
 * Pagination Service
 *
 * All list fetches from Jira and Confluence must go through these helpers.
 * Never inline pagination logic in adapters or workers.
 */

export interface JiraPaginatedResponse<T> {
  startAt: number;
  maxResults: number;
  total: number;
  isLast?: boolean;
  values?: T[];
  issues?: T[];
}

export interface ConfluencePaginatedResponse<T> {
  results: T[];
  start: number;
  limit: number;
  size: number;
  _links: {
    next?: string;
    base: string;
  };
}

export type FetchPage<T> = (startAt: number, maxResults: number) => Promise<JiraPaginatedResponse<T>>;
export type FetchConfluencePage<T> = (start: number, limit: number) => Promise<ConfluencePaginatedResponse<T>>;

/**
 * Fetches all pages from a Jira paginated endpoint.
 * Uses startAt/maxResults/total pattern.
 */
export async function fetchAllJiraPages<T>(
  fetchPage: FetchPage<T>,
  pageSize = 50
): Promise<T[]> {
  const results: T[] = [];
  let startAt = 0;
  let total: number | null = null;

  do {
    const page = await fetchPage(startAt, pageSize);
    const items = page.values ?? page.issues ?? [];
    results.push(...items);

    total = page.total;
    startAt += items.length;

    // Safety: stop if we got an empty page or isLast
    if (items.length === 0 || page.isLast === true) break;
  } while (startAt < (total ?? 0));

  return results;
}

/**
 * Fetches all pages from a Confluence paginated endpoint.
 * Uses start/limit/_links.next pattern.
 */
export async function fetchAllConfluencePages<T>(
  fetchPage: FetchConfluencePage<T>,
  pageSize = 25
): Promise<T[]> {
  const results: T[] = [];
  let start = 0;

  while (true) {
    const page = await fetchPage(start, pageSize);
    results.push(...page.results);

    // Stop if we got fewer results than the page size (last page)
    if (page.results.length < pageSize || !page._links.next) break;

    start += page.results.length;
  }

  return results;
}
