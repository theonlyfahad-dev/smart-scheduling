import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  unique,
  check,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// 1. Departments
// ---------------------------------------------------------------------------
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('departments_name_unique').on(table.name),
    unique('departments_code_unique').on(table.code),
  ]
);

// ---------------------------------------------------------------------------
// 2. Courses
// ---------------------------------------------------------------------------
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    department_id: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 150 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    total_semesters: integer('total_semesters').notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('courses_total_semesters_check', sql`total_semesters >= 1 AND total_semesters <= 12`),
    unique('courses_department_id_code_unique').on(table.department_id, table.code),
    unique('courses_id_department_id_unique').on(table.id, table.department_id),
  ]
);

// ---------------------------------------------------------------------------
// 3. Semesters
// ---------------------------------------------------------------------------
export const semesters = pgTable(
  'semesters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    course_id: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    semester_number: integer('semester_number').notNull(),
    academic_year: varchar('academic_year', { length: 20 }).notNull(),
    term: varchar('term', { length: 10 }).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('semesters_semester_number_check', sql`semester_number >= 1 AND semester_number <= 12`),
    check('semesters_term_check', sql`term IN ('ODD', 'EVEN')`),
    unique('semesters_course_year_sem_unique').on(table.course_id, table.academic_year, table.semester_number),
  ]
);

// ---------------------------------------------------------------------------
// 4. Sections
// ---------------------------------------------------------------------------
export const sections = pgTable(
  'sections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    semester_id: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 10 }).notNull(),
    class_code: varchar('class_code', { length: 30 }).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sections_semester_id_name_unique').on(table.semester_id, table.name),
    unique('sections_class_code_unique').on(table.class_code),
  ]
);

// ---------------------------------------------------------------------------
// 5. Faculty
// ---------------------------------------------------------------------------
export const faculty = pgTable(
  'faculty',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    department_id: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    employee_code: varchar('employee_code', { length: 30 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 25 }),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('faculty_employee_code_unique').on(table.employee_code),
    uniqueIndex('idx_faculty_lower_email').on(sql`LOWER(${table.email})`),
  ]
);

// ---------------------------------------------------------------------------
// 6. Subjects
// ---------------------------------------------------------------------------
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    department_id: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('subjects_type_check', sql`type IN ('THEORY', 'LAB', 'TUTORIAL')`),
    unique('subjects_department_id_code_unique').on(table.department_id, table.code),
    unique('subjects_id_department_id_unique').on(table.id, table.department_id),
  ]
);

// ---------------------------------------------------------------------------
// 7. Course Subjects (Curriculum Mapping)
// ---------------------------------------------------------------------------
export const courseSubjects = pgTable(
  'course_subjects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    course_id: uuid('course_id').notNull(),
    subject_id: uuid('subject_id').notNull(),
    department_id: uuid('department_id').notNull(),
    semester_number: integer('semester_number').notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.course_id, table.department_id],
      foreignColumns: [courses.id, courses.department_id],
      name: 'course_subjects_course_dept_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.subject_id, table.department_id],
      foreignColumns: [subjects.id, subjects.department_id],
      name: 'course_subjects_subject_dept_fk',
    }).onDelete('restrict'),
    check('course_subjects_semester_number_check', sql`semester_number >= 1 AND semester_number <= 12`),
    unique('course_subjects_course_subject_sem_unique').on(
      table.course_id,
      table.subject_id,
      table.semester_number
    ),
  ]
);

// ---------------------------------------------------------------------------
// 8. Classrooms
// ---------------------------------------------------------------------------
export const classrooms = pgTable(
  'classrooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    building_block: varchar('building_block', { length: 50 }).notNull(),
    room_number: varchar('room_number', { length: 30 }).notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('classrooms_type_check', sql`type IN ('LECTURE_HALL', 'LAB', 'SEMINAR_ROOM')`),
    unique('classrooms_building_room_unique').on(table.building_block, table.room_number),
  ]
);

// ---------------------------------------------------------------------------
// 9. User Accounts
// ---------------------------------------------------------------------------
export const userAccounts = pgTable(
  'user_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 50 }).notNull(),
    password_hash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    faculty_id: uuid('faculty_id').references(() => faculty.id, { onDelete: 'restrict' }),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('user_accounts_role_check', sql`role IN ('ADMIN', 'HOD', 'FACULTY')`),
    uniqueIndex('idx_user_accounts_lower_username').on(sql`LOWER(${table.username})`),
    uniqueIndex('idx_user_accounts_faculty_id')
      .on(table.faculty_id)
      .where(sql`faculty_id IS NOT NULL`),
  ]
);

// ---------------------------------------------------------------------------
// 10. User Sessions
// ---------------------------------------------------------------------------
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => userAccounts.id, { onDelete: 'cascade' }),
    token_hash: varchar('token_hash', { length: 64 }).notNull(),
    csrf_secret: varchar('csrf_secret', { length: 64 }).notNull(),
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    is_revoked: boolean('is_revoked').default(false).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('user_sessions_token_hash_unique').on(table.token_hash),
    index('idx_user_sessions_user_id').on(table.user_id),
    index('idx_user_sessions_expires_at').on(table.expires_at),
  ]
);
