import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema.js';
import {
  createDepartment,
  createCourse,
  createSemester,
  createSection,
  createFaculty,
  createSubject,
  createClassroom,
  deactivateDepartment,
} from '../src/services/academic.service.js';
import { addSubjectToCurriculum } from '../src/services/curriculum.service.js';
import {
  listDepartments,
  getDepartmentById,
  listCourses,
  getCourseById,
  listSemesters,
  getSemesterById,
  listSections,
  getSectionById,
  listFaculty,
  getFacultyById,
  listSubjects,
  getSubjectById,
  listClassrooms,
  getClassroomById,
  listCourseSubjects,
  getCourseSubjectById,
} from '../src/services/master-data-query.service.js';
import {
  updateDepartment,
  updateCourse,
  updateSemester,
  updateSection,
  updateFaculty,
  updateSubject,
  updateClassroom,
  updateCourseSubject,
} from '../src/services/master-data-update.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../src/errors/app.errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestDb() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

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

async function runMasterDataServicesTestSuite() {
  console.log('--- Running Master Data Services Tests ---');
  const { pglite, db } = await setupTestDb();

  // 1. Departments Query and Update
  {
    const dept1 = await createDepartment(db, { name: 'Computer Science', code: 'CS' });
    const dept2 = await createDepartment(db, { name: 'Mechanical Engineering', code: 'ME' });
    const dept3 = await createDepartment(db, { name: 'Civil Engineering', code: 'CE' });

    // Test list with pagination and ordering
    const list = await listDepartments(db, { limit: 2, offset: 0, sortBy: 'name', sortOrder: 'asc' });
    assert.equal(list.pagination.total, 3);
    assert.equal(list.data.length, 2);
    assert.equal(list.data[0].name, 'Civil Engineering');
    assert.equal(list.data[1].name, 'Computer Science');

    // Test detail
    const detail = await getDepartmentById(db, dept1.id);
    assert.equal(detail.code, 'CS');

    // Test not found
    await assert.rejects(
      () => getDepartmentById(db, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
      NotFoundError
    );

    // Test update
    const updated = await updateDepartment(db, dept1.id, { name: 'Computer Science & Eng' });
    assert.equal(updated.name, 'Computer Science & Eng');
    assert.equal(updated.code, 'CS');

    // Test duplicate update rejection
    await assert.rejects(
      () => updateDepartment(db, dept1.id, { code: 'ME' }),
      ConflictError
    );

    // Test deactivation and filter
    await deactivateDepartment(db, dept2.id);
    const activeList = await listDepartments(db, { limit: 10, offset: 0, sortBy: 'name', sortOrder: 'asc', isActive: 'true' });
    assert.equal(activeList.pagination.total, 2);
    console.log('✔ Department query & update tests passed');
  }

  // 2. Course Query and Update
  {
    const [dept] = (await listDepartments(db, { limit: 1, offset: 0, sortBy: 'name', sortOrder: 'asc', isActive: 'true' })).data;
    const course = await createCourse(db, {
      departmentId: dept.id,
      name: 'B.Tech CS',
      code: 'BTCS',
      totalSemesters: 8,
    });

    // List by department
    const courseList = await listCourses(db, { limit: 10, offset: 0, sortBy: 'name', sortOrder: 'asc', departmentId: dept.id });
    assert.equal(courseList.pagination.total, 1);
    assert.equal(courseList.data[0].id, course.id);

    // Update course
    const updatedCourse = await updateCourse(db, course.id, { name: 'B.Tech Computer Science' });
    assert.equal(updatedCourse.name, 'B.Tech Computer Science');

    // Bounds check
    await assert.rejects(
      () => updateCourse(db, course.id, { totalSemesters: 15 }),
      ValidationError
    );
    console.log('✔ Course query & update tests passed');
  }

  // 3. Semester Query and Update
  {
    const [course] = (await listCourses(db, { limit: 1, offset: 0, sortBy: 'name', sortOrder: 'asc' })).data;
    const sem = await createSemester(db, {
      courseId: course.id,
      semesterNumber: 1,
      academicYear: '2026-2027',
      term: 'ODD',
    });

    const semList = await listSemesters(db, { limit: 10, offset: 0, sortBy: 'semester_number', sortOrder: 'asc', courseId: course.id });
    assert.equal(semList.pagination.total, 1);

    const updatedSem = await updateSemester(db, sem.id, { semesterNumber: 3 });
    assert.equal(updatedSem.semester_number, 3);

    // Bounds check (> totalSemesters)
    await assert.rejects(
      () => updateSemester(db, sem.id, { semesterNumber: 10 }),
      ValidationError
    );
    console.log('✔ Semester query & update tests passed');
  }

  // 4. Section Query and Update
  {
    const [sem] = (await listSemesters(db, { limit: 1, offset: 0, sortBy: 'semester_number', sortOrder: 'asc' })).data;
    const sec1 = await createSection(db, {
      semesterId: sem.id,
      name: 'A',
      classCode: 'CS-SEM3-A',
    });
    const sec2 = await createSection(db, {
      semesterId: sem.id,
      name: 'B',
      classCode: 'CS-SEM3-B',
    });

    const secList = await listSections(db, { limit: 10, offset: 0, sortBy: 'name', sortOrder: 'asc', semesterId: sem.id });
    assert.equal(secList.pagination.total, 2);

    // Test unique classCode collision on update
    await assert.rejects(
      () => updateSection(db, sec2.id, { classCode: 'CS-SEM3-A' }),
      ConflictError
    );

    const updatedSec = await updateSection(db, sec1.id, { name: 'A1' });
    assert.equal(updatedSec.name, 'A1');
    console.log('✔ Section query & update tests passed');
  }

  // 5. Faculty Query and Update
  {
    const [dept] = (await listDepartments(db, { limit: 1, offset: 0, sortBy: 'name', sortOrder: 'asc', isActive: 'true' })).data;
    const fac1 = await createFaculty(db, {
      departmentId: dept.id,
      employeeCode: 'FAC001',
      name: 'Prof. Donald Knuth',
      email: 'knuth@stanford.edu',
    });
    const fac2 = await createFaculty(db, {
      departmentId: dept.id,
      employeeCode: 'FAC002',
      name: 'Prof. Claude Shannon',
      email: 'shannon@mit.edu',
    });

    const facList = await listFaculty(db, { limit: 10, offset: 0, sortBy: 'name', sortOrder: 'asc', departmentId: dept.id });
    assert.equal(facList.pagination.total, 2);

    // Case-insensitive email collision on update
    await assert.rejects(
      () => updateFaculty(db, fac2.id, { email: 'KNUTH@STANFORD.EDU' }),
      ConflictError
    );

    const updatedFac = await updateFaculty(db, fac1.id, { phone: '1234567890' });
    assert.equal(updatedFac.phone, '1234567890');
    console.log('✔ Faculty query & update tests passed');
  }

  // 6. Subject Query and Update
  {
    const [dept] = (await listDepartments(db, { limit: 1, offset: 0, sortBy: 'name', sortOrder: 'asc', isActive: 'true' })).data;
    const subj1 = await createSubject(db, {
      departmentId: dept.id,
      code: 'CS301',
      name: 'Operating Systems',
      type: 'THEORY',
    });
    const subj2 = await createSubject(db, {
      departmentId: dept.id,
      code: 'CS302',
      name: 'OS Lab',
      type: 'LAB',
    });

    const subjList = await listSubjects(db, { limit: 10, offset: 0, sortBy: 'code', sortOrder: 'asc', type: 'LAB' });
    assert.equal(subjList.pagination.total, 1);
    assert.equal(subjList.data[0].id, subj2.id);

    // Code collision on update
    await assert.rejects(
      () => updateSubject(db, subj2.id, { code: 'CS301' }),
      ConflictError
    );

    const updatedSubj = await updateSubject(db, subj1.id, { name: 'Advanced Operating Systems' });
    assert.equal(updatedSubj.name, 'Advanced Operating Systems');
    console.log('✔ Subject query & update tests passed');
  }

  // 7. Classroom Query and Update
  {
    const room1 = await createClassroom(db, {
      buildingBlock: 'Main',
      roomNumber: '101',
      type: 'LECTURE_HALL',
    });
    const room2 = await createClassroom(db, {
      buildingBlock: 'Main',
      roomNumber: '102',
      type: 'LAB',
    });

    const roomList = await listClassrooms(db, { limit: 10, offset: 0, sortBy: 'building_block', sortOrder: 'asc' });
    assert.equal(roomList.pagination.total, 2);

    // Building + Room collision on update
    await assert.rejects(
      () => updateClassroom(db, room2.id, { roomNumber: '101' }),
      ConflictError
    );

    const updatedRoom = await updateClassroom(db, room1.id, { type: 'SEMINAR_ROOM' });
    assert.equal(updatedRoom.type, 'SEMINAR_ROOM');
    console.log('✔ Classroom query & update tests passed');
  }

  // 8. Course-Subject Mapping Query and Update
  {
    const [dept] = (await listDepartments(db, { limit: 1, offset: 0, sortBy: 'name', sortOrder: 'asc', isActive: 'true' })).data;
    const [course] = (await listCourses(db, { limit: 1, offset: 0, sortBy: 'name', sortOrder: 'asc' })).data;
    const [subj] = (await listSubjects(db, { limit: 1, offset: 0, sortBy: 'code', sortOrder: 'asc' })).data;

    const mapping = await addSubjectToCurriculum(db, {
      courseId: course.id,
      subjectId: subj.id,
      departmentId: dept.id,
      semesterNumber: 3,
    });

    const mapList = await listCourseSubjects(db, { limit: 10, offset: 0, sortBy: 'created_at', sortOrder: 'asc', courseId: course.id });
    assert.equal(mapList.pagination.total, 1);
    assert.equal(mapList.data[0].id, mapping.id);

    // Update semester number
    const updatedMap = await updateCourseSubject(db, mapping.id, { semesterNumber: 4 });
    assert.equal(updatedMap.semester_number, 4);

    // Bounds check (> totalSemesters)
    await assert.rejects(
      () => updateCourseSubject(db, mapping.id, { semesterNumber: 11 }),
      ValidationError
    );
    console.log('✔ Course-subject query & update tests passed');
  }

  await pglite.close();
  console.log('--- ALL MASTER DATA SERVICES TESTS PASSED ---');
}

runMasterDataServicesTestSuite().catch((err) => {
  console.error('Service test failure:', err);
  process.exit(1);
});
