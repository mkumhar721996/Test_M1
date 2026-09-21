summary: |
  This repo currently has no application code at all — only design-system tokens/CSS
  (design-system/tokens.css, design-system/tokens.json, design-system/prototype-utils.css) and
  the approved prototype for this story
  (.arc/designs/TEST-M1-STORY-035-design.html). There is no backend, no frontend framework, and
  no package.json anywhere. This plan builds the "Register New Employee" feature end to end from
  scratch: a small Node/TypeScript/Express backend (in-memory repository, field/file validation,
  atomic sequential Employee ID generation, duplicate-email guard) and a React/TypeScript/Vite
  frontend that reproduces the two approved screens (Employee Directory, Register New Employee)
  using the exact markup structure, class names, and copy already defined in the prototype's
  inline `<style>`/`<script>` blocks. Every acceptance criterion is covered test-first at the
  layer where it is actually enforced: format/required/duplicate/ID rules at the backend
  (unit + HTTP integration tests), and inline field/file error presentation at the UI (React
  Testing Library tests against the prototype's exact copy and DOM structure).
scope:
  - description: |
      Scaffold a minimal Express + TypeScript backend as its own package, with the Express
      `app` built in one module and the HTTP listener in another so tests can import `app`
      without binding a port.
    files:
      - server/package.json
      - server/tsconfig.json
      - server/src/app.ts
      - server/src/server.ts
    rationale: |
      No backend exists anywhere in the repo today. Every acceptance criterion that enforces a
      business rule (ID format/uniqueness, duplicate-email, required/format validation, file
      constraints, concurrency-safe ID assignment) has to live server-side since the browser
      cannot be trusted to enforce them.

  - description: |
      Employee domain types and typed error classes used across the backend.
      ```ts
      export interface Employee {
        id: string; firstName: string; lastName: string; email: string; mobile: string;
        department: string; designation: string; joiningDate: string;
        dob: string | null; photo: UploadedFileMeta | null; idProof: UploadedFileMeta | null;
      }
      export interface UploadedFileMeta { originalName: string; mimeType: string; size: number; }
      export class ValidationError extends Error { constructor(public fieldErrors: Record<string, string>) { super('VALIDATION_ERROR'); } }
      export class DuplicateEmailError extends Error { constructor(public existingEmployeeId: string, public existingName: string) { super('DUPLICATE_EMAIL'); } }
      ```
    files:
      - server/src/types/employee.ts
      - server/src/errors.ts
    rationale: |
      Gives the service/route layers a single typed vocabulary for the two failure modes the
      ACs care about (field validation vs. duplicate email), so the HTTP layer can map each to
      the right status code and message without string-sniffing.

  - description: |
      Required-field and format validation module, with copy taken verbatim from the approved
      prototype's own client-side validation strings (design HTML lines 1256-1273), so backend
      and UI messaging match exactly.
      ```ts
      export function validateEmployeeFields(input: RegisterEmployeeInput): Record<string, string> {
        const errors: Record<string, string> = {};
        const required: [keyof RegisterEmployeeInput, string][] = [
          ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'],
          ['mobile', 'Mobile number'], ['department', 'Department'],
          ['designation', 'Designation'], ['joiningDate', 'Joining date'],
        ];
        for (const [key, label] of required) {
          if (!input[key] || !String(input[key]).trim()) errors[key] = `${label} is required.`;
        }
        if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
          errors.email = 'Enter a valid email address, e.g. name@company.com.';
        }
        if (!errors.mobile && !/^\d{10}$/.test(input.mobile.trim())) {
          errors.mobile = 'Mobile number must be exactly 10 numeric digits.';
        }
        return errors;
      }
      ```
    files:
      - server/src/validation/employeeValidation.ts
      - server/test/employeeValidation.test.ts
    rationale: |
      Backs AC7 (required field blank) and AC8 (invalid email/mobile format) at the layer that
      must never trust the client. Message text is copied from the prototype so the UI-layer
      test (scope item 13) can assert on the identical strings.

  - description: |
      File validation module for Photo (JPG/PNG, max 2MB) and ID Proof (PDF/JPG/PNG, max 5MB),
      with copy again taken verbatim from the prototype's `handlePhotoFile`/`handleIdProofFile`
      (design HTML lines 1129-1184).
      ```ts
      export function validatePhoto(file: UploadedFileMeta): string | null {
        if (!['image/jpeg', 'image/png'].includes(file.mimeType)) {
          return `Photo must be a JPG or PNG file. "${file.originalName}" was rejected.`;
        }
        if (file.size > 2 * 1024 * 1024) {
          return `Photo exceeds the maximum size of 2MB (file is ${humanSize(file.size)}).`;
        }
        return null;
      }
      ```
    files:
      - server/src/validation/fileValidation.ts
      - server/test/fileValidation.test.ts
    rationale: |
      Backs AC9 (wrong file type) and AC10 (oversized file) server-side, since multipart
      uploads must be re-validated after parsing regardless of what the browser already checked.

  - description: |
      In-memory employee repository. Duplicate-email lookup and Employee ID assignment happen
      inside a single synchronous method with no `await` in its body, so two requests handled
      by Node's single-threaded event loop can never interleave inside it — this is what makes
      AC12's "distinct sequential ID, no duplicate or reused IDs" guarantee hold without a lock
      library.
      ```ts
      export class EmployeeRepository {
        private employees: Employee[] = [];
        private emailIndex = new Map<string, string>();
        private nextIdNumber = 1;

        create(input: Omit<Employee, 'id'>): Employee {
          const normalized = input.email.trim().toLowerCase();
          const existingId = this.emailIndex.get(normalized);
          if (existingId) {
            const existing = this.employees.find(e => e.id === existingId)!;
            throw new DuplicateEmailError(existing.id, `${existing.firstName} ${existing.lastName}`);
          }
          const id = `EMP${String(this.nextIdNumber).padStart(5, '0')}`;
          this.nextIdNumber += 1;
          const employee: Employee = { id, ...input, email: input.email.trim() };
          this.employees.push(employee);
          this.emailIndex.set(normalized, id);
          return employee;
        }

        list(): Employee[] { return this.employees.slice(); }
      }
      ```
    files:
      - server/src/repository/employeeRepository.ts
      - server/test/employeeRepository.test.ts
    rationale: |
      Backs AC2 (EMPnnnnn format), AC3 (uniqueness), AC4/AC11 (duplicate check, case/whitespace
      insensitive via `.trim().toLowerCase()`), and AC12 (atomic sequential assignment).

  - description: |
      Employee service that orchestrates field validation, file validation, and repository
      creation for a single registration request.
      ```ts
      export function registerEmployee(input: RegisterEmployeeInput, repo: EmployeeRepository): Employee {
        const fieldErrors = validateEmployeeFields(input);
        if (input.photo) { const e = validatePhoto(input.photo); if (e) fieldErrors.photo = e; }
        if (input.idProof) { const e = validateIdProof(input.idProof); if (e) fieldErrors.idProof = e; }
        if (Object.keys(fieldErrors).length) throw new ValidationError(fieldErrors);
        return repo.create({ ...input, dob: input.dob || null, photo: input.photo ?? null, idProof: input.idProof ?? null });
      }
      ```
    files:
      - server/src/services/employeeService.ts
    rationale: |
      Single seam the route handler calls into, covering AC1 (create with valid data), AC5
      (optional fields blank), AC6 (optional fields provided and persisted).

  - description: |
      HTTP layer: `POST /api/employees` (multipart/form-data, using multer memory storage to
      parse `photo`/`idProof` alongside the text fields) and `GET /api/employees` (directory
      listing, backing the approved Employee Directory screen). An error-handling middleware
      maps `ValidationError` to `400 { error: 'VALIDATION_ERROR', fieldErrors }` and
      `DuplicateEmailError` to `409 { error: 'DUPLICATE_EMAIL', message, existingEmployeeId }`.
    files:
      - server/src/routes/employees.ts
      - server/src/middleware/errorHandler.ts
      - server/test/employees.route.test.ts
    rationale: |
      This is the layer exercised by the HTTP-level tests for AC1-AC6, AC9-AC12 (see `tests`
      below), and is what the frontend's API client actually calls.

  - description: |
      Scaffold a Vite + React + TypeScript frontend as its own package, with a dev-server proxy
      so the browser only ever calls same-origin `/api/*`.
      ```ts
      // web/vite.config.ts
      export default defineConfig({
        plugins: [react()],
        server: { proxy: { '/api': 'http://localhost:4000' } },
      });
      ```
    files:
      - web/package.json
      - web/tsconfig.json
      - web/vite.config.ts
      - web/index.html
      - web/src/main.tsx
    rationale: |
      No frontend exists in the repo today. This is the minimum scaffold needed to render the
      two already-approved screens.

  - description: |
      Port the prototype's app-specific styling (not the shared design-system tokens, which are
      imported as-is) into the frontend package: `.app-nav`, `.page`, `table.directory`,
      `.id-chip`, `.muted-dash`, `form.reg-form`, `fieldset.form-group`, `.field`,
      `.field-error`, `.banner`, `.upload-field`, `.upload-preview`, `.success-card`,
      `.success-id-chip`, `.summary-list`, `#toast`, copied from the approved prototype's
      `<style>` block (design HTML lines 206-736), plus the two shared stylesheets it already
      depends on.
      ```ts
      // web/src/main.tsx
      import '../../design-system/tokens.css';
      import '../../design-system/prototype-utils.css';
      import './styles/app.css';
      ```
    files:
      - web/src/styles/app.css
    rationale: |
      This is the approved visual design (the prototype's own comment at design HTML lines
      194-205 notes the design system has no semantic error/success tokens, so error/success
      states are built from icon + label + border-weight using `color-primary` as the sole
      accent — the CSS below must preserve that, not invent new color tokens).

  - description: |
      App shell: a two-link nav ("Employee Directory" / "Register Employee") exactly matching
      the prototype's `.app-nav` (design HTML lines 752-758), toggling between the
      `EmployeeDirectory` and `RegisterEmployee` views. The prototype's reviewer bar
      (`#review-bar`, lines 741-748) and "Prototype helper" demo box (lines 849-856) are
      explicitly prototype-only scaffolding per the prototype's own comments and are excluded.
    files:
      - web/src/App.tsx
    rationale: |
      Reproduces the approved navigation shell without carrying over the reviewer-only tooling.

  - description: |
      Typed API client used by both pages.
      ```ts
      export async function createEmployee(formData: FormData): Promise<Employee> { /* POST /api/employees */ }
      export async function listEmployees(): Promise<Employee[]> { /* GET /api/employees */ }
      ```
    files:
      - web/src/api/employeesApi.ts
    rationale: |
      Keeps `fetch` calls and response/error-shape parsing out of the page components.

  - description: |
      Client-side validation mirroring the backend's copy exactly (same regexes and message
      strings as scope item 3/4), used for the inline, pre-submit feedback the ACs require.
    files:
      - web/src/validation/clientValidation.ts
      - web/src/validation/clientValidation.test.ts
    rationale: |
      AC7-AC10 are phrased as UI-visible behavior ("an inline field-level error message ... is
      displayed and the submission is blocked"); this module is what `RegisterEmployee.tsx`
      calls before ever hitting the network, with the backend validation in scope items 3/4 as
      the non-bypassable second line of defense.

  - description: |
      Register New Employee form/page, reproducing the prototype's exact structure (design HTML
      lines 840-1030): three fieldsets — "Personal details" (first name, last name, optional
      date of birth, optional Photo upload with type/size demo links removed since those are
      prototype-only, optional ID Proof upload), "Contact details" (email, mobile), "Employment
      details" (department `<select>`, designation text input with the same datalist options,
      joining date) — the `#banner-required` / `#banner-duplicate` alert banners, per-field
      `.field-error` paragraphs, and the success view (`.success-card` with `#success-id-chip`
      and `.summary-list` showing "Not provided" for blank optional fields, matching
      `li('Date of birth', record.dob ? formatDate(record.dob) : 'Not provided')` at design HTML
      line 1325).
    files:
      - web/src/pages/RegisterEmployee.tsx
      - web/src/pages/RegisterEmployee.test.tsx
    rationale: |
      This is the primary UI surface for AC1, AC4-AC11.

  - description: |
      Employee Directory page reproducing `table.directory` (design HTML lines 789-808):
      columns Employee ID (as `.id-chip`), Name, Email, Mobile, Department, Designation, Joining
      date, Date of birth, Photo, ID proof — with blank optional fields rendered as an em dash
      (`.muted-dash`, design HTML lines 1077-1079) rather than empty space, and a brief
      highlight on the row for a newly-created employee (`tr.is-new`, lines 330-337).
    files:
      - web/src/pages/EmployeeDirectory.tsx
      - web/src/pages/EmployeeDirectory.test.tsx
    rationale: |
      Gives AC1/AC2/AC3/AC5/AC6 a visible, testable place where "the record was actually
      created" and "blank vs. provided" are legible, matching the prototype's own stated intent
      for this screen (design HTML lines 762-777).
tests:
  - |
    AC1 — backend HTTP integration test (server/test/employees.route.test.ts), valid required
    fields create a record with an auto-generated ID:
    ```ts
    const res = await request(app).post('/api/employees')
      .field('firstName', 'Meera').field('lastName', 'Nair')
      .field('email', 'meera.nair@acmecorp.com').field('mobile', '9845123670')
      .field('department', 'IT').field('designation', 'IT Support Engineer')
      .field('joiningDate', '2026-09-21');
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^EMP\d{5}$/);
    ```
  - |
    AC2 — repository unit test (server/test/employeeRepository.test.ts), the first employee
    created gets exactly `EMP00001`:
    ```ts
    const repo = new EmployeeRepository();
    const emp = repo.create(validInput);
    expect(emp.id).toBe('EMP00001');
    ```
  - |
    AC3 — repository unit test, IDs are unique and sequential across multiple creations:
    ```ts
    const ids = [repo.create(a), repo.create(b), repo.create(c)].map(e => e.id);
    expect(ids).toEqual(['EMP00001', 'EMP00002', 'EMP00003']);
    expect(new Set(ids).size).toBe(3);
    ```
  - |
    AC4 — backend HTTP integration test, a second registration with an email already on file is
    rejected with a clear duplicate-email error:
    ```ts
    await createEmployee(app, { email: 'john@co.com' });
    const res = await createEmployee(app, { email: 'john@co.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DUPLICATE_EMAIL');
    expect(res.body.message).toMatch(/already on file/i);
    ```
  - |
    AC5 — backend HTTP integration test, optional fields (dob/photo/idProof) omitted still
    creates the record:
    ```ts
    const res = await createEmployee(app, { /* no dob, no files */ });
    expect(res.status).toBe(201);
    expect(res.body.dob).toBeNull();
    expect(res.body.photo).toBeNull();
    expect(res.body.idProof).toBeNull();
    ```
  - |
    AC6 — backend HTTP integration test, optional fields provided are persisted and returned:
    ```ts
    const res = await request(app).post('/api/employees')
      .field(validFields)
      .field('dob', '1996-04-12')
      .attach('photo', Buffer.from('fake'), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .attach('idProof', Buffer.from('fake'), { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.dob).toBe('1996-04-12');
    expect(res.body.photo.originalName).toBe('p.jpg');
    expect(res.body.idProof.originalName).toBe('id.pdf');
    ```
  - |
    AC7 — frontend RTL test (web/src/pages/RegisterEmployee.test.tsx), submitting with a
    required field blank shows an inline error naming it and blocks submission (paired with a
    server/test/employeeValidation.test.ts unit test asserting
    `validateEmployeeFields({...valid, firstName: ''}).firstName === 'First name is required.'`
    as the non-bypassable backend check):
    ```tsx
    render(<RegisterEmployee />);
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(mockCreateEmployee).not.toHaveBeenCalled();
    ```
  - |
    AC8 — frontend RTL test, an invalid email/mobile format shows an inline error naming the
    invalid field and blocks submission (paired with
    server/test/employeeValidation.test.ts asserting the same regex-driven messages
    server-side):
    ```tsx
    await userEvent.type(screen.getByLabelText(/^email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));
    expect(screen.getByText('Enter a valid email address, e.g. name@company.com.')).toBeInTheDocument();
    ```
  - |
    AC9 — frontend RTL test, selecting a non-JPG/PNG Photo (or non-PDF/JPG/PNG ID Proof) shows a
    file-type error and the upload is rejected (paired with
    server/test/fileValidation.test.ts asserting `validatePhoto` returns the same message for a
    `application/pdf` mime type):
    ```tsx
    const badFile = new File(['x'], 'scan.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/^photo/i), badFile);
    expect(await screen.findByText(/Photo must be a JPG or PNG file/)).toBeInTheDocument();
    ```
  - |
    AC10 — frontend RTL test, an oversized Photo (>2MB) or ID Proof (>5MB) shows a size error
    and the upload is rejected (paired with server/test/fileValidation.test.ts asserting
    `validatePhoto` rejects a 3MB `image/jpeg`):
    ```tsx
    const bigFile = new File([new ArrayBuffer(3 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText(/^photo/i), bigFile);
    expect(await screen.findByText(/Photo exceeds the maximum size of 2MB/)).toBeInTheDocument();
    ```
  - |
    AC11 — repository unit test, an email differing only by case/whitespace is still treated as
    a duplicate:
    ```ts
    repo.create({ ...validInput, email: 'john@co.com' });
    expect(() => repo.create({ ...validInput, email: '  John@Co.com  ' }))
      .toThrow(DuplicateEmailError);
    ```
  - |
    AC12 — backend HTTP integration test, two concurrent valid submissions each get a distinct,
    sequential Employee ID:
    ```ts
    const [r1, r2] = await Promise.all([
      createEmployee(app, { email: 'a@x.com' }),
      createEmployee(app, { email: 'b@x.com' }),
    ]);
    const ids = [r1.body.id, r2.body.id].sort();
    expect(ids).toEqual(['EMP00001', 'EMP00002']);
    ```
assumptions_or_open_questions:
  - |
    The repo has no existing backend, frontend, or package.json of any kind — this plan picks a
    stack (Node/TypeScript/Express backend, React/TypeScript/Vite frontend) since none is
    dictated by the codebase. If there's an intended stack this should follow instead, flag it
    before implementation starts.
  - |
    Storage is in-memory only (no database), since nothing in the repo configures one and no AC
    requires durability across process restarts. The Employee ID counter and email index reset
    on restart. If durable storage is actually required, this plan needs a DB dependency added.
  - |
    Uploaded Photo/ID Proof files are held as in-memory metadata + buffer for the lifetime of the
    process (via multer memory storage); no file storage service/bucket is configured in the
    repo, so persisting uploaded files beyond process lifetime is out of scope here.
  - |
    `server/` and `web/` are two independent packages with no workspace tooling (no npm/yarn
    workspaces configured), since none exists today. The Vite dev server proxies `/api/*` to the
    backend so the browser never needs CORS.
  - |
    AC12 ("two HR Executives submit ... at the same time") is validated as concurrent in-process
    async requests relying on Node's single-threaded event loop plus a non-yielding critical
    section in `EmployeeRepository.create`. True cross-process/multi-instance ID uniqueness
    (e.g. multiple server instances behind a load balancer) is out of scope, since no such
    deployment topology exists in this repo.
  - |
    `GET /api/employees` is added even though no AC names it directly, because it's the only way
    to back the already-approved Employee Directory screen and to demonstrate persisted records
    for AC1/AC3/AC12 beyond a single POST response.
  - |
    The prototype's reviewer bar (`#review-bar`) and "Prototype helper" demo box are explicitly
    called out in the prototype's own HTML comments as non-production scaffolding, so they are
    intentionally not reproduced in the real UI.
package_dependencies:
  - name: express
    version: ^4.21.1
    ecosystem: npm
    rationale: HTTP framework for the new backend's routes.
  - name: multer
    version: ^1.4.5-lts.1
    ecosystem: npm
    rationale: Parses multipart/form-data so Photo/ID Proof files can be uploaded alongside the text fields on POST /api/employees.
  - name: typescript
    version: ^5.6.3
    ecosystem: npm
    rationale: Both new packages (server, web) are written in TypeScript.
  - name: tsx
    version: ^4.19.2
    ecosystem: npm
    rationale: Runs the Express server's TypeScript source directly in dev without a separate compile step.
  - name: vitest
    version: ^2.1.4
    ecosystem: npm
    rationale: Test runner for both the backend unit/integration tests and the frontend component tests.
  - name: supertest
    version: ^7.0.0
    ecosystem: npm
    rationale: Drives the HTTP-level tests against the Express app (AC1, AC4-AC6, AC12) without binding a real port.
  - name: react
    version: ^18.3.1
    ecosystem: npm
    rationale: Frontend framework used to build the two approved screens.
  - name: react-dom
    version: ^18.3.1
    ecosystem: npm
    rationale: React DOM renderer, required alongside react.
  - name: vite
    version: ^5.4.10
    ecosystem: npm
    rationale: Dev server/bundler for the new frontend package.
  - name: "@vitejs/plugin-react"
    version: ^4.3.3
    ecosystem: npm
    rationale: Enables JSX/TSX compilation in Vite.
  - name: "@testing-library/react"
    version: ^16.0.1
    ecosystem: npm
    rationale: Renders RegisterEmployee/EmployeeDirectory in tests and queries by role/label/text.
  - name: "@testing-library/user-event"
    version: ^14.5.2
    ecosystem: npm
    rationale: Simulates realistic typing/clicking/file-upload interactions in the frontend tests (AC7-AC10).
  - name: "@testing-library/jest-dom"
    version: ^6.6.3
    ecosystem: npm
    rationale: Adds DOM-specific matchers (toBeInTheDocument, etc.) used throughout the frontend tests.
  - name: jsdom
    version: ^25.0.1
    ecosystem: npm
    rationale: DOM environment Vitest needs to run the React component tests.
  - name: "@types/express"
    version: ^4.17.21
    ecosystem: npm
    rationale: Type definitions for express in the TypeScript backend.
  - name: "@types/multer"
    version: ^1.4.12
    ecosystem: npm
    rationale: Type definitions for multer in the TypeScript backend.
  - name: "@types/supertest"
    version: ^6.0.2
    ecosystem: npm
    rationale: Type definitions for supertest in the backend tests.
  - name: "@types/node"
    version: ^22.9.0
    ecosystem: npm
    rationale: Node.js type definitions needed by the TypeScript backend.
  - name: "@types/react"
    version: ^18.3.12
    ecosystem: npm
    rationale: Type definitions for react in the TypeScript frontend.
  - name: "@types/react-dom"
    version: ^18.3.1
    ecosystem: npm
    rationale: Type definitions for react-dom in the TypeScript frontend.
notes: |
  This is a greenfield build: aside from `design-system/*` (tokens.css, tokens.json,
  prototype-utils.css) and the approved prototype at
  `.arc/designs/TEST-M1-STORY-035-design.html`, there is no existing application code, so every
  node in the diagram below is new. It's included anyway because the plan crosses three layers
  (UI → API client → HTTP route → service → repository/validation) and the call direction/
  fan-in is worth the reviewer sanity-checking before code exists.

  ```mermaid
  flowchart TD
    RD[RegisterEmployee.tsx] --> API[employeesApi.ts]
    ED[EmployeeDirectory.tsx] --> API
    RD --> CV[clientValidation.ts]
    API -->|"POST /api/employees, GET /api/employees"| RT[routes/employees.ts]
    RT --> SVC[employeeService.ts]
    RT --> ERR[middleware/errorHandler.ts]
    SVC --> EV[validation/employeeValidation.ts]
    SVC --> FV[validation/fileValidation.ts]
    SVC --> REPO[repository/employeeRepository.ts]

    classDef touched fill:#f96,color:#000;
    class RD,ED,API,CV,RT,ERR,SVC,EV,FV,REPO touched;
  ```

  Design fidelity notes:
  - All CSS classes/IDs used by the two pages (`.reg-form`, `.field`, `.field-error`, `.banner`,
    `#banner-required`, `#banner-duplicate`, `.upload-field`, `.upload-preview`,
    `.success-card`, `#success-id-chip`, `.summary-list`, `table.directory`, `.id-chip`,
    `.muted-dash`) are taken directly from the approved prototype rather than invented, so the
    reviewer can diff the final markup against the prototype's DOM structure.
  - The prototype's own HTML comment (design HTML lines 194-205) notes the design system has no
    semantic error/success color tokens, so error/success states are deliberately built from
    icon + label + border-weight using `color-primary` as the only accent (never color alone).
    This plan carries that constraint forward rather than adding new color tokens.
  - Error/duplicate message copy is copied verbatim from the prototype's inline `<script>`
    (e.g. "Mobile number must be exactly 10 numeric digits.", "This email is already
    registered.", the `banner-duplicate-body` text pattern including the existing employee's ID
    and name) so backend messages, frontend messages, and the approved design agree exactly.
  - HTTP error convention: `400 { error: 'VALIDATION_ERROR', fieldErrors }` for AC7/AC8/AC9/AC10
    server-side rejections, `409 { error: 'DUPLICATE_EMAIL', message, existingEmployeeId }` for
    AC4/AC11 — chosen so the frontend can map `fieldErrors` straight onto the matching
    `.field-error` element by key.
  - TDD order per scope item: write the listed unit/integration/component test first (it must
    fail against an empty/stubbed implementation), then add the minimal code in the paired
    files to make it pass, then move to the next item. Backend validation/repository/service
    layers are built (and tested) before the routes that wire them together; the frontend API
    client and validation module are built before the pages that consume them.
