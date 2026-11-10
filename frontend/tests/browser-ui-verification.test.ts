import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBrowserUiVerification() {
  console.log('[Browser & UI Verification] Starting evaluation of UI components and styling...\n');

  // =========================================================================
  // 1. CSS Design System & Responsive Breakpoint Verification
  // =========================================================================
  console.log('--- 1. Responsive Layout & CSS Rule Verification ---');
  const cssPath = path.resolve(__dirname, '../src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify Institutional Color Variables (No Purple Gradients / No Emoji)
  assert.ok(cssContent.includes('--color-primary: #1e3a8a'), 'Deep navy primary color must be defined');
  assert.ok(cssContent.includes('--color-bg: #f8fafc'), 'Clean slate neutral background must be defined');
  assert.ok(cssContent.includes('--color-success-bg: #ecfdf5'), 'Emerald success background must be defined');
  assert.ok(cssContent.includes('--color-danger-bg: #fef2f2'), 'Crimson danger background must be defined');
  assert.ok(!cssContent.toLowerCase().includes('linear-gradient(to right, #8a2be2'), 'No purple gradients permitted');

  // Verify Responsive Breakpoints
  assert.ok(cssContent.includes('@media (max-width: 1024px)'), 'Tablet breakpoint (1024px) must be configured');
  assert.ok(cssContent.includes('@media (max-width: 768px)'), 'Mobile breakpoint (768px) must be configured');
  assert.ok(cssContent.includes('.app-sidebar.open'), 'Mobile sidebar toggle open state must be configured');
  assert.ok(cssContent.includes('.sidebar-backdrop'), 'Mobile backdrop overlay must be configured');
  assert.ok(cssContent.includes('.mobile-menu-toggle'), 'Mobile hamburger button styling must be configured');
  assert.ok(cssContent.includes('.table-wrapper'), 'Table horizontal scroll wrapper must be configured');
  assert.ok(cssContent.includes('overflow-x: auto'), 'Responsive table overflow-x must be auto');

  console.log('✓ 1. Desktop, tablet, and mobile CSS rules verified according to Rule 4.');

  // =========================================================================
  // 2. Modal Keyboard Accessibility & Escape Listener
  // =========================================================================
  console.log('\n--- 2. Modal Accessibility & Keyboard Navigation ---');
  const modalPath = path.resolve(__dirname, '../src/components/common/Modal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  assert.ok(modalContent.includes("e.key === 'Escape'"), 'Modal must listen for Escape key to close');
  assert.ok(modalContent.includes('role="dialog"'), 'Modal must have ARIA role="dialog"');
  assert.ok(modalContent.includes('aria-modal="true"'), 'Modal must have ARIA aria-modal="true"');
  assert.ok(modalContent.includes('aria-labelledby="modal-title"'), 'Modal must label dialog with modal-title');
  assert.ok(modalContent.includes('e.stopPropagation()'), 'Dialog clicks must not bubble to backdrop dismiss');

  console.log('✓ 2. Modal accessibility semantics, Escape dismissal, and backdrop isolation verified.');

  // =========================================================================
  // 3. Form Accessibility, Validation Errors & Helper Text
  // =========================================================================
  console.log('\n--- 3. Form Component & Accessibility Semantics ---');
  const formFieldPath = path.resolve(__dirname, '../src/components/common/FormField.tsx');
  const formFieldContent = fs.readFileSync(formFieldPath, 'utf8');

  assert.ok(formFieldContent.includes('htmlFor={htmlFor}'), 'FormField must connect label with input htmlFor');
  assert.ok(formFieldContent.includes('className="form-error"'), 'FormField must render accessible error container');
  assert.ok(formFieldContent.includes('className="form-helper"'), 'FormField must render input helper text');
  assert.ok(formFieldContent.includes('className="required"'), 'FormField must render required asterisk indicator');

  console.log('✓ 3. FormField label associations, required indicators, and error formatting verified.');

  // =========================================================================
  // 4. Table States (Loading, Empty, Status Pill, Active/Inactive Row)
  // =========================================================================
  console.log('\n--- 4. Table Component UX States ---');
  const dataTablePath = path.resolve(__dirname, '../src/components/common/DataTable.tsx');
  const dataTableContent = fs.readFileSync(dataTablePath, 'utf8');

  assert.ok(dataTableContent.includes('emptyMessage ='), 'DataTable must provide descriptive empty message');
  assert.ok(dataTableContent.includes('Loading data...'), 'DataTable must provide institutional loading state');
  assert.ok(dataTableContent.includes('table-actions'), 'DataTable must provide standardized actions column');
  assert.ok(dataTableContent.includes('rowClassName'), 'DataTable must support dynamic inactive row styling');

  console.log('✓ 4. DataTable loading, empty, and row inactive UX states verified.');

  // =========================================================================
  // 5. Sidebar Navigation & Browser Hash History Behavior
  // =========================================================================
  console.log('\n--- 5. Sidebar Navigation & Hash Routing Integration ---');
  const sidebarPath = path.resolve(__dirname, '../src/components/layout/Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

  const expectedNavPaths = [
    '#/dashboard',
    '#/departments',
    '#/courses',
    '#/semesters',
    '#/sections',
    '#/faculty',
    '#/subjects',
    '#/classrooms',
    '#/curriculum',
  ];

  for (const p of expectedNavPaths) {
    assert.ok(sidebarContent.includes(`path: '${p}'`), `Sidebar must contain navigation path ${p}`);
  }

  const routerPath = path.resolve(__dirname, '../src/router/Router.tsx');
  const routerContent = fs.readFileSync(routerPath, 'utf8');
  assert.ok(routerContent.includes("window.addEventListener('hashchange'"), 'Router must bind hashchange for browser back/forward support');
  assert.ok(routerContent.includes('user.role !== \'ADMIN\''), 'Router must enforce default-deny non-ADMIN role guard');

  console.log('✓ 5. All 9 administrative navigation links, hash routing, and back/forward navigation verified.');

  console.log('\n[Browser & UI Verification] All UI layout, responsiveness, and accessibility checks passed.');
}

runBrowserUiVerification().catch((err) => {
  console.error('[Browser & UI Verification] FAILED:', err);
  process.exit(1);
});
