# Extraction Notes

How the XML in `legacy-oml-xml/` was produced, and what to trust in it.

## Method used

The modules were converted locally on macOS, with no OutSystems environment involved.

Tool: [oml-utilities](https://github.com/silviogarbes/oml-utilities) (MIT licensed), commit `eaba43e`, February 2023.

It works by loading OutSystems' own model-reading assemblies, which the repository bundles as DLLs, and dumping each named XML fragment of the .oml into a single `<OML>` document. An .oml file is a header plus a set of compressed binary XML fragments, so this reads the real model rather than inferring it.

### Steps

1. Installed the .NET SDK 10 to a user directory.
2. Cloned oml-utilities and retargeted it from .NET Core 3.1 (end of life) to .NET 10. No other source changes.
3. Built and ran it against copies of the .oml files:

```
oml manipulate <copy-of-module>.oml <output>.xml --format xml
```

4. Copied the output into `legacy-oml-xml/`.

The originals in `project_files/` were never opened for writing. Their SHA-256 checksums were verified as unchanged after the run:

```
fa1e317e15354e67d18fad15af46e3610bcbf579baf786e87962473dc756ef29  OML/core.oml
9f04d87159bb2551515a89a824205c96fbdab0a70ac67f5047b42c2805aebd92  OML/frontend.oml
0fe0e6a61c2771a61f965b76c1947f54232f75aa28bb0de42d6b3a762eb8efda  OAP/app.oap
```

## Version note

The modules were saved by Service Studio 11.54.53. The newest platform version oml-utilities claims to support is 11.53.25. The export ran without error and the output parses and reads correctly, but this is a one-minor-version gap outside the tool's stated support. If anything downstream looks wrong, this is the first thing to suspect.

The tool also sets the `Version` header to 11.53.25.0 in its in-memory model. That affects only the export, not the source files.

## Checklist results

| Item | Status | Notes |
|---|---|---|
| Screens and input parameters | Present | 14 screens in Frontend. 7 carry input parameters, for example `User_ExpenseReportDetail` takes `ExpenseReportId`, `ExpenseId`, `SortBy`. |
| Server actions | Present | 21 in Frontend, for example `ExpenseReport_Submit`, `ProcessExpenseReport`, `GenerateReportCode`. |
| Client actions | Present | 144 client action flows, for example `DeleteExpenseReportOnClick`, `CheckIsApproverOrAdmin`. |
| Call relationships | Present, by reference | Each `Nodes.ExecuteAction` carries an `Action="..."` path to its target. Targets resolve by key to names such as `DoLogout` and `ProcessExpenseReport`. |
| Entities and attributes | Present | 11 entities and 88 attributes in Core, with indexes and generated CRUD actions. |
| Static Entity records | Present | Values are in the XML, for example `Status` as Draft, Submitted, Approved, Declined, and `ExpenseType` as Other, Restaurant, Kilometers, Travel. |
| Aggregates | Present | 40 screen data sets in Frontend, for example `GetExpensesCurrentMonthSum`, `GetEarningsTypeAndCount`. |
| SQL nodes | Present, fragmented | See the caveat below. |
| Role restrictions | Present, by reference | Roles resolve to Anonymous, Registered, Administrator, Approver, User. Restrictions appear as `RoleException` and `RoleReference` elements carrying role keys. |
| Site Properties | Present, with values | `TenantId` and `TenantName` in Core; those plus `MileageReimbursement` in Frontend, whose default value of 0.37 EUR per kilometre is in the XML. `TenantId` and `TenantName` are platform-managed read-only properties and carry no value in the module. |
| Timers | None defined | The `Timers` fragment exists but is empty in both modules. This looks like a property of the app, not a gap in the export. |

## Caveats to know before relying on this

**SQL is stored as fragments, not as a single string.** A SQL node holds a `ParsedSQLExpression` built from many `Text` and `Unbound` elements, with `<Entity Ref="..."/>` and `<Parameter Ref="..."/>` in place of table and parameter names. Reassembling the fragments in order does yield valid T-SQL, and the entity and parameter references resolve by key. Anything reading the XML has to do that reassembly. Reading a single text value will come back empty.

**Relationships are by key, not by nesting.** Logic nodes do not sit inside their screen or action in the XML tree. They live in separate top-level fragments named `NodesNotShownInESpaceTree#<key>` and `Widgets#<key>`, where the fragment name carries the owner's key. The graph is complete, but reconstructing "which action belongs to which screen" means resolving keys across fragments rather than walking the tree. Expect to write a resolver, and expect a tool that only walks the tree to understand the app as a flat pile of nodes.

**One SQL node is a stub.** The Frontend has two nodes named `SQL1`. One is a complete 630-character union query over Expense and Earning. The other contains only `SELECT`, with an empty output structure. This looks like an unfinished node left in the original app rather than a failed export, but that has not been confirmed against the app in Service Studio.

**Widget-level detail is verbose.** `ExpensesManager_Frontend.xml` is 17.3 MB and about 156,000 elements, much of it UI layout and styling. The logic and data model are a small fraction of the file. Blitzy has no size limit, so the file goes in whole.

**Licensing.** oml-utilities is MIT, but the OutSystems DLLs it bundles are proprietary and carry no license text in the repository. This is worth checking with OutSystems before presenting local extraction as a repeatable pipeline for client work.

## Derived database files

`legacy-db/schema.sql` and `legacy-db/static-entities.csv` were generated by parsing the entity model out of `ExpensesManager_Core.xml`. They are derived, not exported from a platform environment, and the header of `schema.sql` lists the ways it differs from the real OutSystems physical schema. The most important one: physical table names are `OSUSR_<hash>_<Entity>`, and that hash is assigned at publish time, so it cannot be recovered from a module file.

What they contain: 11 tables with typed columns, primary keys, 8 foreign keys, 22 indexes including the two unique report-code indexes, and INSERT statements seeding the 14 Static Entity records.

Validation: the DDL and seed statements were run through SQLite (with dialect substitutions for `NVARCHAR`, `DATETIME2` and `VARBINARY`) to confirm they parse, all 11 tables create, every seed row inserts, and `PRAGMA foreign_key_check` is clean. That proves the structure is sound. It does not prove the types match what OutSystems actually created, which only a real platform export would settle.

One quirk is reproduced rather than corrected: `Status.Draft` and `Status.Submitted` both carry `Order = 2` in the source app.

## Not verified

- Whether the export is complete. No element count was compared against the app open in Service Studio, so a silently dropped fragment would not have been noticed.
- Whether the 11.53 reader misreads anything added in 11.54.
- Whether the .oap `Manifest.xml` holds anything the module exports do not. It was not read in detail.

## What an OutSystems environment would still add

Nothing on the checklist. The module XML covers all of it, including Site Property values. An environment is worth the trouble only for:

- **Physical table names.** The `OSUSR_<hash>_<Entity>` names are assigned at publish time and are not in the module file.
- **Per-environment Site Property overrides,** if any exist. The module carries the design-time default, and Service Center carries what each environment actually runs with.
- **A cross-check on completeness.** Comparing an OutDoc inventory against these exports is the only way to prove nothing was silently dropped.

An OutDoc export was not produced, because it would have duplicated what is already here.

## Fallback

If any of the above proves unreliable, publish the modules to an OutSystems environment and export with the OML 2 XML or OutDoc Forge components. That path is supported by OutSystems and produces output matching the platform version, at the cost of needing an environment.
