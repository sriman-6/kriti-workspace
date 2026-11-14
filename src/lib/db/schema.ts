import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const campusEnum = pgEnum('campus', ['PIL', 'GOA', 'HYD', 'DXB']);
export const accountRoleEnum = pgEnum('user_role', ['super_admin', 'member']);
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    role: accountRoleEnum('role').notNull(),
    campus: campusEnum('campus'),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    externalGoogleApproved: boolean('external_google_approved').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    unique('users_email_unique').on(table.email),
    index('users_role_idx').on(table.role),
  ],
);
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
// KRITI workspaces, delivery and versioned submissions.
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'head',
  'associate_head',
  'nucleus',
  'program_head',
  'manager',
  'administrative_support',
  'intern',
  'student',
]);
export const programmeRoleEnum = pgEnum('programme_role', [
  'lead',
  'manager',
  'reviewer',
  'adviser',
  'member',
]);
export const workStatusEnum = pgEnum('work_status', [
  'assigned',
  'in_progress',
  'blocked',
  'submitted',
  'changes_requested',
  'completed',
  'cancelled',
]);
export const workspaceProfiles = pgTable('workspace_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  role: workspaceRoleEnum('role').notNull(),
  programmeCreationAllowed: boolean('programme_creation_allowed').notNull().default(false),
  ...timestamps,
});
export const programmes = pgTable('programmes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  description: text('description'),
  kind: text('kind', { enum: ['programme', 'initiative'] })
    .notNull()
    .default('programme'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});
export const programmeMembers = pgTable(
  'programme_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: programmeRoleEnum('role').notNull().default('member'),
    ...timestamps,
  },
  (table) => [
    unique('programme_members_unique').on(table.programmeId, table.userId),
    index('programme_members_user_idx').on(table.userId),
  ],
);
export const workTasks = pgTable(
  'work_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programmeId: uuid('programme_id').references(() => programmes.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    reviewerId: uuid('reviewer_id')
      .references(() => users.id),
    viewerIds: uuid('viewer_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    assignerId: uuid('assigner_id')
      .notNull()
      .references(() => users.id),
    dueOn: date('due_on'),
    priority: text('priority', { enum: ['normal', 'high'] })
      .notNull()
      .default('normal'),
    status: workStatusEnum('status').notNull().default('assigned'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('work_tasks_owner_idx').on(table.ownerId),
    index('work_tasks_reviewer_idx').on(table.reviewerId),
    index('work_tasks_programme_idx').on(table.programmeId),
  ],
);
export const workSubmissions = pgTable(
  'work_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => workTasks.id),
    version: integer('version').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    summary: text('summary').notNull(),
    links: text('links')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    decision: text('decision', { enum: ['accepted', 'changes_requested'] }),
    feedback: text('feedback'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('work_submission_version_unique').on(table.taskId, table.version),
  ],
);
const privateBytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
  fromDriver: (value) => Buffer.from(value),
});
export const workFiles = pgTable(
  'work_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => workSubmissions.id),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    contentType: text('content_type').notNull(),
    content: privateBytes('content'),
    blobPath: text('blob_path'),
  },
  (table) => [
    index('work_files_submission_idx').on(table.submissionId),
    unique('work_files_blob_path_unique').on(table.blobPath),
    check('work_files_one_storage', sql`(${table.content} is not null) <> (${table.blobPath} is not null)`),
  ],
);
// A private upload becomes visible only after its owner claims it in a submission.
export const workUploads = pgTable('work_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => workTasks.id),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  taskVersion: integer('task_version').notNull(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  contentType: text('content_type').notNull(),
  blobPath: text('blob_path').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('work_uploads_pending_idx').on(table.ownerId, table.expiresAt),
]);
export const workEvents = pgTable(
  'work_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').references(() => workTasks.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('work_events_task_idx').on(table.taskId)],
);
export const workNotifications = pgTable(
  'work_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => workTasks.id),
    message: text('message').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('work_notifications_user_idx').on(table.userId)],
);
export type WorkspaceRole = typeof workspaceProfiles.$inferSelect.role;
export type ProgrammeRole = typeof programmeMembers.$inferSelect.role;
export type WorkTask = typeof workTasks.$inferSelect;

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    agenda: text('agenda').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    location: text('location').notNull().default(''),
    joinUrl: text('join_url'),
    minutes: text('minutes').notNull().default(''),
    status: text('status', { enum: ['scheduled', 'completed', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (table) => [index('meetings_start_idx').on(table.startsAt)],
);
export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    response: text('response', { enum: ['invited', 'accepted', 'declined'] })
      .notNull()
      .default('invited'),
  },
  (table) => [
    unique('meeting_participants_unique').on(table.meetingId, table.userId),
  ],
);
export const discussionGroups = pgTable('discussion_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isArchived: boolean('is_archived').notNull().default(false),
  ...timestamps,
});
export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => discussionGroups.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (table) => [unique('group_members_unique').on(table.groupId, table.userId)],
);
export const groupMessages = pgTable(
  'group_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => discussionGroups.id),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('group_messages_group_idx').on(table.groupId, table.createdAt),
  ],
);
export const ideas = pgTable('ideas', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  initiativeId: uuid('initiative_id').references(() => programmes.id),
  version: integer('version').notNull().default(0),
  ...timestamps,
});
export const ideaMembers = pgTable(
  'idea_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ideaId: uuid('idea_id')
      .notNull()
      .references(() => ideas.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  (table) => [unique('idea_members_unique').on(table.ideaId, table.userId)],
);
