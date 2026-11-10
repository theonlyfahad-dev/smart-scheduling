import { z } from 'zod';

// ===========================================================================
// Common UUID Param and Base Pagination Query Schemas
// ===========================================================================

export const idParamSchema = z.object({
  id: z.string().uuid({ message: 'Invalid ID: must be a valid UUID' }),
});

export const basePaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  offset: z.coerce.number().int().min(0, 'Offset cannot be negative').default(0),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  isActive: z.enum(['true', 'false', 'all']).default('all'),
});

// ===========================================================================
// 1. Departments
// ===========================================================================

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters'),
  code: z.string().trim().min(1, 'Code is required').max(20, 'Code cannot exceed 20 characters').transform((v) => v.toUpperCase()),
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(150, 'Name cannot exceed 150 characters').optional(),
  code: z.string().trim().min(1, 'Code cannot be empty').max(20, 'Code cannot exceed 20 characters').transform((v) => v.toUpperCase()).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listDepartmentsQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['name', 'code', 'created_at']).default('name'),
});

// ===========================================================================
// 2. Courses
// ===========================================================================

export const createCourseSchema = z.object({
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  name: z.string().trim().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters'),
  code: z.string().trim().min(1, 'Code is required').max(20, 'Code cannot exceed 20 characters').transform((v) => v.toUpperCase()),
  totalSemesters: z.coerce.number().int().min(1, 'Total semesters must be between 1 and 12').max(12, 'Total semesters must be between 1 and 12'),
});

export const updateCourseSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(150, 'Name cannot exceed 150 characters').optional(),
  code: z.string().trim().min(1, 'Code cannot be empty').max(20, 'Code cannot exceed 20 characters').transform((v) => v.toUpperCase()).optional(),
  totalSemesters: z.coerce.number().int().min(1, 'Total semesters must be between 1 and 12').max(12, 'Total semesters must be between 1 and 12').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listCoursesQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['name', 'code', 'total_semesters', 'created_at']).default('name'),
  departmentId: z.string().uuid().optional(),
});

// ===========================================================================
// 3. Semesters
// ===========================================================================

export const createSemesterSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID'),
  semesterNumber: z.coerce.number().int().min(1, 'Semester number must be between 1 and 12').max(12, 'Semester number must be between 1 and 12'),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Academic year must match format YYYY-YYYY (e.g. 2026-2027)'),
  term: z.enum(['ODD', 'EVEN'], { errorMap: () => ({ message: "Term must be 'ODD' or 'EVEN'" }) }),
});

export const updateSemesterSchema = z.object({
  semesterNumber: z.coerce.number().int().min(1, 'Semester number must be between 1 and 12').max(12, 'Semester number must be between 1 and 12').optional(),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Academic year must match format YYYY-YYYY (e.g. 2026-2027)').optional(),
  term: z.enum(['ODD', 'EVEN'], { errorMap: () => ({ message: "Term must be 'ODD' or 'EVEN'" }) }).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listSemestersQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['semester_number', 'academic_year', 'created_at']).default('created_at'),
  courseId: z.string().uuid().optional(),
  academicYear: z.string().optional(),
  term: z.enum(['ODD', 'EVEN']).optional(),
});

// ===========================================================================
// 4. Sections
// ===========================================================================

export const createSectionSchema = z.object({
  semesterId: z.string().uuid('semesterId must be a valid UUID'),
  name: z.string().trim().min(1, 'Name is required').max(10, 'Name cannot exceed 10 characters'),
  classCode: z.string().trim().min(1, 'Class code is required').max(30, 'Class code cannot exceed 30 characters'),
});

export const updateSectionSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(10, 'Name cannot exceed 10 characters').optional(),
  classCode: z.string().trim().min(1, 'Class code cannot be empty').max(30, 'Class code cannot exceed 30 characters').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listSectionsQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['name', 'class_code', 'created_at']).default('name'),
  semesterId: z.string().uuid().optional(),
});

// ===========================================================================
// 5. Faculty
// ===========================================================================

export const createFacultySchema = z.object({
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  employeeCode: z.string().trim().min(1, 'Employee code is required').max(30, 'Employee code cannot exceed 30 characters').transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email cannot exceed 255 characters').transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(25, 'Phone cannot exceed 25 characters').optional(),
});

export const updateFacultySchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(150, 'Name cannot exceed 150 characters').optional(),
  employeeCode: z.string().trim().min(1, 'Employee code cannot be empty').max(30, 'Employee code cannot exceed 30 characters').transform((v) => v.toUpperCase()).optional(),
  email: z.string().trim().email('Invalid email address').max(255, 'Email cannot exceed 255 characters').transform((v) => v.toLowerCase()).optional(),
  phone: z.string().trim().max(25, 'Phone cannot exceed 25 characters').optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listFacultyQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['name', 'employee_code', 'email', 'created_at']).default('name'),
  departmentId: z.string().uuid().optional(),
});

// ===========================================================================
// 6. Subjects
// ===========================================================================

export const createSubjectSchema = z.object({
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  code: z.string().trim().min(1, 'Code is required').max(20, 'Code cannot exceed 20 characters').transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters'),
  type: z.enum(['THEORY', 'LAB', 'TUTORIAL'], { errorMap: () => ({ message: "Type must be 'THEORY', 'LAB', or 'TUTORIAL'" }) }),
});

export const updateSubjectSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(150, 'Name cannot exceed 150 characters').optional(),
  code: z.string().trim().min(1, 'Code cannot be empty').max(20, 'Code cannot exceed 20 characters').transform((v) => v.toUpperCase()).optional(),
  type: z.enum(['THEORY', 'LAB', 'TUTORIAL'], { errorMap: () => ({ message: "Type must be 'THEORY', 'LAB', or 'TUTORIAL'" }) }).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listSubjectsQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['name', 'code', 'type', 'created_at']).default('name'),
  departmentId: z.string().uuid().optional(),
  type: z.enum(['THEORY', 'LAB', 'TUTORIAL']).optional(),
});

// ===========================================================================
// 7. Classrooms
// ===========================================================================

export const createClassroomSchema = z.object({
  buildingBlock: z.string().trim().min(1, 'Building block is required').max(50, 'Building block cannot exceed 50 characters'),
  roomNumber: z.string().trim().min(1, 'Room number is required').max(30, 'Room number cannot exceed 30 characters'),
  type: z.enum(['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM'], { errorMap: () => ({ message: "Type must be 'LECTURE_HALL', 'LAB', or 'SEMINAR_ROOM'" }) }),
});

export const updateClassroomSchema = z.object({
  buildingBlock: z.string().trim().min(1, 'Building block cannot be empty').max(50, 'Building block cannot exceed 50 characters').optional(),
  roomNumber: z.string().trim().min(1, 'Room number cannot be empty').max(30, 'Room number cannot exceed 30 characters').optional(),
  type: z.enum(['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM'], { errorMap: () => ({ message: "Type must be 'LECTURE_HALL', 'LAB', or 'SEMINAR_ROOM'" }) }).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listClassroomsQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['building_block', 'room_number', 'type', 'created_at']).default('building_block'),
  buildingBlock: z.string().optional(),
  type: z.enum(['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM']).optional(),
});

// ===========================================================================
// 8. Course-Subjects (Curriculum Mappings)
// ===========================================================================

export const createCourseSubjectSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID'),
  subjectId: z.string().uuid('subjectId must be a valid UUID'),
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  semesterNumber: z.coerce.number().int().min(1, 'Semester number must be between 1 and 12').max(12, 'Semester number must be between 1 and 12'),
});

export const updateCourseSubjectSchema = z.object({
  semesterNumber: z.coerce.number().int().min(1, 'Semester number must be between 1 and 12').max(12, 'Semester number must be between 1 and 12'),
});

export const listCourseSubjectsQuerySchema = basePaginationQuerySchema.extend({
  sortBy: z.enum(['semester_number', 'created_at']).default('created_at'),
  courseId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  semesterNumber: z.coerce.number().int().min(1).max(12).optional(),
});
