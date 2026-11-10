import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { createAdminMasterDataRouter } from '../src/routes/admin/master-data.routes.js';
import { hashPassword } from '../src/auth/password.js';
import { generateSessionToken, hashToken } from '../src/auth/token.js';
import { generateCsrfSecret } from '../src/auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestDb() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

  const migrationPath = path.resolve(__dirname, '../drizzle/0000_abnormal_leopardon.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await pglite.exec(stmt);
  }

  return { pglite, db };
}

function dispatch(router: any, options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  query?: Record<string, any>;
}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;
    let resolved = false;

    const normalizedHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
      }
    }

    // Parse query params from URL if present
    const urlParts = options.url.split('?');
    const pathPart = urlParts[0];
    const queryParams: Record<string, any> = { ...options.query };
    if (urlParts[1]) {
      const searchParams = new URLSearchParams(urlParts[1]);
      for (const [k, v] of searchParams.entries()) {
        queryParams[k] = v;
      }
    }

    const req: any = {
      method: options.method.toUpperCase(),
      url: options.url,
      path: pathPart,
      headers: normalizedHeaders,
      body: options.body ?? {},
      cookies: options.cookies ?? {},
      query: queryParams,
    };

    const triggerResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve({ status: statusCode, body: responseBody });
      }
    };

    const res: any = {
      locals: {},
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        responseBody = data;
        triggerResolve();
        return res;
      },
      send(data: any) {
        responseBody = data;
        triggerResolve();
        return res;
      },
    };

    router.handle(req, res, (err: any) => {
      if (err) {
        statusCode = 500;
        responseBody = { error: err.message };
      } else if (!resolved) {
        statusCode = 404;
        responseBody = { error: 'Not found' };
      }
      triggerResolve();
    });
  });
}

async function runAdminMasterDataIntegrationTestSuite() {
  console.log('=== RUNNING ADMIN MASTER DATA INTEGRATION TEST SUITE ===');
  const { pglite, db } = await setupTestDb();
  const router = createAdminMasterDataRouter(db);

  // ---------------------------------------------------------------------------
  // 0. Seed RBAC Users: ADMIN, HOD, FACULTY
  // ---------------------------------------------------------------------------
  const passwordHash = await hashPassword('AdminPass123!');
  const [adminUser] = await db
    .insert(schema.userAccounts)
    .values({ username: 'admin', password_hash: passwordHash, role: 'ADMIN', is_active: true })
    .returning();

  const [hodUser] = await db
    .insert(schema.userAccounts)
    .values({ username: 'hod', password_hash: passwordHash, role: 'HOD', is_active: true })
    .returning();

  const [facultyUser] = await db
    .insert(schema.userAccounts)
    .values({ username: 'faculty', password_hash: passwordHash, role: 'FACULTY', is_active: true })
    .returning();

  const adminToken = generateSessionToken();
  const adminCsrf = generateCsrfSecret();
  await db.insert(schema.userSessions).values({
    user_id: adminUser.id,
    token_hash: hashToken(adminToken),
    csrf_secret: adminCsrf,
    expires_at: new Date(Date.now() + 86400000),
  });

  const hodToken = generateSessionToken();
  const hodCsrf = generateCsrfSecret();
  await db.insert(schema.userSessions).values({
    user_id: hodUser.id,
    token_hash: hashToken(hodToken),
    csrf_secret: hodCsrf,
    expires_at: new Date(Date.now() + 86400000),
  });

  const facultyToken = generateSessionToken();
  const facultyCsrf = generateCsrfSecret();
  await db.insert(schema.userSessions).values({
    user_id: facultyUser.id,
    token_hash: hashToken(facultyToken),
    csrf_secret: facultyCsrf,
    expires_at: new Date(Date.now() + 86400000),
  });

  const adminAuth = {
    cookies: { [SESSION_COOKIE_NAME]: adminToken },
    headers: { 'x-csrf-token': adminCsrf },
  };

  // Helper for admin requests
  const api = {
    get: (url: string) => dispatch(router, { method: 'GET', url, cookies: adminAuth.cookies }),
    post: (url: string, body: any) =>
      dispatch(router, { method: 'POST', url, cookies: adminAuth.cookies, headers: adminAuth.headers, body }),
    patch: (url: string, body: any) =>
      dispatch(router, { method: 'PATCH', url, cookies: adminAuth.cookies, headers: adminAuth.headers, body }),
    delete: (url: string) =>
      dispatch(router, { method: 'DELETE', url, cookies: adminAuth.cookies, headers: adminAuth.headers }),
  };

  // ---------------------------------------------------------------------------
  // 1. Security & RBAC Suite
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Testing Security, RBAC & CSRF Protection ---');
  {
    // Unauthenticated
    const unauth = await dispatch(router, { method: 'GET', url: '/departments' });
    assert.equal(unauth.status, 401);

    // HOD role -> 403
    const hodReq = await dispatch(router, {
      method: 'GET',
      url: '/departments',
      cookies: { [SESSION_COOKIE_NAME]: hodToken },
    });
    assert.equal(hodReq.status, 403);

    // Faculty role -> 403
    const facReq = await dispatch(router, {
      method: 'GET',
      url: '/departments',
      cookies: { [SESSION_COOKIE_NAME]: facultyToken },
    });
    assert.equal(facReq.status, 403);

    // Missing CSRF on state-changing method -> 403
    const noCsrf = await dispatch(router, {
      method: 'POST',
      url: '/departments',
      cookies: adminAuth.cookies,
      body: { name: 'Dept Test', code: 'DT' },
    });
    assert.equal(noCsrf.status, 403);

    // Mismatched CSRF -> 403
    const badCsrf = await dispatch(router, {
      method: 'POST',
      url: '/departments',
      cookies: adminAuth.cookies,
      headers: { 'x-csrf-token': 'wrong-csrf-token' },
      body: { name: 'Dept Test', code: 'DT' },
    });
    assert.equal(badCsrf.status, 403);

    // Safe GET with Admin cookies -> 200
    const safeGet = await api.get('/departments');
    assert.equal(safeGet.status, 200);
    console.log('✔ Auth, RBAC, and CSRF protection verified');
  }

  // ---------------------------------------------------------------------------
  // 2. Departments CRUD Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing Departments CRUD Lifecycle ---');
  let deptAId = '';
  let deptBId = '';
  {
    // Create Department A
    const resA = await api.post('/departments', { name: 'Computer Science', code: 'cs' });
    assert.equal(resA.status, 201);
    assert.equal(resA.body.data.name, 'Computer Science');
    assert.equal(resA.body.data.code, 'CS');
    assert.equal(resA.body.data.is_active, true);
    deptAId = resA.body.data.id;

    // Create Department B
    const resB = await api.post('/departments', { name: 'Electrical Engineering', code: 'EE' });
    assert.equal(resB.status, 201);
    deptBId = resB.body.data.id;

    // Duplicate code -> 409
    const dupCode = await api.post('/departments', { name: 'Other CS', code: 'CS' });
    assert.equal(dupCode.status, 409);

    // Duplicate name -> 409
    const dupName = await api.post('/departments', { name: 'Computer Science', code: 'CS2' });
    assert.equal(dupName.status, 409);

    // List departments with pagination
    const listRes = await api.get('/departments?limit=10&offset=0&sortBy=name&sortOrder=asc');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.pagination.total, 2);
    assert.equal(listRes.body.data[0].code, 'CS');

    // Detail by ID
    const detail = await api.get(`/departments/${deptAId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.code, 'CS');

    // Invalid UUID param -> 400
    const invalidId = await api.get('/departments/not-a-valid-uuid');
    assert.equal(invalidId.status, 400);

    // Nonexistent UUID -> 404
    const notFound = await api.get('/departments/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    assert.equal(notFound.status, 404);

    // PATCH Update
    const patchRes = await api.patch(`/departments/${deptAId}`, { name: 'Computer Science and Engineering' });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.name, 'Computer Science and Engineering');

    // PATCH Collision -> 409
    const patchConflict = await api.patch(`/departments/${deptAId}`, { code: 'EE' });
    assert.equal(patchConflict.status, 409);

    // Soft-deactivation via DELETE
    const rowCountBefore = await db.select({ count: sql<number>`count(*)::int` }).from(schema.departments);
    const delRes = await api.delete(`/departments/${deptBId}`);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.is_active, false);

    const rowCountAfter = await db.select({ count: sql<number>`count(*)::int` }).from(schema.departments);
    assert.equal(rowCountBefore[0].count, rowCountAfter[0].count, 'DELETE must not decrease physical row count');

    // Active filter
    const activeList = await api.get('/departments?isActive=true');
    assert.equal(activeList.body.pagination.total, 1);
    assert.equal(activeList.body.data[0].id, deptAId);

    // Reactivation via POST /:id/activate
    const actRes = await api.post(`/departments/${deptBId}/activate`, {});
    assert.equal(actRes.status, 200);
    assert.equal(actRes.body.data.is_active, true);
    console.log('✔ Departments CRUD, uniqueness, pagination, soft-deactivate & activate verified');
  }

  // ---------------------------------------------------------------------------
  // 3. Courses CRUD & Relational Rules
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Courses CRUD & Relational Integrity ---');
  let courseId = '';
  {
    // Create Course
    const res = await api.post('/courses', {
      departmentId: deptAId,
      name: 'B.Tech CSE',
      code: 'cse',
      totalSemesters: 8,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.code, 'CSE');
    courseId = res.body.data.id;

    // Duplicate code within same department -> 409
    const dupCourse = await api.post('/courses', {
      departmentId: deptAId,
      name: 'B.Tech CSE Second Shift',
      code: 'CSE',
      totalSemesters: 8,
    });
    assert.equal(dupCourse.status, 409);

    // Invalid totalSemesters (> 12) -> 400
    const invalidSem = await api.post('/courses', {
      departmentId: deptAId,
      name: 'Long Course',
      code: 'LC',
      totalSemesters: 16,
    });
    assert.equal(invalidSem.status, 400);

    // Create course under inactive department -> 400
    await api.delete(`/departments/${deptBId}`);
    const inactiveDeptCourse = await api.post('/courses', {
      departmentId: deptBId,
      name: 'B.Tech EE',
      code: 'EE01',
      totalSemesters: 8,
    });
    assert.equal(inactiveDeptCourse.status, 400);
    await api.post(`/departments/${deptBId}/activate`, {}); // Reactivate deptB

    // PATCH update
    const patchCourse = await api.patch(`/courses/${courseId}`, { name: 'B.Tech Computer Science & Engineering' });
    assert.equal(patchCourse.status, 200);
    assert.equal(patchCourse.body.data.name, 'B.Tech Computer Science & Engineering');

    // DELETE soft-deactivation
    const delCourse = await api.delete(`/courses/${courseId}`);
    assert.equal(delCourse.status, 200);
    assert.equal(delCourse.body.data.is_active, false);

    // Reactivate course
    const actCourse = await api.post(`/courses/${courseId}/activate`, {});
    assert.equal(actCourse.status, 200);
    assert.equal(actCourse.body.data.is_active, true);
    console.log('✔ Courses CRUD, department relation, and soft-deactivation verified');
  }

  // ---------------------------------------------------------------------------
  // 4. Semesters CRUD & Relational Rules
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Semesters CRUD & Bounds Verification ---');
  let semesterId = '';
  {
    // Create Semester
    const res = await api.post('/semesters', {
      courseId,
      semesterNumber: 1,
      academicYear: '2026-2027',
      term: 'ODD',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.semester_number, 1);
    semesterId = res.body.data.id;

    // Semester number exceeding course totalSemesters (8) -> 400
    const exceedSem = await api.post('/semesters', {
      courseId,
      semesterNumber: 9,
      academicYear: '2026-2027',
      term: 'ODD',
    });
    assert.equal(exceedSem.status, 400);

    // Duplicate semester -> 409
    const dupSem = await api.post('/semesters', {
      courseId,
      semesterNumber: 1,
      academicYear: '2026-2027',
      term: 'ODD',
    });
    assert.equal(dupSem.status, 409);

    // PATCH update
    const patchSem = await api.patch(`/semesters/${semesterId}`, { semesterNumber: 3 });
    assert.equal(patchSem.status, 200);
    assert.equal(patchSem.body.data.semester_number, 3);

    // DELETE soft-deactivation
    const delSem = await api.delete(`/semesters/${semesterId}`);
    assert.equal(delSem.status, 200);
    assert.equal(delSem.body.data.is_active, false);

    // Reactivate
    const actSem = await api.post(`/semesters/${semesterId}/activate`, {});
    assert.equal(actSem.status, 200);
    assert.equal(actSem.body.data.is_active, true);
    console.log('✔ Semesters CRUD, course total bounds, and soft-deactivation verified');
  }

  // ---------------------------------------------------------------------------
  // 5. Sections CRUD & Relational Rules
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing Sections CRUD & Class Code Uniqueness ---');
  let sectionId = '';
  {
    // Create Section
    const res = await api.post('/sections', {
      semesterId,
      name: 'A',
      classCode: 'CSE-S3-A',
    });
    assert.equal(res.status, 201);
    sectionId = res.body.data.id;

    // Duplicate name in same semester -> 409
    const dupName = await api.post('/sections', {
      semesterId,
      name: 'A',
      classCode: 'CSE-S3-A-ALT',
    });
    assert.equal(dupName.status, 409);

    // Duplicate classCode globally -> 409
    const dupCode = await api.post('/sections', {
      semesterId,
      name: 'B',
      classCode: 'CSE-S3-A',
    });
    assert.equal(dupCode.status, 409);

    // PATCH update
    const patchSec = await api.patch(`/sections/${sectionId}`, { name: 'A1' });
    assert.equal(patchSec.status, 200);
    assert.equal(patchSec.body.data.name, 'A1');

    // DELETE soft-deactivation
    const delSec = await api.delete(`/sections/${sectionId}`);
    assert.equal(delSec.status, 200);
    assert.equal(delSec.body.data.is_active, false);

    // Reactivate
    const actSec = await api.post(`/sections/${sectionId}/activate`, {});
    assert.equal(actSec.status, 200);
    assert.equal(actSec.body.data.is_active, true);
    console.log('✔ Sections CRUD, classCode uniqueness, and soft-deactivation verified');
  }

  // ---------------------------------------------------------------------------
  // 6. Faculty CRUD & Deactivation Cascade
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Testing Faculty CRUD & User Account Cascade Deactivation ---');
  let facultyId = '';
  {
    // Create Faculty
    const res = await api.post('/faculty', {
      departmentId: deptAId,
      employeeCode: 'fac101',
      name: 'Dr. Ada Lovelace',
      email: 'ADA.LOVELACE@ACADEMIA.EDU',
      phone: '9876543210',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.employee_code, 'FAC101');
    assert.equal(res.body.data.email, 'ada.lovelace@academia.edu');
    facultyId = res.body.data.id;

    // Case-insensitive duplicate email -> 409
    const dupEmail = await api.post('/faculty', {
      departmentId: deptAId,
      employeeCode: 'FAC102',
      name: 'Ada Copy',
      email: 'ada.lovelace@academia.edu',
    });
    assert.equal(dupEmail.status, 409);

    // Duplicate employeeCode -> 409
    const dupCode = await api.post('/faculty', {
      departmentId: deptAId,
      employeeCode: 'FAC101',
      name: 'Ada Copy 2',
      email: 'different@academia.edu',
    });
    assert.equal(dupCode.status, 409);

    // Seed linked userAccount and active session for this faculty
    const [linkedUser] = await db
      .insert(schema.userAccounts)
      .values({
        username: 'adalovelace',
        password_hash: passwordHash,
        role: 'FACULTY',
        faculty_id: facultyId,
        is_active: true,
      })
      .returning();

    const linkedToken = generateSessionToken();
    const [linkedSession] = await db
      .insert(schema.userSessions)
      .values({
        user_id: linkedUser.id,
        token_hash: hashToken(linkedToken),
        csrf_secret: generateCsrfSecret(),
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
      })
      .returning();

    // DELETE soft-deactivation of Faculty: must cascade to user account deactivation and session revocation
    const delFac = await api.delete(`/faculty/${facultyId}`);
    assert.equal(delFac.status, 200);
    assert.equal(delFac.body.data.is_active, false);

    // Verify cascade
    const [checkedUser] = await db.select().from(schema.userAccounts).where(eq(schema.userAccounts.id, linkedUser.id));
    assert.equal(checkedUser.is_active, false, 'Linked userAccount must be deactivated');

    const [checkedSession] = await db.select().from(schema.userSessions).where(eq(schema.userSessions.id, linkedSession.id));
    assert.equal(checkedSession.is_revoked, true, 'Active userSession must be revoked');

    // Reactivate Faculty
    const actFac = await api.post(`/faculty/${facultyId}/activate`, {});
    assert.equal(actFac.status, 200);
    assert.equal(actFac.body.data.is_active, true);
    console.log('✔ Faculty CRUD and session revocation cascade verified');
  }

  // ---------------------------------------------------------------------------
  // 7. Subjects CRUD Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Testing Subjects CRUD Lifecycle ---');
  let subjectId = '';
  {
    // Create Subject
    const res = await api.post('/subjects', {
      departmentId: deptAId,
      code: 'cs301',
      name: 'Algorithms',
      type: 'THEORY',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.code, 'CS301');
    subjectId = res.body.data.id;

    // Invalid type -> 400
    const invType = await api.post('/subjects', {
      departmentId: deptAId,
      code: 'CS302',
      name: 'Unknown',
      type: 'INVALID',
    });
    assert.equal(invType.status, 400);

    // Duplicate code in same department -> 409
    const dupSubj = await api.post('/subjects', {
      departmentId: deptAId,
      code: 'CS301',
      name: 'Advanced Algorithms',
      type: 'THEORY',
    });
    assert.equal(dupSubj.status, 409);

    // PATCH update
    const patchSubj = await api.patch(`/subjects/${subjectId}`, { type: 'LAB' });
    assert.equal(patchSubj.status, 200);
    assert.equal(patchSubj.body.data.type, 'LAB');

    // DELETE soft-deactivation
    const delSubj = await api.delete(`/subjects/${subjectId}`);
    assert.equal(delSubj.status, 200);
    assert.equal(delSubj.body.data.is_active, false);

    // Reactivate
    const actSubj = await api.post(`/subjects/${subjectId}/activate`, {});
    assert.equal(actSubj.status, 200);
    assert.equal(actSubj.body.data.is_active, true);
    console.log('✔ Subjects CRUD and soft-deactivation verified');
  }

  // ---------------------------------------------------------------------------
  // 8. Classrooms CRUD Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. Testing Classrooms CRUD Lifecycle ---');
  let classroomId = '';
  {
    // Create Classroom
    const res = await api.post('/classrooms', {
      buildingBlock: 'Tech Park',
      roomNumber: 'TP-301',
      type: 'LECTURE_HALL',
    });
    assert.equal(res.status, 201);
    classroomId = res.body.data.id;

    // Duplicate building + room -> 409
    const dupRoom = await api.post('/classrooms', {
      buildingBlock: 'Tech Park',
      roomNumber: 'TP-301',
      type: 'LAB',
    });
    assert.equal(dupRoom.status, 409);

    // PATCH update
    const patchRoom = await api.patch(`/classrooms/${classroomId}`, { type: 'SEMINAR_ROOM' });
    assert.equal(patchRoom.status, 200);
    assert.equal(patchRoom.body.data.type, 'SEMINAR_ROOM');

    // DELETE soft-deactivation
    const delRoom = await api.delete(`/classrooms/${classroomId}`);
    assert.equal(delRoom.status, 200);
    assert.equal(delRoom.body.data.is_active, false);

    // Reactivate
    const actRoom = await api.post(`/classrooms/${classroomId}/activate`, {});
    assert.equal(actRoom.status, 200);
    assert.equal(actRoom.body.data.is_active, true);
    console.log('✔ Classrooms CRUD and soft-deactivation verified');
  }

  // ---------------------------------------------------------------------------
  // 9. Course-Subject Curriculum Mapping & Cross-Department Protection
  // ---------------------------------------------------------------------------
  console.log('\n--- 9. Testing Course-Subject Curriculum Mapping ---');
  let mappingId = '';
  {
    // Subject in Department B
    const subB = await api.post('/subjects', {
      departmentId: deptBId,
      code: 'EE101',
      name: 'Circuits',
      type: 'THEORY',
    });
    assert.equal(subB.status, 201);

    // Cross-department mapping attempt (Course from Dept A, Subject from Dept B) -> 400
    const crossDept = await api.post('/course-subjects', {
      courseId,
      subjectId: subB.body.data.id,
      departmentId: deptAId,
      semesterNumber: 3,
    });
    assert.equal(crossDept.status, 400);
    assert.ok(crossDept.body.error.includes('Cross-department') || crossDept.body.error.includes('department'));

    // Valid mapping within Dept A
    const validMap = await api.post('/course-subjects', {
      courseId,
      subjectId,
      departmentId: deptAId,
      semesterNumber: 3,
    });
    assert.equal(validMap.status, 201);
    mappingId = validMap.body.data.id;

    // Duplicate mapping -> 409
    const dupMap = await api.post('/course-subjects', {
      courseId,
      subjectId,
      departmentId: deptAId,
      semesterNumber: 3,
    });
    assert.equal(dupMap.status, 409);

    // PATCH update semesterNumber
    const patchMap = await api.patch(`/course-subjects/${mappingId}`, { semesterNumber: 4 });
    assert.equal(patchMap.status, 200);
    assert.equal(patchMap.body.data.semester_number, 4);

    // DELETE soft-deactivation
    const delMap = await api.delete(`/course-subjects/${mappingId}`);
    assert.equal(delMap.status, 200);
    assert.equal(delMap.body.data.is_active, false);

    // Reactivate
    const actMap = await api.post(`/course-subjects/${mappingId}/activate`, {});
    assert.equal(actMap.status, 200);
    assert.equal(actMap.body.data.is_active, true);
    console.log('✔ Course-subject mappings and cross-department protection verified');
  }

  // ---------------------------------------------------------------------------
  // 10. Inactive-Parent Restrictions
  // ---------------------------------------------------------------------------
  console.log('\n--- 10. Testing Inactive-Parent Restrictions ---');
  {
    // Deactivate Department A
    await api.delete(`/departments/${deptAId}`);

    // Attempting to create child course under inactive department -> 400
    const failCourse = await api.post('/courses', {
      departmentId: deptAId,
      name: 'Blocked Course',
      code: 'BC',
      totalSemesters: 8,
    });
    assert.equal(failCourse.status, 400);

    // Attempting to activate child course while parent department is inactive -> 400
    const failActCourse = await api.post(`/courses/${courseId}/activate`, {});
    assert.equal(failActCourse.status, 400);

    // Reactivate Department A
    await api.post(`/departments/${deptAId}/activate`, {});
    console.log('✔ Inactive-parent creation and activation restrictions verified');
  }

  await pglite.close();
  console.log('\n=== ALL ADMIN MASTER DATA INTEGRATION TESTS PASSED (10/10 SUITES) ===');
}

runAdminMasterDataIntegrationTestSuite().catch((err) => {
  console.error('Integration test failure:', err);
  process.exit(1);
});
