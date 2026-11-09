import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema.js';
import {
  addSubjectToCurriculum,
  deactivateCourseSubject,
} from '../src/services/curriculum.service.js';
import {
  createDepartment,
  createCourse,
  createSemester,
  createSection,
  createFaculty,
  createSubject,
  createClassroom,
  deactivateDepartment,
  deactivateCourse,
  deactivateSemester,
  deactivateSection,
  deactivateFaculty,
  deactivateSubject,
  deactivateClassroom,
  deactivateUserAccount,
  activateCourse,
  activateFaculty,
  activateSubject,
} from '../src/services/academic.service.js';
import { ValidationError, ConflictError, NotFoundError } from '../src/errors/app.errors.js';
import { eq } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestDb() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

  // Load and execute schema migration
  const migrationPath = path.resolve(__dirname, '../drizzle/0000_abnormal_leopardon.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await pglite.exec(stmt);
  }

  return { pglite, db };
}

async function runServicesTestSuite(): Promise<void> {
  console.log('[Services Test Suite] Initializing in-memory PGlite instance and migrations...');
  const { pglite, db } = await setupTestDb();

  try {
    // =======================================================================
    // 1. Valid Curriculum Mapping & Academic Creation
    // =======================================================================
    console.log('\n--- 1. Testing Valid Academic Entities & Curriculum Mapping ---');
    const deptCSE = await createDepartment(db, { name: 'Computer Science', code: 'CSE' });
    assert.strictEqual(deptCSE.name, 'Computer Science');
    assert.strictEqual(deptCSE.is_active, true);

    const courseCS = await createCourse(db, {
      departmentId: deptCSE.id,
      name: 'B.Tech Computer Science',
      code: 'BTCS',
      totalSemesters: 8,
    });
    assert.strictEqual(courseCS.code, 'BTCS');
    assert.strictEqual(courseCS.total_semesters, 8);

    const subjectDS = await createSubject(db, {
      departmentId: deptCSE.id,
      code: 'CS201',
      name: 'Data Structures',
      type: 'THEORY',
    });
    assert.strictEqual(subjectDS.code, 'CS201');

    const mappedCS = await addSubjectToCurriculum(db, {
      courseId: courseCS.id,
      subjectId: subjectDS.id,
      departmentId: deptCSE.id,
      semesterNumber: 3,
    });
    assert.strictEqual(mappedCS.course_id, courseCS.id);
    assert.strictEqual(mappedCS.subject_id, subjectDS.id);
    assert.strictEqual(mappedCS.semester_number, 3);
    assert.strictEqual(mappedCS.is_active, true);

    console.log('✓ Valid department, course, subject, and curriculum mapping created.');

    // Duplicate mapping check
    await assert.rejects(
      async () => {
        await addSubjectToCurriculum(db, {
          courseId: courseCS.id,
          subjectId: subjectDS.id,
          departmentId: deptCSE.id,
          semesterNumber: 3,
        });
      },
      ConflictError,
      'Duplicate curriculum mapping must throw ConflictError'
    );
    console.log('✓ Duplicate curriculum mapping correctly rejected with ConflictError.');

    // =======================================================================
    // 2. Invalid Semester Number Rejection (Exceeding total_semesters)
    // =======================================================================
    console.log('\n--- 2. Testing Invalid Semester Number Rejection ---');
    await assert.rejects(
      async () => {
        await addSubjectToCurriculum(db, {
          courseId: courseCS.id,
          subjectId: subjectDS.id,
          departmentId: deptCSE.id,
          semesterNumber: 9, // Course only has 8 semesters
        });
      },
      ValidationError,
      'Mapping to semester > total_semesters must throw ValidationError'
    );

    // Verify no row was inserted for semester 9
    const sem9Rows = await db
      .select()
      .from(schema.courseSubjects)
      .where(eq(schema.courseSubjects.semester_number, 9));
    assert.strictEqual(sem9Rows.length, 0, 'No row must be persisted for rejected semester number');
    console.log('✓ Invalid semester number (9 > 8) rejected and confirmed not persisted.');

    // =======================================================================
    // 3. Cross-Department Mapping Rejection
    // =======================================================================
    console.log('\n--- 3. Testing Cross-Department Mapping Rejection ---');
    const deptMECH = await createDepartment(db, { name: 'Mechanical Engineering', code: 'MECH' });
    const subjectThermo = await createSubject(db, {
      departmentId: deptMECH.id,
      code: 'ME101',
      name: 'Thermodynamics',
      type: 'THEORY',
    });

    await assert.rejects(
      async () => {
        await addSubjectToCurriculum(db, {
          courseId: courseCS.id, // CSE department
          subjectId: subjectThermo.id, // MECH department
          departmentId: deptCSE.id,
          semesterNumber: 2,
        });
      },
      ValidationError,
      'Cross-department curriculum mapping must throw ValidationError'
    );
    console.log('✓ Cross-department subject mapping successfully rejected.');

    // =======================================================================
    // 4. Inactive Course & Subject Rejection
    // =======================================================================
    console.log('\n--- 4. Testing Inactive Course & Subject Rejection ---');
    // Deactivate subject
    await deactivateSubject(db, subjectDS.id);
    await assert.rejects(
      async () => {
        await addSubjectToCurriculum(db, {
          courseId: courseCS.id,
          subjectId: subjectDS.id,
          departmentId: deptCSE.id,
          semesterNumber: 4,
        });
      },
      ValidationError,
      'Mapping inactive subject must throw ValidationError'
    );

    // Reactivate subject for course deactivation test
    await db
      .update(schema.subjects)
      .set({ is_active: true })
      .where(eq(schema.subjects.id, subjectDS.id));

    // Deactivate course
    await deactivateCourse(db, courseCS.id);
    await assert.rejects(
      async () => {
        await addSubjectToCurriculum(db, {
          courseId: courseCS.id,
          subjectId: subjectDS.id,
          departmentId: deptCSE.id,
          semesterNumber: 4,
        });
      },
      ValidationError,
      'Mapping curriculum to inactive course must throw ValidationError'
    );

    // Reactivate course
    await db
      .update(schema.courses)
      .set({ is_active: true })
      .where(eq(schema.courses.id, courseCS.id));

    console.log('✓ Inactive course and subject mapping attempts successfully rejected.');

    // =======================================================================
    // 5. Semester & Section Creation Validation
    // =======================================================================
    console.log('\n--- 5. Testing Semester and Section Creation Validation ---');
    // Valid semester creation
    const sem1 = await createSemester(db, {
      courseId: courseCS.id,
      semesterNumber: 1,
      academicYear: '2026-2027',
      term: 'ODD',
    });
    assert.strictEqual(sem1.semester_number, 1);
    assert.strictEqual(sem1.term, 'ODD');

    // Invalid semester number (> total_semesters)
    await assert.rejects(
      async () => {
        await createSemester(db, {
          courseId: courseCS.id,
          semesterNumber: 10,
          academicYear: '2026-2027',
          term: 'EVEN',
        });
      },
      ValidationError,
      'Creating semester exceeding total_semesters must throw ValidationError'
    );

    // Valid section creation
    const secA = await createSection(db, {
      semesterId: sem1.id,
      name: 'A',
      classCode: 'CS26-1A',
    });
    assert.strictEqual(secA.name, 'A');
    assert.strictEqual(secA.class_code, 'CS26-1A');

    // Deactivating semester blocks creating sections
    await deactivateSemester(db, sem1.id);
    await assert.rejects(
      async () => {
        await createSection(db, {
          semesterId: sem1.id,
          name: 'B',
          classCode: 'CS26-1B',
        });
      },
      ValidationError,
      'Creating section under inactive semester must throw ValidationError'
    );

    console.log('✓ Semester bounds and section parent deactivation rules verified.');

    // =======================================================================
    // 6. Inactive Department Restrictions
    // =======================================================================
    console.log('\n--- 6. Testing Inactive Department Restrictions ---');
    const deptECE = await createDepartment(db, { name: 'Electronics Engineering', code: 'ECE' });

    // Create active child course, faculty, and subject while department is active
    const courseECE = await createCourse(db, {
      departmentId: deptECE.id,
      name: 'B.Tech ECE',
      code: 'BTECE',
      totalSemesters: 8,
    });
    const facultyECE = await createFaculty(db, {
      departmentId: deptECE.id,
      employeeCode: 'ECE001',
      name: 'Prof. Davis',
      email: 'davis@campus.edu',
    });
    const subjectECE = await createSubject(db, {
      departmentId: deptECE.id,
      code: 'EC101',
      name: 'Circuit Analysis',
      type: 'THEORY',
    });

    // Deactivate child entities first
    await deactivateCourse(db, courseECE.id);
    await deactivateFaculty(db, facultyECE.id);
    await deactivateSubject(db, subjectECE.id);

    // Deactivate parent department
    await deactivateDepartment(db, deptECE.id);

    // 6a. Attempt to create course under inactive department -> FAILS
    await assert.rejects(
      async () => {
        await createCourse(db, {
          departmentId: deptECE.id,
          name: 'M.Tech ECE',
          code: 'MTECE',
          totalSemesters: 4,
        });
      },
      ValidationError,
      'Cannot create course under inactive department'
    );

    // 6b. Attempt to create faculty under inactive department -> FAILS
    await assert.rejects(
      async () => {
        await createFaculty(db, {
          departmentId: deptECE.id,
          employeeCode: 'ECE002',
          name: 'Prof. Miller',
          email: 'miller@campus.edu',
        });
      },
      ValidationError,
      'Cannot create faculty under inactive department'
    );

    // 6c. Attempt to create subject under inactive department -> FAILS
    await assert.rejects(
      async () => {
        await createSubject(db, {
          departmentId: deptECE.id,
          code: 'EC102',
          name: 'Digital Signals',
          type: 'THEORY',
        });
      },
      ValidationError,
      'Cannot create subject under inactive department'
    );

    // 6d. Department deactivation prevents activation of existing child courses, faculty and subjects
    await assert.rejects(
      async () => {
        await activateCourse(db, courseECE.id);
      },
      ValidationError,
      'Cannot activate course under inactive department'
    );

    await assert.rejects(
      async () => {
        await activateFaculty(db, facultyECE.id);
      },
      ValidationError,
      'Cannot activate faculty under inactive department'
    );

    await assert.rejects(
      async () => {
        await activateSubject(db, subjectECE.id);
      },
      ValidationError,
      'Cannot activate subject under inactive department'
    );

    console.log('✓ Inactive department prevents new children and blocks activating existing courses, faculty, and subjects.');

    // =======================================================================
    // 7. Deactivation of All Approved Entities & Historical Data Preservation
    // =======================================================================
    console.log('\n--- 7. Testing Deactivation of All Entities & Data Preservation ---');
    const room1 = await createClassroom(db, {
      buildingBlock: 'Main Block',
      roomNumber: '101',
      type: 'LECTURE_HALL',
    });
    const deactivatedRoom = await deactivateClassroom(db, room1.id);
    assert.strictEqual(deactivatedRoom.is_active, false);

    const deactivatedSec = await deactivateSection(db, secA.id);
    assert.strictEqual(deactivatedSec.is_active, false);

    const deactivatedMap = await deactivateCourseSubject(db, mappedCS.id);
    assert.strictEqual(deactivatedMap.is_active, false);

    // Verify historical preservation: record is intact in DB, NOT deleted
    const [preservedSec] = await db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.id, secA.id));
    assert.ok(preservedSec, 'Historical section record must remain intact');
    assert.strictEqual(preservedSec.is_active, false);

    console.log('✓ Deactivation functions verified; historical records preserved.');

    // =======================================================================
    // 8. Faculty Deactivation Cascades to Linked User Account & Revokes Sessions
    // =======================================================================
    console.log('\n--- 8. Testing Faculty Deactivation -> User Account & Session Revocation ---');
    const facultyMember = await createFaculty(db, {
      departmentId: deptCSE.id,
      employeeCode: 'CS_FAC_001',
      name: 'Dr. Alice',
      email: 'alice@campus.edu',
    });

    // Create user account linked to faculty
    const [userAcc] = await db
      .insert(schema.userAccounts)
      .values({
        username: 'alice_prof',
        password_hash: 'sample_hash_bcrypt_12',
        role: 'FACULTY',
        faculty_id: facultyMember.id,
        is_active: true,
      })
      .returning();

    // Create active session for user
    const [activeSession] = await db
      .insert(schema.userSessions)
      .values({
        user_id: userAcc.id,
        token_hash: 'c'.repeat(64),
        csrf_secret: 'csrf_secret_alice',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
      })
      .returning();

    assert.strictEqual(activeSession.is_revoked, false, 'Precondition: session must be active');

    // Deactivating faculty MUST deactivate linked user account AND revoke active session
    await deactivateFaculty(db, facultyMember.id);

    const [updatedFaculty] = await db
      .select()
      .from(schema.faculty)
      .where(eq(schema.faculty.id, facultyMember.id));
    assert.strictEqual(updatedFaculty.is_active, false, 'Faculty must be inactive');

    const [updatedUser] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, userAcc.id));
    assert.strictEqual(updatedUser.is_active, false, 'Linked user account must be deactivated');

    const [updatedSession] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.id, activeSession.id));
    assert.strictEqual(updatedSession.is_revoked, true, 'Active user session must be revoked');

    console.log('✓ Faculty deactivation deactivated linked account and revoked active session.');

    // =======================================================================
    // 9. User Account Deactivation Directly Revokes Active Sessions
    // =======================================================================
    console.log('\n--- 9. Testing Direct User Account Deactivation Session Revocation ---');
    const [adminUser] = await db
      .insert(schema.userAccounts)
      .values({
        username: 'standalone_admin',
        password_hash: 'sample_hash_bcrypt_12',
        role: 'ADMIN',
        faculty_id: null,
        is_active: true,
      })
      .returning();

    const [adminSession] = await db
      .insert(schema.userSessions)
      .values({
        user_id: adminUser.id,
        token_hash: 'd'.repeat(64),
        csrf_secret: 'csrf_secret_admin',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
      })
      .returning();

    await deactivateUserAccount(db, adminUser.id);

    const [revokedAdminSession] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.id, adminSession.id));
    assert.strictEqual(revokedAdminSession.is_revoked, true, 'Direct user deactivation must revoke session');
    console.log('✓ Direct user account deactivation revoked active sessions.');

    // =======================================================================
    // 10. Database Transaction Rollback on Failure
    // =======================================================================
    console.log('\n--- 10. Testing Database Transaction Rollback ---');
    const rollbackTestSubjectCode = 'CS_ROLLBACK';

    let txErrorCaught = false;
    try {
      await db.transaction(async (tx) => {
        // Step A: Insert a valid subject
        await createSubject(tx, {
          departmentId: deptCSE.id,
          code: rollbackTestSubjectCode,
          name: 'Rollback Subject Test',
          type: 'LAB',
        });

        // Step B: Intentionally trigger validation failure
        throw new ValidationError('Simulated mid-transaction failure');
      });
    } catch (err: unknown) {
      txErrorCaught = err instanceof ValidationError;
    }

    assert.strictEqual(txErrorCaught, true, 'Transaction failure must be caught');

    // Confirm that Step A was rolled back and does NOT exist in database
    const [checkRolledBack] = await db
      .select()
      .from(schema.subjects)
      .where(eq(schema.subjects.code, rollbackTestSubjectCode));
    assert.strictEqual(
      checkRolledBack,
      undefined,
      'Subject from failed transaction must be rolled back and not persisted'
    );

    console.log('✓ Database transaction rollback verified: uncommitted operations left 0 rows.');

    console.log('\n[Services Test Suite] All 10 service & deactivation tests PASSED successfully.');
  } finally {
    await pglite.close();
  }
}

runServicesTestSuite().catch((err) => {
  console.error('\n[Services Test Suite Error]:', err);
  process.exit(1);
});
