# OutSystems Glossary

Terms used across this repository, with notes on how each maps to a .NET or Java target. The mapping notes are guidance for modernization, not a prescription.

## eSpace

The legacy name for an OutSystems module that holds server-side logic, data, and UI. In OutSystems 11 the term is largely replaced by "Module", but it still appears in the platform's internals, in logs, and in some XML element names. For this app, `core.oml` and `frontend.oml` are each one eSpace.

## Module

The unit of development and deployment in OutSystems. A module contains Entities, Actions, Screens, Roles, Site Properties, Timers, and other elements. Modules reference each other through public elements. In this repo:

- **Core**: database management (Entities, Static Entities, and the logic that wraps them).
- **Frontend**: design and logic (Screens, Client Actions, and Server Actions used by the UI).

Modernization note: a module usually maps to a project or assembly (.NET) or a Maven or Gradle module (Java).

## Server Action

Logic that runs on the server, written in the visual flow editor. It can read and write the database, call integrations, and enforce business rules. A Server Action marked public can be consumed by other modules. Screens reach Server Actions through Client Actions or Data Actions in Reactive and Mobile apps.

Modernization note: typically becomes a service method (for example a .NET application service or a Spring `@Service` method).

## Client Action

Logic that runs in the user's browser or on the device, in Reactive Web and Mobile apps. It handles UI behavior such as navigation, validation, showing messages, and calling Server Actions. It cannot access the database directly.

Modernization note: becomes front-end code (component methods, event handlers) or is folded into a controller if the target is server-rendered.

## Screen

A page of the UI, made of widgets, local variables, input parameters, and the Client Actions and Data Actions bound to it. In Reactive Web a Screen is a single route in a single-page app. Screens are grouped under Flows (for example MainFlow).

Modernization note: maps to a page or view plus its backing component or controller.

## Aggregate

A visual, declarative query used to fetch data from Entities. It supports joins, filters, sorting, and pagination, and OutSystems generates optimized SQL from it. Aggregates can sit in a Screen (to feed widgets) or in an Action (to feed logic). The output is a list or a single record, plus metadata such as `Count` and `Empty`.

Modernization note: becomes an ORM query (Entity Framework LINQ, JPA or Hibernate criteria, or a repository method).

## SQL node

A flow element that runs hand-written SQL against the database. It is used when an Aggregate cannot express the query, for example for complex joins, database functions, or bulk updates. It declares typed inputs (parameters) and a typed output structure.

Modernization note: SQL nodes need the closest review during migration. They may contain dialect-specific syntax, and they bypass the Entity model, so they should be checked against the extracted `legacy-db/schema.sql`.

## Entity

A database table definition, modeled in the module that owns it. Each Entity has Attributes (columns), an Identifier (primary key), optional Indexes, and generated CRUD actions (Create, Update, CreateOrUpdate, Get, GetForUpdate, Delete). Entity relationships are modeled through reference attributes (foreign keys).

Modernization note: becomes an ORM entity class and a table migration.

## Static Entity

An Entity whose records are defined at design time and shipped with the module, such as a list of statuses or categories. Each record has an Id, a Label, an Order, and an Is_Active flag, plus any custom attributes. Code refers to records by name (for example `Entities.Status.Approved`), so the labels are effectively compile-time constants.

Modernization note: becomes an enum, a seeded lookup table, or both. The record values are exported to `legacy-db/static-entities.csv` because they live in the module definition, not in ordinary table data.

## Timer

A scheduled background job. A Timer points to a Server Action and runs it on a schedule or on demand, with a configurable timeout and priority. Timers are used for batch work such as cleanups, reminders, and report generation.

Modernization note: becomes a hosted background service or scheduled job (.NET `BackgroundService`, Quartz, Hangfire; Java Spring `@Scheduled`, Quartz). The schedule and timeout must be preserved from the module metadata.

## Site Property

A named configuration value stored per environment, with a data type and a default value. Its value can be changed at runtime from the management console without redeploying. It plays the role that application settings or environment variables play elsewhere.

Modernization note: becomes an entry in `appsettings.json` or `application.yml`, or an environment variable or secret. Values that look like secrets need separate handling.

## Anonymous and Registered roles

OutSystems provides two built-in roles in every module that has them enabled:

- **Anonymous**: anyone who is not logged in. Screens and actions that allow Anonymous are public.
- **Registered**: any user who has logged in. This is the minimum level of authentication.

A module can define extra Roles on top of these (this app distinguishes an admin from a regular user). Each Screen declares which roles may open it, and logic can check a role with `CheckRoleName()` functions. Role checks are enforced at the Screen level and are also commonly repeated inside Server Actions.

Modernization note: maps to authorization policies or roles (`[Authorize]` in .NET, Spring Security roles in Java). Because OutSystems enforces access per Screen, the role-to-Screen matrix has to survive the migration intact. It is in `legacy-oml-xml/ExpensesManager_Frontend.xml` as `RoleException` and `RoleReference` elements, which carry role keys rather than names, so resolving them is a required step.
