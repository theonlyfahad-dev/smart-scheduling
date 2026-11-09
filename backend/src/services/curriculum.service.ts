import { eq, and } from 'drizzle-orm';
import {
  departments,
  courses,
  subjects,
  courseSubjects,
} from '../db/schema.js';
import type { DatabaseExecutor } from '../db/client.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/app.errors.js';

export interface AddSubjectToCurriculumInput {
  courseId: string;
  subjectId: string;
  departmentId: string;
  semesterNumber: number;
}

export async function addSubjectToCurriculum(
  tx: DatabaseExecutor,
  input: AddSubjectToCurriculumInput
) {
  // 1. Validate department existence and active status
  const [department] = await tx
    .select({
      id: departments.id,
      name: departments.name,
      isActive: departments.is_active,
    })
    .from(departments)
    .where(eq(departments.id, input.departmentId));

  if (!department) {
    throw new NotFoundError(`Department with ID "${input.departmentId}" not found`);
  }
  if (!department.isActive) {
    throw new ValidationError(`Cannot map curriculum under inactive department "${department.name}"`);
  }

  // 2. Validate course existence, active status, and department ownership
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
    throw new ValidationError(`Cannot map curriculum to inactive course "${course.name}"`);
  }
  if (course.departmentId !== input.departmentId) {
    throw new ValidationError(`Course does not belong to specified department "${input.departmentId}"`);
  }

  // 3. Validate subject existence, active status, and department ownership
  const [subject] = await tx
    .select({
      id: subjects.id,
      departmentId: subjects.department_id,
      name: subjects.name,
      isActive: subjects.is_active,
    })
    .from(subjects)
    .where(eq(subjects.id, input.subjectId));

  if (!subject) {
    throw new NotFoundError(`Subject with ID "${input.subjectId}" not found`);
  }
  if (!subject.isActive) {
    throw new ValidationError(`Cannot map inactive subject "${subject.name}" to curriculum`);
  }
  if (subject.departmentId !== input.departmentId) {
    throw new ValidationError(
      `Cross-department curriculum mapping is forbidden: subject department "${subject.departmentId}" does not match course department "${course.departmentId}"`
    );
  }

  // 4. Validate semester number does not exceed course.total_semesters
  if (input.semesterNumber < 1 || input.semesterNumber > course.totalSemesters) {
    throw new ValidationError(
      `Semester number ${input.semesterNumber} is invalid. Must be between 1 and course total semesters (${course.totalSemesters})`
    );
  }

  // 5. Check if mapping already exists
  const [existingMapping] = await tx
    .select({ id: courseSubjects.id })
    .from(courseSubjects)
    .where(
      and(
        eq(courseSubjects.course_id, input.courseId),
        eq(courseSubjects.subject_id, input.subjectId),
        eq(courseSubjects.semester_number, input.semesterNumber)
      )
    );

  if (existingMapping) {
    throw new ConflictError(
      `Subject is already mapped to course "${course.name}" in semester ${input.semesterNumber}`
    );
  }

  // 6. Insert new curriculum mapping
  const [created] = await tx
    .insert(courseSubjects)
    .values({
      course_id: input.courseId,
      subject_id: input.subjectId,
      department_id: input.departmentId,
      semester_number: input.semesterNumber,
      is_active: true,
    })
    .returning();

  return created;
}

export async function deactivateCourseSubject(tx: DatabaseExecutor, id: string) {
  const [mapping] = await tx
    .select({ id: courseSubjects.id, isActive: courseSubjects.is_active })
    .from(courseSubjects)
    .where(eq(courseSubjects.id, id));

  if (!mapping) {
    throw new NotFoundError(`Course-subject mapping with ID "${id}" not found`);
  }

  const [updated] = await tx
    .update(courseSubjects)
    .set({ is_active: false })
    .where(eq(courseSubjects.id, id))
    .returning();

  return updated;
}

export async function activateCourseSubject(tx: DatabaseExecutor, id: string) {
  const [mapping] = await tx
    .select({
      id: courseSubjects.id,
      courseId: courseSubjects.course_id,
      subjectId: courseSubjects.subject_id,
      departmentId: courseSubjects.department_id,
    })
    .from(courseSubjects)
    .where(eq(courseSubjects.id, id));

  if (!mapping) {
    throw new NotFoundError(`Course-subject mapping with ID "${id}" not found`);
  }

  const [dept] = await tx
    .select({ isActive: departments.is_active })
    .from(departments)
    .where(eq(departments.id, mapping.departmentId));

  if (!dept || !dept.isActive) {
    throw new ValidationError(`Cannot activate curriculum mapping under inactive department`);
  }

  const [course] = await tx
    .select({ isActive: courses.is_active })
    .from(courses)
    .where(eq(courses.id, mapping.courseId));

  if (!course || !course.isActive) {
    throw new ValidationError(`Cannot activate curriculum mapping for inactive course`);
  }

  const [subject] = await tx
    .select({ isActive: subjects.is_active })
    .from(subjects)
    .where(eq(subjects.id, mapping.subjectId));

  if (!subject || !subject.isActive) {
    throw new ValidationError(`Cannot activate curriculum mapping for inactive subject`);
  }

  const [updated] = await tx
    .update(courseSubjects)
    .set({ is_active: true })
    .where(eq(courseSubjects.id, id))
    .returning();

  return updated;
}
