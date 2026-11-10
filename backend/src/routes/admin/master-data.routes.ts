import { Router } from 'express';
import { dbAdapter, type DatabaseExecutor } from '../../db/client.js';
import { authenticate, createAuthenticateMiddleware } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { csrfGuard } from '../../middleware/csrfGuard.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../../middleware/validate.js';
import {
  idParamSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
  createCourseSchema,
  updateCourseSchema,
  listCoursesQuerySchema,
  createSemesterSchema,
  updateSemesterSchema,
  listSemestersQuerySchema,
  createSectionSchema,
  updateSectionSchema,
  listSectionsQuerySchema,
  createFacultySchema,
  updateFacultySchema,
  listFacultyQuerySchema,
  createSubjectSchema,
  updateSubjectSchema,
  listSubjectsQuerySchema,
  createClassroomSchema,
  updateClassroomSchema,
  listClassroomsQuerySchema,
  createCourseSubjectSchema,
  updateCourseSubjectSchema,
  listCourseSubjectsQuerySchema,
} from '../../validations/master-data.schema.js';
import { createAdminMasterDataController } from '../../controllers/admin-master-data.controller.js';

export function createAdminMasterDataRouter(customDb?: DatabaseExecutor): Router {
  const router = Router();
  const getDb = () => customDb ?? dbAdapter.db;
  const authMiddleware = customDb ? createAuthenticateMiddleware(customDb) : authenticate;
  const controller = createAdminMasterDataController(getDb);

  // Security Guards across all Admin routes
  router.use(authMiddleware);
  router.use(requireRole('ADMIN'));

  // ===========================================================================
  // 1. Departments
  // ===========================================================================
  router.get('/departments', validateQuery(listDepartmentsQuerySchema), controller.listDepartments);
  router.get('/departments/:id', validateParams(idParamSchema), controller.getDepartment);
  router.post('/departments', csrfGuard, validateBody(createDepartmentSchema), controller.createDepartment);
  router.patch('/departments/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateDepartmentSchema), controller.updateDepartment);
  router.delete('/departments/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateDepartment);
  router.post('/departments/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateDepartment);

  // ===========================================================================
  // 2. Courses
  // ===========================================================================
  router.get('/courses', validateQuery(listCoursesQuerySchema), controller.listCourses);
  router.get('/courses/:id', validateParams(idParamSchema), controller.getCourse);
  router.post('/courses', csrfGuard, validateBody(createCourseSchema), controller.createCourse);
  router.patch('/courses/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateCourseSchema), controller.updateCourse);
  router.delete('/courses/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateCourse);
  router.post('/courses/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateCourse);

  // ===========================================================================
  // 3. Semesters
  // ===========================================================================
  router.get('/semesters', validateQuery(listSemestersQuerySchema), controller.listSemesters);
  router.get('/semesters/:id', validateParams(idParamSchema), controller.getSemester);
  router.post('/semesters', csrfGuard, validateBody(createSemesterSchema), controller.createSemester);
  router.patch('/semesters/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateSemesterSchema), controller.updateSemester);
  router.delete('/semesters/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateSemester);
  router.post('/semesters/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateSemester);

  // ===========================================================================
  // 4. Sections
  // ===========================================================================
  router.get('/sections', validateQuery(listSectionsQuerySchema), controller.listSections);
  router.get('/sections/:id', validateParams(idParamSchema), controller.getSection);
  router.post('/sections', csrfGuard, validateBody(createSectionSchema), controller.createSection);
  router.patch('/sections/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateSectionSchema), controller.updateSection);
  router.delete('/sections/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateSection);
  router.post('/sections/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateSection);

  // ===========================================================================
  // 5. Faculty
  // ===========================================================================
  router.get('/faculty', validateQuery(listFacultyQuerySchema), controller.listFaculty);
  router.get('/faculty/:id', validateParams(idParamSchema), controller.getFaculty);
  router.post('/faculty', csrfGuard, validateBody(createFacultySchema), controller.createFaculty);
  router.patch('/faculty/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateFacultySchema), controller.updateFaculty);
  router.delete('/faculty/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateFaculty);
  router.post('/faculty/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateFaculty);

  // ===========================================================================
  // 6. Subjects
  // ===========================================================================
  router.get('/subjects', validateQuery(listSubjectsQuerySchema), controller.listSubjects);
  router.get('/subjects/:id', validateParams(idParamSchema), controller.getSubject);
  router.post('/subjects', csrfGuard, validateBody(createSubjectSchema), controller.createSubject);
  router.patch('/subjects/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateSubjectSchema), controller.updateSubject);
  router.delete('/subjects/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateSubject);
  router.post('/subjects/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateSubject);

  // ===========================================================================
  // 7. Classrooms
  // ===========================================================================
  router.get('/classrooms', validateQuery(listClassroomsQuerySchema), controller.listClassrooms);
  router.get('/classrooms/:id', validateParams(idParamSchema), controller.getClassroom);
  router.post('/classrooms', csrfGuard, validateBody(createClassroomSchema), controller.createClassroom);
  router.patch('/classrooms/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateClassroomSchema), controller.updateClassroom);
  router.delete('/classrooms/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateClassroom);
  router.post('/classrooms/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateClassroom);

  // ===========================================================================
  // 8. Course-Subjects (Curriculum Mappings)
  // ===========================================================================
  router.get('/course-subjects', validateQuery(listCourseSubjectsQuerySchema), controller.listCourseSubjects);
  router.get('/course-subjects/:id', validateParams(idParamSchema), controller.getCourseSubject);
  router.post('/course-subjects', csrfGuard, validateBody(createCourseSubjectSchema), controller.createCourseSubject);
  router.patch('/course-subjects/:id', csrfGuard, validateParams(idParamSchema), validateBody(updateCourseSubjectSchema), controller.updateCourseSubject);
  router.delete('/course-subjects/:id', csrfGuard, validateParams(idParamSchema), controller.deactivateCourseSubject);
  router.post('/course-subjects/:id/activate', csrfGuard, validateParams(idParamSchema), controller.activateCourseSubject);

  return router;
}

export const adminMasterDataRouter = createAdminMasterDataRouter();
