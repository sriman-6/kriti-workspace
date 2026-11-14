export const WORKSPACE_ROLES = [
  'head',
  'associate_head',
  'nucleus',
  'program_head',
  'manager',
  'administrative_support',
  'intern',
  'student',
] as const;
export const WORKSPACE_ROLE_LABELS = {
  head: 'Head, KRITI',
  associate_head: 'Associate Head',
  nucleus: 'Nucleus Member',
  program_head: 'Program Head',
  manager: 'Manager',
  administrative_support: 'Administrative Support',
  intern: 'Intern',
  student: 'Student Team Member',
} as const;
export const PROGRAMME_ROLES = [
  'lead',
  'manager',
  'reviewer',
  'adviser',
  'member',
] as const;
export const WORK_STATUS_LABELS = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  submitted: 'In review',
  changes_requested: 'Changes requested',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type WorkStatus = keyof typeof WORK_STATUS_LABELS;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SUBMISSION_FILES = 3;
export const ACCEPTED_WORK_FILES =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.pptx';
