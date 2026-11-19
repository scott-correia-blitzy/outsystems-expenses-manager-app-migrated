# Expenses Manager, migrated to .NET

A runnable demo prop for the MassMutual onsite. This is the OutSystems Expenses Manager
rebuilt as an ASP.NET Core app, from the XML extracted out of the binary .oml modules.

The legacy input it was built from is in [../legacy/](../legacy/). The two sit together for
readability, but this directory is excluded from Blitzy ingestion by `../.blitzyignore`.
Hand-written .NET read alongside the legacy XML would be the answer key, and would muddy
what the demo is meant to prove.

## Run it

```
./start.sh
```

Then open <http://localhost:5280>. Stop with `./stop.sh` or Ctrl+C.

Sign in with either account:

| Username | Password | Role |
|---|---|---|
| `em_user1` | `123456` | User |
| `em_admin` | `123456` | Administrator, Approver |

Those are the two accounts from the original project's README. Here they are sample
credentials against a local SQLite file with sample data, nothing more.

## What to show

- **Dashboard** reproduces the original screenshot's numbers exactly: balance 3,412.95,
  April spend 500.00, and the expenses-per-type split of 69.93 / 25.64 / 3.88 percent.
  Compare it side by side with [../legacy/screenshots/User_View_Dashboard.png](../legacy/screenshots/User_View_Dashboard.png).
- **Reports** matches `../legacy/screenshots/User_View_Report_List.png` row for row, including the
  report codes, totals and statuses. The Expenses and Earnings tabs and the status filters
  work.
- **Admin** is role restricted. Signed in as `em_user1`, clicking it redirects to
  Invalid Permissions, which is how the original app behaved. The nav link only appears
  for an admin.
- **Migration** is not part of the original app. It shows the one hand-written SQL node
  in its original SQL Server form next to the SQLite version running here, the full
  element mapping, and what does and does not count as evidence that the extraction was
  faithful.

## What this does and does not prove

It does **not** prove the OML to XML extraction was faithful. This app was written from the
extracted XML, so anything the extraction silently dropped would simply be absent here and
the app would still run fine. That is circular.

What it does show:

- The extracted XML is complete enough to rebuild working behaviour from.
- The data model holds together: 11 entities, typed columns, keys, 22 indexes, and the
  Static Entity records, all executing against a real database.
- The hand-written SQL node reassembles out of its XML fragments into valid SQL.

The real corroboration is independent of this app: the Static Entity labels
(Travel, Restaurant, Other, Kilometers; Draft, Submitted, Approved, Declined) and the
`GenerateReportCode` action came out of the binary module before any screenshot was
consulted, and they match what the screenshots show.

## Shortcuts taken

- **SQLite, not SQL Server.** SQL Server does not run natively on Apple Silicon. The
  dialect differences are called out in `Services/ReportingService.cs`.
- **Dates are pinned to 15 May 2024** (`Data/Seed.cs`), which is when the original
  screenshots were taken, so the dashboard reproduces their figures. Set `Seed.AsOf` to
  `DateTime.Today` to run against live dates.
- **Sample data, not real data.** The original environment is gone, so no row-level data
  was recoverable. The figures were reconstructed to land on the screenshot totals.
- **Read-only.** Creating, editing, submitting and approving reports, and invoice upload
  and download, are not implemented. Those actions all exist in the extracted module
  (`ExpenseReport_Submit`, `ProcessExpenseReport`, `ExpenseUploadInvoice` and others).
- **Fixed account list** instead of a real identity provider.

## Known advisory

The build reports a high severity advisory against `SQLitePCLRaw.lib.e_sqlite3` 2.1.11
([GHSA-2m69-gcr7-jv3q](https://github.com/advisories/GHSA-2m69-gcr7-jv3q)). It is a
transitive dependency: this project pins `Microsoft.EntityFrameworkCore.Sqlite` 10.0.0,
which resolves that version of the native SQLite library.

It is left as-is deliberately. This is a local demo that binds to localhost, ships no
real data, and accepts no untrusted input, so the advisory has no reachable attack
surface here. Anyone lifting this code toward anything real should pin a patched version
of the native library first.

## One real migration finding

Both unique indexes in the source module are named `UniqueIndex_ReportCode`, one on
`ExpenseReport` and one on `EarningReport`. SQL Server scopes index names per table, so
that is legal there. SQLite and PostgreSQL scope them per database, so the second
`CREATE INDEX` fails outright. The app crashed on startup until the names were prefixed.

This is the kind of defect that only surfaces when a migrated schema is actually executed,
which is a reasonable thing to say out loud at the onsite.

## Layout

```
Data/Entities.cs          entity model, Static Entities as enums with fixed Ids
Data/AppDbContext.cs      EF Core mapping, indexes, Static Entity seed data
Data/Seed.cs              sample transaction data
Services/ReportingService.cs   the Aggregates and the SQL node
Pages/                    one Razor Page per migrated screen
```

Every file names the OutSystems element it came from.
