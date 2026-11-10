import { Request, Response } from 'express';
import type { DatabaseExecutor } from '../db/client.js';
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
  activateDepartment,
  activateCourse,
  activateSemester,
  activateSection,
  activateFaculty,
  activateSubject,
  activateClassroom,
} from '../services/academic.service.js';
import {
  addSubjectToCurriculum,
  deactivateCourseSubject,
  activateCourseSubject,
} from '../services/curriculum.service.js';
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
} from '../services/master-data-query.service.js';
import {
  updateDepartment,
  updateCourse,
  updateSemester,
  updateSection,
  updateFaculty,
  updateSubject,
  updateClassroom,
  updateCourseSubject,
} from '../services/master-data-update.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/app.errors.js';

export function createAdminMasterDataController(getDb: () => DatabaseExecutor) {
  const getId = (req: Request): string => req.params.id as string;

  async function handle(res: Response, fn: (db: DatabaseExecutor) => Promise<any>, status = 200) {
    try {
      const db = getDb();
      const result = await fn(db);
      return res.status(status).json(result);
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof ConflictError) {
        return res.status(409).json({ error: err.message });
      }
      // Map PostgreSQL / PGlite unique constraint violation (code 23505) to 409 Conflict
      const pgCode = (err as any)?.code || (err as any)?.cause?.code;
      if (pgCode === '23505') {
        const detail = (err as any)?.detail || (err as any)?.cause?.detail || 'A record with conflicting unique values already exists';
        return res.status(409).json({ error: detail });
      }
      console.error('[Admin Master Data Controller Error]:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return {
    // 1. Departments
    listDepartments: (req: Request, res: Response) =>
      handle(res, (db) => listDepartments(db, req.query as any)),
    getDepartment: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getDepartmentById(db, getId(req)) })),
    createDepartment: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createDepartment(db, req.body) }), 201),
    updateDepartment: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateDepartment(db, getId(req), req.body) })),
    deactivateDepartment: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateDepartment(db, getId(req)) })),
    activateDepartment: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateDepartment(db, getId(req)) })),

    // 2. Courses
    listCourses: (req: Request, res: Response) =>
      handle(res, (db) => listCourses(db, req.query as any)),
    getCourse: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getCourseById(db, getId(req)) })),
    createCourse: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createCourse(db, req.body) }), 201),
    updateCourse: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateCourse(db, getId(req), req.body) })),
    deactivateCourse: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateCourse(db, getId(req)) })),
    activateCourse: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateCourse(db, getId(req)) })),

    // 3. Semesters
    listSemesters: (req: Request, res: Response) =>
      handle(res, (db) => listSemesters(db, req.query as any)),
    getSemester: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getSemesterById(db, getId(req)) })),
    createSemester: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createSemester(db, req.body) }), 201),
    updateSemester: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateSemester(db, getId(req), req.body) })),
    deactivateSemester: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateSemester(db, getId(req)) })),
    activateSemester: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateSemester(db, getId(req)) })),

    // 4. Sections
    listSections: (req: Request, res: Response) =>
      handle(res, (db) => listSections(db, req.query as any)),
    getSection: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getSectionById(db, getId(req)) })),
    createSection: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createSection(db, req.body) }), 201),
    updateSection: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateSection(db, getId(req), req.body) })),
    deactivateSection: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateSection(db, getId(req)) })),
    activateSection: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateSection(db, getId(req)) })),

    // 5. Faculty
    listFaculty: (req: Request, res: Response) =>
      handle(res, (db) => listFaculty(db, req.query as any)),
    getFaculty: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getFacultyById(db, getId(req)) })),
    createFaculty: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createFaculty(db, req.body) }), 201),
    updateFaculty: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateFaculty(db, getId(req), req.body) })),
    deactivateFaculty: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateFaculty(db, getId(req)) })),
    activateFaculty: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateFaculty(db, getId(req)) })),

    // 6. Subjects
    listSubjects: (req: Request, res: Response) =>
      handle(res, (db) => listSubjects(db, req.query as any)),
    getSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getSubjectById(db, getId(req)) })),
    createSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createSubject(db, req.body) }), 201),
    updateSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateSubject(db, getId(req), req.body) })),
    deactivateSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateSubject(db, getId(req)) })),
    activateSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateSubject(db, getId(req)) })),

    // 7. Classrooms
    listClassrooms: (req: Request, res: Response) =>
      handle(res, (db) => listClassrooms(db, req.query as any)),
    getClassroom: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getClassroomById(db, getId(req)) })),
    createClassroom: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await createClassroom(db, req.body) }), 201),
    updateClassroom: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateClassroom(db, getId(req), req.body) })),
    deactivateClassroom: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateClassroom(db, getId(req)) })),
    activateClassroom: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateClassroom(db, getId(req)) })),

    // 8. Course-Subjects (Curriculum Mappings)
    listCourseSubjects: (req: Request, res: Response) =>
      handle(res, (db) => listCourseSubjects(db, req.query as any)),
    getCourseSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await getCourseSubjectById(db, getId(req)) })),
    createCourseSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await addSubjectToCurriculum(db, req.body) }), 201),
    updateCourseSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await updateCourseSubject(db, getId(req), req.body) })),
    deactivateCourseSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await deactivateCourseSubject(db, getId(req)) })),
    activateCourseSubject: (req: Request, res: Response) =>
      handle(res, async (db) => ({ data: await activateCourseSubject(db, getId(req)) })),
  };
}
