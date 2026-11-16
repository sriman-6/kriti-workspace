export const PROGRAMME_NAME_MAX_LENGTH = 1000;
export const TRACKER_STAGES = {
  unset: 'Set stage',
  planning: 'Planning',
  ongoing: 'Ongoing',
  completed: 'Completed',
  on_hold: 'On hold',
} as const;
export const TRACKER_KINDS = {
  update: 'Update',
  activity: 'Activity / visit',
  milestone: 'Milestone',
  decision: 'Decision',
  website_update: 'Website update',
  field_story: 'Field story',
  reference: 'Document / link',
  sheet: 'Related tracker',
} as const;
export const ROW_STATUSES = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
} as const;
export type TrackerColumn = {
  id: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'url';
};
export const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function validTrackerLink(value: string) {
  if (
    /^\/(?:programmes|work|meetings|groups)\/[a-f0-9-]{36}(?:\?sheet=[a-f0-9-]{36})?$/.test(
      value,
    )
  )
    return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
