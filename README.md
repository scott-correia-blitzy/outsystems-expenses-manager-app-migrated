# Expenses Manager: OutSystems to .NET

A worked example of pulling a real OutSystems application out of its binary format and rebuilding it on .NET. Prepared as demo material for a MassMutual onsite discussion about modernizing OutSystems applications to .NET or Java.

The repository holds both ends of that move side by side:

| Directory | What it is |
|---|---|
| [legacy/](legacy/) | The OutSystems application, extracted into text: module XML, a derived database schema, Static Entity data, and documentation. Plus the original binaries, unmodified. This is the input. |
| [migrated/](migrated/) | The same application rebuilt as an ASP.NET Core app that runs locally. This is a reference target, written by hand from the extracted XML. |

## The problem this addresses

OutSystems keeps each module as a binary `.oml` file and ships applications as `.oap`. Neither is readable as text. We verified this directly rather than assuming it: `.oml` is a short pipe-delimited header followed by compressed binary XML fragments, with a byte entropy of 7.99 out of 8, every one of the 256 byte values present, and no readable XML recoverable by brute-forcing deflate at every offset in the file. An `.oap` is a plain zip, but it contains only `Manifest.xml` and more `.oml` files.

So a code-analysis tool cannot read an OutSystems application as delivered. The documented way to get text out is to publish the modules to a Platform Server and run a Forge component such as OML 2 XML or OutDoc. Platform Server is Windows only and licensed, which puts the customer's platform team on the critical path before any analysis can start.

**That turns out not to be the only way.** The XML in `legacy/legacy-oml-xml/` was extracted entirely locally, on an Apple Silicon Mac, with no OutSystems environment, no Windows, and no license, using the MIT licensed [oml-utilities](https://github.com/silviogarbes/oml-utilities). See [legacy/docs/extraction-notes.md](legacy/docs/extraction-notes.md) for the method, the verification checklist, and the caveats.

Read the caveats before building anything on this XML. Two matter most:

- **SQL is fragmented.** A query is split across `Text` and `Unbound` attributes carrying key references to entities and parameters. It has to be reassembled before it means anything.
- **Relationships are by key, not by nesting.** Logic nodes are not children of the screens that use them. They sit as sibling fragments referenced by key, so a naive tree walk will not find them.

## Running the migrated app

```
cd migrated
./start.sh
```

Then open <http://localhost:5280>. Stop with `./stop.sh` or Ctrl+C. Requires the .NET 10 SDK.

Sign in as `em_user1` / `123456`, or `em_admin` / `123456` for the admin screens. Those are the two demo accounts from the original project's public README, here running against a local SQLite file with sample data.

The legacy side cannot be run. An `.oml` is a design-time model, not a build artifact, and OutSystems compiles it to .NET only at publish time inside Platform Server.

## What this does and does not prove

Worth being precise about, because it is easy to overclaim.

It does **not** prove the extraction was faithful. `migrated/` was written from the extracted XML, so anything the extraction silently dropped would simply be absent from both, and the app would still run fine. That reasoning is circular.

What it does show:

- The extracted XML is complete enough to rebuild working behaviour from.
- The data model holds together: 11 entities, typed columns, keys, 22 indexes and the Static Entity records, all executing against a real database.
- The one hand-written SQL node reassembles out of its XML fragments into valid SQL.

The genuine corroboration is independent of the rebuilt app. The Static Entity labels (Travel, Restaurant, Other, Kilometers; Draft, Submitted, Approved, Declined) and the `GenerateReportCode` action were read out of the binary module before any screenshot was consulted, and they match what the screenshots show.

Extraction completeness is still **unverified** in the strict sense. There is no diff against a Service Studio view and no second independent reader to cross-check against.

## One real migration finding

Both unique indexes in the source module are named `UniqueIndex_ReportCode`, one on `ExpenseReport` and one on `EarningReport`. SQL Server scopes index names per table, so that is legal there. SQLite and PostgreSQL scope them per database, so the second `CREATE INDEX` fails outright and the app would not start until the names were prefixed.

It is a small thing, but it is the kind of defect that surfaces only when a migrated schema is actually executed, not when it is read.

## Ingestion

`.blitzyignore` at the repo root excludes the unreadable binaries, and also excludes `migrated/`. The second exclusion is deliberate and is explained in the file: the migrated app is the answer key, and an ingestion run that reads the finished target alongside the legacy input is transcribing rather than modernizing.

## Credits and licensing

The original application is the **Expenses Management Platform by [joaocba](https://github.com/joaocba)**, from [joaocba/outsystems_expenses-manager-app](https://github.com/joaocba/outsystems_expenses-manager-app). The upstream README is preserved verbatim at [legacy/docs/upstream-README.md](legacy/docs/upstream-README.md), and the screenshots and logo are theirs.

That upstream repository is public but carries **no license file**, so no license is granted for the original work and none is claimed here. The `.oml` and `.oap` binaries in [legacy/project_files/](legacy/project_files/) are included unmodified, for reference and attribution, in a non-commercial demonstration of format conversion. If the author would prefer they not be redistributed, open an issue and they will be removed.

The hosted demo the upstream README links to is no longer live. As of November 2026 the URL redirects to outsystems.com, which is what happens when an OutSystems Personal Environment is reclaimed. `legacy/screenshots/` is the only remaining record of the application running, which is why those images are ingested rather than ignored.
