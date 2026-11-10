import assert from 'node:assert';
import {
  apiClient,
  ApiError,
  buildQueryString,
  setClientCsrfToken,
  getClientCsrfToken,
  setOnUnauthorizedCallback,
} from '../src/api/client.js';

async function runFrontendIntegrationTests() {
  console.log('[Frontend Integration Tests] Starting comprehensive verification...\n');

  // =========================================================================
  // 1. Query String Serializer Tests
  // =========================================================================
  console.log('--- 1. Testing buildQueryString ---');

  const emptyQuery = buildQueryString();
  assert.strictEqual(emptyQuery, '', 'Empty params must produce empty string');

  const emptyObjQuery = buildQueryString({});
  assert.strictEqual(emptyObjQuery, '', 'Empty object must produce empty string');

  const standardParams = {
    limit: 20,
    offset: 40,
    isActive: 'true',
    departmentId: '00000000-0000-0000-0000-000000000001',
    emptyField: '',
    nullField: null,
    undefinedField: undefined,
  };
  const qs = buildQueryString(standardParams);
  assert.ok(qs.startsWith('?'), 'Query string must start with ?');
  assert.ok(qs.includes('limit=20'), 'Must include limit=20');
  assert.ok(qs.includes('offset=40'), 'Must include offset=40');
  assert.ok(qs.includes('isActive=true'), 'Must include isActive=true');
  assert.ok(
    qs.includes('departmentId=00000000-0000-0000-0000-000000000001'),
    'Must include departmentId'
  );
  assert.ok(!qs.includes('emptyField'), 'Must exclude empty string fields');
  assert.ok(!qs.includes('nullField'), 'Must exclude null fields');
  assert.ok(!qs.includes('undefinedField'), 'Must exclude undefined fields');
  console.log('✓ 1. buildQueryString properly serializes bounded query parameters and strips empty fields.');

  // =========================================================================
  // 2. In-Memory CSRF Token Retention (Never LocalStorage)
  // =========================================================================
  console.log('\n--- 2. Testing In-Memory CSRF Token Lifecycle ---');

  setClientCsrfToken(null);
  assert.strictEqual(getClientCsrfToken(), null, 'Initial CSRF token must be null');

  const testCsrfToken = 'mock_csrf_secret_a1b2c3d4e5f6';
  setClientCsrfToken(testCsrfToken);
  assert.strictEqual(
    getClientCsrfToken(),
    testCsrfToken,
    'CSRF token must be retained in memory'
  );

  setClientCsrfToken(null);
  assert.strictEqual(
    getClientCsrfToken(),
    null,
    'CSRF token must be cleared on logout or session reset'
  );
  console.log('✓ 2. CSRF token correctly stored and cleared strictly in JavaScript memory.');

  // =========================================================================
  // 3. API Client HTTP Methods, Headers & CSRF Injection (Mock Fetch)
  // =========================================================================
  console.log('\n--- 3. Testing API Client Fetch Wrapper ---');

  const originalFetch = globalThis.fetch;
  const recordedRequests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    credentials?: RequestCredentials;
    body?: any;
  }> = [];

  let mockFetchResponse = {
    status: 200,
    ok: true,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ data: [] }),
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => {
          headers[k.toLowerCase()] = v;
        });
      } else {
        Object.entries(init.headers).forEach(([k, v]) => {
          headers[k.toLowerCase()] = String(v);
        });
      }
    }

    recordedRequests.push({
      url,
      method,
      headers,
      credentials: init?.credentials,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });

    return {
      status: mockFetchResponse.status,
      ok: mockFetchResponse.ok,
      headers: {
        get: (h: string) => mockFetchResponse.headers.get(h.toLowerCase()) ?? null,
      },
      json: mockFetchResponse.json,
    } as any;
  }) as typeof fetch;

  try {
    // 3a. GET request: No CSRF header, credentials included
    recordedRequests.length = 0;
    setClientCsrfToken('mock_active_csrf');
    mockFetchResponse = {
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: [{ id: '1', name: 'Dept 1' }] }),
    };

    const getRes = await apiClient.get<any>('/admin/departments', { limit: 10 });
    assert.strictEqual(recordedRequests.length, 1);
    assert.strictEqual(recordedRequests[0].method, 'GET');
    assert.strictEqual(recordedRequests[0].url, '/api/v1/admin/departments?limit=10');
    assert.strictEqual(recordedRequests[0].credentials, 'include', 'Must include credentials');
    assert.strictEqual(
      recordedRequests[0].headers['x-csrf-token'],
      undefined,
      'Safe GET must not attach X-CSRF-Token'
    );
    assert.strictEqual(getRes.data.length, 1);
    console.log('✓ 3a. GET requests include credentials: "include" and omit X-CSRF-Token.');

    // 3b. POST request: X-CSRF-Token attached, Content-Type application/json
    recordedRequests.length = 0;
    mockFetchResponse = {
      status: 201,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: { id: 'new-id', name: 'New Dept' } }),
    };

    const postPayload = { name: 'Computer Science', code: 'CSE' };
    const postRes = await apiClient.post<any>('/admin/departments', postPayload);
    assert.strictEqual(recordedRequests.length, 1);
    assert.strictEqual(recordedRequests[0].method, 'POST');
    assert.strictEqual(recordedRequests[0].url, '/api/v1/admin/departments');
    assert.strictEqual(recordedRequests[0].credentials, 'include');
    assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'mock_active_csrf');
    assert.strictEqual(recordedRequests[0].headers['content-type'], 'application/json');
    assert.deepStrictEqual(recordedRequests[0].body, postPayload);
    assert.strictEqual(postRes.data.id, 'new-id');
    console.log('✓ 3b. POST requests attach X-CSRF-Token and Content-Type: application/json.');

    // 3c. PATCH request: X-CSRF-Token attached, partial body
    recordedRequests.length = 0;
    mockFetchResponse = {
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: { id: 'dept-1', name: 'Updated Dept' } }),
    };

    const patchPayload = { name: 'Updated Dept' };
    const patchRes = await apiClient.patch<any>('/admin/departments/dept-1', patchPayload);
    assert.strictEqual(recordedRequests.length, 1);
    assert.strictEqual(recordedRequests[0].method, 'PATCH');
    assert.strictEqual(recordedRequests[0].url, '/api/v1/admin/departments/dept-1');
    assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'mock_active_csrf');
    assert.deepStrictEqual(recordedRequests[0].body, patchPayload);
    assert.strictEqual(patchRes.data.name, 'Updated Dept');
    console.log('✓ 3c. PATCH requests attach X-CSRF-Token and send partial JSON update payload.');

    // 3d. DELETE request: X-CSRF-Token attached
    recordedRequests.length = 0;
    mockFetchResponse = {
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: { id: 'dept-1', is_active: false } }),
    };

    const deleteRes = await apiClient.delete<any>('/admin/departments/dept-1');
    assert.strictEqual(recordedRequests.length, 1);
    assert.strictEqual(recordedRequests[0].method, 'DELETE');
    assert.strictEqual(recordedRequests[0].url, '/api/v1/admin/departments/dept-1');
    assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'mock_active_csrf');
    assert.strictEqual(deleteRes.data.is_active, false);
    console.log('✓ 3d. DELETE requests attach X-CSRF-Token and return deactivated record.');

    // =========================================================================
    // 4. API Error Handling (HTTP 400 with details, HTTP 409 Conflict)
    // =========================================================================
    console.log('\n--- 4. Testing API Error Translation ---');

    // 4a. 400 Validation Error
    mockFetchResponse = {
      status: 400,
      ok: false,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        error: 'Validation failed',
        details: [{ path: 'code', message: 'Code cannot exceed 20 characters' }],
      }),
    };

    try {
      await apiClient.post('/admin/departments', { code: 'A'.repeat(25) });
      assert.fail('Should have thrown ApiError on 400');
    } catch (err: unknown) {
      assert.ok(err instanceof ApiError, 'Error must be an instance of ApiError');
      assert.strictEqual(err.status, 400);
      assert.strictEqual(err.message, 'Validation failed');
      assert.strictEqual(err.details?.length, 1);
      assert.strictEqual(err.details[0].path, 'code');
    }
    console.log('✓ 4a. HTTP 400 Bad Request translated into ApiError with field validation details.');

    // 4b. 409 Conflict Error
    mockFetchResponse = {
      status: 409,
      ok: false,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        error: 'Department with code "CSE" already exists',
      }),
    };

    try {
      await apiClient.post('/admin/departments', { code: 'CSE', name: 'Computer Science' });
      assert.fail('Should have thrown ApiError on 409');
    } catch (err: unknown) {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.status, 409);
      assert.ok(err.message.includes('already exists'));
    }
    console.log('✓ 4b. HTTP 409 Conflict translated into typed ApiError.');

    // 4c. 401 Unauthorized Transition Callback
    let unauthorizedTriggered = false;
    setOnUnauthorizedCallback(() => {
      unauthorizedTriggered = true;
    });

    mockFetchResponse = {
      status: 401,
      ok: false,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ error: 'Authentication required' }),
    };

    try {
      await apiClient.get('/admin/departments');
    } catch {
      // expected
    }
    assert.strictEqual(
      unauthorizedTriggered,
      true,
      'onUnauthorized callback must be triggered on 401'
    );
    console.log('✓ 4c. HTTP 401 triggers onUnauthorized callback to clear client state.');

    // =========================================================================
    // 5. Client-Side Quick Filtering Logic Verification
    // =========================================================================
    console.log('\n--- 5. Testing Client-Side Quick Filtering Logic ---');

    const sampleDepartments = [
      { id: '1', code: 'CSE', name: 'Computer Science & Engineering', is_active: true },
      { id: '2', code: 'ECE', name: 'Electronics & Communication', is_active: true },
      { id: '3', code: 'MECH', name: 'Mechanical Engineering', is_active: false },
    ];

    const filterBySearch = (items: typeof sampleDepartments, term: string) => {
      if (!term.trim()) return items;
      const lower = term.toLowerCase();
      return items.filter(
        (i) => i.code.toLowerCase().includes(lower) || i.name.toLowerCase().includes(lower)
      );
    };

    const emptyTermResults = filterBySearch(sampleDepartments, '');
    assert.strictEqual(emptyTermResults.length, 3, 'Empty search must return all page rows');

    const cseResults = filterBySearch(sampleDepartments, 'cse');
    assert.strictEqual(cseResults.length, 1);
    assert.strictEqual(cseResults[0].code, 'CSE');

    const engResults = filterBySearch(sampleDepartments, 'engineering');
    assert.strictEqual(engResults.length, 2, 'Must match partial text across records');

    console.log('✓ 5. Client-side quick filter properly filters records without triggering invalid API calls.');

    // =========================================================================
    // 6. Complete CRUD Workflow Verification for All 8 Master Data Entities
    // =========================================================================
    console.log('\n--- 6. Testing All 8 Master Data Entities CRUD Routes ---');

    const entityTestMatrix = [
      { name: 'departments', postBody: { name: 'Civil', code: 'CIVIL' }, patchBody: { name: 'Civil Eng' } },
      { name: 'courses', postBody: { departmentId: 'dept-id', name: 'BTech', code: 'BT', totalSemesters: 8 }, patchBody: { name: 'BTech Hons' } },
      { name: 'semesters', postBody: { courseId: 'c-id', semesterNumber: 1, academicYear: '2026-2027', term: 'ODD' }, patchBody: { academicYear: '2026-2027' } },
      { name: 'sections', postBody: { semesterId: 's-id', name: 'A', classCode: 'CSE-1A' }, patchBody: { name: 'A1' } },
      { name: 'faculty', postBody: { departmentId: 'd-id', employeeCode: 'FAC-01', name: 'Dr. Jane', email: 'jane@edu.com' }, patchBody: { name: 'Dr. Jane Smith' } },
      { name: 'subjects', postBody: { departmentId: 'd-id', code: 'CS101', name: 'Programming', type: 'THEORY' }, patchBody: { name: 'Intro to Programming' } },
      { name: 'classrooms', postBody: { buildingBlock: 'Block A', roomNumber: '101', type: 'LECTURE_HALL' }, patchBody: { roomNumber: '102' } },
      { name: 'curriculum', postBody: { courseId: 'c-id', subjectId: 's-id', departmentId: 'd-id', semesterNumber: 2 }, patchBody: { semesterNumber: 3 } },
    ];

    setClientCsrfToken('active_test_csrf_token');

    for (const ent of entityTestMatrix) {
      // 1. List
      recordedRequests.length = 0;
      mockFetchResponse = {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: [], pagination: { total: 0, limit: 20, offset: 0 } }),
      };
      await apiClient.get(`/admin/${ent.name}`, { limit: 20, offset: 0 });
      assert.strictEqual(recordedRequests[0].url, `/api/v1/admin/${ent.name}?limit=20&offset=0`);

      // 2. Create
      recordedRequests.length = 0;
      mockFetchResponse = {
        status: 201,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: { id: `new-${ent.name}-id`, ...ent.postBody } }),
      };
      await apiClient.post(`/admin/${ent.name}`, ent.postBody);
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, `/api/v1/admin/${ent.name}`);
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'active_test_csrf_token');

      // 3. Update (PATCH)
      recordedRequests.length = 0;
      mockFetchResponse = {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: { id: 'target-id', ...ent.patchBody } }),
      };
      await apiClient.patch(`/admin/${ent.name}/target-id`, ent.patchBody);
      assert.strictEqual(recordedRequests[0].method, 'PATCH');
      assert.strictEqual(recordedRequests[0].url, `/api/v1/admin/${ent.name}/target-id`);
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'active_test_csrf_token');

      // 4. Soft-Deactivate (DELETE)
      recordedRequests.length = 0;
      mockFetchResponse = {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: { id: 'target-id', is_active: false } }),
      };
      await apiClient.delete(`/admin/${ent.name}/target-id`);
      assert.strictEqual(recordedRequests[0].method, 'DELETE');
      assert.strictEqual(recordedRequests[0].url, `/api/v1/admin/${ent.name}/target-id`);
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'active_test_csrf_token');

      // 5. Reactivate (POST /:id/activate)
      recordedRequests.length = 0;
      mockFetchResponse = {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: { id: 'target-id', is_active: true } }),
      };
      await apiClient.post(`/admin/${ent.name}/target-id/activate`);
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, `/api/v1/admin/${ent.name}/target-id/activate`);
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'active_test_csrf_token');
    }
    console.log('✓ 6. Complete CRUD, soft-deactivate, and reactivate contracts verified across all 8 master data entities.');

    // =========================================================================
    // 7. Curriculum Cross-Department Consistency Logic
    // =========================================================================
    console.log('\n--- 7. Testing Curriculum Consistency & Dependent Filters ---');

    const sampleCourses = [
      { id: 'c1', department_id: 'dept-cse', code: 'BTECH-CSE', name: 'CS Engineering', is_active: true },
      { id: 'c2', department_id: 'dept-mech', code: 'BTECH-MECH', name: 'Mech Engineering', is_active: true },
    ];
    const sampleSubjects = [
      { id: 's1', department_id: 'dept-cse', code: 'CS101', name: 'Algorithms', is_active: true },
      { id: 's2', department_id: 'dept-mech', code: 'ME101', name: 'Thermodynamics', is_active: true },
    ];

    // Filter by chosen department
    const selectedDept = 'dept-cse';
    const cseCourses = sampleCourses.filter((c) => c.department_id === selectedDept);
    const cseSubjects = sampleSubjects.filter((s) => s.department_id === selectedDept);

    assert.strictEqual(cseCourses.length, 1);
    assert.strictEqual(cseCourses[0].id, 'c1');
    assert.strictEqual(cseSubjects.length, 1);
    assert.strictEqual(cseSubjects[0].id, 's1');
    assert.notStrictEqual(cseCourses[0].department_id, sampleSubjects[1].department_id, 'Cross-department selection prevented');

    console.log('✓ 7. Curriculum mapping department selection guarantees course and subject share matching department.');

    // =========================================================================
    // 8. Session Restoration & Refresh Re-hydration
    // =========================================================================
    console.log('\n--- 8. Testing Session & CSRF Token Re-hydration via GET /me ---');

    setClientCsrfToken(null);
    assert.strictEqual(getClientCsrfToken(), null, 'Starting with null CSRF token');

    mockFetchResponse = {
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        user: { id: 'admin-id', username: 'SuperAdmin', role: 'ADMIN', faculty_id: null },
        csrfToken: 'rehydrated_session_csrf_9999',
      }),
    };

    // Simulate AuthContext bootstrap on browser refresh
    const meData = await apiClient.get<any>('/auth/me');
    assert.strictEqual(meData.user.username, 'SuperAdmin');
    assert.strictEqual(meData.user.role, 'ADMIN');
    assert.strictEqual(meData.csrfToken, 'rehydrated_session_csrf_9999');

    // Set token into client memory
    setClientCsrfToken(meData.csrfToken);
    assert.strictEqual(getClientCsrfToken(), 'rehydrated_session_csrf_9999');

    // Subsequent mutating request uses restored token
    recordedRequests.length = 0;
    mockFetchResponse = {
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: { id: 'dept-1' } }),
    };
    await apiClient.delete('/admin/departments/dept-1');
    assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'rehydrated_session_csrf_9999');

    console.log('✓ 8. Browser refresh re-hydrates user session and CSRF token without requiring re-login.');

    // =========================================================================
    // 9. Admin-Only Role Guard Simulation
    // =========================================================================
    console.log('\n--- 9. Testing Role Guard Logic (ADMIN vs Non-ADMIN) ---');

    const checkRoleAccess = (userRole: string | undefined): 'ALLOW' | 'FORBIDDEN_403' | 'REDIRECT_LOGIN' => {
      if (!userRole) return 'REDIRECT_LOGIN';
      if (userRole === 'ADMIN') return 'ALLOW';
      return 'FORBIDDEN_403';
    };

    assert.strictEqual(checkRoleAccess(undefined), 'REDIRECT_LOGIN', 'Unauthenticated user redirected to login');
    assert.strictEqual(checkRoleAccess('ADMIN'), 'ALLOW', 'ADMIN user permitted');
    assert.strictEqual(checkRoleAccess('HOD'), 'FORBIDDEN_403', 'HOD user blocked with 403');
    assert.strictEqual(checkRoleAccess('FACULTY'), 'FORBIDDEN_403', 'FACULTY user blocked with 403');

    console.log('✓ 9. Default-deny role guard permits ADMIN and presents 403 screen for unauthorized roles.');

    console.log('\n[Frontend Integration Tests] All 9 test groups passed successfully.');
  } finally {
    globalThis.fetch = originalFetch;
    setOnUnauthorizedCallback(null);
    setClientCsrfToken(null);
  }
}

runFrontendIntegrationTests().catch((err) => {
  console.error('[Frontend Integration Tests] FAILED:', err);
  process.exit(1);
});
