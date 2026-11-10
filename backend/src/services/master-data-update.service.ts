import { eq, and, ne, sql } from 'drizzle-orm';
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
import { NotFoundError, ValidationError, ConflictError } from '../errors/app.errors.js';

// ===========================================================================
// 1. Departments Update
// ===========================================================================

export interface UpdateDepartmentPatch {
  name?: string;
  code?: string;
}

export async function updateDepartment(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateDepartmentPatch
) {
  const [existing] = await tx.select().from(departments).where(eq(departments.id, id));
  if (!existing) {
    throw new NotFoundError(`Department with ID "${id}" not found`);
  }

  const name = patch.name?.trim() ?? existing.name;
  const code = patch.code ? patch.code.trim().toUpperCase() : existing.code;

  if (name !== existing.name) {
    const [nameConflict] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.name, name), ne(departments.id, id)));
    if (nameConflict) {
      throw new ConflictError(`Department with name "${name}" already exists`);
    }
  }

  if (code !== existing.code) {
    const [codeConflict] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.code, code), ne(departments.id, id)));
    if (codeConflict) {
      throw new ConflictError(`Department with code "${code}" already exists`);
    }
  }

  const [updated] = await tx
    .update(departments)
    .set({
      name,
      code,
      updated_at: sql`NOW()`,
    })
    .where(eq(departments.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 2. Courses Update
// ===========================================================================

export interface UpdateCoursePatch {
  name?: string;
  code?: string;
  totalSemesters?: number;
}

export async function updateCourse(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateCoursePatch
) {
  const [existing] = await tx.select().from(courses).where(eq(courses.id, id));
  if (!existing) {
    throw new NotFoundError(`Course with ID "${id}" not found`);
  }

  const name = patch.name?.trim() ?? existing.name;
  const code = patch.code ? patch.code.trim().toUpperCase() : existing.code;
  const totalSemesters = patch.totalSemesters ?? existing.total_semesters;

  if (totalSemesters < 1 || totalSemesters > 12) {
    throw new ValidationError(`Total semesters must be between 1 and 12, received ${totalSemesters}`);
  }

  if (code !== existing.code) {
    const [codeConflict] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.department_id, existing.department_id),
          eq(courses.code, code),
          ne(courses.id, id)
        )
      );
    if (codeConflict) {
      throw new ConflictError(`Course with code "${code}" already exists in this department`);
    }
  }

  if (totalSemesters < existing.total_semesters) {
    // Check if any active semester or curriculum mapping exceeds the new total semesters
    const [highestSemester] = await tx
      .select({ semesterNumber: semesters.semester_number })
      .from(semesters)
      .where(and(eq(semesters.course_id, id), eq(semesters.is_active, true)))
      .orderBy(sql`${semesters.semester_number} DESC`)
      .limit(1);

    if (highestSemester && highestSemester.semesterNumber > totalSemesters) {
      throw new ValidationError(
        `Cannot reduce total semesters to ${totalSemesters} because semester ${highestSemester.semesterNumber} is currently active for this course`
      );
    }
  }

  const [updated] = await tx
    .update(courses)
    .set({
      name,
      code,
      total_semesters: totalSemesters,
      updated_at: sql`NOW()`,
    })
    .where(eq(courses.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 3. Semesters Update
// ===========================================================================

export interface UpdateSemesterPatch {
  semesterNumber?: number;
  academicYear?: string;
  term?: 'ODD' | 'EVEN';
}

export async function updateSemester(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateSemesterPatch
) {
  const [existing] = await tx.select().from(semesters).where(eq(semesters.id, id));
  if (!existing) {
    throw new NotFoundError(`Semester with ID "${id}" not found`);
  }

  const semesterNumber = patch.semesterNumber ?? existing.semester_number;
  const academicYear = patch.academicYear?.trim() ?? existing.academic_year;
  const term = patch.term ?? existing.term;

  // Validate semester number against parent course total_semesters
  const [parentCourse] = await tx
    .select({ totalSemesters: courses.total_semesters })
    .from(courses)
    .where(eq(courses.id, existing.course_id));

  if (parentCourse && semesterNumber > parentCourse.totalSemesters) {
    throw new ValidationError(
      `Semester number ${semesterNumber} exceeds course total semesters (${parentCourse.totalSemesters})`
    );
  }

  // Check unique collision: (course_id, academic_year, semester_number)
  if (semesterNumber !== existing.semester_number || academicYear !== existing.academic_year) {
    const [conflict] = await tx
      .select({ id: semesters.id })
      .from(semesters)
      .where(
        and(
          eq(semesters.course_id, existing.course_id),
          eq(semesters.academic_year, academicYear),
          eq(semesters.semester_number, semesterNumber),
          ne(semesters.id, id)
        )
      );
    if (conflict) {
      throw new ConflictError(
        `Semester ${semesterNumber} for academic year "${academicYear}" already exists for this course`
      );
    }
  }

  const [updated] = await tx
    .update(semesters)
    .set({
      semester_number: semesterNumber,
      academic_year: academicYear,
      term,
      updated_at: sql`NOW()`,
    })
    .where(eq(semesters.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 4. Sections Update
// ===========================================================================

export interface UpdateSectionPatch {
  name?: string;
  classCode?: string;
}

export async function updateSection(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateSectionPatch
) {
  const [existing] = await tx.select().from(sections).where(eq(sections.id, id));
  if (!existing) {
    throw new NotFoundError(`Section with ID "${id}" not found`);
  }

  const name = patch.name?.trim() ?? existing.name;
  const classCode = patch.classCode?.trim() ?? existing.class_code;

  if (name !== existing.name) {
    const [conflict] = await tx
      .select({ id: sections.id })
      .from(sections)
      .where(
        and(
          eq(sections.semester_id, existing.semester_id),
          eq(sections.name, name),
          ne(sections.id, id)
        )
      );
    if (conflict) {
      throw new ConflictError(`Section "${name}" already exists in this semester`);
    }
  }

  if (classCode !== existing.class_code) {
    const [conflict] = await tx
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.class_code, classCode), ne(sections.id, id)));
    if (conflict) {
      throw new ConflictError(`Section with class code "${classCode}" already exists`);
    }
  }

  const [updated] = await tx
    .update(sections)
    .set({
      name,
      class_code: classCode,
      updated_at: sql`NOW()`,
    })
    .where(eq(sections.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 5. Faculty Update
// ===========================================================================

export interface UpdateFacultyPatch {
  name?: string;
  employeeCode?: string;
  email?: string;
  phone?: string | null;
}

export async function updateFaculty(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateFacultyPatch
) {
  const [existing] = await tx.select().from(faculty).where(eq(faculty.id, id));
  if (!existing) {
    throw new NotFoundError(`Faculty with ID "${id}" not found`);
  }

  const name = patch.name?.trim() ?? existing.name;
  const employeeCode = patch.employeeCode ? patch.employeeCode.trim().toUpperCase() : existing.employee_code;
  const email = patch.email ? patch.email.trim().toLowerCase() : existing.email;
  const phone = patch.phone !== undefined ? (patch.phone ? patch.phone.trim() : null) : existing.phone;

  if (employeeCode !== existing.employee_code) {
    const [codeConflict] = await tx
      .select({ id: faculty.id })
      .from(faculty)
      .where(and(eq(faculty.employee_code, employeeCode), ne(faculty.id, id)));
    if (codeConflict) {
      throw new ConflictError(`Faculty with employee code "${employeeCode}" already exists`);
    }
  }

  if (email !== existing.email) {
    const [emailConflict] = await tx
      .select({ id: faculty.id })
      .from(faculty)
      .where(and(sql`LOWER(${faculty.email}) = LOWER(${email})`, ne(faculty.id, id)));
    if (emailConflict) {
      throw new ConflictError(`Faculty with email "${email}" already exists`);
    }
  }

  const [updated] = await tx
    .update(faculty)
    .set({
      name,
      employee_code: employeeCode,
      email,
      phone,
      updated_at: sql`NOW()`,
    })
    .where(eq(faculty.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 6. Subjects Update
// ===========================================================================

export interface UpdateSubjectPatch {
  name?: string;
  code?: string;
  type?: 'THEORY' | 'LAB' | 'TUTORIAL';
}

export async function updateSubject(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateSubjectPatch
) {
  const [existing] = await tx.select().from(subjects).where(eq(subjects.id, id));
  if (!existing) {
    throw new NotFoundError(`Subject with ID "${id}" not found`);
  }

  const name = patch.name?.trim() ?? existing.name;
  const code = patch.code ? patch.code.trim().toUpperCase() : existing.code;
  const type = patch.type ?? existing.type;

  if (!['THEORY', 'LAB', 'TUTORIAL'].includes(type)) {
    throw new ValidationError(`Subject type must be THEORY, LAB, or TUTORIAL, received "${type}"`);
  }

  if (code !== existing.code) {
    const [conflict] = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(
        and(
          eq(subjects.department_id, existing.department_id),
          eq(subjects.code, code),
          ne(subjects.id, id)
        )
      );
    if (conflict) {
      throw new ConflictError(`Subject with code "${code}" already exists in this department`);
    }
  }

  const [updated] = await tx
    .update(subjects)
    .set({
      name,
      code,
      type,
      updated_at: sql`NOW()`,
    })
    .where(eq(subjects.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 7. Classrooms Update
// ===========================================================================

export interface UpdateClassroomPatch {
  buildingBlock?: string;
  roomNumber?: string;
  type?: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM';
}

export async function updateClassroom(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateClassroomPatch
) {
  const [existing] = await tx.select().from(classrooms).where(eq(classrooms.id, id));
  if (!existing) {
    throw new NotFoundError(`Classroom with ID "${id}" not found`);
  }

  const buildingBlock = patch.buildingBlock?.trim() ?? existing.building_block;
  const roomNumber = patch.roomNumber?.trim() ?? existing.room_number;
  const type = patch.type ?? existing.type;

  if (!['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM'].includes(type)) {
    throw new ValidationError(`Classroom type must be LECTURE_HALL, LAB, or SEMINAR_ROOM, received "${type}"`);
  }

  if (buildingBlock !== existing.building_block || roomNumber !== existing.room_number) {
    const [conflict] = await tx
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(
        and(
          eq(classrooms.building_block, buildingBlock),
          eq(classrooms.room_number, roomNumber),
          ne(classrooms.id, id)
        )
      );
    if (conflict) {
      throw new ConflictError(`Classroom "${buildingBlock}-${roomNumber}" already exists`);
    }
  }

  const [updated] = await tx
    .update(classrooms)
    .set({
      building_block: buildingBlock,
      room_number: roomNumber,
      type,
      updated_at: sql`NOW()`,
    })
    .where(eq(classrooms.id, id))
    .returning();

  return updated;
}

// ===========================================================================
// 8. Course-Subjects Update
// ===========================================================================

export interface UpdateCourseSubjectPatch {
  semesterNumber: number;
}

export async function updateCourseSubject(
  tx: DatabaseExecutor,
  id: string,
  patch: UpdateCourseSubjectPatch
) {
  const [existing] = await tx.select().from(courseSubjects).where(eq(courseSubjects.id, id));
  if (!existing) {
    throw new NotFoundError(`Course-subject mapping with ID "${id}" not found`);
  }

  const semesterNumber = patch.semesterNumber;

  // Validate semester number against parent course total_semesters
  const [parentCourse] = await tx
    .select({ totalSemesters: courses.total_semesters })
    .from(courses)
    .where(eq(courses.id, existing.course_id));

  if (parentCourse && semesterNumber > parentCourse.totalSemesters) {
    throw new ValidationError(
      `Semester number ${semesterNumber} exceeds course total semesters (${parentCourse.totalSemesters})`
    );
  }

  if (semesterNumber !== existing.semester_number) {
    const [conflict] = await tx
      .select({ id: courseSubjects.id })
      .from(courseSubjects)
      .where(
        and(
          eq(courseSubjects.course_id, existing.course_id),
          eq(courseSubjects.subject_id, existing.subject_id),
          eq(courseSubjects.semester_number, semesterNumber),
          ne(courseSubjects.id, id)
        )
      );
    if (conflict) {
      throw new ConflictError(
        `Subject is already mapped to this course in semester ${semesterNumber}`
      );
    }
  }

  const [updated] = await tx
    .update(courseSubjects)
    .set({
      semester_number: semesterNumber,
      updated_at: sql`NOW()`,
    })
    .where(eq(courseSubjects.id, id))
    .returning();

  return updated;
}
