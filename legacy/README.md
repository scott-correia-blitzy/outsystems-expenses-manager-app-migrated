# Expenses Manager: OutSystems Modernization Demo

This repository packages an OutSystems application in a form Blitzy can ingest, so it can be modernized to .NET or Java.

The source app is the open-source Expenses Management Platform by joaocba (`joaocba/outsystems_expenses-manager-app`). It lets users submit expense and earnings reports, and lets administrators approve or reject them. The original upstream README is kept at [docs/upstream-README.md](docs/upstream-README.md).

## Why extraction is needed

OutSystems stores modules as binary `.oml` files and packages them as `.oap`. Neither format is readable as text, so a code-analysis tool cannot ingest them directly. The pipeline below turns the binaries into text artifacts (XML, SQL, CSV) that carry the same logic, data model, and configuration.

## Extraction pipeline

The module XML was extracted locally, with no OutSystems environment involved, using the MIT licensed [oml-utilities](https://github.com/silviogarbes/oml-utilities). It loads OutSystems' own model-reading assemblies and dumps each XML fragment of the .oml.

```
project_files/*.oml, *.oap        (binary originals, never modified)
        |
        |  1. Copy the modules to a scratch folder
        |  2. oml manipulate <module>.oml <module>.xml --format xml
        v
legacy-oml-xml/     (done)
        |
        |  3. Parse the entity model out of the Core XML
        v
legacy-db/          (done, derived)
        |
        |  4. Ingest into Blitzy (binaries filtered by .blitzyignore)
        v
Modernized .NET or Java application
```

The extraction is complete. See [docs/extraction-notes.md](docs/extraction-notes.md) for the exact method, the checklist results, and the caveats. Read the caveats before building anything on this XML: SQL is stored as fragments that need reassembling, and relationships are by key rather than by tree nesting.

No OutSystems environment is needed for any step above. Step 4 reads only what `.blitzyignore` leaves visible.

## Folder layout

| Path | Contents | Status |
|---|---|---|
| `project_files/` | Original `core.oml`, `frontend.oml`, `app.oap`. Binary, read-only, excluded from ingestion. | Present |
| `legacy-oml-xml/` | XML conversion of each module: `ExpensesManager_Core.xml` (713 KB) and `ExpensesManager_Frontend.xml` (17.3 MB). Holds Entities, Actions, Screens, Aggregates, SQL, and Roles. | Present |
| `legacy-db/` | `schema.sql` (11 tables, keys, indexes, and Static Entity seed data) and `static-entities.csv`. Derived from the Core XML, not exported from a platform environment. | Derived |
| `docs/` | [outsystems-glossary.md](docs/outsystems-glossary.md) for OutSystems terms, [extraction-notes.md](docs/extraction-notes.md) for how the XML was produced, and the upstream README. | Present |
| `screenshots/`, `assets/` | Upstream PNG images. Ingested, not excluded: with the hosted demo gone, these are the only surviving record of the app running, and they corroborate the extraction (see the extraction notes). | Present |
| `../.blitzyignore` | Lives at the repository root, one level up. Excludes what nothing can read (`.oml`, `.oap`, archives, compiled output, database binaries, video, fonts) plus `../migrated/`. Images, PDFs and Office files are ingested, since their content is extractable. | Present |

## Modules in scope

- **Core**: database management (Entities, Static Entities, wrapper logic).
- **Frontend**: design and logic (Screens, Client Actions, Server Actions).

See the glossary for definitions of each term.

## Before an ingestion run

There are no placeholders left to fill. Every file here is real. Worth checking anyway:

1. Confirm `.blitzyignore` at the repository root does not hide anything you want ingested. `git check-ignore -v <path>` reads `.gitignore` rather than `.blitzyignore`, so check the patterns by hand or copy them across temporarily.
2. Confirm the originals in `project_files/` are unchanged, by comparing checksums against the downloaded ZIP.

## Ground rules

- Never edit or convert the files in `project_files/` in place. Work from copies.
- Do not commit credentials. The upstream README lists demo accounts for a public hosted demo; they are intentionally not repeated here. That demo is no longer live: as of November 2026 the URL redirects to outsystems.com, which is what happens when an OutSystems Personal Environment is reclaimed. The `screenshots/` folder is the only remaining view of the app running.
- The app cannot be run from this directory. An .oml is a design-time model, not a build artifact, and OutSystems compiles it to .NET only at publish time inside Platform Server. See [docs/extraction-notes.md](docs/extraction-notes.md). The rebuilt .NET version in [../migrated/](../migrated/) does run, but it is a hand-written reference target, not a build of anything here.
- Docs in this repo avoid em dashes.
