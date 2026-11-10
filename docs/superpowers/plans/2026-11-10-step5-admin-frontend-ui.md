# Step 5: Admin Frontend UI Implementation Plan (Refined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional, accessible, and responsive Admin frontend interface in React and TypeScript for college master data management (Departments, Courses, Semesters, Sections, Faculty, Subjects, Classrooms, Curriculum Mappings) with strict session-based authentication, Synchronizer Token CSRF integration, bounded pagination, form validation, and soft-deactivation workflows.

**Architecture:** Single Page Application (SPA) powered by React 18, Vite 6, and TypeScript with zero new runtime dependencies. Authentication state and Synchronizer CSRF token are managed in an in-memory `AuthContext` backed by `GET /api/v1/auth/me` on bootstrap (session token in HttpOnly `token` cookie; raw tokens are never touched by client JavaScript or stored in `localStorage`). A lightweight, dependency-free hash router (`#/login`, `#/dashboard`, `#/departments`, etc.) provides bookmarkable URLs and browser navigation without server-side catch-all routing dependencies. API client wrapper transparently attaches `credentials: 'include'` and `X-CSRF-Token` to state-changing requests, handling 401 unauthenticated transitions and 400/409 validation error rendering.

**Tech Stack:** React 18, TypeScript 5, Vite 6, `lucide-react` (icons), Pure CSS with semantic system variables (no CSS bloat, no Tailwind, no decorative AI gradients).

**Spec:** Step 5 user specification, `AGENTS.md`, and `GEMINI.md`.

---

## 1. Existing Frontend Architecture Assessment

- **Current State:**
  - Standard React 18 + Vite template created in Step 1.
  - Dependencies: `react`, `react-dom`, `lucide-react` (icons).
  - Dev dependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`.
  - Single `App.tsx` file displaying Phase 1 connectivity check (`/api/v1/health`).
  - Base design system in `index.css` defining semantic CSS variables (`--color-primary`, `--color-border`, `--color-surface`, `--color-bg`, `--color-danger-*`, `--color-success-*`), typography, and basic card layouts.
  - Reverse proxy configured in `vite.config.ts`: `/api` forwards to `http://localhost:5000`.
- **Architectural Fit:**
  - Modern, fast, and lightweight.
  - No bloated UI libraries, component frameworks, or unnecessary state management dependencies.
  - Existing `lucide-react` provides icons for navigation, actions (edit, deactivate, activate, search, filter), and status pills.

---

## 2. Authentication & API Integration Approach

### 2.1 Verified Session Cookie Name & Security Lifecycle
- **Cookie Name:** The session cookie is strictly named **`token`** (as defined in `backend/src/auth/cookie.ts`: `SESSION_COOKIE_NAME = 'token'`).
- **Cookie Transport:** The `token` cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` (in production). Client JavaScript cannot read or modify it. Every `fetch` request passes `credentials: 'include'` so the browser automatically handles cookie transmission.
- **Synchronizer Token Pattern (CSRF):**
  - Upon successful `POST /api/v1/auth/login`, the response returns `{ user, csrfToken }`.
  - The `csrfToken` is stored strictly in React memory (`AuthContext`), **never** in `localStorage`, `sessionStorage`, or client-accessible cookies.
  - The API client wrapper automatically attaches `X-CSRF-Token` to all mutating requests (`POST`, `PATCH`, `DELETE`). Safe `GET` requests omit this header.

### 2.2 CSRF Token Restoration on Browser Refresh (Backend Change Requiring Approval)
- **The Problem:** When an administrator refreshes the browser, in-memory React state is reset. While the browser retains the `HttpOnly` session cookie `token`, `GET /api/v1/auth/me` currently returns only `{ user: { id, username, role, faculty_id } }`, omitting the session's `csrf_secret`. This would leave the frontend unable to perform subsequent mutating actions (POST/PATCH/DELETE) without re-logging in.
- **Recommended Minimal Solution (Requires Approval):**
  - In `backend/src/auth/auth.routes.ts`, `authenticate` middleware already loads `session.csrf_secret` into `res.locals.user.csrf_secret`.
  - Extend `GET /api/v1/auth/me` to include `csrfToken: user.csrf_secret` alongside `user`, with header `Cache-Control: no-store, no-cache, must-revalidate, private`.
  - *Security & Usability Guarantee:* The token is returned strictly to the authenticated session over HTTPS/same-origin, never cached by proxies, and immediately re-hydrates the in-memory `AuthContext` on page reload without requiring the administrator to log in again.
- **Route Guarding:**
  - On app load, `AuthContext` calls `GET /api/v1/auth/me`.
  - If 200 OK: session is restored, `user` and `csrfToken` are populated in memory.
  - If 401 Unauthorized: user state is cleared; router redirects to `#/login`.
  - If role is not `ADMIN` (e.g. `HOD`, `FACULTY`), access is blocked with a 403 Forbidden screen.
- **Logout:**
  - Invokes `POST /api/v1/auth/logout` with `X-CSRF-Token`, clears server session and cookie, clears memory state, and redirects to `#/login`.

### 2.3 Reusable API Client (`src/api/client.ts`)
- Helper functions: `apiClient.get(endpoint, queryParams)`, `apiClient.post(endpoint, body)`, `apiClient.patch(endpoint, body)`, `apiClient.delete(endpoint)`.
- Query serializer: converts `{ limit: 20, offset: 0, isActive: 'true', departmentId: '...' }` to standard URL query string.
- Error parser: extracts `{ error, details }` from 400/404/409 responses and exposes a typed `ApiError`.

---

## 3. Search and Filter Support Matrix (Verified Against Step 4 Code)

The backend query schemas (`master-data.schema.ts`) and query services (`master-data-query.service.ts`) implement specific, validated filter parameters. Server-side free-text `search` is **not** implemented in the backend.

| Entity | Bounded Pagination (`limit`, `offset`) | `isActive` Filter (`true` \| `false` \| `all`) | Relational / Attribute Filters | Allowlisted Sort Fields (`sortBy`) | Server-Side Text Search (`search`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Departments** | Yes (`limit` 1-100, `offset` $\ge 0$) | Yes | None | `name`, `code`, `created_at` | **Not supported** |
| **Courses** | Yes | Yes | `departmentId` | `name`, `code`, `total_semesters`, `created_at` | **Not supported** |
| **Semesters** | Yes | Yes | `courseId`, `academicYear`, `term` | `semester_number`, `academic_year`, `created_at` | **Not supported** |
| **Sections** | Yes | Yes | `semesterId` | `name`, `class_code`, `created_at` | **Not supported** |
| **Faculty** | Yes | Yes | `departmentId` | `name`, `employee_code`, `email`, `created_at` | **Not supported** |
| **Subjects** | Yes | Yes | `departmentId`, `type` | `name`, `code`, `type`, `created_at` | **Not supported** |
| **Classrooms** | Yes | Yes | `buildingBlock`, `type` | `building_block`, `room_number`, `type`, `created_at` | **Not supported** |
| **Curriculum** | Yes | Yes | `courseId`, `subjectId`, `departmentId`, `semesterNumber` | `semester_number`, `created_at` | **Not supported** |

### UI Design Decision Based on Matrix:
- The UI will **not** send an unsupported `search` query parameter to the backend.
- The `FilterBar` component will provide:
  1. `isActive` status selector (`All`, `Active`, `Inactive`).
  2. Entity-specific filter dropdowns (e.g. Department dropdown for Courses, Faculty, Subjects; Course dropdown for Semesters; Semester dropdown for Sections; Type dropdown for Subjects and Classrooms).
  3. Sort field and order controls (`sortBy`, `sortOrder`).
  4. Quick client-side filter input that filters the currently loaded page rows in memory without triggering invalid API calls.

---

## 4. Verified API Contracts & Response Shapes

Every endpoint in `admin-master-data.controller.ts` follows a uniform envelope pattern:

### 4.1 Collection List (`GET /api/v1/admin/<entities>`)
```json
{
  "data": [ /* Array of entity objects */ ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

### 4.2 Detail (`GET /api/v1/admin/<entities>/:id`)
Returns HTTP 200 with entity data:
```json
{
  "data": { /* Complete entity object */ }
}
```

### 4.3 Create (`POST /api/v1/admin/<entities>`)
Returns HTTP 201 Created with created record:
```json
{
  "data": { /* Complete created entity object */ }
}
```

### 4.4 Update (`PATCH /api/v1/admin/<entities>/:id`)
Returns HTTP 200 OK with updated record:
```json
{
  "data": { /* Complete updated entity object */ }
}
```

### 4.5 Soft-Deactivate (`DELETE /api/v1/admin/<entities>/:id`)
Returns HTTP 200 OK with deactivated record (`is_active: false`):
```json
{
  "data": { /* Entity with is_active: false */ }
}
```
*(Verified: returns 200 with data, not empty 204).*

### 4.6 Reactivate (`POST /api/v1/admin/<entities>/:id/activate`)
Returns HTTP 200 OK with reactivated record (`is_active: true`):
```json
{
  "data": { /* Entity with is_active: true */ }
}
```
*(Verified: returns 200 with data, not empty 204).*

### 4.7 Standard Error Format (HTTP 400, 401, 403, 404, 409)
```json
{
  "error": "Descriptive message",
  "details": [
    { "path": "totalSemesters", "message": "Total semesters must be between 1 and 12" }
  ]
}
```

---

## 5. Navigation & Route Structure

### 5.1 Routing Strategy
- Native Hash Router (`window.location.hash`, e.g. `#/departments`, `#/courses`).
- Zero external dependencies. Eliminates Vite dev-server 404 rewrite issues. Supports bookmarking and browser history.

### 5.2 Route Map
| Hash Route | View Component | Protected? | Purpose |
| :--- | :--- | :--- | :--- |
| `#/login` | `LoginView` | Public | Admin login form |
| `#/dashboard` | `DashboardHomeView` | Admin | Institutional launchpad & navigation tiles |
| `#/departments` | `DepartmentsView` | Admin | Department master data CRUD |
| `#/courses` | `CoursesView` | Admin | Course master data CRUD |
| `#/semesters` | `SemestersView` | Admin | Semester master data CRUD |
| `#/sections` | `SectionsView` | Admin | Section master data CRUD |
| `#/faculty` | `FacultyView` | Admin | Faculty master data CRUD |
| `#/subjects` | `SubjectsView` | Admin | Subject master data CRUD |
| `#/classrooms` | `ClassroomsView` | Admin | Classroom master data CRUD |
| `#/curriculum` | `CurriculumView` | Admin | Course-Subject curriculum mapping CRUD |

---

## 6. Page and Component Structure

```
frontend/src/
├── api/
│   ├── client.ts              # Fetch wrapper with credentials & CSRF injection
│   └── types.ts               # Exact TypeScript interfaces matching API responses
├── context/
│   └── AuthContext.tsx        # In-memory auth & CSRF token state
├── components/
│   ├── layout/
│   │   ├── AdminLayout.tsx    # Responsive shell with sidebar, header, main area
│   │   ├── Sidebar.tsx        # Navigation menu with Lucide icons
│   │   └── Header.tsx         # Institution branding, user role, logout button
│   ├── common/
│   │   ├── DataTable.tsx      # Table with loading, empty, and active pill states
│   │   ├── Pagination.tsx     # Bounded pagination (1-100), offset calculator
│   │   ├── FilterBar.tsx      # Status toggle, entity filter dropdowns, Add button
│   │   ├── Modal.tsx          # Accessible modal dialog with backdrop
│   │   ├── ConfirmDialog.tsx  # Confirmation modal for soft-deactivation
│   │   └── FormField.tsx      # Label, input control, and field error display
│   └── views/
│       ├── LoginView.tsx
│       ├── DashboardHomeView.tsx
│       ├── DepartmentsView.tsx
│       ├── CoursesView.tsx
│       ├── SemestersView.tsx
│       ├── SectionsView.tsx
│       ├── FacultyView.tsx
│       ├── SubjectsView.tsx
│       ├── ClassroomsView.tsx
│       └── CurriculumView.tsx
├── router/
│   └── Router.tsx             # Hash router & route guard
├── index.css                  # Design system styling (clean, responsive, no gradients)
├── App.tsx                    # Root component with AuthProvider and Router
└── main.tsx                   # React root entry
```

---

## 7. Review of Dashboard Shell (`#/dashboard`)

- **Confirmed Requirement:** Do not use `/health` as a source of dashboard statistics.
- **Design:** Keep the dashboard as a clean, institutional navigation launchpad:
  1. Welcome banner displaying the logged-in Administrator username and role badge.
  2. Quick navigation grid linking to each of the 8 master data modules with descriptive subtitles (e.g. "Departments: Academic divisions and codes", "Courses: Degree programs and duration", "Faculty: Academic staff directory", etc.).
  3. Action shortcuts: "Add Department", "Add Course", "Add Faculty".
  4. No fake statistics, fake charts, fake attendance metrics, or decorative cards.

---

## 8. Form Fields Based on Actual Backend Schemas

| Entity | Fields & Types | Input Controls | Backend Constraints Enforced |
| :--- | :--- | :--- | :--- |
| **Department** | `name` (string)<br>`code` (string) | Text input<br>Text input | 1–150 chars<br>1–20 chars (auto-uppercase, unique) |
| **Course** | `departmentId` (UUID)<br>`name` (string)<br>`code` (string)<br>`totalSemesters` (number) | Department Select<br>Text input<br>Text input<br>Number input | Active department (immutable on PATCH)<br>1–150 chars<br>1–20 chars (uppercase)<br>Integer 1–12 |
| **Semester** | `courseId` (UUID)<br>`semesterNumber` (number)<br>`academicYear` (string)<br>`term` (string) | Course Select<br>Number input<br>Text input<br>Radio / Select | Active course (immutable on PATCH)<br>1–course.total_semesters<br>Format `YYYY-YYYY` (e.g. `2026-2027`)<br>`ODD` or `EVEN` |
| **Section** | `semesterId` (UUID)<br>`name` (string)<br>`classCode` (string) | Semester Select<br>Text input<br>Text input | Active semester (immutable on PATCH)<br>1–10 chars (e.g. `A`)<br>1–30 chars (globally unique) |
| **Faculty** | `departmentId` (UUID)<br>`employeeCode` (string)<br>`name` (string)<br>`email` (string)<br>`phone` (optional string) | Department Select<br>Text input<br>Text input<br>Email input<br>Tel input | Active department (immutable on PATCH)<br>1–30 chars (uppercase, unique)<br>1–150 chars<br>Email max 255 chars (unique)<br>Max 25 chars |
| **Subject** | `departmentId` (UUID)<br>`code` (string)<br>`name` (string)<br>`type` (string) | Department Select<br>Text input<br>Text input<br>Select dropdown | Active department (immutable on PATCH)<br>1–20 chars (uppercase)<br>1–150 chars<br>`THEORY`, `LAB`, or `TUTORIAL` |
| **Classroom** | `buildingBlock` (string)<br>`roomNumber` (string)<br>`type` (string) | Text input<br>Text input<br>Select dropdown | 1–50 chars<br>1–30 chars<br>`LECTURE_HALL`, `LAB`, or `SEMINAR_ROOM` |
| **Curriculum** | `departmentId` (UUID)<br>`courseId` (UUID)<br>`subjectId` (UUID)<br>`semesterNumber` (number) | Department Select<br>Course Select<br>Subject Select<br>Number input | Department Select filters Course & Subject lists to guarantee cross-department consistency.<br>1–course.total_semesters |

---

## 9. Loading, Validation & Error-Handling Strategy

1. **Client-Side Pre-validation:** Inline checks for required fields, string lengths, regex patterns, and range bounds.
2. **Server Error Mapping:**
   - **400 Bad Request:** Displays field error details returned by Zod (`details: [{ path, message }]`).
   - **409 Conflict:** Displays inline conflict notice (duplicate department code, duplicate class code, duplicate email).
   - **401 Unauthorized:** Clears in-memory auth state and redirects to `#/login`.
   - **403 Forbidden:** Renders authorization notice.
   - **404 Not Found:** Renders record not found notice.
3. **Loading & Empty States:** Spinner during data fetch; disabled submit button with spinner during save; clean institutional empty states when 0 records match filters.
4. **Action Confirmation Dialogs:**
   - Soft-deactivation explains that historical records are preserved and the entity will be marked `is_active = false`.
   - Faculty deactivation specifically warns that linked user accounts will be deactivated and active sessions revoked.

---

## 10. Responsive Design Approach

- **Desktop ($\ge 1024\text{px}$):** Permanent navigation sidebar, tabular data with action buttons, top institutional header.
- **Tablet ($768\text{px} - 1023\text{px}$):** Compact sidebar, scrollable tables with sticky headers.
- **Mobile ($< 768\text{px}$):** Hamburger menu toggle, stacked filter/search inputs, horizontal scrolling for tables.
- **Visual Style (Rule 4 Enforced):** Deep Navy (`#1e3a8a`), slate neutral (`#0f172a`), emerald green for active (`#ecfdf5`), crimson for inactive (`#fef2f2`). No purple gradients, no pill-shaped buttons, no emojis, no fake statistics.

---

## 11. Testing Strategy

1. **Frontend Integration Tests (`frontend/tests/frontend-integration.test.ts`):**
   - Authentication flow: login submission, cookie inclusion flag, in-memory CSRF retention, logout cleanup.
   - Route guard: unauthenticated access blocks admin views; non-admin roles receive 403.
   - API client: automatic `X-CSRF-Token` injection on POST/PATCH/DELETE; safe GET omission; error translation for 400 and 409.
   - Form validation: client validation and server Zod error rendering.
   - Pagination & sorting: bounded limits, offset increments, allowlisted sort keys.
2. **Regression & Build Verification:**
   - All 11 backend test suites must pass 100%.
   - TypeScript checks: `npm --prefix backend run check:types` and `npm --prefix frontend run check:types`.
   - Production builds: `npm --prefix backend run build` and `npm --prefix frontend run build`.

---

## 12. Exact Files Affected

### Frontend New Files:
- `frontend/src/api/types.ts`
- `frontend/src/api/client.ts`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/router/Router.tsx`
- `frontend/src/components/layout/AdminLayout.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/common/DataTable.tsx`
- `frontend/src/components/common/Pagination.tsx`
- `frontend/src/components/common/FilterBar.tsx`
- `frontend/src/components/common/Modal.tsx`
- `frontend/src/components/common/ConfirmDialog.tsx`
- `frontend/src/components/common/FormField.tsx`
- `frontend/src/components/views/LoginView.tsx`
- `frontend/src/components/views/DashboardHomeView.tsx`
- `frontend/src/components/views/DepartmentsView.tsx`
- `frontend/src/components/views/CoursesView.tsx`
- `frontend/src/components/views/SemestersView.tsx`
- `frontend/src/components/views/SectionsView.tsx`
- `frontend/src/components/views/FacultyView.tsx`
- `frontend/src/components/views/SubjectsView.tsx`
- `frontend/src/components/views/ClassroomsView.tsx`
- `frontend/src/components/views/CurriculumView.tsx`
- `frontend/tests/frontend-integration.test.ts`

### Frontend Modified Files:
- `frontend/src/App.tsx`
- `frontend/src/index.css`

### Backend Change Requiring Explicit Approval:
- `backend/src/auth/auth.routes.ts` — In `router.get('/me')`, include `csrfToken: user.csrf_secret` alongside `user` and add header `Cache-Control: no-store, no-cache, must-revalidate, private`.
- `backend/tests/auth-middleware.test.ts` — Update `/me` assertion to verify `csrfToken` presence.

---

## 13. Task Breakdown

- **Task 1: API Client, Type Definitions & Auth Context** (Includes approved `/me` CSRF restoration).
- **Task 2: Hash Router, Navigation Shell & Login View**.
- **Task 3: Common UI Components & Design System Extensions**.
- **Task 4: Department & Course Management Views**.
- **Task 5: Semester & Section Management Views**.
- **Task 6: Faculty & Subject Management Views**.
- **Task 7: Classroom & Course-Subject Curriculum Mapping Views**.
- **Task 8: Comprehensive Frontend Testing, Builds & Verification Checkpoint**.

---

## 14. Acceptance Criteria

1. Session cookie strictly recognized as `token`.
2. Browser refresh re-hydrates `csrfToken` via `GET /me` (if approved) without requiring re-login.
3. Unauthenticated users cannot access admin views and are redirected to `#/login`.
4. Valid Admin credentials grant access; non-Admin credentials display a 403 Forbidden screen.
5. All 8 master data entities support complete CRUD: list, filter (`isActive`, foreign keys), bounded pagination, create, partial PATCH update, soft-deactivate, and reactivate.
6. Soft-deactivation marks records `is_active = false` without decreasing physical row count.
7. Deactivating faculty displays a clear warning regarding linked user account deactivation and session revocation.
8. Responsive on mobile (360px), tablet (768px), and desktop (1280px).
9. Zero new runtime dependencies.
10. Clean TypeScript (0 errors) and successful production builds on both frontend and backend.
11. `AGENTS.md` and `GEMINI.md` remain untracked and unmodified.

---

*This refined plan addresses all 5 review points and is presented for human review and explicit approval of the minimal `/me` backend update before implementation.*
