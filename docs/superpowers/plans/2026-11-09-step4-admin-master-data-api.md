# Admin Master Data API Implementation Plan (Refined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure, production-grade, Admin-only CRUD REST API endpoints for the 8 core college master data entities and curriculum mappings with strict RBAC, Synchronizer Token CSRF protection, Zod validation, bounded pagination with stable ordering, explicit PATCH update semantics, and soft-deactivation lifecycle guarantees.

**Architecture:** Express API routes mounted under `/api/v1/admin`, protected at the router level by session authentication (`authenticate`) and role guard (`requireRole('ADMIN')`), with `csrfGuard` enforcing Synchronizer Token validation on all state-changing HTTP methods (POST, PATCH, DELETE) while exempting safe GET requests. Request bodies, query parameters, and route parameters are validated using Zod schemas with standardized HTTP status codes and error formatting. Mutating operations directly reuse existing creation, activation, and deactivation business logic from `academic.service.ts` and `curriculum.service.ts` without duplication. New services provide only missing query (paginated/filtered/sorted) and update operations. Partial updates use PATCH semantics with complete merged-state validation. Soft-deactivation is standardized to `DELETE /:id` across all entities to preserve historical timetable records and prevent relational cascade failures.

**Tech Stack:** Node.js, Express, TypeScript, Zod, Drizzle ORM, PostgreSQL / PGlite, Cookie-Parser.

**Spec:** Step 4 Master Data API specification defined in user requests, adhering strictly to `AGENTS.md` and `GEMINI.md`.

---

## Global Constraints

- **Human-controlled development:** Follow `AGENTS.md` rules strictly; do not add unapproved features, analytics, dashboards, or AI/LLM modules.
- **Direct service reuse:** Reuse `academic.service.ts` and `curriculum.service.ts` for all creation, deactivation, activation, relationship checks, and session revocation logic. Do not duplicate this code.
- **Strict Admin-only access:** Every `/api/v1/admin/*` route must require `authenticate` and `requireRole('ADMIN')`.
- **Default-deny:** HOD and FACULTY roles must receive HTTP 403 Forbidden on all Admin endpoints.
- **CSRF protection:** Synchronizer Token Pattern (`csrfGuard`) must be enforced on all state-changing methods (POST, PATCH, DELETE). Safe methods (GET, HEAD, OPTIONS) are exempt.
- **Consistent deactivation convention:** `DELETE /:id` performs soft-deactivation (`is_active = false`). No separate redundant `/deactivate` endpoints. Never hard-delete master data records.
- **Reactivation convention:** `POST /:id/activate` re-activates an entity after verifying that all parent entities in the hierarchy are active.
- **Bounded pagination with stable ordering:** All list endpoints enforce bounded limit (`1 <= limit <= 100`, default `20`), offset (`offset >= 0`, default `0`), allowlisted `sortBy` fields per entity, and a mandatory secondary tie-breaker `id ASC` to prevent pagination jitter.
- **Explicit PATCH update semantics:** Updates use PATCH, permit only explicitly editable fields, prevent modification of immutable primary and foreign keys, and validate the complete merged entity record before saving.
- **Standardized HTTP status codes:**
  - `400 Bad Request`: malformed input, invalid types, out-of-range bounds, inactive-parent violations, cross-department mapping mismatches.
  - `401 Unauthorized`: missing, invalid, expired, or revoked session cookie.
  - `403 Forbidden`: authenticated user without ADMIN role or invalid CSRF token.
  - `404 Not Found`: requested entity or referenced parent record does not exist.
  - `409 Conflict`: unique constraint violation or duplicate record.
- **Zero new runtime dependencies:** Use existing dependencies (`zod`, `drizzle-orm`, `express`, `cookie-parser`).
- **No schema modifications:** Tables, triggers, indexes, and constraints from Step 2 remain unchanged.

---

## Offset-Pagination Limitations & Design Rationale

1. **Strategy:** Standard SQL offset-pagination (`LIMIT $limit OFFSET $offset`) with allowlisted sorting keys.
2. **Parameters:**
   - `limit`: integer, bounded between `1` and `100` (default: `20`). Rejects values outside this range.
   - `offset`: integer, bounded $\ge 0$ (default: `0`).
   - `sortBy`: allowlisted string matching approved entity columns.
   - `sortOrder`: enum `['asc', 'desc']` (default: `asc`, or `desc` for timestamps).
3. **Stable Ordering Guarantee:**
   - All listing queries enforce an unambiguous secondary sort: `ORDER BY <sortBy> <sortOrder>, id ASC`.
   - This guarantees deterministic ordering for rows with identical primary sort values.
4. **Documented Limitations:**
   - Offset pagination queries against a snapshot of the table at execution time. Under concurrent writes (e.g. concurrent creation or deactivation), records may shift across page boundaries between successive page requests, potentially causing an item to appear twice or be skipped.
   - For college master data management (departments, courses, faculty, classrooms, etc.), administrative writes are infrequent and dataset sizes are moderate (typically tens to hundreds of records per entity). Therefore, standard offset pagination provides the simplest, most readable, and fully adequate solution without introducing cursor pagination complexity in this milestone.

---

## Update Semantics & Field Mutability Contract

Partial updates must use `PATCH /api/v1/admin/<entities>/:id`.
The update service must:
1. Load the existing record by ID (throw `NotFoundError` 404 if not found).
2. Merge the incoming validated patch fields into the existing record state.
3. Validate the complete resulting record against business rules and constraints.
4. Verify unique constraints excluding the current entity ID (throw `ConflictError` 409 on collision).
5. Prevent modification of immutable primary identifiers, relationship keys, and lifecycle flags.
6. Commit the update with `updated_at = sql`NOW()`` and return the updated entity.

### Entity-by-Entity Mutability Specification

| Entity | Editable Fields (PATCH) | Immutable Fields (Rejected if modified) | Specific Validation Rules on Merged State |
| :--- | :--- | :--- | :--- |
| **Departments** | `name` (1-150), `code` (1-20) | `id`, `created_at`, `updated_at`, `is_active` | Code coerced to uppercase; check `name` and `code` uniqueness across other departments. |
| **Courses** | `name` (1-150), `code` (1-20), `totalSemesters` (1-12) | `id`, `department_id`, `created_at`, `updated_at`, `is_active` | Code coerced to uppercase; check `(department_id, code)` uniqueness; check `totalSemesters` $\ge 1$ and $\le 12$; check new `totalSemesters` is not less than the maximum existing active semester number for this course. |
| **Semesters** | `academicYear` (regex `^\d{4}-\d{4}$`), `term` (`ODD` \| `EVEN`), `semesterNumber` (1-12) | `id`, `course_id`, `created_at`, `updated_at`, `is_active` | Verify `semesterNumber` $\le$ parent `course.total_semesters`; check `(course_id, academic_year, semester_number)` uniqueness across other semesters. |
| **Sections** | `name` (1-10), `classCode` (1-30) | `id`, `semester_id`, `created_at`, `updated_at`, `is_active` | Check `(semester_id, name)` uniqueness and global `class_code` uniqueness across other sections. |
| **Faculty** | `name` (1-150), `employeeCode` (1-30), `email` (email, max 255), `phone` (max 25) | `id`, `department_id`, `created_at`, `updated_at`, `is_active` | Employee code coerced to uppercase; email coerced to lowercase; check `employee_code` uniqueness and case-insensitive `email` uniqueness across other faculty. |
| **Subjects** | `name` (1-150), `code` (1-20), `type` (`THEORY` \| `LAB` \| `TUTORIAL`) | `id`, `department_id`, `created_at`, `updated_at`, `is_active` | Code coerced to uppercase; check `(department_id, code)` uniqueness; check `type` in allowed enum. |
| **Classrooms** | `buildingBlock` (1-50), `roomNumber` (1-30), `type` (`LECTURE_HALL` \| `LAB` \| `SEMINAR_ROOM`) | `id`, `created_at`, `updated_at`, `is_active` | Check `(building_block, room_number)` uniqueness across other classrooms; check `type` in allowed enum. |
| **Course-Subjects** | `semesterNumber` (1-12) | `id`, `course_id`, `subject_id`, `department_id`, `created_at`, `updated_at`, `is_active` | Curriculum relationships (`course_id`, `subject_id`, `department_id`) are immutable once created (must deactivate and create anew to reassign); verify `semesterNumber` $\le$ `course.total_semesters`; check `(course_id, subject_id, semester_number)` uniqueness. |

---

## Standardized HTTP Status Code & Error Mapping

| Status Code | Meaning | Triggers & Handling in Master Data API |
| :--- | :--- | :--- |
| **400 Bad Request** | Invalid Client Input | - Malformed JSON body or unparseable payload.<br>- Zod schema validation errors (missing required fields, string length, regex mismatch).<br>- Out-of-bounds pagination parameters (`limit < 1` or `limit > 100`, `offset < 0`).<br>- Unallowlisted `sortBy` field.<br>- Value range bounds (`semester_number > course.total_semesters`, `total_semesters < 1 or > 12`).<br>- Inactive-parent violations: attempting to create or activate a child under an inactive parent entity (`ValidationError`).<br>- Cross-department curriculum mismatch (`course.department_id !== subject.department_id`). |
| **401 Unauthorized** | Authentication Failure | - Missing `smart_session` cookie.<br>- Invalid token hash.<br>- Expired session (`expires_at <= NOW()`).<br>- Revoked session (`is_revoked = true`).<br>- Inactive or missing linked user account. |
| **403 Forbidden** | Authorization / CSRF Failure | - Authenticated user whose role is not `ADMIN` (e.g. `HOD`, `FACULTY`).<br>- Missing `X-CSRF-Token` header on state-changing requests (POST, PATCH, DELETE).<br>- Mismatched `X-CSRF-Token` header compared to session `csrf_secret`. |
| **404 Not Found** | Resource Missing | - Target resource `:id` does not exist in the queried table (`NotFoundError`).<br>- Referenced foreign key entity does not exist in its table (`NotFoundError`). |
| **409 Conflict** | Relational Collision | - Unique constraint violation on duplicate natural key or compound key (`ConflictError`):<br>  - Duplicate department name or code.<br>  - Duplicate course code within same department.<br>  - Duplicate semester `(course_id, academic_year, semester_number)`.<br>  - Duplicate section name in semester or duplicate `class_code`.<br>  - Duplicate faculty employee code or case-insensitive email.<br>  - Duplicate classroom building block and room number.<br>  - Duplicate curriculum mapping `(course_id, subject_id, semester_number)`. |
| **500 Internal Error** | Server Failure | - Unhandled runtime exceptions or database connectivity failures (never exposing database internals or secrets to client). |

---

## Detailed REST Endpoint Contract for All 8 Entities

All endpoints are mounted under `/api/v1/admin`.
All requests require authenticated session cookie (`smart_session`).
All mutating requests (POST, PATCH, DELETE) require `X-CSRF-Token` header. Safe GET requests are exempt.

### Standard Response Envelope

#### 1. Paginated List Response (HTTP 200 OK)
```json
{
  "data": [ /* Array of entity records */ ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

#### 2. Single Entity Response (HTTP 200 OK / HTTP 201 Created)
```json
{
  "data": { /* Entity record */ }
}
```

#### 3. Standard Error Response
```json
{
  "error": "Descriptive error message",
  "details": [ /* Optional Zod validation issues array */ ]
}
```

---

### Endpoints Specification

#### 1. Departments (`/departments`)
- **List:** `GET /departments`
  - Query: `limit` (1-100, def 20), `offset` (>=0, def 0), `sortBy` (`name` | `code` | `created_at`, def `name`), `sortOrder` (`asc` | `desc`, def `asc`), `isActive` (`'true'` | `'false'` | `'all'`, def `'all'`).
  - Response: 200 OK with paginated departments list.
- **Detail:** `GET /departments/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with department record; 404 if not found.
- **Create:** `POST /departments`
  - Body: `{ name: string (1-150), code: string (1-20) }`
  - Service: `academicService.createDepartment`
  - Response: 201 Created with `{ data: department }`. 400 on validation failure, 409 on duplicate name or code.
- **Update:** `PATCH /departments/:id`
  - Body: `{ name?: string (1-150), code?: string (1-20) }`
  - Service: `masterDataUpdateService.updateDepartment`
  - Response: 200 OK with `{ data: updatedDepartment }`. 400 on invalid input, 404 if not found, 409 on duplicate name or code.
- **Soft-deactivate:** `DELETE /departments/:id`
  - Service: `academicService.deactivateDepartment`
  - Response: 200 OK with `{ data: deactivatedDepartment }` (`is_active: false`). 404 if not found.
- **Activate:** `POST /departments/:id/activate`
  - Service: `academicService.activateDepartment`
  - Response: 200 OK with `{ data: activatedDepartment }` (`is_active: true`). 404 if not found.

#### 2. Courses (`/courses`)
- **List:** `GET /courses`
  - Query: `limit`, `offset`, `sortBy` (`name` | `code` | `total_semesters` | `created_at`, def `name`), `sortOrder`, `isActive`, `departmentId` (UUID, optional).
  - Response: 200 OK with paginated courses list.
- **Detail:** `GET /courses/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with course record; 404 if not found.
- **Create:** `POST /courses`
  - Body: `{ departmentId: UUID, name: string (1-150), code: string (1-20), totalSemesters: int (1-12) }`
  - Service: `academicService.createCourse`
  - Response: 201 Created. 400 if parent department inactive or totalSemesters out of range, 404 if department not found, 409 on duplicate code within department.
- **Update:** `PATCH /courses/:id`
  - Body: `{ name?: string (1-150), code?: string (1-20), totalSemesters?: int (1-12) }`
  - Service: `masterDataUpdateService.updateCourse`
  - Response: 200 OK. 400 if invalid bounds or reducing below existing active semester count, 404 if not found, 409 on duplicate code in same department.
- **Soft-deactivate:** `DELETE /courses/:id`
  - Service: `academicService.deactivateCourse`
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /courses/:id/activate`
  - Service: `academicService.activateCourse`
  - Response: 200 OK with `is_active: true`. 400 if parent department is inactive, 404 if not found.

#### 3. Semesters (`/semesters`)
- **List:** `GET /semesters`
  - Query: `limit`, `offset`, `sortBy` (`semester_number` | `academic_year` | `created_at`, def `created_at`), `sortOrder`, `isActive`, `courseId` (UUID, optional), `academicYear` (string, optional), `term` (`ODD` | `EVEN`, optional).
  - Response: 200 OK with paginated semesters list.
- **Detail:** `GET /semesters/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with semester record; 404 if not found.
- **Create:** `POST /semesters`
  - Body: `{ courseId: UUID, semesterNumber: int (1-12), academicYear: string (regex ^\d{4}-\d{4}$), term: 'ODD' | 'EVEN' }`
  - Service: `academicService.createSemester`
  - Response: 201 Created. 400 if course/dept inactive or semesterNumber > course.totalSemesters, 404 if course not found, 409 on duplicate (courseId, academicYear, semesterNumber).
- **Update:** `PATCH /semesters/:id`
  - Body: `{ semesterNumber?: int (1-12), academicYear?: string (regex ^\d{4}-\d{4}$), term?: 'ODD' | 'EVEN' }`
  - Service: `masterDataUpdateService.updateSemester`
  - Response: 200 OK. 400 if out of bounds of course total semesters, 404 if not found, 409 if collision with existing semester.
- **Soft-deactivate:** `DELETE /semesters/:id`
  - Service: `academicService.deactivateSemester`
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /semesters/:id/activate`
  - Service: `academicService.activateSemester`
  - Response: 200 OK with `is_active: true`. 400 if parent course or department inactive, 404 if not found.

#### 4. Sections (`/sections`)
- **List:** `GET /sections`
  - Query: `limit`, `offset`, `sortBy` (`name` | `class_code` | `created_at`, def `name`), `sortOrder`, `isActive`, `semesterId` (UUID, optional).
  - Response: 200 OK with paginated sections list.
- **Detail:** `GET /sections/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with section record; 404 if not found.
- **Create:** `POST /sections`
  - Body: `{ semesterId: UUID, name: string (1-10), classCode: string (1-30) }`
  - Service: `academicService.createSection`
  - Response: 201 Created. 400 if semester/course/dept inactive, 404 if semester not found, 409 on duplicate name within semester or duplicate classCode globally.
- **Update:** `PATCH /sections/:id`
  - Body: `{ name?: string (1-10), classCode?: string (1-30) }`
  - Service: `masterDataUpdateService.updateSection`
  - Response: 200 OK. 400 on invalid input, 404 if not found, 409 on duplicate name within semester or duplicate classCode.
- **Soft-deactivate:** `DELETE /sections/:id`
  - Service: `academicService.deactivateSection`
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /sections/:id/activate`
  - Service: `academicService.activateSection`
  - Response: 200 OK with `is_active: true`. 400 if parent semester, course, or department inactive, 404 if not found.

#### 5. Faculty (`/faculty`)
- **List:** `GET /faculty`
  - Query: `limit`, `offset`, `sortBy` (`name` | `employee_code` | `email` | `created_at`, def `name`), `sortOrder`, `isActive`, `departmentId` (UUID, optional).
  - Response: 200 OK with paginated faculty list.
- **Detail:** `GET /faculty/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with faculty record; 404 if not found.
- **Create:** `POST /faculty`
  - Body: `{ departmentId: UUID, employeeCode: string (1-30), name: string (1-150), email: string (email, max 255), phone?: string (max 25) }`
  - Service: `academicService.createFaculty`
  - Response: 201 Created. 400 if department inactive, 404 if department not found, 409 on duplicate employeeCode or duplicate email (case-insensitive).
- **Update:** `PATCH /faculty/:id`
  - Body: `{ name?: string (1-150), employeeCode?: string (1-30), email?: string (email, max 255), phone?: string (max 25) }`
  - Service: `masterDataUpdateService.updateFaculty`
  - Response: 200 OK. 400 on invalid input, 404 if not found, 409 on duplicate employeeCode or duplicate email.
- **Soft-deactivate:** `DELETE /faculty/:id`
  - Service: `academicService.deactivateFaculty`
  - Note: Cascades to deactivating linked user account and revoking all active user sessions!
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /faculty/:id/activate`
  - Service: `academicService.activateFaculty`
  - Response: 200 OK with `is_active: true`. 400 if parent department is inactive, 404 if not found.

#### 6. Subjects (`/subjects`)
- **List:** `GET /subjects`
  - Query: `limit`, `offset`, `sortBy` (`name` | `code` | `type` | `created_at`, def `name`), `sortOrder`, `isActive`, `departmentId` (UUID, optional), `type` (`THEORY` | `LAB` | `TUTORIAL`, optional).
  - Response: 200 OK with paginated subjects list.
- **Detail:** `GET /subjects/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with subject record; 404 if not found.
- **Create:** `POST /subjects`
  - Body: `{ departmentId: UUID, code: string (1-20), name: string (1-150), type: 'THEORY' | 'LAB' | 'TUTORIAL' }`
  - Service: `academicService.createSubject`
  - Response: 201 Created. 400 if department inactive or invalid type, 404 if department not found, 409 on duplicate code within department.
- **Update:** `PATCH /subjects/:id`
  - Body: `{ name?: string (1-150), code?: string (1-20), type?: 'THEORY' | 'LAB' | 'TUTORIAL' }`
  - Service: `masterDataUpdateService.updateSubject`
  - Response: 200 OK. 400 on invalid input, 404 if not found, 409 on duplicate code in same department.
- **Soft-deactivate:** `DELETE /subjects/:id`
  - Service: `academicService.deactivateSubject`
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /subjects/:id/activate`
  - Service: `academicService.activateSubject`
  - Response: 200 OK with `is_active: true`. 400 if parent department is inactive, 404 if not found.

#### 7. Classrooms (`/classrooms`)
- **List:** `GET /classrooms`
  - Query: `limit`, `offset`, `sortBy` (`building_block` | `room_number` | `type` | `created_at`, def `building_block`), `sortOrder`, `isActive`, `buildingBlock` (string, optional), `type` (`LECTURE_HALL` | `LAB` | `SEMINAR_ROOM`, optional).
  - Response: 200 OK with paginated classrooms list.
- **Detail:** `GET /classrooms/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with classroom record; 404 if not found.
- **Create:** `POST /classrooms`
  - Body: `{ buildingBlock: string (1-50), roomNumber: string (1-30), type: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM' }`
  - Service: `academicService.createClassroom`
  - Response: 201 Created. 400 if invalid type, 409 on duplicate (buildingBlock, roomNumber).
- **Update:** `PATCH /classrooms/:id`
  - Body: `{ buildingBlock?: string (1-50), roomNumber?: string (1-30), type?: 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM' }`
  - Service: `masterDataUpdateService.updateClassroom`
  - Response: 200 OK. 400 on invalid type, 404 if not found, 409 on collision with another classroom's (buildingBlock, roomNumber).
- **Soft-deactivate:** `DELETE /classrooms/:id`
  - Service: `academicService.deactivateClassroom`
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /classrooms/:id/activate`
  - Service: `academicService.activateClassroom`
  - Response: 200 OK with `is_active: true`. 404 if not found.

#### 8. Course-Subjects (`/course-subjects`)
- **List:** `GET /course-subjects`
  - Query: `limit`, `offset`, `sortBy` (`semester_number` | `created_at`, def `created_at`), `sortOrder`, `isActive`, `courseId` (UUID, optional), `subjectId` (UUID, optional), `departmentId` (UUID, optional), `semesterNumber` (int 1-12, optional).
  - Response: 200 OK with paginated course-subject mappings.
- **Detail:** `GET /course-subjects/:id`
  - Params: `id` (UUID).
  - Response: 200 OK with mapping record; 404 if not found.
- **Create:** `POST /course-subjects`
  - Body: `{ courseId: UUID, subjectId: UUID, departmentId: UUID, semesterNumber: int (1-12) }`
  - Service: `curriculumService.addSubjectToCurriculum`
  - Response: 201 Created. 400 if department/course/subject inactive, if semesterNumber > course.totalSemesters, or if cross-department (course.departmentId !== subject.departmentId), 404 if not found, 409 on duplicate mapping.
- **Update:** `PATCH /course-subjects/:id`
  - Body: `{ semesterNumber: int (1-12) }`
  - Service: `masterDataUpdateService.updateCourseSubject`
  - Response: 200 OK with updated mapping. 400 if semesterNumber > course.totalSemesters, 404 if not found, 409 on duplicate (courseId, subjectId, semesterNumber).
- **Soft-deactivate:** `DELETE /course-subjects/:id`
  - Service: `curriculumService.deactivateCourseSubject`
  - Response: 200 OK with `is_active: false`. 404 if not found.
- **Activate:** `POST /course-subjects/:id/activate`
  - Service: `curriculumService.activateCourseSubject`
  - Response: 200 OK with `is_active: true`. 400 if parent course, subject, or department inactive, 404 if not found.

---

### Task 1: Master Data Validation Schemas & Validation Middleware

**Files:**
- Create: `backend/src/validations/master-data.schema.ts`
- Create: `backend/src/middleware/validate.ts`
- Test: `backend/tests/validation-middleware.test.ts`

**Interfaces:**
- Consumes: `zod` (`z`), Express types (`Request`, `Response`, `NextFunction`).
- Produces: 
  - `validateBody(schema)`, `validateQuery(schema)`, `validateParams(schema)` middleware functions.
  - Zod schemas: `idParamSchema`, `createPaginationQuerySchema(allowedSortFields, defaultSortField)`, schemas for Create/Update of all 8 entities.

- [ ] **Step 1: Write the failing test for validation schemas and middleware**

Create `backend/tests/validation-middleware.test.ts` testing:
- `validateParams` rejects non-UUID strings with 400 `{ error: 'Validation failed', details: [...] }`.
- `validateBody` rejects invalid payloads with 400 and passes valid payloads.
- `createPaginationQuerySchema` validates bounded limit (`1 <= limit <= 100`, default 20), offset (`offset >= 0`, default 0), rejects unapproved sort keys, and sets defaults.
- Schema validation for all 8 entities: checking types, bounds, string length, and regex.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/validation-middleware.test.ts` (from `backend/` directory)
Expected: FAIL with "Cannot find module '../src/validations/master-data.schema.js'"

- [ ] **Step 3: Implement `backend/src/validations/master-data.schema.ts` and `backend/src/middleware/validate.ts`**

Implement:
1. `backend/src/validations/master-data.schema.ts`:
   - `idParamSchema`: `z.object({ id: z.string().uuid() })`
   - Helper function `createPaginationQuerySchema<T extends [string, ...string[]]>(allowedSortFields: T, defaultSortField: T[number])`:
     - `limit`: `z.coerce.number().int().min(1).max(100).default(20)`
     - `offset`: `z.coerce.number().int().min(0).default(0)`
     - `sortBy`: `z.enum(allowedSortFields).default(defaultSortField)`
     - `sortOrder`: `z.enum(['asc', 'desc']).default('asc')`
     - `isActive`: `z.enum(['true', 'false', 'all']).default('all')`
   - Entity-specific query schemas extending the base pagination schema:
     - `listCoursesQuerySchema`: adds optional `departmentId: z.string().uuid()`
     - `listSemestersQuerySchema`: adds optional `courseId: z.string().uuid()`, `academicYear: z.string()`, `term: z.enum(['ODD', 'EVEN'])`
     - `listSectionsQuerySchema`: adds optional `semesterId: z.string().uuid()`
     - `listFacultyQuerySchema`: adds optional `departmentId: z.string().uuid()`
     - `listSubjectsQuerySchema`: adds optional `departmentId: z.string().uuid()`, `type: z.enum(['THEORY', 'LAB', 'TUTORIAL'])`
     - `listClassroomsQuerySchema`: adds optional `buildingBlock: z.string()`, `type: z.enum(['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM'])`
     - `listCourseSubjectsQuerySchema`: adds optional `courseId: z.string().uuid()`, `subjectId: z.string().uuid()`, `departmentId: z.string().uuid()`, `semesterNumber: z.coerce.number().int().min(1).max(12)`
   - Create schemas and PATCH Update schemas for all 8 entities strictly matching the mutability specification.
2. `backend/src/middleware/validate.ts`:
   - `validateBody(schema)`: parses `req.body`, replaces `req.body` with parsed output; on ZodError returns 400 with `{ error: 'Validation failed', details: err.errors }`.
   - `validateQuery(schema)`: parses `req.query`, replaces `req.query` with parsed output; on ZodError returns 400.
   - `validateParams(schema)`: parses `req.params`, returns 400 on failure.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/validation-middleware.test.ts`
Expected: PASS with 0 exit code.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/validations/master-data.schema.ts backend/src/middleware/validate.ts backend/tests/validation-middleware.test.ts
git commit -m "feat(api): implement master data validation schemas and validation middleware"
```

---

### Task 2: Master Data Query & Update Service Layer (Non-Duplicative)

**Files:**
- Create: `backend/src/services/master-data-query.service.ts`
- Create: `backend/src/services/master-data-update.service.ts`
- Test: `backend/tests/master-data-services.test.ts`

**Interfaces:**
- Consumes: `drizzle-orm`, `backend/src/db/schema.ts`, `backend/src/db/client.ts` (`DatabaseExecutor`), `backend/src/errors/app.errors.ts`.
- Produces:
  - `masterDataQueryService`: `listDepartments`, `getDepartmentById`, `listCourses`, `getCourseById`, `listSemesters`, `getSemesterById`, `listSections`, `getSectionById`, `listFaculty`, `getFacultyById`, `listSubjects`, `getSubjectById`, `listClassrooms`, `getClassroomById`, `listCourseSubjects`, `getCourseSubjectById`.
  - `masterDataUpdateService`: `updateDepartment`, `updateCourse`, `updateSemester`, `updateSection`, `updateFaculty`, `updateSubject`, `updateClassroom`, `updateCourseSubject`.

- [ ] **Step 1: Write the failing test for query and update services**

Create `backend/tests/master-data-services.test.ts` using in-memory PGlite executor:
- Test pagination bounds, total calculation, and stable ordering tie-breaker (`id ASC`).
- Test allowlisted `sortBy` in both `asc` and `desc` orders.
- Test `isActive` filter (`'true'`, `'false'`, `'all'`).
- Test detail retrieval by ID throws `NotFoundError` if absent.
- Test entity update methods verify existence (404), merge incoming fields, check unique collisions (409), validate bounds (400), set `updated_at`, and return the updated entity.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/master-data-services.test.ts`
Expected: FAIL with "Cannot find module '../src/services/master-data-query.service.js'"

- [ ] **Step 3: Implement `backend/src/services/master-data-query.service.ts` and `backend/src/services/master-data-update.service.ts`**

1. `backend/src/services/master-data-query.service.ts`:
   - Generic query executor executing `COUNT(*)` for total and data query with `limit`, `offset`, `orderBy([primaryOrder, asc(table.id)])`.
   - Filters applied conditionally based on validated query parameters.
   - Detail methods (`get*ById`) using `where(eq(table.id, id))`, throwing `NotFoundError` if missing.
2. `backend/src/services/master-data-update.service.ts`:
   - Check entity exists with `NotFoundError`.
   - Merge patch fields with existing record.
   - Validate merged state against business rules and unique constraints:
     - `updateDepartment`: checks `name` and uppercase `code` not taken by another department (`and(eq(col, val), ne(table.id, id))`).
     - `updateCourse`: checks `(department_id, code)` collision; validates `totalSemesters` between 1 and 12 and not lower than existing active semesters.
     - `updateSemester`: checks `(course_id, academic_year, semester_number)` collision; validates `semesterNumber <= course.total_semesters`.
     - `updateSection`: checks `(semester_id, name)` and `class_code` collision.
     - `updateFaculty`: checks `employee_code` collision and case-insensitive `email` collision.
     - `updateSubject`: checks `(department_id, code)` collision.
     - `updateClassroom`: checks `(building_block, room_number)` collision.
     - `updateCourseSubject`: checks `semesterNumber <= course.total_semesters` and `(course_id, subject_id, semester_number)` collision.
   - Update timestamp `updated_at: sql`NOW()``.
   - Return updated entity.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/master-data-services.test.ts`
Expected: PASS with 0 exit code.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/src/services/master-data-query.service.ts backend/src/services/master-data-update.service.ts backend/tests/master-data-services.test.ts
git commit -m "feat(services): implement master data query and update services"
```

---

### Task 3: Admin Controller & Express Route Infrastructure

**Files:**
- Create: `backend/src/controllers/admin-master-data.controller.ts`
- Create: `backend/src/routes/admin/master-data.routes.ts`
- Modify: `backend/src/app.ts:19-25`
- Test: `backend/tests/admin-routes-structure.test.ts`

**Interfaces:**
- Consumes:
  - `authenticate`, `requireRole('ADMIN')`, `csrfGuard`
  - `validateBody`, `validateQuery`, `validateParams`
  - Validation schemas from Task 1
  - Existing creation, deactivation, and activation services: `academic.service.ts`, `curriculum.service.ts`
  - Query and update services: `master-data-query.service.ts`, `master-data-update.service.ts`
- Produces:
  - `createAdminMasterDataRouter(customDb?)` mounted at `/api/v1/admin` in `app.ts`.

- [ ] **Step 1: Write the failing test for admin route structure & security binding**

Create `backend/tests/admin-routes-structure.test.ts`:
- Verify all `/api/v1/admin/*` routes reject requests lacking session cookie with HTTP 401.
- Verify all `/api/v1/admin/*` routes reject HOD and FACULTY sessions with HTTP 403.
- Verify state-changing routes (POST, PATCH, DELETE) reject missing or invalid CSRF tokens with HTTP 403.
- Verify safe GET routes pass without CSRF tokens.
- Verify DELETE endpoints execute soft-deactivation (setting `is_active = false`).
- Verify no redundant `/deactivate` routes exist (return 404).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/admin-routes-structure.test.ts`
Expected: FAIL (routes not registered or 404).

- [ ] **Step 3: Implement controller, router, and wire into `createApp()`**

1. `backend/src/controllers/admin-master-data.controller.ts`:
   - Factory function accepting `DatabaseExecutor`.
   - Handlers for all 8 entities:
     - `list`: calls query service, returns `{ data: result.data, pagination: result.pagination }`.
     - `getById`: calls query service, returns `{ data: result }`.
     - `create`: calls existing `create*` from `academic.service.ts` or `addSubjectToCurriculum` from `curriculum.service.ts`, returns 201 `{ data: result }`.
     - `update`: calls `update*` from `master-data-update.service.ts`, returns 200 `{ data: result }`.
     - `softDeactivate`: calls existing `deactivate*` from `academic.service.ts` or `deactivateCourseSubject` from `curriculum.service.ts`, returns 200 `{ data: result }`.
     - `activate`: calls existing `activate*` from `academic.service.ts` or `activateCourseSubject` from `curriculum.service.ts`, returns 200 `{ data: result }`.
   - Comprehensive error catcher translating `ValidationError` -> 400, `NotFoundError` -> 404, `ConflictError` -> 409.
2. `backend/src/routes/admin/master-data.routes.ts`:
   - Export `createAdminMasterDataRouter(customDb?)`.
   - Router-level middleware: `authMiddleware`, `requireRole('ADMIN')`.
   - Apply `csrfGuard` to mutating methods (POST, PATCH, DELETE).
   - Wire each route with `validateParams(idParamSchema)`, `validateBody(schema)`, `validateQuery(schema)`.
   - Route registration:
     - `/departments`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/courses`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/semesters`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/sections`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/faculty`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/subjects`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/classrooms`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
     - `/course-subjects`: `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate`
3. `backend/src/app.ts`:
   - Mount `app.use('/api/v1/admin', createAdminMasterDataRouter())`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/admin-routes-structure.test.ts`
Expected: PASS with 0 exit code.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/src/controllers/admin-master-data.controller.ts backend/src/routes/admin/master-data.routes.ts backend/src/app.ts backend/tests/admin-routes-structure.test.ts
git commit -m "feat(api): implement admin master data controller and route tree"
```

---

### Task 4: Comprehensive Automated Test Suite for Master Data CRUD & Security

**Files:**
- Create: `backend/tests/admin-master-data.test.ts`
- Modify: `backend/package.json:12-24` (add `"test:admin-api"`)

**Interfaces:**
- Consumes: Complete API application (`createApp` / `createAdminMasterDataRouter`), in-memory PGlite instance, auth utilities.
- Produces: End-to-end integration test suite verifying security, validation, CRUD lifecycle, and relational constraints.

- [ ] **Step 1: Implement comprehensive integration test scenarios in `backend/tests/admin-master-data.test.ts`**

Include the following test suites:
1. **Security & RBAC Protection:**
   - Missing session cookie on any admin route -> 401 Unauthorized.
   - Expired or revoked session -> 401 Unauthorized.
   - Authenticated HOD session -> 403 Forbidden.
   - Authenticated FACULTY session -> 403 Forbidden.
   - Authenticated ADMIN session -> 200/201.
   - POST, PATCH, DELETE without `X-CSRF-Token` -> 403 Forbidden.
   - POST, PATCH, DELETE with mismatched `X-CSRF-Token` -> 403 Forbidden.
   - Safe GET requests without `X-CSRF-Token` -> 200 OK.
2. **Validation & Pagination Guarantees:**
   - Non-UUID `:id` path param -> 400 Bad Request with details.
   - Malformed body payloads -> 400 Bad Request with details.
   - Clamped/bounded limit (`limit=500` clamped or rejected, `limit=-1` rejected).
   - Disallowed `sortBy` field -> 400 Bad Request.
   - Total count matches and pagination metadata accurately reflects query.
3. **Full CRUD Lifecycle & Soft-Deactivation for All 8 Entities:**
   - **Departments:** Create (201), List (200), Detail (200), Update (200), Soft-deactivate via `DELETE /:id` (200, `is_active: false`), Activate via `POST /:id/activate` (200, `is_active: true`).
   - **Courses:** Create under active department (201), List (200), Detail (200), Update (200), Soft-deactivate (200), Activate (200).
   - **Semesters:** Create under active course (201), List (200), Detail (200), Update (200), Soft-deactivate (200), Activate (200).
   - **Sections:** Create under active semester (201), List (200), Detail (200), Update (200), Soft-deactivate (200), Activate (200).
   - **Faculty:** Create under active department (201), List (200), Detail (200), Update (200), Soft-deactivate (200, also deactivates linked user account and revokes active session), Activate (200).
   - **Subjects:** Create under active department (201), List (200), Detail (200), Update (200), Soft-deactivate (200), Activate (200).
   - **Classrooms:** Create (201), List (200), Detail (200), Update (200), Soft-deactivate (200), Activate (200).
   - **Course-Subjects:** Create mapping (201), List (200), Detail (200), Update semester (200), Soft-deactivate (200), Activate (200).
4. **Relational Constraints & Business Rules:**
   - Duplicate department name or code -> 409 Conflict.
   - Duplicate course code within same department -> 409 Conflict.
   - Duplicate semester `(course_id, academic_year, semester_number)` -> 409 Conflict.
   - Duplicate section name in same semester or duplicate class_code -> 409 Conflict.
   - Duplicate faculty employee_code or email (case-insensitive) -> 409 Conflict.
   - Duplicate classroom `(building_block, room_number)` -> 409 Conflict.
   - Create child entity under inactive parent -> 400 Bad Request.
   - Activate child entity whose parent is inactive -> 400 Bad Request.
   - Semester number exceeding course total semesters -> 400 Bad Request.
   - Cross-department course-subject mapping -> 400 Bad Request.
   - Database record count verification: verify `DELETE /:id` never decreases table row count (soft-deactivation proof).

- [ ] **Step 2: Add `"test:admin-api": "tsx tests/admin-master-data.test.ts"` to `backend/package.json`**

Update `backend/package.json` scripts section.

- [ ] **Step 3: Run the new test suite**

Run: `npm run test:admin-api` (from `backend/` directory)
Expected: All tests pass with 0 exit code.

- [ ] **Step 4: Commit Task 4**

```bash
git add backend/tests/admin-master-data.test.ts backend/package.json
git commit -m "test(api): add comprehensive admin master data api test suite"
```

---

### Task 5: Full Verification, Regression Testing & Git Milestone Check

**Files:**
- None modified; comprehensive execution and verification across all suites.

**Interfaces:**
- Consumes: All test suites in `backend/package.json`, TypeScript compiler `tsc`, frontend build.
- Produces: Verified clean working tree, verification logs, ready for user review.

- [ ] **Step 1: Run all backend unit and integration test suites**

Run in sequence:
- `npm run test:auth-utils`
- `npm run test:auth-setup`
- `npm run test:auth-service`
- `npm run test:auth-middleware`
- `npm run test:schema`
- `npm run test:adapter`
- `npm run test:services`
- `npm run test:admin-api`

Expected: 100% pass across all test suites with 0 failures.

- [ ] **Step 2: Run TypeScript checks and production builds**

Backend:
- `npm run check:types`
- `npm run build`

Frontend:
- `npm run check:types` (from root / frontend)
- `npm run build` (from frontend)

Expected: Zero TypeScript errors, clean production builds.

- [ ] **Step 3: Security & Architecture Audit**

Verify:
- All `/api/v1/admin/*` endpoints strictly guarded by `authenticate` and `requireRole('ADMIN')`.
- HOD and FACULTY receive 403 Forbidden on all Admin endpoints.
- Synchronizer Token CSRF token strictly required on state-changing endpoints (POST, PATCH, DELETE).
- Safe GET requests pass without CSRF token.
- No JWT or unapproved dependencies added.
- No soft-deactivation bypass; `DELETE /:id` performs soft deactivation and no raw hard deletes exist.
- `AGENTS.md` and `GEMINI.md` remain untracked and unmodified.

- [ ] **Step 4: Milestone Commit & Push**

```bash
git add backend/
git commit -m "feat(api): implement admin master data crud api"
git push origin main
```
