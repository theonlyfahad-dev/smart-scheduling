// ===========================================================================
// Step 5: Admin Frontend UI - Core API Types
// ===========================================================================

export interface AuthUser {
  id: string;
  username: string;
  role: 'ADMIN' | 'HOD' | 'FACULTY';
  faculty_id: string | null;
}

export interface LoginResponse {
  message: string;
  user: AuthUser;
  csrfToken: string;
}

export interface MeResponse {
  user: AuthUser;
  csrfToken: string;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface SingleResponse<T> {
  data: T;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: ApiErrorDetail[];
}

// ---------------------------------------------------------------------------
// 1. Departments
// ---------------------------------------------------------------------------
export interface Department {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDepartmentInput {
  name: string;
  code: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// 2. Courses
// ---------------------------------------------------------------------------
export interface Course {
  id: string;
  department_id: string;
  name: string;
  code: string;
  total_semesters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCourseInput {
  departmentId: string;
  name: string;
  code: string;
  totalSemesters: number;
}

export interface UpdateCourseInput {
  name?: string;
  code?: string;
  totalSemesters?: number;
}

// ---------------------------------------------------------------------------
// 3. Semesters
// ---------------------------------------------------------------------------
export interface Semester {
  id: string;
  course_id: string;
  semester_number: number;
  academic_year: string;
  term: 'ODD' | 'EVEN';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSemesterInput {
  courseId: string;
  semesterNumber: number;
  academicYear: string;
  term: 'ODD' | 'EVEN';
}

export interface UpdateSemesterInput {
  semesterNumber?: number;
  academicYear?: string;
  term?: 'ODD' | 'EVEN';
}

// ---------------------------------------------------------------------------
// 4. Sections
// ---------------------------------------------------------------------------
export interface Section {
  id: string;
  semester_id: string;
  name: string;
  class_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSectionInput {
  semesterId: string;
  name: string;
  classCode: string;
}

export interface UpdateSectionInput {
  name?: string;
  classCode?: string;
}

// ---------------------------------------------------------------------------
// 5. Faculty
// ---------------------------------------------------------------------------
export interface Faculty {
  id: string;
  department_id: string;
  employee_code: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFacultyInput {
  departmentId: string;
  employeeCode: string;
  name: string;
  email: string;
  phone?: string;
}

export interface UpdateFacultyInput {
  name?: string;
  employeeCode?: string;
  email?: string;
  phone?: string | null;
}

// ---------------------------------------------------------------------------
// 6. Subjects
// ---------------------------------------------------------------------------
export interface Subject {
  id: string;
  department_id: string;
  code: string;
  name: string;
  type: 'THEORY' | 'LAB' | 'TUTORIAL';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSubjectInput {
  departmentId: string;
  code: string;
  name: string;
  type: 'THEORY' | 'LAB' | 'TUTORIAL';
}

export interface UpdateSubjectInput {
  name?: string;
  code?: string;
  type?: 'THEORY' | 'LAB' | 'TUTORIAL';
}

// ---------------------------------------------------------------------------
// 7. Classrooms
// ---------------------------------------------------------------------------
export interface Classroom {
  id: string;
  building_block: string;
  room_number: string;
  type: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClassroomInput {
  buildingBlock: string;
  roomNumber: string;
  type: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM';
}

export interface UpdateClassroomInput {
  buildingBlock?: string;
  roomNumber?: string;
  type?: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM';
}

// ---------------------------------------------------------------------------
// 8. Curriculum (Course-Subject Mappings)
// ---------------------------------------------------------------------------
export interface CourseSubject {
  id: string;
  course_id: string;
  subject_id: string;
  department_id: string;
  semester_number: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCourseSubjectInput {
  courseId: string;
  subjectId: string;
  departmentId: string;
  semesterNumber: number;
}

export interface UpdateCourseSubjectInput {
  semesterNumber: number;
}
