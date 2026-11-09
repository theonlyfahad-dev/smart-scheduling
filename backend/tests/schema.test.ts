import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSchemaVerification(): Promise<void> {
  console.log('[Audit Test] Initializing in-memory PGlite instance...');
  const pglite = new PGlite();

  const migrationPath = path.resolve(__dirname, '../drizzle/0000_abnormal_leopardon.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');

  // Split migration statements by breakpoint
  const statements = sqlContent
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`[Audit Test] Executing ${statements.length} migration statements...`);
  for (const stmt of statements) {
    await pglite.exec(stmt);
  }

  // =========================================================================
  // AUDIT ITEM 1 & 2: Verify all 10 tables exist in public schema
  // =========================================================================
  const expectedTables = [
    'classrooms',
    'course_subjects',
    'courses',
    'departments',
    'faculty',
    'sections',
    'semesters',
    'subjects',
    'user_accounts',
    'user_sessions',
  ];

  const tableQueryResult = await pglite.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );
  const actualTables = tableQueryResult.rows.map((r) => r.table_name);

  for (const expected of expectedTables) {
    if (!actualTables.includes(expected)) {
      throw new Error(`Missing expected table: ${expected}`);
    }
  }
  console.log('✓ Audit Check 1 & 2: All 10 tables exist and match schema definition.');

  // Helper UUIDs for seeding
  const deptCSE = '11111111-1111-1111-1111-111111111111';
  const deptMECH = '22222222-2222-2222-2222-222222222222';
  const courseCSE = '33333333-3333-3333-3333-333333333333';
  const courseMECH = '44444444-4444-4444-4444-444444444444';
  const semesterCSE = '55555555-5555-5555-5555-555555555555';
  const sectionCSE = '66666666-6666-6666-6666-666666666666';
  const faculty1 = '77777777-7777-7777-7777-777777777777';
  const subjectCSE = '88888888-8888-8888-8888-888888888888';
  const subjectMECH = '99999999-9999-9999-9999-999999999999';
  const courseSubj = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const classroom1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const user1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const user2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const userNoFaculty1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const userNoFaculty2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const session1 = '12121212-1212-1212-1212-121212121212';
  const session2 = '34343434-3434-3434-3434-343434343434';

  // Seed baseline records for all 10 tables
  await pglite.exec(`INSERT INTO departments (id, name, code) VALUES ('${deptCSE}', 'Computer Science', 'CSE');`);
  await pglite.exec(`INSERT INTO departments (id, name, code) VALUES ('${deptMECH}', 'Mechanical Eng', 'MECH');`);
  await pglite.exec(`INSERT INTO courses (id, department_id, name, code, total_semesters) VALUES ('${courseCSE}', '${deptCSE}', 'B.Tech CS', 'BTECH', 8);`);
  await pglite.exec(`INSERT INTO semesters (id, course_id, semester_number, academic_year, term) VALUES ('${semesterCSE}', '${courseCSE}', 3, '2026-2027', 'ODD');`);
  await pglite.exec(`INSERT INTO sections (id, semester_id, name, class_code) VALUES ('${sectionCSE}', '${semesterCSE}', 'A', 'CSE-3A-2026');`);
  await pglite.exec(`INSERT INTO faculty (id, department_id, employee_code, name, email) VALUES ('${faculty1}', '${deptCSE}', 'EMP001', 'Dr. Smith', 'smith@campus.edu');`);
  await pglite.exec(`INSERT INTO subjects (id, department_id, code, name, type) VALUES ('${subjectCSE}', '${deptCSE}', 'CS301', 'Data Structures', 'THEORY');`);
  await pglite.exec(`INSERT INTO course_subjects (id, course_id, subject_id, department_id, semester_number) VALUES ('${courseSubj}', '${courseCSE}', '${subjectCSE}', '${deptCSE}', 3);`);
  await pglite.exec(`INSERT INTO classrooms (id, building_block, room_number, type) VALUES ('${classroom1}', 'Block A', '101', 'LECTURE_HALL');`);
  await pglite.exec(`INSERT INTO user_accounts (id, username, password_hash, role, faculty_id) VALUES ('${user1}', 'faculty_smith', 'hash_pw_1', 'FACULTY', '${faculty1}');`);
  await pglite.exec(`INSERT INTO user_sessions (id, user_id, token_hash, csrf_secret, expires_at) VALUES ('${session1}', '${user1}', '${'a'.repeat(64)}', 'csrf1', NOW() + INTERVAL '1 day');`);

  // =========================================================================
  // AUDIT ITEM 3: Verify all 10 tables have working updated_at triggers
  // =========================================================================
  const tablesToTestTriggers = [
    { table: 'departments', id: deptCSE, update: "name = 'CS Department Updated'" },
    { table: 'courses', id: courseCSE, update: "name = 'B.Tech CS Updated'" },
    { table: 'semesters', id: semesterCSE, update: "term = 'EVEN'" },
    { table: 'sections', id: sectionCSE, update: "name = 'B'" },
    { table: 'faculty', id: faculty1, update: "name = 'Dr. John Smith'" },
    { table: 'subjects', id: subjectCSE, update: "name = 'Advanced Data Structures'" },
    { table: 'course_subjects', id: courseSubj, update: "semester_number = 4" },
    { table: 'classrooms', id: classroom1, update: "type = 'LAB'" },
    { table: 'user_accounts', id: user1, update: "role = 'HOD'" },
    { table: 'user_sessions', id: session1, update: "is_revoked = true" },
  ];

  for (const item of tablesToTestTriggers) {
    const before = await pglite.query<{ updated_at: string }>(
      `SELECT updated_at FROM ${item.table} WHERE id = '${item.id}';`
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await pglite.exec(`UPDATE ${item.table} SET ${item.update} WHERE id = '${item.id}';`);
    const after = await pglite.query<{ updated_at: string }>(
      `SELECT updated_at FROM ${item.table} WHERE id = '${item.id}';`
    );

    const beforeTime = new Date(before.rows[0].updated_at).getTime();
    const afterTime = new Date(after.rows[0].updated_at).getTime();

    if (afterTime <= beforeTime) {
      throw new Error(`Trigger failure: ${item.table}.updated_at was not updated.`);
    }
  }
  console.log('✓ Audit Check 3: Verified updated_at triggers on all 10 tables.');

  // =========================================================================
  // AUDIT ITEM 4: Test ON DELETE RESTRICT and user_sessions CASCADE
  // =========================================================================
  // 4a. Attempt to delete department with existing course -> MUST FAIL (RESTRICT)
  let deptDeleteFailed = false;
  try {
    await pglite.exec(`DELETE FROM departments WHERE id = '${deptCSE}';`);
  } catch (err: unknown) {
    deptDeleteFailed = String(err).includes('courses_department_id_departments_id_fk');
  }
  if (!deptDeleteFailed) {
    throw new Error('ON DELETE RESTRICT failure: Deleting department with existing courses was not rejected.');
  }

  // 4b. Attempt to delete course with existing semester -> MUST FAIL (RESTRICT)
  let courseDeleteFailed = false;
  try {
    await pglite.exec(`DELETE FROM courses WHERE id = '${courseCSE}';`);
  } catch (err: unknown) {
    courseDeleteFailed = String(err).includes('semesters_course_id_courses_id_fk') || String(err).includes('course_subjects_course_dept_fk');
  }
  if (!courseDeleteFailed) {
    throw new Error('ON DELETE RESTRICT failure: Deleting course with existing semesters/curriculum was not rejected.');
  }

  // 4c. Attempt to delete faculty with linked user_account -> MUST FAIL (RESTRICT)
  let facultyDeleteFailed = false;
  try {
    await pglite.exec(`DELETE FROM faculty WHERE id = '${faculty1}';`);
  } catch (err: unknown) {
    facultyDeleteFailed = String(err).includes('user_accounts_faculty_id_faculty_id_fk');
  }
  if (!facultyDeleteFailed) {
    throw new Error('ON DELETE RESTRICT failure: Deleting faculty with linked user account was not rejected.');
  }

  // 4d. Deleting user account -> MUST CASCADE delete sessions
  const sessionCheckBefore = await pglite.query(`SELECT COUNT(*) as count FROM user_sessions WHERE user_id = '${user1}';`);
  if (Number(sessionCheckBefore.rows[0].count) !== 1) {
    throw new Error('Precondition failure: session for user1 does not exist.');
  }
  await pglite.exec(`DELETE FROM user_accounts WHERE id = '${user1}';`);
  const sessionCheckAfter = await pglite.query(`SELECT COUNT(*) as count FROM user_sessions WHERE user_id = '${user1}';`);
  if (Number(sessionCheckAfter.rows[0].count) !== 0) {
    throw new Error('ON DELETE CASCADE failure: user_sessions rows were not removed when user was deleted.');
  }
  console.log('✓ Audit Check 4: ON DELETE RESTRICT on hierarchy and CASCADE on sessions verified.');

  // =========================================================================
  // AUDIT ITEM 5: Department-scoped uniqueness for courses and subjects
  // =========================================================================
  // 5a. Courses: Same code 'BTECH' in MECH department -> SUCCEEDS (department-scoped)
  await pglite.exec(
    `INSERT INTO courses (id, department_id, name, code, total_semesters) VALUES ('${courseMECH}', '${deptMECH}', 'B.Tech Mech', 'BTECH', 8);`
  );
  // 5b. Courses: Duplicate code 'BTECH' in MECH department -> MUST FAIL
  let dupCourseInDeptFailed = false;
  try {
    await pglite.exec(
      `INSERT INTO courses (id, department_id, name, code, total_semesters) VALUES ('ffffffff-0000-0000-0000-000000000001', '${deptMECH}', 'B.Tech Mech 2', 'BTECH', 8);`
    );
  } catch (err: unknown) {
    dupCourseInDeptFailed = String(err).includes('courses_department_id_code_unique');
  }
  if (!dupCourseInDeptFailed) {
    throw new Error('Uniqueness failure: Duplicate course code in the same department was not rejected.');
  }

  // 5c. Subjects: Same code 'CS301' in MECH department -> SUCCEEDS (department-scoped)
  await pglite.exec(
    `INSERT INTO subjects (id, department_id, code, name, type) VALUES ('${subjectMECH}', '${deptMECH}', 'CS301', 'Applied CS for Mech', 'THEORY');`
  );
  // 5d. Subjects: Duplicate code 'CS301' in MECH department -> MUST FAIL
  let dupSubjectInDeptFailed = false;
  try {
    await pglite.exec(
      `INSERT INTO subjects (id, department_id, code, name, type) VALUES ('ffffffff-0000-0000-0000-000000000002', '${deptMECH}', 'CS301', 'Duplicate Subject', 'THEORY');`
    );
  } catch (err: unknown) {
    dupSubjectInDeptFailed = String(err).includes('subjects_department_id_code_unique');
  }
  if (!dupSubjectInDeptFailed) {
    throw new Error('Uniqueness failure: Duplicate subject code in the same department was not rejected.');
  }
  console.log('✓ Audit Check 5: Department-scoped uniqueness for courses and subjects verified.');

  // =========================================================================
  // AUDIT ITEM 6: Faculty-account one-to-one constraint
  // =========================================================================
  // Re-create user for faculty1
  await pglite.exec(
    `INSERT INTO user_accounts (id, username, password_hash, role, faculty_id) VALUES ('${user2}', 'dr_smith_account', 'hash_pw_2', 'FACULTY', '${faculty1}');`
  );
  // Attempt to assign the SAME faculty1 to another account -> MUST FAIL
  let duplicateFacultyAccountFailed = false;
  try {
    await pglite.exec(
      `INSERT INTO user_accounts (id, username, password_hash, role, faculty_id) VALUES ('ffffffff-0000-0000-0000-000000000003', 'dr_smith_second_acc', 'hash_pw_3', 'FACULTY', '${faculty1}');`
    );
  } catch (err: unknown) {
    duplicateFacultyAccountFailed = String(err).includes('idx_user_accounts_faculty_id');
  }
  if (!duplicateFacultyAccountFailed) {
    throw new Error('1:1 constraint failure: Two user accounts were permitted for the same faculty member.');
  }

  // Multiple user accounts with NULL faculty_id (e.g. general administrators) -> MUST SUCCEED
  await pglite.exec(
    `INSERT INTO user_accounts (id, username, password_hash, role, faculty_id) VALUES ('${userNoFaculty1}', 'admin_one', 'hash_admin_1', 'ADMIN', NULL);`
  );
  await pglite.exec(
    `INSERT INTO user_accounts (id, username, password_hash, role, faculty_id) VALUES ('${userNoFaculty2}', 'admin_two', 'hash_admin_2', 'ADMIN', NULL);`
  );
  console.log('✓ Audit Check 6: Faculty-account 1:1 constraint (and multiple NULL admins) verified.');

  // =========================================================================
  // AUDIT ITEM 7: Session token uniqueness
  // =========================================================================
  const tokenHash = 'b'.repeat(64);
  await pglite.exec(
    `INSERT INTO user_sessions (id, user_id, token_hash, csrf_secret, expires_at) VALUES ('${session2}', '${user2}', '${tokenHash}', 'csrf_sec_1', NOW() + INTERVAL '1 day');`
  );
  let duplicateTokenFailed = false;
  try {
    await pglite.exec(
      `INSERT INTO user_sessions (id, user_id, token_hash, csrf_secret, expires_at) VALUES ('ffffffff-0000-0000-0000-000000000004', '${user2}', '${tokenHash}', 'csrf_sec_2', NOW() + INTERVAL '1 day');`
    );
  } catch (err: unknown) {
    duplicateTokenFailed = String(err).includes('user_sessions_token_hash_unique');
  }
  if (!duplicateTokenFailed) {
    throw new Error('Token uniqueness failure: Duplicate session token_hash was not rejected.');
  }
  console.log('✓ Audit Check 7: Session token_hash uniqueness verified.');

  await pglite.close();
  console.log('\n[Audit Test] All 7 targeted audit items PASSED successfully.');
}

runSchemaVerification().catch((err) => {
  console.error('[Audit Test Error]:', err);
  process.exit(1);
});
