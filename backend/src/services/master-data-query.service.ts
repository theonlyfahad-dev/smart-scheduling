import { eq, and, asc, desc, sql, SQL } from 'drizzle-orm';
import {
  departments,
  courses,
  semesters,
  sections,
  faculty,
  subjects,
  classrooms,
  courseSubjects,
} from '../db/schema.js';
import type { DatabaseExecutor } from '../db/client.js';
import { NotFoundError } from '../errors/app.errors.js';

export interface PaginationParams {
  limit: number;
  offset: number;
  sortOrder: 'asc' | 'desc';
  isActive?: 'true' | 'false' | 'all';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// ===========================================================================
// 1. Departments
// ===========================================================================

export interface ListDepartmentsParams extends PaginationParams {
  sortBy: 'name' | 'code' | 'created_at';
}

export async function listDepartments(
  tx: DatabaseExecutor,
  params: ListDepartmentsParams
): Promise<PaginatedResult<typeof departments.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(departments.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(departments.is_active, false));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(departments)
    .where(whereClause);

  const sortCol = departments[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(departments)
    .where(whereClause)
    .orderBy(primaryOrder, asc(departments.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getDepartmentById(tx: DatabaseExecutor, id: string) {
  const [dept] = await tx.select().from(departments).where(eq(departments.id, id));
  if (!dept) {
    throw new NotFoundError(`Department with ID "${id}" not found`);
  }
  return dept;
}

// ===========================================================================
// 2. Courses
// ===========================================================================

export interface ListCoursesParams extends PaginationParams {
  sortBy: 'name' | 'code' | 'total_semesters' | 'created_at';
  departmentId?: string;
}

export async function listCourses(
  tx: DatabaseExecutor,
  params: ListCoursesParams
): Promise<PaginatedResult<typeof courses.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(courses.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(courses.is_active, false));
  if (params.departmentId) conditions.push(eq(courses.department_id, params.departmentId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(courses)
    .where(whereClause);

  const sortCol = courses[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(courses)
    .where(whereClause)
    .orderBy(primaryOrder, asc(courses.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getCourseById(tx: DatabaseExecutor, id: string) {
  const [course] = await tx.select().from(courses).where(eq(courses.id, id));
  if (!course) {
    throw new NotFoundError(`Course with ID "${id}" not found`);
  }
  return course;
}

// ===========================================================================
// 3. Semesters
// ===========================================================================

export interface ListSemestersParams extends PaginationParams {
  sortBy: 'semester_number' | 'academic_year' | 'created_at';
  courseId?: string;
  academicYear?: string;
  term?: 'ODD' | 'EVEN';
}

export async function listSemesters(
  tx: DatabaseExecutor,
  params: ListSemestersParams
): Promise<PaginatedResult<typeof semesters.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(semesters.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(semesters.is_active, false));
  if (params.courseId) conditions.push(eq(semesters.course_id, params.courseId));
  if (params.academicYear) conditions.push(eq(semesters.academic_year, params.academicYear));
  if (params.term) conditions.push(eq(semesters.term, params.term));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(semesters)
    .where(whereClause);

  const sortCol = semesters[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(semesters)
    .where(whereClause)
    .orderBy(primaryOrder, asc(semesters.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getSemesterById(tx: DatabaseExecutor, id: string) {
  const [sem] = await tx.select().from(semesters).where(eq(semesters.id, id));
  if (!sem) {
    throw new NotFoundError(`Semester with ID "${id}" not found`);
  }
  return sem;
}

// ===========================================================================
// 4. Sections
// ===========================================================================

export interface ListSectionsParams extends PaginationParams {
  sortBy: 'name' | 'class_code' | 'created_at';
  semesterId?: string;
}

export async function listSections(
  tx: DatabaseExecutor,
  params: ListSectionsParams
): Promise<PaginatedResult<typeof sections.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(sections.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(sections.is_active, false));
  if (params.semesterId) conditions.push(eq(sections.semester_id, params.semesterId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(sections)
    .where(whereClause);

  const sortCol = sections[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(sections)
    .where(whereClause)
    .orderBy(primaryOrder, asc(sections.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getSectionById(tx: DatabaseExecutor, id: string) {
  const [sec] = await tx.select().from(sections).where(eq(sections.id, id));
  if (!sec) {
    throw new NotFoundError(`Section with ID "${id}" not found`);
  }
  return sec;
}

// ===========================================================================
// 5. Faculty
// ===========================================================================

export interface ListFacultyParams extends PaginationParams {
  sortBy: 'name' | 'employee_code' | 'email' | 'created_at';
  departmentId?: string;
}

export async function listFaculty(
  tx: DatabaseExecutor,
  params: ListFacultyParams
): Promise<PaginatedResult<typeof faculty.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(faculty.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(faculty.is_active, false));
  if (params.departmentId) conditions.push(eq(faculty.department_id, params.departmentId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(faculty)
    .where(whereClause);

  const sortCol = faculty[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(faculty)
    .where(whereClause)
    .orderBy(primaryOrder, asc(faculty.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getFacultyById(tx: DatabaseExecutor, id: string) {
  const [fac] = await tx.select().from(faculty).where(eq(faculty.id, id));
  if (!fac) {
    throw new NotFoundError(`Faculty with ID "${id}" not found`);
  }
  return fac;
}

// ===========================================================================
// 6. Subjects
// ===========================================================================

export interface ListSubjectsParams extends PaginationParams {
  sortBy: 'name' | 'code' | 'type' | 'created_at';
  departmentId?: string;
  type?: 'THEORY' | 'LAB' | 'TUTORIAL';
}

export async function listSubjects(
  tx: DatabaseExecutor,
  params: ListSubjectsParams
): Promise<PaginatedResult<typeof subjects.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(subjects.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(subjects.is_active, false));
  if (params.departmentId) conditions.push(eq(subjects.department_id, params.departmentId));
  if (params.type) conditions.push(eq(subjects.type, params.type));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(subjects)
    .where(whereClause);

  const sortCol = subjects[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(subjects)
    .where(whereClause)
    .orderBy(primaryOrder, asc(subjects.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getSubjectById(tx: DatabaseExecutor, id: string) {
  const [subj] = await tx.select().from(subjects).where(eq(subjects.id, id));
  if (!subj) {
    throw new NotFoundError(`Subject with ID "${id}" not found`);
  }
  return subj;
}

// ===========================================================================
// 7. Classrooms
// ===========================================================================

export interface ListClassroomsParams extends PaginationParams {
  sortBy: 'building_block' | 'room_number' | 'type' | 'created_at';
  buildingBlock?: string;
  type?: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM';
}

export async function listClassrooms(
  tx: DatabaseExecutor,
  params: ListClassroomsParams
): Promise<PaginatedResult<typeof classrooms.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(classrooms.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(classrooms.is_active, false));
  if (params.buildingBlock) conditions.push(eq(classrooms.building_block, params.buildingBlock));
  if (params.type) conditions.push(eq(classrooms.type, params.type));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(classrooms)
    .where(whereClause);

  const sortCol = classrooms[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(classrooms)
    .where(whereClause)
    .orderBy(primaryOrder, asc(classrooms.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getClassroomById(tx: DatabaseExecutor, id: string) {
  const [room] = await tx.select().from(classrooms).where(eq(classrooms.id, id));
  if (!room) {
    throw new NotFoundError(`Classroom with ID "${id}" not found`);
  }
  return room;
}

// ===========================================================================
// 8. Course-Subjects (Curriculum Mappings)
// ===========================================================================

export interface ListCourseSubjectsParams extends PaginationParams {
  sortBy: 'semester_number' | 'created_at';
  courseId?: string;
  subjectId?: string;
  departmentId?: string;
  semesterNumber?: number;
}

export async function listCourseSubjects(
  tx: DatabaseExecutor,
  params: ListCourseSubjectsParams
): Promise<PaginatedResult<typeof courseSubjects.$inferSelect>> {
  const conditions: SQL[] = [];
  if (params.isActive === 'true') conditions.push(eq(courseSubjects.is_active, true));
  if (params.isActive === 'false') conditions.push(eq(courseSubjects.is_active, false));
  if (params.courseId) conditions.push(eq(courseSubjects.course_id, params.courseId));
  if (params.subjectId) conditions.push(eq(courseSubjects.subject_id, params.subjectId));
  if (params.departmentId) conditions.push(eq(courseSubjects.department_id, params.departmentId));
  if (params.semesterNumber !== undefined) conditions.push(eq(courseSubjects.semester_number, params.semesterNumber));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(courseSubjects)
    .where(whereClause);

  const sortCol = courseSubjects[params.sortBy];
  const primaryOrder = params.sortOrder === 'desc' ? desc(sortCol) : asc(sortCol);

  const data = await tx
    .select()
    .from(courseSubjects)
    .where(whereClause)
    .orderBy(primaryOrder, asc(courseSubjects.id))
    .limit(params.limit)
    .offset(params.offset);

  return { data, pagination: { total, limit: params.limit, offset: params.offset } };
}

export async function getCourseSubjectById(tx: DatabaseExecutor, id: string) {
  const [mapping] = await tx.select().from(courseSubjects).where(eq(courseSubjects.id, id));
  if (!mapping) {
    throw new NotFoundError(`Course-subject mapping with ID "${id}" not found`);
  }
  return mapping;
}
