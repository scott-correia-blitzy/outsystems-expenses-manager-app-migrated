# Expenses Manager V2: Spring Boot and React

A rebuild of the OutSystems 11 application Expenses Manager V2 (Frontend module `ExpensesManagerV2`, Core module `ExpensesManagerV2_Core`) as a Spring Boot 3.5 REST backend and a React 19 single-page app built with MUI 7. One process serves both from a single jar on port 8080 and keeps its data in an embedded H2 file. The inputs are the extracted model, derived schema and screenshots in [`../legacy/`](../legacy/), which this project only reads; the original application is the Expenses Management Platform by joaocba (`joaocba/outsystems_expenses-manager-app`).

## Features

- **User dashboard**: total balance, current and last month spend with the month comparison, current month earnings, expenses and earnings per date over the last 30 days, expenses per type, earnings trends, report status summary, and a notice when Draft reports exist.
- **Report list**: expenses or earnings, status filter, date range, search by title, and expandable rows showing each report's lines.
- **Report details**: add, edit, view and delete lines; upload and download one invoice per line; submit or delete a Draft report.
- **Administrator dashboard**: total reports, reports waiting verification and approved rate; approve or decline from the list or from the detail page.
- **Blog**: every signed-in user reads it; administrators create and edit posts.
- **Tools**: USD to EUR converter and mileage reimbursement calculator.

Stored euro amounts, totals, VAT and every dashboard figure are computed on the server; the browser only formats them, apart from a live total and VAT preview in the line form. Users are provisioned by the seed; there is no self-registration.

## Run

```
cd java-react
./start.sh
```

`start.sh` does four things:

1. Finds a JDK 25 or newer (`$JAVA_HOME/bin/java` when `JAVA_HOME` is set, otherwise `java` on `PATH`; a JRE alone is not enough) and exits with "Java 25 or newer is required. Install a JDK 25+ (any arm64 build on Apple Silicon)." when there is none.
2. Needs `lsof` for the port check and exits with "lsof is required to check whether port 8080 is free." when it is missing. Exits with "Run ./stop.sh first." when something already listens on port 8080.
3. Builds with `./mvnw -q package`, which runs the backend unit tests and the Vitest suite (not the integration tests). Because `-q` hides the npm, TypeScript and Vitest output, a failed build exits 1 with "Build failed. Run ./mvnw package to see the full output." and nothing is started.
4. Prints the URL and the demo logins, then runs `target/expenses-manager.jar` in the foreground.

Open <http://localhost:8080>. The first build downloads Maven 3.9.16, Node v24.22.3 and the Maven and npm dependencies; later builds reuse them. The running app makes no outbound network calls.

## Stop

Press Ctrl+C in the terminal running the app, or run this from another terminal:

```
cd java-react
./stop.sh
```

It stops the process listening on port 8080 and prints "Stopped.", or prints "Nothing listening on port 8080." when nothing is running. When the port is still in use about 5 seconds after the stop signal, it names the process and exits 1, for example with "Port 8080 is still in use by PID 4242." It needs `lsof` to find the app and exits 1 with "lsof is required to find the app on port 8080." when `lsof` is missing. Neither script takes arguments: `-h` or `--help` prints a usage line, and any other argument prints "Unknown argument:" with that argument and the usage line, then exits 2.

## Port

8080 only, set by `server.port` in `src/main/resources/application.properties`.

## Demo logins

| Username | Password | Name | Role | Lands on |
|---|---|---|---|---|
| `em_user1` | `123456` | John Smith | User | `/dashboard` |
| `em_admin` | `123456` | EM_Admin | Administrator | `/admin` |

`michael.davis` (Michael Davis) and `sarah.lee` (Sarah Lee) own the other users' seeded reports. Their passwords are random and unusable, so they are not demo logins.

After login an Administrator lands on `/admin`, a User on `/dashboard`, and anyone else on `/blog`. An Approver therefore lands on the Blog, where legacy sent them to the User dashboard their role cannot open (AN-03, an intentional change).

## Versions

| Component | Version | Notes |
|---|---|---|
| JDK | 25 or newer | `maven.compiler.release` 25; any arm64 build on Apple Silicon. `JAVA_HOME` is optional: `start.sh` exports it for the JDK it found, so the wrapper builds with the same one |
| Maven | 3.9.16 | Through `./mvnw` (Maven Wrapper 3.3.4, only-script type); no global Maven needed |
| Node and npm | Node v24.22.3 with its bundled npm 11.19.1 | Installed by `frontend-maven-plugin` 1.15.4 into `java-react/node/` (git-ignored); no global Node needed |
| Backend | Spring Boot 3.5.16 | Spring Security 6.5.11, Hibernate 6.6.53.Final and H2 2.3.232, all from the Boot BOM |
| Frontend | React 19.3.1, `@mui/material` 7.3.11, `react-router` 7.18.6, Vite 7.3.8, TypeScript 5.9.3, Vitest 3.2.7 | Exact pins in `frontend/package.json`, resolved by the committed `frontend/package-lock.json` |

`@testing-library/jest-dom` is pinned to 6.9.1 rather than 6.10.0: 6.10.0, the newest 6.x, is deprecated by its publisher as a minor release with breaking changes, and the publisher names 6.9.1 as the 6.x release to use.

`tinypool`, Vitest 3.2.7's worker pool, is forced to 2.1.2 through `overrides` in `frontend/package.json`, because Vitest 3.2.7 would otherwise resolve 1.1.1, which is affected by CVE-2026-104848 and CVE-2026-104849; 2.1.2 is the first patched release and needs no Vitest change.

## Data

The database is the H2 file `java-react/data/expenses.mv.db` (`jdbc:h2:file:./data/expenses`, relative to the working directory, which `start.sh` sets to `java-react/`). It is created and seeded on first start. A restart keeps the data and does not seed again: seeding runs only while both report tables are empty. `schema.sql` (`CREATE ... IF NOT EXISTS`) and `data.sql` (the 14 Static Entity rows, as `MERGE`) run on every start and are safe to repeat. The H2 console is disabled and the database has no credentials.

To reset the data, stop the app, delete `java-react/data/`, and start again.

## Configuration

All configuration is committed in `src/main/resources/application.properties`; no environment variables or secrets are needed. The application's own keys:

| Key | Value | Meaning |
|---|---|---|
| `expenses.mileage-reimbursement` | `0.37` | EUR per kilometre for Kilometers expenses (legacy Site Property `MileageReimbursement`) |
| `expenses.dollars-to-euros` | `0.93` | USD to EUR rate for Dollar lines and the converter's default (legacy `Dollars2Euros` default) |
| `expenses.vat-rate` | `0.23` | VAT shown beside line totals, display only (legacy "VAT (23%)" label) |
| `expenses.dashboard.reference-date` | `2024-05-23` | Date the month and 30-day dashboard figures are computed from; blank means today |
| `expenses.remember-me-days` | `30` | Session lifetime when "Remember me" is ticked |
| `expenses.seed.enabled` | `true` | Seeds the demo data on first start |

The two rates must be positive and below 1000 with at most 8 decimals, and the reference date, when set, must lie between 0001-01-01 and 9999-12-31; any other value stops startup with an error naming the key.

The SPA reads the three rates from `GET /api/reference` for its live previews; the server recomputes every stored amount.

## Tests

Run from `java-react/`:

| Command | Runs |
|---|---|
| `./mvnw verify` | The gate: frontend type-check and build, `BusinessRulesTest`, Vitest, packaging, then the integration suites `ScreenshotFiguresIT`, `RoleMatrixIT`, `EndToEndIT` and `ResponseTimeIT`. It fails on any type error, build failure or failing test |
| `./mvnw test` | Frontend build, `BusinessRulesTest` and Vitest |
| `./mvnw verify -Dit.test=ScreenshotFiguresIT` | The gate with only the named integration test |
| `cd frontend && PATH="../node:$PATH" npm test` | Vitest only, with the project-local Node, which exists after any Maven build |

What the suites prove:

- `BusinessRulesTest`: report codes, submit, decision and delete rules, amount calculation, validation boundaries.
- `ScreenshotFiguresIT`: the seeded figures and report rows match `../legacy/screenshots/`.
- `RoleMatrixIT`: every endpoint for anonymous, User, Approver and Administrator callers. Mixed-role callers get targeted checks: User plus Administrator cannot write another user's Draft but can read it and decide a Submitted report, and User plus Administrator and User plus Approver list the reports their combined roles allow.
- `EndToEndIT`: create, add a line, upload and download an invoice, submit, approve, log out and in again, and restart on the same data.
- `ResponseTimeIT`: start with seeding under 30 s, and a 95th percentile under 300 ms for the list and dashboard calls.
- Vitest: formatters, all 14 routes rendered and guarded per role, the report, line, decision, browsing, dashboard, preview, tool and blog workflows against a mocked API, and a scan that rejects colour literals outside `frontend/src/theme/theme.ts`.

The integration tests start the app on a random port with a private H2 file in a temporary directory; none needs a running server.

## Seed data

Every seeded value is read from a screenshot in `../legacy/screenshots/` (named in the Source column), inferred so that the screenshot figures add up (marked inferred), or follows legacy: the demo logins and their roles come from `../legacy/docs/upstream-README.md`; the owner is the creator, submitter and updater of every report and the creator and updater of every line, as legacy saves stamp them; and `IsActive` stays `FALSE`, the OutSystems default (AN-15). Amounts are EUR.

**Reference date.** `expenses.dashboard.reference-date=2024-05-23`, because `User_View_Dashboard.png` shows "May 01 - May 31" as the current month and "April 01 - April 30" as last month, and `User_View_New_Expense_Detail.png` shows `12/2024 EX` created at 23 May 2024 15:18:38. It drives only the current and last month spend, the change percentage, current month earnings and the 30-day chart. New report codes use the real system year.

### John Smith's expense reports (`em_user1`)

| Code | Title | Status | Created | Lines (date, title, type, amount) | Total | Source |
|---|---|---|---|---|---|---|
| 1/2024 EX | Client Meetings Expenses | Submitted | 2024-03-02 | 2024-03-01 Client lunch, Restaurant, 80.00; 2024-03-01 Team dinner, Restaurant, 50.00; 2024-03-02 Client visit mileage, Kilometers, 19.05 km = 7.0485 | 137.05 | Row: `User_View_New_Report.png`; lines inferred |
| 2/2024 EX | Business Travel Expenses | Submitted | 2024-03-05 | 2024-03-04 Train tickets, Travel, 350.00; 2024-03-04 Airport transfer, Travel, 250.00 | 600.00 | Row: `User_View_New_Report.png`; lines inferred |
| 3/2024 EX | Transportation Expenses | Submitted | 2024-03-09 | 2024-03-08 Taxi, Other, 30.00; 2024-03-08 Parking, Other, 20.00 | 50.00 | Row: `User_View_New_Report.png`; lines inferred |
| 8/2024 EX | Office Supplies Purchase | Declined | 2024-03-28 | 2024-03-27 Office supplies, Other, 80.00 | 80.00 | Row: `Admin_View_Report_List.png`; line inferred |
| 9/2024 EX | Business Trip Expenses | Approved | 2024-04-01 | 2024-04-02 Dining Expenses ("Meals during the business trip."), Restaurant, 200.00, no invoice; 2024-04-02 Hotel Accommodation ("Stay at a business hotel during a trip."), Travel, 300.00 | 500.00 | `Admin_View_Report_List.png`, `Admin_View_Report_Details.png` |
| 10/2024 EX | Home Office | Draft | 2024-04-10 (inferred) | none (inferred) | 0.00 (inferred) | Title: `User_View_New_Report.png` |
| 11/2024 EX | Hotel | Draft | 2024-04-15 (inferred) | none (inferred) | 0.00 (inferred) | Title: `User_View_New_Report.png` |
| 12/2024 EX | London Trip | Draft | 2024-05-23 15:18:38 | 2024-05-21 Flight tickets ("Tickets for flight to London"), Travel, 42.00, no invoice | 42.00 | `User_View_New_Expense_Detail.png`, `User_View_Report_Details.png` |

### John Smith's earning reports (`em_user1`)

| Code | Title | Status | Created | Lines (date, title, type, amount) | Total | Source |
|---|---|---|---|---|---|---|
| 1/2024 EA | Salary Payments | Submitted | 2024-03-01 | 2024-02-29 Monthly salary, Salary, 3000.00 | 3000.00 | Row: `User_View_Report_List.png`; line inferred |
| 2/2024 EA | Investment Income | Submitted | 2024-03-03 | 2024-03-02 Dividends, Investment, 200.00 | 200.00 | Row: `User_View_Report_List.png`; line inferred |
| 3/2024 EA | Service Income | Draft | 2024-03-05 | none | 0.00 | Row: `User_View_Report_List.png` |
| 4/2024 EA | Miscellaneous Income | Draft | 2024-03-09 | 2024-03-08 Miscellaneous income, Other, 900.00 | 900.00 | Row: `User_View_Report_List.png`; line inferred |
| 9/2024 EA | Consulting Fees | Submitted | 2024-04-01 | 2024-03-28 Consulting Service for Client A ("Fee earned for providing consulting services to Client A."), Service, 500.00 | 500.00 | `User_View_Report_List.png` (expanded row) |
| 10/2024 EA | Sales Commission | Submitted | 2024-04-05 | 2024-03-29 Sales commission, Salary, 1000.00 | 1000.00 | Row: `User_View_Report_List.png`; line inferred, type Salary inferred from the three-segment earnings donut |

### Other users' reports

All Submitted, each with one line titled as the report and dated the day before the report was created (inferred). The usernames `michael.davis` and `sarah.lee` are inferred.

| Code | Owner | Title | Created | Line type, amount | Source |
|---|---|---|---|---|---|
| 4/2024 EX | Michael Davis | Conference Registration | 2024-03-12 | Other, 120.00 | inferred |
| 5/2024 EX | Sarah Lee | Training Materials | 2024-03-16 | Other, 75.00 | inferred |
| 6/2024 EX | Sarah Lee | Educational Expenses | 2024-03-23 | Other, 200.00 | Row: `Admin_View_Report_List.png`; line inferred |
| 7/2024 EX | Michael Davis | Household Expenses | 2024-04-01 | Other, 250.00 | Row: `Admin_View_Report_List.png`; line inferred |
| 5/2024 EA | Michael Davis | Freelance Project | 2024-03-14 | Service, 400.00 | inferred |
| 6/2024 EA | Sarah Lee | Stock Dividends | 2024-03-18 | Investment, 150.00 | inferred |
| 7/2024 EA | Michael Davis | Monthly Salary | 2024-03-25 | Salary, 2500.00 | inferred |
| 8/2024 EA | Sarah Lee | Bonus Payment | 2024-03-29 | Other, 300.00 | inferred |

### Defaults (inferred)

- Reports are created at 09:00:00, except `12/2024 EX` (15:18:38).
- Every non-Draft report was submitted one day after creation; `8/2024 EX` and `9/2024 EX` were processed one day after submission; the last update is the latest of these.
- Lines are in EUR with no invoice, no distance (except the 19.05 km line) and an empty description unless one is shown above.
- Each line takes its report's creation time as its own creation and last-update time.
- John Smith's line dates that no screenshot fixes avoid April and May, so only the Business Trip lines fall in last month and no Submitted or Approved line falls in the current month.
- `9/2024 EX` keeps the creation date 1.04.2024 shown in `Admin_View_Report_List.png`, although its lines are dated 2 Apr 2024.

### Blog posts (inferred)

Two active posts by EM_Admin, never edited:

- "Welcome to Expenses Manager", 2024-03-16 10:00: "Record your expenses and earnings in reports, then submit them for approval."
- "Mileage reimbursement rate", 2024-03-20 10:00: "Kilometers expenses are reimbursed at 0.37 EUR per km."

### Figures the seed produces

| Figure | Value | Source |
|---|---|---|
| Total balance | € 3.412,95 | `User_View_Dashboard.png` |
| Expenses per type | Travel 900.00 (3 lines) 69.93%, Restaurant 330.00 (3) 25.64%, Other 50.00 (2) 3.88% | `User_View_Dashboard.png` |
| Fourth expenses per type row | Kilometers 7.05 (1) 0.55% | inferred (hidden in the screenshot) |
| Total spent | € 0,00 current month ("is 100.00% less of last month"), € 500,00 last month (April 01 - April 30) | `User_View_Dashboard.png` |
| Earnings (current month) | € 0,00 (May 01 - May 31) | `User_View_Dashboard.png` |
| Report status summary | Approved 1, Declined 1 | `User_View_Dashboard.png` |
| Report status summary | Draft 5, Submitted 7 | inferred (scrolled out of view) |
| Administrator dashboard | 17 total, 15 waiting, 5.88% approved | `Admin_View_Report_List.png` |

The balance counts only Submitted and Approved reports: earnings 3000.00 + 200.00 + 500.00 + 1000.00 = 4700.00, minus expenses 137.0485 + 600.00 + 50.00 + 500.00 = 1287.0485, gives 3412.9515, shown as € 3.412,95.

**Why 19.05 km.** At 0.37 EUR/km no whole number of kilometres gives the 7.05 needed for both the € 137,05 report total and the € 3.412,95 balance (19 km gives 7.03, 20 km gives 7.40). 19.05 km gives 7.0485, which rounds to both.

## Known behaviours

Kept from legacy:

- A decided report can be decided again: the decision does not check the current status (AN-06).
- Month figures compare month numbers only and ignore the year. In January the last-month figure matches nothing and the change percentage is empty (AN-02).
- The 30-day chart includes lines of Draft reports (AN-09).
- Saving a report as its owner (create, rename, submit) restamps its creation date and creator (AN-04).
- Status Draft and Submitted both have `Order` 2 (AN-12), and the "There are no expenses associated to the report" message is also used for earning reports (AN-13).
- Legacy spellings are kept in column names (`SubmitedBy`, `SubmitedOn`), the "Submited" filter and messages such as "This report cant be deleted" and "Blog post successfuly published".

Behaviour of this build:

- Sessions are held in memory, so a server restart signs everyone out. The idle timeout is 20 minutes; "Remember me" keeps the session for 30 days.
- Until start-up, first-start seeding included, has finished, every `/api/**` call answers 503 with "The application is starting, please try again in a moment."; the pages themselves are already served.
- `expenses.dashboard.reference-date` fixes the date-relative dashboard figures to the seeded data. Clear its value to use the current date.
- New report codes use the real year, so the first report created in a year other than 2024 is `1/<year> EX` or `1/<year> EA`.
- Invoices are PDF, PNG or JPEG files up to 5 MB with a file name of at most 50 characters; a new upload replaces the line's invoice.
- The API lets an Approver list their own reports plus every Submitted report, but no screen shows that list, because the legacy role matrix gives Approver no report screen. Only an Administrator can approve or decline.

## Optional dev mode

With the backend already running on port 8080:

```
cd java-react/frontend
PATH="../node:$PATH" npm run dev
```

This serves the SPA with hot reload on <http://localhost:5173> and proxies `/api` to `http://localhost:8080`. It is not needed for the demo.

## Project layout

```
java-react/
  pom.xml, mvnw, .mvn/         Maven build and wrapper
  start.sh, stop.sh            run scripts
  src/main/java/com/massmutual/expensesmanager/
    domain/                    JPA entities, roles, report kinds, static ids
    repository/                Spring Data repositories and query projections
    service/                   business rules, access policy, seed loader
    web/                       REST controllers, security, SPA serving, error body
  src/main/resources/          application.properties, schema.sql, data.sql, seed/demo-data.json
  src/test/java/               BusinessRulesTest and the *IT suites
  frontend/src/                React SPA: pages, components, routes, API client, formatters
  frontend/src/theme/theme.ts  every colour, font, radius and spacing token
```

[`PR_DESCRIPTION.md`](PR_DESCRIPTION.md) lists the intentional changes from legacy, the mismatches against the screenshots, the theme token sources and the inferred seed values in full.
