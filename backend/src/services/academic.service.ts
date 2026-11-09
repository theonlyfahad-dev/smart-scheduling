import { eq, and } from 'drizzle-orm';
import {
  departments,
  courses,
  semesters,
  sections,
  faculty,
  subjects,
  classrooms,
  userAccounts,
  userSessions,
} from '../db/schema.js';
import type { DatabaseExecutor } from '../db/client.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/app.errors.js';

// ===========================================================================
// 1. Creation Operations with Hierarchical Active Checks
// ===========================================================================

export interface CreateDepartmentInput {
  name: string;
  code: string;
}

export async function createDepartment(tx: DatabaseExecutor, input: CreateDepartmentInput) {
  const [existing] = await tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.code, input.code.toUpperCase()));

  if (existing) {
    throw new ConflictError(`Department with code "${input.code}" already exists`);
  }

  const [created] = await tx
    .insert(departments)
    .values({
      name: input.name,
      code: input.code.toUpperCase(),
      is_active: true,
    })
    .returning();

  return created;
}

export interface CreateCourseInput {
  departmentId: string;
  name: string;
  code: string;
  totalSemesters: number;
}

export async function createCourse(tx: DatabaseExecutor, input: CreateCourseInput) {
  // Validate parent department existence and active status
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, input.departmentId));

  if (!dept) {
    throw new NotFoundError(`Department with ID "${input.departmentId}" not found`);
  }
  if (!dept.isActive) {
    throw new ValidationError(`Cannot create course under inactive department "${dept.name}"`);
  }

  if (input.totalSemesters < 1 || input.totalSemesters > 12) {
    throw new ValidationError(`Total semesters must be between 1 and 12, received ${input.totalSemesters}`);
  }

  const [existing] = await tx
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.department_id, input.departmentId),
        eq(courses.code, input.code.toUpperCase())
      )
    );

  if (existing) {
    throw new ConflictError(
      `Course with code "${input.code}" already exists in department "${dept.name}"`
    );
  }

  const [created] = await tx
    .insert(courses)
    .values({
      department_id: input.departmentId,
      name: input.name,
      code: input.code.toUpperCase(),
      total_semesters: input.totalSemesters,
      is_active: true,
    })
    .returning();

  return created;
}

export interface CreateSemesterInput {
  courseId: string;
  semesterNumber: number;
  academicYear: string;
  term: 'ODD' | 'EVEN';
}

export async function createSemester(tx: DatabaseExecutor, input: CreateSemesterInput) {
  // Validate course existence and active status
  const [course] = await tx
    .select({
      id: courses.id,
      departmentId: courses.department_id,
      name: courses.name,
      totalSemesters: courses.total_semesters,
      isActive: courses.is_active,
    })
    .from(courses)
    .where(eq(courses.id, input.courseId));

  if (!course) {
    throw new NotFoundError(`Course with ID "${input.courseId}" not found`);
  }
  if (!course.isActive) {
    throw new ValidationError(`Cannot create semester under inactive course "${course.name}"`);
  }

  // Validate parent department active status
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, course.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(
      `Cannot create semester under inactive parent department "${dept?.name || course.departmentId}"`
    );
  }

  // Validate semester number against course.total_semesters
  if (input.semesterNumber < 1 || input.semesterNumber > course.totalSemesters) {
    throw new ValidationError(
      `Semester number ${input.semesterNumber} exceeds course total semesters of ${course.totalSemesters}`
    );
  }

  if (input.term !== 'ODD' && input.term !== 'EVEN') {
    throw new ValidationError(`Term must be either 'ODD' or 'EVEN', received "${input.term}"`);
  }

  const [existing] = await tx
    .select({ id: semesters.id })
    .from(semesters)
    .where(
      and(
        eq(semesters.course_id, input.courseId),
        eq(semesters.academic_year, input.academicYear),
        eq(semesters.semester_number, input.semesterNumber)
      )
    );

  if (existing) {
    throw new ConflictError(
      `Semester ${input.semesterNumber} for academic year "${input.academicYear}" already exists for course "${course.name}"`
    );
  }

  const [created] = await tx
    .insert(semesters)
    .values({
      course_id: input.courseId,
      semester_number: input.semesterNumber,
      academic_year: input.academicYear,
      term: input.term,
      is_active: true,
    })
    .returning();

  return created;
}

export interface CreateSectionInput {
  semesterId: string;
  name: string;
  classCode: string;
}

export async function createSection(tx: DatabaseExecutor, input: CreateSectionInput) {
  // Validate semester existence and active status
  const [semester] = await tx
    .select({
      id: semesters.id,
      courseId: semesters.course_id,
      semesterNumber: semesters.semester_number,
      isActive: semesters.is_active,
    })
    .from(semesters)
    .where(eq(semesters.id, input.semesterId));

  if (!semester) {
    throw new NotFoundError(`Semester with ID "${input.semesterId}" not found`);
  }
  if (!semester.isActive) {
    throw new ValidationError(`Cannot create section under inactive semester`);
  }

  // Validate parent course active status
  const [course] = await tx
    .select({ id: courses.id, departmentId: courses.department_id, isActive: courses.is_active })
    .from(courses)
    .where(eq(courses.id, semester.courseId));

  if (!course || !course.isActive) {
    throw new ValidationError(`Cannot create section under inactive course`);
  }

  // Validate parent department active status
  const [dept] = await tx
    .select({ id: departments.id, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, course.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(`Cannot create section under inactive parent department`);
  }

  const [created] = await tx
    .insert(sections)
    .values({
      semester_id: input.semesterId,
      name: input.name,
      class_code: input.classCode,
      is_active: true,
    })
    .returning();

  return created;
}

export interface CreateFacultyInput {
  departmentId: string;
  employeeCode: string;
  name: string;
  email: string;
  phone?: string;
}

export async function createFaculty(tx: DatabaseExecutor, input: CreateFacultyInput) {
  // Validate department existence and active status
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, input.departmentId));

  if (!dept) {
    throw new NotFoundError(`Department with ID "${input.departmentId}" not found`);
  }
  if (!dept.isActive) {
    throw new ValidationError(`Cannot create faculty under inactive department "${dept.name}"`);
  }

  const [created] = await tx
    .insert(faculty)
    .values({
      department_id: input.departmentId,
      employee_code: input.employeeCode.toUpperCase(),
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      is_active: true,
    })
    .returning();

  return created;
}

export interface CreateSubjectInput {
  departmentId: string;
  code: string;
  name: string;
  type: 'THEORY' | 'LAB' | 'TUTORIAL';
}

export async function createSubject(tx: DatabaseExecutor, input: CreateSubjectInput) {
  // Validate department existence and active status
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, input.departmentId));

  if (!dept) {
    throw new NotFoundError(`Department with ID "${input.departmentId}" not found`);
  }
  if (!dept.isActive) {
    throw new ValidationError(`Cannot create subject under inactive department "${dept.name}"`);
  }

  if (!['THEORY', 'LAB', 'TUTORIAL'].includes(input.type)) {
    throw new ValidationError(`Subject type must be THEORY, LAB, or TUTORIAL, received "${input.type}"`);
  }

  const [created] = await tx
    .insert(subjects)
    .values({
      department_id: input.departmentId,
      code: input.code.toUpperCase(),
      name: input.name,
      type: input.type,
      is_active: true,
    })
    .returning();

  return created;
}

export interface CreateClassroomInput {
  buildingBlock: string;
  roomNumber: string;
  type: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM';
}

export async function createClassroom(tx: DatabaseExecutor, input: CreateClassroomInput) {
  if (!['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM'].includes(input.type)) {
    throw new ValidationError(
      `Classroom type must be LECTURE_HALL, LAB, or SEMINAR_ROOM, received "${input.type}"`
    );
  }

  const [created] = await tx
    .insert(classrooms)
    .values({
      building_block: input.buildingBlock,
      room_number: input.roomNumber,
      type: input.type,
      is_active: true,
    })
    .returning();

  return created;
}

// ===========================================================================
// 2. Deactivation Operations (Preserving Historical Records)
// ===========================================================================

export async function deactivateDepartment(tx: DatabaseExecutor, id: string) {
  const [dept] = await tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.id, id));

  if (!dept) {
    throw new NotFoundError(`Department with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(departments)
    .set({ is_active: false })
    .where(eq(departments.id, id))
    .returning();

  return updated;
}

export async function deactivateCourse(tx: DatabaseExecutor, id: string) {
  const [course] = await tx
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, id));

  if (!course) {
    throw new NotFoundError(`Course with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(courses)
    .set({ is_active: false })
    .where(eq(courses.id, id))
    .returning();

  return updated;
}

export async function deactivateSemester(tx: DatabaseExecutor, id: string) {
  const [semester] = await tx
    .select({ id: semesters.id })
    .from(semesters)
    .where(eq(semesters.id, id));

  if (!semester) {
    throw new NotFoundError(`Semester with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(semesters)
    .set({ is_active: false })
    .where(eq(semesters.id, id))
    .returning();

  return updated;
}

export async function deactivateSection(tx: DatabaseExecutor, id: string) {
  const [sec] = await tx
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.id, id));

  if (!sec) {
    throw new NotFoundError(`Section with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(sections)
    .set({ is_active: false })
    .where(eq(sections.id, id))
    .returning();

  return updated;
}

export async function deactivateFaculty(tx: DatabaseExecutor, id: string) {
  const [fac] = await tx
    .select({ id: faculty.id })
    .from(faculty)
    .where(eq(faculty.id, id));

  if (!fac) {
    throw new NotFoundError(`Faculty with ID "${id}" not found`);
  }

  // 1. Deactivate faculty record
  const [updatedFaculty] = await tx
    .update(faculty)
    .set({ is_active: false })
    .where(eq(faculty.id, id))
    .returning();

  // 2. Deactivating faculty must deactivate its linked user account and revoke sessions
  const linkedAccounts = await tx
    .select({ id: userAccounts.id })
    .from(userAccounts)
    .where(eq(userAccounts.faculty_id, id));

  for (const account of linkedAccounts) {
    await deactivateUserAccount(tx, account.id);
  }

  return updatedFaculty;
}

export async function deactivateSubject(tx: DatabaseExecutor, id: string) {
  const [subj] = await tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.id, id));

  if (!subj) {
    throw new NotFoundError(`Subject with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(subjects)
    .set({ is_active: false })
    .where(eq(subjects.id, id))
    .returning();

  return updated;
}

export async function deactivateClassroom(tx: DatabaseExecutor, id: string) {
  const [room] = await tx
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(eq(classrooms.id, id));

  if (!room) {
    throw new NotFoundError(`Classroom with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(classrooms)
    .set({ is_active: false })
    .where(eq(classrooms.id, id))
    .returning();

  return updated;
}

export async function deactivateUserAccount(tx: DatabaseExecutor, id: string) {
  const [user] = await tx
    .select({ id: userAccounts.id })
    .from(userAccounts)
    .where(eq(userAccounts.id, id));

  if (!user) {
    throw new NotFoundError(`User account with ID "${id}" not found`);
  }

  // 1. Deactivate user account
  const [updatedUser] = await tx
    .update(userAccounts)
    .set({ is_active: false })
    .where(eq(userAccounts.id, id))
    .returning();

  // 2. Deactivating user accounts must revoke their active sessions
  await tx
    .update(userSessions)
    .set({ is_revoked: true })
    .where(
      and(
        eq(userSessions.user_id, id),
        eq(userSessions.is_revoked, false)
      )
    );

  return updatedUser;
}

// ===========================================================================
// 3. Activation Operations with Hierarchical Active Checks
// ===========================================================================

export async function activateDepartment(tx: DatabaseExecutor, id: string) {
  const [dept] = await tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.id, id));

  if (!dept) {
    throw new NotFoundError(`Department with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(departments)
    .set({ is_active: true })
    .where(eq(departments.id, id))
    .returning();

  return updated;
}

export async function activateCourse(tx: DatabaseExecutor, id: string) {
  const [course] = await tx
    .select({ id: courses.id, departmentId: courses.department_id, name: courses.name })
    .from(courses)
    .where(eq(courses.id, id));

  if (!course) {
    throw new NotFoundError(`Course with ID "${id}" not found`);
  }

  // Validate parent department is active
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, course.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(
      `Cannot activate course "${course.name}" under inactive department "${dept?.name || course.departmentId}"`
    );
  }

  const [updated] = await tx
    .update(courses)
    .set({ is_active: true })
    .where(eq(courses.id, id))
    .returning();

  return updated;
}

export async function activateFaculty(tx: DatabaseExecutor, id: string) {
  const [fac] = await tx
    .select({ id: faculty.id, departmentId: faculty.department_id, name: faculty.name })
    .from(faculty)
    .where(eq(faculty.id, id));

  if (!fac) {
    throw new NotFoundError(`Faculty with ID "${id}" not found`);
  }

  // Validate parent department is active
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, fac.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(
      `Cannot activate faculty "${fac.name}" under inactive department "${dept?.name || fac.departmentId}"`
    );
  }

  const [updated] = await tx
    .update(faculty)
    .set({ is_active: true })
    .where(eq(faculty.id, id))
    .returning();

  return updated;
}

export async function activateSubject(tx: DatabaseExecutor, id: string) {
  const [subj] = await tx
    .select({ id: subjects.id, departmentId: subjects.department_id, name: subjects.name })
    .from(subjects)
    .where(eq(subjects.id, id));

  if (!subj) {
    throw new NotFoundError(`Subject with ID "${id}" not found`);
  }

  // Validate parent department is active
  const [dept] = await tx
    .select({ id: departments.id, name: departments.name, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, subj.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(
      `Cannot activate subject "${subj.name}" under inactive department "${dept?.name || subj.departmentId}"`
    );
  }

  const [updated] = await tx
    .update(subjects)
    .set({ is_active: true })
    .where(eq(subjects.id, id))
    .returning();

  return updated;
}

export async function activateSemester(tx: DatabaseExecutor, id: string) {
  const [sem] = await tx
    .select({ id: semesters.id, courseId: semesters.course_id, semesterNumber: semesters.semester_number })
    .from(semesters)
    .where(eq(semesters.id, id));

  if (!sem) {
    throw new NotFoundError(`Semester with ID "${id}" not found`);
  }

  // Validate parent course is active
  const [course] = await tx
    .select({ id: courses.id, departmentId: courses.department_id, isActive: courses.is_active })
    .from(courses)
    .where(eq(courses.id, sem.courseId));

  if (!course || !course.isActive) {
    throw new ValidationError(`Cannot activate semester for inactive course`);
  }

  // Validate root department is active
  const [dept] = await tx
    .select({ id: departments.id, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, course.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(`Cannot activate semester under inactive department`);
  }

  const [updated] = await tx
    .update(semesters)
    .set({ is_active: true })
    .where(eq(semesters.id, id))
    .returning();

  return updated;
}

export async function activateSection(tx: DatabaseExecutor, id: string) {
  const [sec] = await tx
    .select({ id: sections.id, semesterId: sections.semester_id })
    .from(sections)
    .where(eq(sections.id, id));

  if (!sec) {
    throw new NotFoundError(`Section with ID "${id}" not found`);
  }

  // Validate semester is active
  const [sem] = await tx
    .select({ id: semesters.id, courseId: semesters.course_id, isActive: semesters.is_active })
    .from(semesters)
    .where(eq(semesters.id, sec.semesterId));

  if (!sem || !sem.isActive) {
    throw new ValidationError(`Cannot activate section for inactive semester`);
  }

  // Validate course is active
  const [course] = await tx
    .select({ id: courses.id, departmentId: courses.department_id, isActive: courses.is_active })
    .from(courses)
    .where(eq(courses.id, sem.courseId));

  if (!course || !course.isActive) {
    throw new ValidationError(`Cannot activate section for inactive course`);
  }

  // Validate department is active
  const [dept] = await tx
    .select({ id: departments.id, isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, course.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(`Cannot activate section under inactive department`);
  }

  const [updated] = await tx
    .update(sections)
    .set({ is_active: true })
    .where(eq(sections.id, id))
    .returning();

  return updated;
}

export async function activateClassroom(tx: DatabaseExecutor, id: string) {
  const [room] = await tx
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(eq(classrooms.id, id));

  if (!room) {
    throw new NotFoundError(`Classroom with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(classrooms)
    .set({ is_active: true })
    .where(eq(classrooms.id, id))
    .returning();

  return updated;
}

export async function activateUserAccount(tx: DatabaseExecutor, id: string) {
  const [user] = await tx
    .select({ id: userAccounts.id, facultyId: userAccounts.faculty_id })
    .from(userAccounts)
    .where(eq(userAccounts.id, id));

  if (!user) {
    throw new NotFoundError(`User account with ID "${id}" not found`);
  }

  if (user.facultyId) {
    const [fac] = await tx
      .select({ id: faculty.id, departmentId: faculty.department_id, isActive: faculty.is_active })
      .from(faculty)
      .where(eq(faculty.id, user.facultyId));

    if (!fac || !fac.isActive) {
      throw new ValidationError(`Cannot activate user account linked to inactive faculty`);
    }

    const [dept] = await tx
      .select({ id: departments.id, isActive: departments.is_active })
      .from(departments)
      .where(eq(departments.id, fac.departmentId));

    if (!dept || !dept.isActive) {
      throw new ValidationError(`Cannot activate user account under inactive department`);
    }
  }

  const [updated] = await tx
    .update(userAccounts)
    .set({ is_active: true })
    .where(eq(userAccounts.id, id))
    .returning();

  return updated;
}
