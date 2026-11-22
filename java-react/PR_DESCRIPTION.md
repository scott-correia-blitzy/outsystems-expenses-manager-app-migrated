# Rebuild Expenses Manager V2 as Spring Boot 3.5 and React 19 (java-react/)

This PR adds `java-react/`, a rebuild of the OutSystems 11 application Expenses Manager V2 (Frontend module `ExpensesManagerV2`, Core module `ExpensesManagerV2_Core`) as a Spring Boot 3.5.16 REST backend and a React 19 single-page app built with MUI 7. One jar serves both on port 8080 and keeps its data in an embedded H2 file (`jdbc:h2:file:./data/expenses`, so `java-react/data/`). `cd java-react && ./start.sh` builds and runs it in one command, and `./mvnw verify` is the single pass/fail gate. `legacy/` is read-only input and is unchanged. The only edit outside `java-react/` is three lines appended to the root `.gitignore`: `java-react/data/`, `target/` and `node_modules/`.

## What was migrated

### Counts

| Legacy construct | Count | Target |
|---|---|---|
| Reactive Web screens | 14 | React routes, one page each in `frontend/src/pages/`, guarded by the route table `frontend/src/routes.tsx` |
| Server actions | 21 | Methods of Spring-managed classes in `com.massmutual.expensesmanager.service`: the `@Service` classes and the `@Component` classes `ReportCodeGenerator` and `AmountCalculator`; `DoLogout` is the Spring Security logout filter configured in `web/SecurityConfig` |
| Screen and block aggregates | 40 | Spring Data JPA queries: report, line and invoice queries declared once on generic `@NoRepositoryBean` repositories and bound to both report kinds; type and blog queries on the concrete `ExpenseTypeRepository`, `EarningTypeRepository` and `BlogPostRepository`; creator display names from `AppUserRepository` |
| Action aggregates, plus the `SQL1` union | 18 + 1 | `ReportRepository` counts and lookups; `LineRepository.findForCreatorSince`, merged per kind in `DashboardService` |
| Entities (4 of them Static Entities) | 11 | JPA entities on an H2 schema transcribed from `legacy/legacy-db/schema.sql` |
| Platform `User` entity and the OutSystems `Users` module | n/a | New `AppUser` and `AppUserRole` tables with BCrypt password hashes |
| Roles `Administrator`, `Approver`, `User`, `Registered`, `Anonymous` | 5 | Authorities `ROLE_Administrator`, `ROLE_Approver`, `ROLE_User`, `ROLE_Registered` (every signed-in user); Anonymous is an unauthenticated caller |
| Site Property `MileageReimbursement` (0.37), literals 0.93 and 0.23 | 3 | `expenses.mileage-reimbursement`, `expenses.dollars-to-euros`, `expenses.vat-rate` in `application.properties` |
| Client action `CalculateTotalAmountInEuros` | 1 | `AmountCalculator` on the server; the SPA shows a preview only |
| OutSystemsUI theme | 1 | One MUI theme, `frontend/src/theme/theme.ts` |

### Screens to routes

| Legacy screen | Route | Page (`frontend/src/pages/`) |
|---|---|---|
| `Login` | `/login` | `LoginPage.tsx` |
| `InvalidPermissions` | `/invalid-permissions` | `InvalidPermissionsPage.tsx` |
| `UserDashboard` | `/dashboard` | `UserDashboardPage.tsx` |
| `User_ReportsPage` | `/reports` | `UserReportsPage.tsx` |
| `User_ExpenseReportDetail` | `/reports/expense/:id` | `UserExpenseReportDetailPage.tsx` |
| `User_EarningReportDetail` | `/reports/earning/:id` | `UserEarningReportDetailPage.tsx` |
| `AdminDashboard` | `/admin` | `AdminDashboardPage.tsx` |
| `Admin_ExpenseReportDetail` | `/admin/reports/expense/:id` | `AdminExpenseReportDetailPage.tsx` |
| `Admin_EarningReportDetail` | `/admin/reports/earning/:id` | `AdminEarningReportDetailPage.tsx` |
| `Blog` | `/blog` | `BlogPage.tsx` |
| `BlogPostDetail` | `/blog/posts/:id` (`new` creates a post) | `BlogPostDetailPage.tsx` |
| `TOOLS_UsdToEurConverter` | `/tools/usd-to-eur` | `UsdToEurConverterPage.tsx` |
| `TOOLS_MileageReimbursement` | `/tools/mileage` | `MileageReimbursementPage.tsx` |
| `HomeScreen` | `/home` | `HomeScreenPage.tsx`, which redirects to the caller's landing route |

The six legacy modal blocks become dialogs in `frontend/src/components/`: `SHARED_AddReport_Popup` is `NewReportDialog`, `SHARED_AddReportDetail_Popup` and `SHARED_EditReportDetail_Popup` are `LineFormDialog`, `SHARED_ViewReportDetail_Popup` is `LineViewDialog`, and `SHARED_DeleteReport_Popup` and `SHARED_DeleteReportDetail_Popup` are `ConfirmDialog`.

### Server actions to services

| Legacy server action(s) | Target |
|---|---|
| `DoLogin` | `AuthService.authenticate`, called by `AuthController.login`, which stores the session |
| `DoLogout` | Spring Security logout at `POST /api/auth/logout`, configured in `SecurityConfig` |
| `ExpenseReportTitleCreate`, `EarningReportTitleCreate` | `ReportService.create` |
| `GenerateReportCode` | `ReportCodeGenerator.nextCode` |
| `ExpenseReportCreateOrUpdate`, `EarningReportCreateOrUpdate` | `ReportService.rename` and the owner-save stamping shared by create, rename and submit |
| `ExpenseCreateOrUpdate`, `EarningCreateOrUpdate` | `LineService.create`, `LineService.update` |
| `ExpenseDelete`, `EarningDelete` | `LineService.delete` |
| `ExpenseReportDelete`, `EarningReportDelete` | `ReportService.delete` |
| `ExpenseReport_Submit`, `EarningReport_Submit` | `ReportService.submit` |
| `ProcessExpenseReport`, `ProcessEarningReport` | `ReportService.decide` |
| `ExpenseUploadInvoice`, `EarningUploadInvoice` | `InvoiceService.upload` (the client download action becomes `InvoiceService.download`) |
| `MileageReimbursement` | `AmountCalculator.mileage`, exposed by `ToolsService.mileage` |
| `BlogPostCreateOrUpdate` | `BlogService.create`, `BlogService.update` |

Total: 21 server actions.

### Features

| Feature | Backend | Frontend |
|---|---|---|
| F-001 Authentication and session | `AuthController`, `AuthService`, `AppUserDetailsService`, `SecurityConfig` | `LoginPage`, `AuthContext` |
| F-002 Authorization and landing | `SecurityConfig`, `ReportAccessPolicy`, `AuthService` landing route | `routes.tsx`, `RequireRole`, `InvalidPermissionsPage`, `HomeScreenPage` |
| F-003 Report creation and code | `ReportService.create`, `ReportCodeGenerator` | `NewReportDialog` |
| F-004 Browse, search, filter | `ReportService.list`, `ReportRepository` | `UserReportsPage`, `ReportList` |
| F-005 Line items | `LineService`, `LineController` | `ReportDetailView`, `LineTable`, `LineFormDialog`, `LineViewDialog` |
| F-006 Amount calculation | `AmountCalculator` | Preview in `LineFormDialog` |
| F-007 Invoices | `InvoiceService` | Upload in `LineFormDialog`, download in `LineViewDialog` |
| F-008 Submit | `ReportService.submit` | `ReportDetailView` |
| F-009 Review and decision | `ReportService.decide` | `AdminDashboardPage`, admin detail pages |
| F-010 Delete | `ReportService.delete`, `LineService.delete` | `ConfirmDialog` |
| F-011 User dashboard | `DashboardService.user` | `UserDashboardPage` |
| F-012 Admin dashboard | `DashboardService.admin` | `AdminDashboardPage` |
| F-013 Blog | `BlogService`, `BlogController` | `BlogPage`, `BlogPostDetailPage` |
| F-014 Tools | `ToolsService`, `ToolsController` | `UsdToEurConverterPage`, `MileageReimbursementPage` |
| F-015 Reference data and persistence | `schema.sql`, `data.sql`, `ReferenceDataService` | Reference loader in `api.ts` |

### Constructs not carried

A legacy construct is carried exactly when it has an observable effect in the legacy model: it renders a screen or a value, changes stored data, or shows a message. These have none:

- `HomeScreen` template content ("App Feedback Available!"). The route stays and redirects to the landing route.
- The empty `Login.ForgotPassword` flow. The link is dropped.
- The unified login and logout URL branches of `DoLogin`, `DoLogout` and `UserInfo.ClientLogin`. There is no external identity provider.
- The JavaScript role checks `CheckRolesLoginWithJS`, `CheckAdminRoleWithJS` and `CheckUserRoleWithJS`, replaced by the route table and the session's roles.
- The generated `GrantRole` and `RevokeRole` actions, which nothing calls.
- The stub `SQL1` node that holds only `SELECT`.
- References to `OutSystemsMaps` and `OutSystemsSampleDataDB`, and the `Client.Username` cache.
- Approve and Decline buttons on the user detail screens for Approvers. The server always rejected them: `ProcessExpenseReport` and `ProcessEarningReport` raise "The user does not have permissions" for any caller without Administrator.

### Dependencies

Every runtime, library and build plugin is on the requested list except these four, each with its reason:

- `@testing-library/dom` 10.4.2: required peer of `@testing-library/react` 16, which does not install it.
- `@types/react` 19.3.0 and `@types/react-dom` 19.3.0: React ships no TypeScript declarations, so `tsc --noEmit` cannot type-check TSX without them.
- `org.hibernate.orm.tooling:hibernate-enhance-maven-plugin` 6.6.53.Final (the Boot BOM's `hibernate.version`): build-time bytecode enhancement, so an invoice's `Content` BLOB loads only on download and not with every line view.

`@testing-library/jest-dom` is pinned to 6.9.1: 6.10.0, the newest 6.x, is deprecated by its publisher as a minor release with breaking changes, and the publisher names 6.9.1 as the 6.x release to use.

`tinypool`, Vitest 3.2.7's worker pool, is forced to 2.1.2 through `overrides` in `frontend/package.json`, because Vitest 3.2.7 would otherwise resolve 1.1.1, which is affected by CVE-2026-104848 and CVE-2026-104849; 2.1.2 is the first patched release and needs no Vitest change.

Versions: Spring Boot 3.5.16 (Spring Security 6.5.11, Hibernate 6.6.53.Final, H2 2.3.232 from its BOM), `maven.compiler.release` 25, Maven 3.9.16 through the Maven Wrapper 3.3.4 (only-script), `frontend-maven-plugin` 1.15.4 installing Node v24.22.3 with its bundled npm 11.19.1 into `java-react/node/`. Frontend pins are exact in `frontend/package.json` (React 19.3.1, `@mui/material` 7.3.11, `@emotion/react` 11.14.0, `@emotion/styled` 11.14.1, `react-router` 7.18.6, TypeScript 5.9.3, Vite 7.3.8, `@vitejs/plugin-react` 5.2.0, Vitest 3.2.7, `@testing-library/react` 16.3.3, jsdom 31.0.1) and resolved by the committed `frontend/package-lock.json`.

### Schema

- Legacy table and column names are kept, including the misspelt `SubmitedBy` and `SubmitedOn`.
- The Core module gives both report tables the unique index name `UniqueIndex_ReportCode`, which SQL Server scopes per table. H2 scopes index names per schema, so the H2 schema uses the table-prefixed names of the derived DDL (`ExpenseReport_UniqueIndex_ReportCode`, `EarningReport_UniqueIndex_ReportCode`).
- All 10 foreign keys of `legacy/legacy-db/schema.sql` are kept with their names. The extraction notes count 8 because they omit the two invoice shared-key constraints `FK_InvoiceExpense_Id` and `FK_InvoiceEarning_Id`; the DDL governs. The new `FK_AppUserRole_UserId` makes 11.
- Type substitutions for H2: `NVARCHAR` to `VARCHAR`, `DATETIME2` to `TIMESTAMP`, `BIT` to `BOOLEAN`, `VARBINARY(MAX)` to `BLOB`. H2 reserves `ORDER`, so the static column is the quoted identifier `"Order"`.
- `schema.sql` (`CREATE ... IF NOT EXISTS`) and `data.sql` (the 14 Static Entity rows as `MERGE`) run on every start; Hibernate validates the mapping (`ddl-auto=validate`).

## Token sources

`https://www.massmutual.com/` was fetched in a desktop Chrome session, because the site rejects headless agents. The tokens were parsed from its design-system bundle `https://www.massmutual.com/mm-assets/5.21.1/mm-consumer/mm-consumer.bundle.css`, using the `:root`, `body`, `.btn`, heading (`h1,.h1,h2,.h2,...`) and `.alert` rules. The bundle sets `html{font-size:62.5%}`, so 1rem is 10px on the site; rem values are converted to px for MUI, except the pill radius, which keeps its CSS value.

Every token lives in `frontend/src/theme/theme.ts`, mounted once through `ThemeProvider` in `App.tsx`; components read tokens only through theme keys, so replacing that file reskins the app. No logo, wordmark, image or font file is downloaded or embedded. "Lato" and "MMSharpSans" are named in the font stacks and render with the system fallbacks unless installed locally.

| Theme key | Value | Source rule in the bundle |
|---|---|---|
| `palette.primary.main` | `#004DB2` | `:root { --bds-color-brand-primary }` |
| `palette.primary.dark` | `#002E6B` | `:root { --bds-color-brand-tertiary }` |
| `palette.secondary.main` | `#003D8C` | `:root { --bds-color-brand-secondary }` |
| `palette.info.main` | `#002E6B` | `:root { --bds-color-alert-info }` |
| `palette.success.main` | `#327320` | `:root { --bds-color-alert-success }` |
| `palette.warning.main` | `#DB7C0F` | `:root { --bds-color-alert-warning }` |
| `palette.warning.contrastText` | `rgba(0, 0, 0, 0.85)` | `:root { --bds-color-text-primary }`, reused because white on the brand orange is 3.04:1, below WCAG AA; filled warning alerts use it |
| `palette.error.main` | `#E21224` | `:root { --bds-color-alert-danger }` |
| `palette.text.primary` | `rgba(0, 0, 0, 0.85)` | `:root { --bds-color-text-primary }` |
| `palette.text.secondary` | `#555555` | `:root { --bds-color-text-tertiary }` |
| `palette.text.disabled` | `#767676` | `:root { --bds-color-text-disabled }` |
| `palette.action.disabled` | `#767676` | `:root { --bds-color-text-disabled }`, reused so disabled controls match disabled text |
| `palette.divider` | `#C6C6C6` | `:root { --bds-color-border-divider }` |
| `palette.background.paper` | `#FFFFFF` | `:root { --bds-color-background-default }` |
| `palette.background.default` | `#F8F8F8` | `:root { --bds-color-gray-25 }` |
| `palette.nav.main` (app bar background, `MuiAppBar` override) | `#002452` | `:root { --bds-color-background-nav }` |
| `palette.accent.main` | `#72D3EF` | `:root { --bds-color-accent-default }` |
| `palette.grey` 50, 100, 200, 300, 400, 500, 600, 700, 800, 900 | `#F1F1F1`, `#E2E2E2`, `#C6C6C6`, `#ABABAB`, `#919191`, `#767676`, `#5E5E5E`, `#474747`, `#303030`, `#1B1B1B` | `:root { --bds-color-gray-50 }` to `:root { --bds-color-gray-900 }` |
| `typography.fontFamily` (body) | `"Lato", Helvetica, Arial, sans-serif` | `body{font-family:"Lato",Helvetica,Arial,sans-serif}` |
| `typography.h1` to `typography.h6`, `typography.button` | `"MMSharpSans", Helvetica, Arial, sans-serif` | `.btn{font-family:"MMSharpSans",...}` and `h1,.h1,h2,.h2,...{font-family:"MMSharpSans",...}` |
| `typography.button` `textTransform` | `'none'` | Not a bundle token: button and toggle labels keep the title case of `legacy/screenshots/` |
| `shape.borderRadius` | `8` (px) | `:root { --bds-border-radius-large: 0.8rem }`; also `.alert{border-radius:.8rem}` |
| `MuiButton` root `borderRadius` | `'9999rem'` (pill) | `:root { --bds-border-radius-full: 9999rem }`; `.btn{border-radius:9999rem}` |
| `spacing` | `8` (px base) | `:root { --bds-space-xsmall: 0.8rem }` |

The component overrides in `theme.ts` reuse these tokens: a 2px `primary.main` focus outline on buttons, toggles, menu items, accordion rows, links and focused page headings, drawn in the alert's text colour on filled alerts; `text.secondary` placeholders at full opacity; `grey.500` resting outlines on outlined fields; a 44px (`spacing(5.5)`) minimum size for buttons, icon buttons, toggles, menu items, checkboxes and small fields; a `common.black` ripple behind the label of contained buttons, so focus and press darken the fill; `divider` row separators in tables, `grey.600` avatars with white initials, and white hover and disabled tints (from `nav.contrastText`) on the app bar controls.

Enforcement: `frontend/src/test/noHardCodedColours.test.ts` fails on any hex, `rgb()`, `rgba()`, `hsl()` or `hsla()` literal in a `.ts` or `.tsx` file under `frontend/src` other than `theme.ts`, its own source included, and names each file and literal it finds.

## Intentional changes

### Requested by the brief

| Change | Anomaly | Where |
|---|---|---|
| `AmountInEuros` is computed on the server from amount, currency, type and kilometres; any value a client sends is ignored. Results equal the documented rule: EUR copied, USD × 0.93, Kilometers km × 0.37 | none | `AmountCalculator`, `LineService` |
| The role matrix is enforced on every endpoint, and a User reads and changes only reports they own. Legacy enforced roles in 2 of 21 server actions and had no ownership filter on the detail screens | AN-05 | `SecurityConfig`, `ReportAccessPolicy` |
| An Approver lands on `/blog`. Legacy sent them to `UserDashboard`, which the role matrix denies them | AN-03 | `AuthService`, `routes.tsx` |
| Kept: a decision does not check the current status, so a decided report can be decided again | AN-06 | `ReportService.decide` |
| Not reproduced: Kilometers lines store kilometres × 0.37, never the legacy client-side subtraction of the previous value | AN-08 | `AmountCalculator` |

### Forced by the REST contract and the brief's rules

| Anomaly | Legacy | This build | Ground |
|---|---|---|---|
| AN-01 | Any upload type and size accepted; the `.pdf`/`.png`/`.jpg` check is never reached | PDF, PNG or JPEG only (`.pdf`, `.png`, `.jpg`, `.jpeg`, with a declared content type that matches the extension), otherwise 415 "File type is not supported"; over 5 MB is 413; a filename over 50 characters is rejected with 422 rather than truncated, so a download always carries the uploaded name. A new upload replaces the line's invoice | The contract's invoice row |
| AN-07 | Line edit ignores the report status | 409 `NOT_DRAFT` outside Draft | The contract's 409 on line update |
| AN-10 | Delete guards end silently | 409 with the legacy warning text ("This report cant be deleted", "This detail cant be deleted") | The contract's 409 on deletes |
| AN-15 | `Filetype` never written; `IsActive` never set on reports and lines | `Filetype` stores the uploaded content type and is served on download. `IsActive` on reports and lines is written as `FALSE`, the OutSystems default, because nothing reads it | The contract's download row |
| AN-11 | Delete rules differ from the DDL | `ON DELETE CASCADE` on `FK_Expense_ExpenseReportId`, `FK_Earning_EarningReportId`, `FK_InvoiceExpense_Id` and `FK_InvoiceEarning_Id`, following the Core `DeleteRule="Delete"`; deleting a Draft report removes its lines and invoices | The brief's delete rule |
| AN-16 | The line table shows `AmountInEuros` as "$42.00" beside a "€ 42,00" total | Euros everywhere, "€ 42,00" in the line table too | The brief's euro display rule (`€ 3.412,95`), which it lists as preserved behaviour |

### Other departures

- One list endpoint, `GET /api/reports`, takes the union of the legacy list scopes: a report is listed when the caller submitted it, or the caller holds Approver and it is Submitted, or the caller holds Administrator and it is not Draft. An Administrator therefore also sees their own Draft reports, which the legacy admin list excluded. No report a legacy screen showed the caller is hidden.
- An Approver can list their own reports plus every Submitted report through the API, as the legacy user-list filter allowed, but no screen shows that list, because the role matrix gives Approver no report screen. Only an Administrator can approve or decline.
- Platform services are explicit code: an HTTP session cookie, CSRF protection with the `XSRF-TOKEN` cookie and `X-XSRF-TOKEN` header, a 20-minute idle timeout, and a 30-day session when "Remember me" is ticked. Sessions are held in memory, so a server restart signs everyone out. Passwords are BCrypt hashes, and unknown users and wrong passwords get the same 401.
- `expenses.dashboard.reference-date=2024-05-23` fixes the date-relative dashboard figures (current and last month, the change percentage, the 30-day chart) so they match the seeded data; legacy used the current date. Clearing the value restores that. New report codes always use the real year.
- Errors use one JSON body (`status`, `code`, `message`, `fieldErrors`) with an HTTP status in place of legacy `Success = False` plus `ErrorMessage`, keeping the legacy message text. New messages where legacy had none: "Invalid username or password.", "Please log in to continue.", "The requested resource was not found", "The report is no longer in Draft", "The file exceeds the 5 MB limit", "Maximum length is 50 characters", "Maximum length is 1500 characters", "Maximum length is 10000 characters", "File name must be 50 characters or fewer", "Invalid value" and "The application is starting, please try again in a moment.", the 503 `SERVICE_UNAVAILABLE` answer (with `Retry-After: 1`) that every `/api/**` call gets until start-up, first-start seeding included, has finished, so a demo login is never refused as invalid while the users are still being loaded.
- Adding a line shows "Expense was added" or "Earning was added"; the legacy add popup showed no message. Edits keep the legacy "Your expense detail was successfully edited" and "Your earning detail was successfully edited".
- Dashboard charts with no data show "No expenses or earnings in the last 30 days", "No expenses to show" or "No earnings to show" where the legacy widgets showed an empty area. A dashboard whose figures fail to load keeps the error on the page with a "Retry" button, in addition to the error toast.
- The presentation is re-architected with MUI rather than ported widget by widget: no logo or icon font is embedded, "Expenses & Earnings per date" and "Earnings trends" are drawn with bars and progress rows rather than the legacy chart widgets, and "Filter by date range" is two date fields.
- Search fields are capped: "Search by title" on the report lists at 50 characters, the longest code or title, and the blog search at 500. Uncapped, a pasted query could exceed the server's 8 KB request-header limit, which the server answers with 401, signing the user out.

### Kept as is

No change was requested for AN-02, AN-04, AN-09, AN-12, AN-13 and AN-14, so they are kept. Among them:

- Month figures compare month numbers only and ignore the year; in January the last-month figure matches nothing and the change percentage is empty (AN-02).
- Saving a report as its owner (create, rename, submit) restamps its creation date, creator and submitter (AN-04).
- The 30-day chart includes lines of Draft reports, as `SQL1` has no status filter (AN-09).
- Statuses Draft and Submitted both have `Order` 2 (AN-12).
- "There are no expenses associated to the report" is also the message for earning reports (AN-13).

Legacy spelling is kept in identifiers and messages: `SubmitedBy`, `SubmitedOn`, the "Submited" filter, "This report cant be deleted", "Blog post successfuly published" and "this reports are not considered for statistics".

## Seed values inferred

`src/main/resources/seed/demo-data.json` is loaded on first start. Every value below is inferred, so that the screenshot figures add up, and is not taken from legacy. Everything else seeded is read from a screenshot (the README seed section names the file per row) or follows legacy: the demo logins and their roles come from `legacy/docs/upstream-README.md`; the owner is the creator, submitter and updater of every report and the creator and updater of every line, as legacy saves stamp them; and `IsActive` stays `FALSE`, the OutSystems default (AN-15). Amounts are EUR.

- **Reference date** `2024-05-23`, from "May 01 - May 31" and "April 01 - April 30" in `User_View_Dashboard.png` and "23 May 2024 15:18:38" in `User_View_New_Expense_Detail.png`.
- **Lines of John Smith's reports** whose rows show only a total:
  - `1/2024 EX`: 2024-03-01 Client lunch, Restaurant, 80.00; 2024-03-01 Team dinner, Restaurant, 50.00; 2024-03-02 Client visit mileage, Kilometers, 19.05 km = 7.0485. At 0.37 EUR/km no whole number of kilometres gives the 7.05 that both € 137,05 and € 3.412,95 need (19 km gives 7.03, 20 km gives 7.40).
  - `2/2024 EX`: 2024-03-04 Train tickets, Travel, 350.00; 2024-03-04 Airport transfer, Travel, 250.00.
  - `3/2024 EX`: 2024-03-08 Taxi, Other, 30.00; 2024-03-08 Parking, Other, 20.00.
  - `8/2024 EX`: 2024-03-27 Office supplies, Other, 80.00.
  - `1/2024 EA`: 2024-02-29 Monthly salary, Salary, 3000.00.
  - `2/2024 EA`: 2024-03-02 Dividends, Investment, 200.00.
  - `4/2024 EA`: 2024-03-08 Miscellaneous income, Other, 900.00.
  - `10/2024 EA`: 2024-03-29 Sales commission, Salary, 1000.00; the type Salary is inferred from the three-segment earnings donut.
- **`10/2024 EX` Home Office and `11/2024 EX` Hotel**: created 2024-04-10 and 2024-04-15, with no lines and a 0.00 total (the titles and Draft status are from `User_View_New_Report.png`).
- **Other users' reports**, all Submitted, each with one line titled as the report and dated the day before the report:
  - `4/2024 EX` Conference Registration, Michael Davis, 2024-03-12, Other, 120.00.
  - `5/2024 EX` Training Materials, Sarah Lee, 2024-03-16, Other, 75.00.
  - `5/2024 EA` Freelance Project, Michael Davis, 2024-03-14, Service, 400.00.
  - `6/2024 EA` Stock Dividends, Sarah Lee, 2024-03-18, Investment, 150.00.
  - `7/2024 EA` Monthly Salary, Michael Davis, 2024-03-25, Salary, 2500.00.
  - `8/2024 EA` Bonus Payment, Sarah Lee, 2024-03-29, Other, 300.00.
  - The single lines of `6/2024 EX` (Other, 200.00) and `7/2024 EX` (Other, 250.00); those report rows are from `Admin_View_Report_List.png`.
- **Usernames** `michael.davis` and `sarah.lee`, with random unusable passwords; they are not demo logins.
- **Default times**: reports are created at 09:00:00 (except `12/2024 EX`, 15:18:38 from the screenshot); every non-Draft report is submitted one day after creation; `8/2024 EX` and `9/2024 EX` are processed one day after submission; the last update is the latest of these.
- **Line defaults**: EUR, no invoice, no distance (except the 19.05 km line) and an empty description unless a screenshot shows one; each line takes its report's creation time as its own creation and last-update time. John Smith's line dates that no screenshot fixes avoid April and May, so only the Business Trip lines fall in last month and no Submitted or Approved line falls in the current month.
- **Line titles** not shown in any screenshot: all the titles listed above.
- **Figures hidden in the screenshots**, derived from the seed: the fourth "Expenses per type" row, Kilometers 7.05 (1 line) 0.55%; the status counts Draft 5 and Submitted 7.
- **Blog posts**, both by EM_Admin and never edited: "Welcome to Expenses Manager" (2024-03-16 10:00, "Record your expenses and earnings in reports, then submit them for approval.") and "Mileage reimbursement rate" (2024-03-20 10:00, "Kilometers expenses are reimbursed at 0.37 EUR per km.").

The seed then produces: a balance of 4700.00 earnings minus 1287.0485 expenses, both in Submitted or Approved reports, which is 3412.9515 and shown as € 3.412,95; Travel 900.00 (3 lines) 69.93%, Restaurant 330.00 (3) 25.64%, Other 50.00 (2) 3.88%; 17 non-Draft reports, 15 Submitted, 1 Approved, rate 5.88%.

## Mismatches against the screenshots

- **30-day chart.** `User_View_Dashboard.png` shows "Expenses & Earnings per date (last 30 days)" as an empty grey placeholder. The seeded Draft line Flight tickets (2024-05-21, 42.00) lies inside the 30 days before 2024-05-23, and legacy `SQL1` has no status filter (AN-09, kept), so the app's chart shows it. Why the capture is empty is unconfirmed; a capture taken before that line existed is one possibility.
- **Line amounts.** `User_View_Report_Details.png` shows the Flight tickets amount as "$42.00" beside a "€ 42,00" total (AN-16). The app shows "€ 42,00" in both places.
- **Hidden and truncated values.** In `User_View_New_Report.png` the New Report dialog covers the totals of `12/2024 EX` down to `8/2024 EX` and truncates two titles; the full titles "Business Trip Expenses" and "Office Supplies Purchase" and the totals of `9/2024 EX` and `8/2024 EX` are taken from `Admin_View_Report_List.png`, the `12/2024 EX` total from `User_View_Report_Details.png`, and the 0.00 totals of `10/2024 EX` and `11/2024 EX` are inferred. In `User_View_Dashboard.png` the fourth "Expenses per type" row and the Draft and Submitted status counts are scrolled out of view. These values come from the seed and are marked inferred above.
- **Report date versus line dates.** `Admin_View_Report_List.png` shows `9/2024 EX` created 1.04.2024 with lines dated 2 Apr 2024. The seed reproduces this as displayed; legacy restamps `CreatedOn` on every owner save (AN-04).
- **Percentage notation.** The app shows "69.93%" and "5.88%" as the screenshots do, not the brief's "69,93 %" and "5,88 %". The numbers are the same.
- **Screenshot caption.** `legacy/docs/upstream-README.md` captions "User View Report Details" but links `User_View_New_Expense_Detail.png`. The detail table follows `User_View_Report_Details.png` and the line dialog `User_View_New_Expense_Detail.png`.

## How to review

### Commands

Run from `java-react/` on macOS (Apple Silicon) with any JDK 25 or newer; no global Maven or Node is needed.

| Command | What it does |
|---|---|
| `./start.sh` | Checks for JDK 25+, refuses to start while port 8080 is taken, builds with `./mvnw -q package` (unit tests and Vitest, not the integration tests), prints `http://localhost:8080` and the demo logins, then runs `target/expenses-manager.jar` in the foreground |
| `./stop.sh` | Stops the process listening on port 8080 |
| `./mvnw verify` | The gate: `npm ci`, `tsc --noEmit`, `vite build`, `BusinessRulesTest`, Vitest, packaging, then `ScreenshotFiguresIT`, `RoleMatrixIT`, `EndToEndIT` and `ResponseTimeIT`. It exits non-zero on any type error, build failure or failing test |
| `./mvnw verify -Dit.test=ScreenshotFiguresIT` | The gate with only the named integration test |
| `cd frontend && PATH="../node:$PATH" npm test` | Vitest only, with the project-local Node that any Maven build installs |

### Demo logins

| Username | Password | Role | Lands on |
|---|---|---|---|
| `em_user1` | `123456` | User (John Smith) | `/dashboard` |
| `em_admin` | `123456` | Administrator (EM_Admin) | `/admin` |

The brief and the root `README.md` publish these accounts, so they also appear in `java-react/README.md` and the `start.sh` banner; that governs over `legacy/README.md:64`, which keeps them out of the legacy folder.

### Screenshot comparison

Sign in as each demo user and compare each screen with its file in `legacy/screenshots/`. The "App shows" column records what the running app displays; `ScreenshotFiguresIT` asserts the API figures behind these rows on every `./mvnw verify`, and `format.test.ts` asserts the euro and percentage formats.

| Screenshot | Figure | Legacy shows | App shows |
|---|---|---|---|
| `User_View_Dashboard.png` | Total Balance | € 3.412,95, "Your balance is ok" | € 3.412,95, "Your balance is ok" |
| `User_View_Dashboard.png` | Total Spent (current month) | € 0,00, "is 100.00% less of last month" | € 0,00, "is 100.00% less of last month" |
| `User_View_Dashboard.png` | Total Spent (last month) | € 500,00, "April 01 - April 30" | € 500,00, "April 01 - April 30" |
| `User_View_Dashboard.png` | Earnings (current month) | € 0,00, "May 01 - May 31" | € 0,00, "May 01 - May 31" |
| `User_View_Dashboard.png` | Expenses per type | Travel 69.93% € 900,00 Count: 3; Restaurant 25.64% € 330,00 Count: 3; Other 3.88% € 50,00 Count: 2 | Travel 69.93% € 900,00 Count: 3; Restaurant 25.64% € 330,00 Count: 3; Other 3.88% € 50,00 Count: 2; Kilometers 0.55% € 7,05 Count: 1 (the fourth row is scrolled out of view in the screenshot) |
| `User_View_Dashboard.png` | Report Status Summary | Approved 1, Declined 1 | Approved 1, Declined 1, Submitted 7, Draft 5 (Submitted and Draft are scrolled out of view in the screenshot) |
| `User_View_Dashboard.png` | Draft banner | "You have reports with Draft status, this reports are not considered for statistics" | "You have reports with Draft status, this reports are not considered for statistics" |
| `User_View_New_Report.png` | Expense rows of `em_user1` | `12/2024 EX` London Trip, `11/2024 EX` Hotel, `10/2024 EX` Home Office (Draft); `9/2024 EX` Approved; `8/2024 EX` Declined; `3/2024 EX` Transportation Expenses € 50,00, `2/2024 EX` Business Travel Expenses € 600,00, `1/2024 EX` Client Meetings Expenses € 137,05 (Submitted); "1 to 8 of 8 items" | `12/2024 EX` London Trip 23.05.2024 € 42,00, `11/2024 EX` Hotel 15.04.2024 € 0,00, `10/2024 EX` Home Office 10.04.2024 € 0,00 (Draft); `9/2024 EX` Business Trip Expenses 1.04.2024 € 500,00 Approved; `8/2024 EX` Office Supplies Purchase 28.03.2024 € 80,00 Declined; `3/2024 EX` Transportation Expenses 9.03.2024 € 50,00, `2/2024 EX` Business Travel Expenses 5.03.2024 € 600,00, `1/2024 EX` Client Meetings Expenses 2.03.2024 € 137,05 (Submitted); "1 to 8 of 8 items" (the totals the New Report dialog covers in the screenshot, and the two titles it truncates, are shown in full) |
| `User_View_Report_List.png` | Earning rows of `em_user1` | `10/2024 EA` Sales Commission 5.04.2024 € 1.000,00 Submitted down to `1/2024 EA` Salary Payments 1.03.2024 € 3.000,00 Submitted; "1 to 6 of 6 items" | `10/2024 EA` Sales Commission 5.04.2024 € 1.000,00 Submitted; `9/2024 EA` Consulting Fees 1.04.2024 € 500,00 Submitted; `4/2024 EA` Miscellaneous Income 9.03.2024 € 900,00 Draft; `3/2024 EA` Service Income 5.03.2024 € 0,00 Draft; `2/2024 EA` Investment Income 3.03.2024 € 200,00 Submitted; `1/2024 EA` Salary Payments 1.03.2024 € 3.000,00 Submitted; "1 to 6 of 6 items" |
| `User_View_Report_List.png` | Expanded `9/2024 EA` row | 28 Mar 2024, Consulting Service for Client A, Fee earned for providing consulting services to Client A., € 500,00, Service | 28 Mar 2024, Consulting Service for Client A, Fee earned for providing consulting services to Client A., € 500,00, Service |
| `Admin_View_Report_List.png` | Counters | Total Reports 17, Reports Waiting Verification 15, Approved Report Rate 5.88% | Total Reports 17, Reports Waiting Verification 15, Approved Report Rate 5.88% |
| `Admin_View_Report_List.png` | Expense rows | `9/2024 EX` John Smith Business Trip Expenses 1.04.2024 € 500,00 Approved; `8/2024 EX` John Smith Office Supplies Purchase 28.03.2024 € 80,00 Declined; `7/2024 EX` Michael Davis Household Expenses 1.04.2024 € 250,00 Submitted; `6/2024 EX` Sarah Lee Educational Expenses 23.03.2024 € 200,00 Submitted | `9/2024 EX` John Smith Business Trip Expenses 1.04.2024 € 500,00 Approved; `8/2024 EX` John Smith Office Supplies Purchase 28.03.2024 € 80,00 Declined; `7/2024 EX` Michael Davis Household Expenses 1.04.2024 € 250,00 Submitted; `6/2024 EX` Sarah Lee Educational Expenses 23.03.2024 € 200,00 Submitted; then `5/2024 EX` Sarah Lee Training Materials 16.03.2024 € 75,00 Submitted; "1 to 5 of 9 items" (Expenses, All filter, page 1; the fifth row and the footer lie below the screenshot's edge) |
| `Admin_View_Report_List.png` | Expanded `9/2024 EX` lines | 2 Apr 2024 Dining Expenses € 200,00 Restaurant; 2 Apr 2024 Hotel Accommodation € 300,00 Travel | 2 Apr 2024 Dining Expenses € 200,00 Restaurant; 2 Apr 2024 Hotel Accommodation € 300,00 Travel |
| `Admin_View_Report_Details.png` | Dining Expenses dialog | Date 2024-04-02, Expense Type Restaurant, Total € 200,00, "VAT (23%): € 46,00", "No invoice available" | Date 2024-04-02, Expense Type Restaurant, Total € 200,00, "VAT (23%): € 46,00", "No invoice available" |
| `User_View_New_Expense_Detail.png` | Report header | "12/2024 EX: London Trip", Draft, "Created by John Smith at 23 May 2024 15:18:38" | "12/2024 EX: London Trip", Draft, "Created by John Smith at 23 May 2024 15:18:38" |
| `User_View_New_Expense_Detail.png` | Line form for Flight tickets | Total € 42,00, "VAT (23%): € 9,66" | Total € 42,00, "VAT (23%): € 9,66" (the line's edit form, closed with Cancel) |
| `User_View_Report_Details.png` | Total Expenses | € 42,00 | € 42,00 |
| `User_View_Report_Details.png` | Line row | 21 May 2024, Flight tickets, Tickets for flight to London, $42.00, Travel (the app uses € 42,00, AN-16) | 21 May 2024, Flight tickets, Tickets for flight to London, € 42,00, Travel (€ 42,00 where the screenshot shows $42.00, AN-16) |

### Manual checks

From a clean checkout, in `java-react/`:

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | `./start.sh`, then open `http://localhost:8080` and sign in as `em_user1` | Builds, serves the app, lands on `/dashboard` | Passed. With no `target/`, `node/`, `frontend/node_modules/` or `data/`, it printed "Building...", built, printed the URL and both demo logins, and served the app 61 s after launch: `GET /` and `GET /dashboard` returned 200 with `index.html`, and the process on port 8080 was the script itself. The `em_user1` login returned `landingRoute` `/dashboard`; in Chrome, against the same build on another port, it landed on `/dashboard` |
| 2 | `./start.sh` in a second terminal while the app runs | Prints "Run ./stop.sh first." and exits 1 | Passed. Printed "Run ./stop.sh first." and exited 1 |
| 3 | `./stop.sh` | Prints "Stopped." and frees port 8080 | Passed. Printed "Stopped." and exited 0; nothing listened on port 8080 afterwards and the first `./start.sh` ended |
| 4 | `./stop.sh` again | Prints "Nothing listening on port 8080." and exits 0 | Passed. Printed "Nothing listening on port 8080." and exited 0 |
| 5 | Create a report, stop, `./start.sh` again | The new report is still listed and the seeded reports are not duplicated | Passed. Before check 3, `em_user1` created `1/2026 EX` "Manual check restart" (201), and the expense list held 9 reports. After the restart it still held `1/2026 EX` and the 8 seeded codes, each once, the earning list still held its 6, and the app did not seed again |
| 6 | Screenshot comparison above | Every "App shows" cell matches its legacy value, apart from the mismatches listed | Passed. Every cell matches its legacy value apart from the listed mismatches: the line row shows € 42,00 (AN-16), and the app shows the values the screenshots hide (the fourth "Expenses per type" row, the Draft and Submitted counts, what the New Report dialog covers). The admin list also shows its fifth row and pager, which lie below the edge of `Admin_View_Report_List.png` |

Checks 1 to 5 ran with JDK 25.0.5.1 on a Linux host, inside a private network namespace so that port 8080 was free, with `curl` as the client. The new report's code takes the year of the host clock. Check 6 used Chrome at 1440x900 against the same build on a fresh `data/`.

### Startup time

Build first (`./mvnw -q package`) and record the build time separately. Stop the app, delete `java-react/data/` so seeding runs, note the time, launch `java -jar target/expenses-manager.jar`, and poll until a login as `em_user1` followed by `GET /api/reports?kind=expense` returns the 8 seeded rows. The Spring Boot "Started" log line is not used, because it excludes JVM start and precedes the seed loader. The target is under 30 s.

| Measurement | Result |
|---|---|
| Seconds from jar launch to the 8 seeded rows | 6.8 s, the median of three launches on a fresh `data/` (7.1 s, 6.3 s and 6.8 s), polling every 0.2 s; on a shared 12-core Linux host with a 1-minute load average of 8.9 to 9.5; under the 30 s target |
| Build time (`./mvnw -q package`) | 61 s from a clean checkout (no `target/`, `node/` or `frontend/node_modules/`) with the Maven and npm caches already filled, on the same host at a 1-minute load average of 10.4 to 10.8; exit 0 with `BusinessRulesTest` and Vitest passing, no compiler or type-check errors |

`ResponseTimeIT` also asserts, on every `./mvnw verify`, a start with seeding under 30 s on a fresh H2 file, and a 95th percentile (the 48th of 50 sorted calls, after 5 warm-up calls) under 300 ms for `GET /api/reports?kind=expense` and `kind=earning` as `em_user1` and as `em_admin`, `GET /api/dashboard/user` and `GET /api/dashboard/admin`.

### Success criteria

| # | Criterion | Proven by | Command |
|---|---|---|---|
| 1 | The seeded app reproduces the screenshots | `ScreenshotFiguresIT`, `frontend/src/format/format.test.ts`, the comparison table above | `./mvnw verify` |
| 2 | Authorization over the full role matrix | `RoleMatrixIT`, `frontend/src/test/routeGuards.test.tsx` | `./mvnw verify` |
| 3 | Business rules | `BusinessRulesTest` | `./mvnw test` |
| 4 | End to end: create, add a line, upload and download an invoice, submit, approve, log out and in again | `EndToEndIT` | `./mvnw verify` |
| 5 | One command to build and run; data survives a restart | Manual checks 1 to 5, and the restart on the same H2 file in `EndToEndIT` | `./start.sh`, `./stop.sh`, `./mvnw verify` |
| 6 | Theme from massmutual.com tokens | `frontend/src/test/noHardCodedColours.test.ts`, the token table above | `./mvnw test` |
| 7 | Every screen reachable | `frontend/src/test/routeRender.test.tsx` | `./mvnw test` |
| 8 | Performance | `ResponseTimeIT`, the startup time above | `./mvnw verify` |

Test sources: `src/test/java/com/massmutual/expensesmanager/` for the backend suites and `frontend/src/` for Vitest.
