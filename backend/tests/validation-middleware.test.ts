import assert from 'node:assert/strict';
import {
  idParamSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
  createCourseSchema,
  updateCourseSchema,
  createSemesterSchema,
  updateSemesterSchema,
  createSectionSchema,
  updateSectionSchema,
  createFacultySchema,
  updateFacultySchema,
  createSubjectSchema,
  updateSubjectSchema,
  createClassroomSchema,
  updateClassroomSchema,
  createCourseSubjectSchema,
  updateCourseSubjectSchema,
} from '../src/validations/master-data.schema.js';
import { validateBody, validateQuery, validateParams } from '../src/middleware/validate.js';

async function runTests() {
  console.log('--- Running Validation & Middleware Tests ---');

  const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  // 1. idParamSchema
  {
    const valid = idParamSchema.parse({ id: validUuid });
    assert.equal(valid.id, validUuid);
    assert.throws(() => idParamSchema.parse({ id: 'not-a-uuid' }));
    console.log('✔ idParamSchema: valid UUID passes, invalid UUID throws');
  }

  // 2. Department Schemas
  {
    const parsed = createDepartmentSchema.parse({ name: 'Computer Science', code: 'cs' });
    assert.equal(parsed.code, 'CS', 'Code should be transformed to uppercase');
    assert.throws(() => createDepartmentSchema.parse({ name: '', code: 'CS' }));
    assert.throws(() => createDepartmentSchema.parse({ name: 'CS', code: '' }));

    const updateParsed = updateDepartmentSchema.parse({ name: 'Updated Dept' });
    assert.equal(updateParsed.name, 'Updated Dept');
    assert.throws(() => updateDepartmentSchema.parse({}), 'Empty update must be rejected');
    console.log('✔ Department schemas: creation, uppercase transformation, update constraints pass');
  }

  // 3. Course Schemas
  {
    const course = createCourseSchema.parse({
      departmentId: validUuid,
      name: 'B.Tech CSE',
      code: 'cse',
      totalSemesters: '8',
    });
    assert.equal(course.code, 'CSE');
    assert.equal(course.totalSemesters, 8);
    assert.throws(() => createCourseSchema.parse({ departmentId: validUuid, name: 'B.Tech', code: 'BT', totalSemesters: 0 }));
    assert.throws(() => createCourseSchema.parse({ departmentId: validUuid, name: 'B.Tech', code: 'BT', totalSemesters: 13 }));
    console.log('✔ Course schemas: bounds (1-12), type coercion pass');
  }

  // 4. Semester Schemas
  {
    const sem = createSemesterSchema.parse({
      courseId: validUuid,
      semesterNumber: '5',
      academicYear: '2026-2027',
      term: 'ODD',
    });
    assert.equal(sem.semesterNumber, 5);
    assert.equal(sem.term, 'ODD');
    assert.throws(() => createSemesterSchema.parse({ courseId: validUuid, semesterNumber: 5, academicYear: '26-27', term: 'ODD' }));
    assert.throws(() => createSemesterSchema.parse({ courseId: validUuid, semesterNumber: 5, academicYear: '2026-2027', term: 'SUMMER' }));
    console.log('✔ Semester schemas: regex year format, ODD/EVEN enum pass');
  }

  // 5. Section Schemas
  {
    const sec = createSectionSchema.parse({
      semesterId: validUuid,
      name: 'A',
      classCode: 'CS5A',
    });
    assert.equal(sec.name, 'A');
    assert.throws(() => createSectionSchema.parse({ semesterId: validUuid, name: '', classCode: 'CS5A' }));
    console.log('✔ Section schemas: valid and empty rejection pass');
  }

  // 6. Faculty Schemas
  {
    const fac = createFacultySchema.parse({
      departmentId: validUuid,
      employeeCode: 'emp101',
      name: 'Dr. Alan Turing',
      email: 'ALAN@EXAMPLE.COM',
      phone: '+1-555-0199',
    });
    assert.equal(fac.employeeCode, 'EMP101');
    assert.equal(fac.email, 'alan@example.com');
    assert.throws(() => createFacultySchema.parse({ departmentId: validUuid, employeeCode: 'E1', name: 'Dr.', email: 'invalid-email' }));
    console.log('✔ Faculty schemas: uppercase employee code, lowercase email pass');
  }

  // 7. Subject Schemas
  {
    const subj = createSubjectSchema.parse({
      departmentId: validUuid,
      code: 'cs101',
      name: 'Data Structures',
      type: 'LAB',
    });
    assert.equal(subj.code, 'CS101');
    assert.equal(subj.type, 'LAB');
    assert.throws(() => createSubjectSchema.parse({ departmentId: validUuid, code: 'CS', name: 'DS', type: 'INVALID' }));
    console.log('✔ Subject schemas: type enum verification passes');
  }

  // 8. Classroom Schemas
  {
    const room = createClassroomSchema.parse({
      buildingBlock: 'Block A',
      roomNumber: '101',
      type: 'LECTURE_HALL',
    });
    assert.equal(room.type, 'LECTURE_HALL');
    assert.throws(() => createClassroomSchema.parse({ buildingBlock: 'A', roomNumber: '101', type: 'OFFICE' }));
    console.log('✔ Classroom schemas: type enum verification passes');
  }

  // 9. Course-Subject Schemas
  {
    const csMap = createCourseSubjectSchema.parse({
      courseId: validUuid,
      subjectId: validUuid,
      departmentId: validUuid,
      semesterNumber: '3',
    });
    assert.equal(csMap.semesterNumber, 3);
    assert.throws(() => createCourseSubjectSchema.parse({ courseId: validUuid, subjectId: validUuid, departmentId: validUuid, semesterNumber: 0 }));
    assert.throws(() => createCourseSubjectSchema.parse({ courseId: validUuid, subjectId: validUuid, departmentId: validUuid, semesterNumber: 13 }));

    const updateMap = updateCourseSubjectSchema.parse({ semesterNumber: '4' });
    assert.equal(updateMap.semesterNumber, 4);
    console.log('✔ CourseSubject schemas: bounds and updates pass');
  }

  // 10. Base Pagination Query Schema & Clamping
  {
    const defaultQuery = listDepartmentsQuerySchema.parse({});
    assert.equal(defaultQuery.limit, 20);
    assert.equal(defaultQuery.offset, 0);
    assert.equal(defaultQuery.sortBy, 'name');
    assert.equal(defaultQuery.sortOrder, 'asc');
    assert.equal(defaultQuery.isActive, 'all');

    assert.throws(() => listDepartmentsQuerySchema.parse({ limit: 0 }), 'Limit 0 must throw');
    assert.throws(() => listDepartmentsQuerySchema.parse({ limit: 101 }), 'Limit > 100 must throw');
    assert.throws(() => listDepartmentsQuerySchema.parse({ offset: -1 }), 'Offset < 0 must throw');
    assert.throws(() => listDepartmentsQuerySchema.parse({ sortBy: 'unapproved_column' }), 'Unapproved sortBy must throw');
    console.log('✔ Pagination query schema: default values, limits, allowlist sorting pass');
  }

  // 11. Middleware Dispatch Tests
  {
    // Mock Express Request, Response, NextFunction
    let nextCalled = false;
    const req: any = { body: { name: 'IT', code: 'it' } };
    const res: any = {
      statusCode: 200,
      jsonData: null,
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.jsonData = data; return this; },
    };
    const next = () => { nextCalled = true; };

    const bodyMiddleware = validateBody(createDepartmentSchema);
    bodyMiddleware(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(req.body.code, 'IT');

    // Test rejection in middleware
    let rejectNextCalled = false;
    const rejectReq: any = { body: { name: '' } };
    const rejectRes: any = {
      statusCode: 200,
      jsonData: null,
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.jsonData = data; return this; },
    };
    bodyMiddleware(rejectReq, rejectRes, () => { rejectNextCalled = true; });
    assert.equal(rejectNextCalled, false);
    assert.equal(rejectRes.statusCode, 400);
    assert.equal(rejectRes.jsonData.error, 'Validation failed');
    assert.ok(Array.isArray(rejectRes.jsonData.details));
    console.log('✔ validateBody middleware: transformation and 400 rejection pass');

    // Test validateParams rejection
    let paramsNextCalled = false;
    const paramsReq: any = { params: { id: 'invalid-uuid' } };
    const paramsRes: any = {
      statusCode: 200,
      jsonData: null,
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.jsonData = data; return this; },
    };
    validateParams(idParamSchema)(paramsReq, paramsRes, () => { paramsNextCalled = true; });
    assert.equal(paramsNextCalled, false);
    assert.equal(paramsRes.statusCode, 400);
    assert.equal(paramsRes.jsonData.error, 'Validation failed');
    console.log('✔ validateParams middleware: 400 on invalid UUID passes');
  }

  console.log('--- ALL VALIDATION & MIDDLEWARE TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Validation test failure:', err);
  process.exit(1);
});
