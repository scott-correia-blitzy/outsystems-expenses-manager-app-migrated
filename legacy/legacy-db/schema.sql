-- schema.sql
-- DERIVED from legacy-oml-xml/ExpensesManager_Core.xml by parsing the module's
-- entity model. This was NOT exported from an OutSystems environment.
-- See docs/extraction-notes.md for how the XML was produced.
--
-- Dialect: SQL Server. The app's one SQL node uses GETDATE and DATEADD.
--
-- Known differences from the real OutSystems physical schema:
--   * Table names here are logical entity names. OutSystems creates physical
--     tables named OSUSR_<hash>_<Entity>, where the hash is assigned by the
--     platform at publish time and cannot be derived from the module file.
--   * CreatedBy, UpdatedBy and SubmitedBy point at the User entity of the
--     System module, which is outside this app. They are typed to match but
--     carry no FOREIGN KEY constraint here.
--   * Id columns are declared without IDENTITY. OutSystems autonumbers them.
--   * Mandatory attributes become NOT NULL. Platform-applied defaults are not
--     reproduced.
--   * Binary Data is mapped to VARBINARY(MAX); the platform representation may
--     differ.

-- Static Entity: Currency  (PrettyName: Currency)
CREATE TABLE [Currency] (
    [Id] INT NOT NULL,  -- primary key
    [Label] NVARCHAR(50) NOT NULL,
    [Order] INT NOT NULL,
    [Is_Active] BIT NOT NULL,
    CONSTRAINT [PK_Currency] PRIMARY KEY ([Id])
);

-- Static Entity: Status  (PrettyName: Status)
CREATE TABLE [Status] (
    [Id] INT NOT NULL,  -- primary key
    [Label] NVARCHAR(50) NOT NULL,
    [Order] INT NOT NULL,
    [Is_Active] BIT NOT NULL,
    CONSTRAINT [PK_Status] PRIMARY KEY ([Id])
);

-- Static Entity: ExpenseType  (PrettyName: Expense Type)
CREATE TABLE [ExpenseType] (
    [Id] INT NOT NULL,  -- primary key
    [Label] NVARCHAR(50) NOT NULL,
    [Order] INT NOT NULL,
    [Is_Active] BIT NOT NULL,
    CONSTRAINT [PK_ExpenseType] PRIMARY KEY ([Id])
);

-- Static Entity: EarningType  (PrettyName: Earning Type)
CREATE TABLE [EarningType] (
    [Id] INT NOT NULL,  -- primary key
    [Label] NVARCHAR(50) NOT NULL,
    [Order] INT NOT NULL,
    [Is_Active] BIT NOT NULL,
    CONSTRAINT [PK_EarningType] PRIMARY KEY ([Id])
);

-- Entity: BlogPost  (PrettyName: Blog Post)
CREATE TABLE [BlogPost] (
    [Id] BIGINT NOT NULL,  -- primary key
    [Title] NVARCHAR(50) NULL,
    [Description] NVARCHAR(10000) NULL,
    [CreatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [CreatedOn] DATETIME2 NULL,
    [IsActive] BIT NULL,
    [UpdatedOn] DATETIME2 NULL,
    CONSTRAINT [PK_BlogPost] PRIMARY KEY ([Id])
);
CREATE INDEX [BlogPost_AutoIndex_CreatedBy] ON [BlogPost] ([CreatedBy]);
CREATE INDEX [BlogPost_AutoIndex_UpdatedBy] ON [BlogPost] ([UpdatedBy]);

-- Entity: ExpenseReport  (PrettyName: Expense Report)
CREATE TABLE [ExpenseReport] (
    [Id] BIGINT NOT NULL,  -- primary key
    [Code] NVARCHAR(50) NULL,
    [Title] NVARCHAR(50) NULL,
    [StatusId] INT NULL,  -- FK -> Status
    [SubmitedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [CreatedOn] DATETIME2 NULL,
    [CreatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedOn] DATETIME2 NULL,
    [IsActive] BIT NULL,
    [SubmitedOn] DATETIME2 NULL,
    [ProcessedOn] DATETIME2 NULL,
    CONSTRAINT [PK_ExpenseReport] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_ExpenseReport_StatusId] FOREIGN KEY ([StatusId]) REFERENCES [Status] ([Id])
);
CREATE INDEX [ExpenseReport_AutoIndex_StatusId] ON [ExpenseReport] ([StatusId]);
CREATE UNIQUE INDEX [ExpenseReport_UniqueIndex_ReportCode] ON [ExpenseReport] ([Code]);
CREATE INDEX [ExpenseReport_AutoIndex_UpdatedBy] ON [ExpenseReport] ([UpdatedBy]);
CREATE INDEX [ExpenseReport_AutoIndex_SubmitedBy] ON [ExpenseReport] ([SubmitedBy]);
CREATE INDEX [ExpenseReport_AutoIndex_CreatedBy] ON [ExpenseReport] ([CreatedBy]);

-- Entity: EarningReport  (PrettyName: Earning Report)
CREATE TABLE [EarningReport] (
    [Id] BIGINT NOT NULL,  -- primary key
    [Code] NVARCHAR(50) NULL,
    [Title] NVARCHAR(50) NULL,
    [StatusId] INT NULL,  -- FK -> Status
    [SubmitedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [CreatedOn] DATETIME2 NULL,
    [CreatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedOn] DATETIME2 NULL,
    [IsActive] BIT NULL,
    [SubmitedOn] DATETIME2 NULL,
    [ProcessedOn] DATETIME2 NULL,
    CONSTRAINT [PK_EarningReport] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_EarningReport_StatusId] FOREIGN KEY ([StatusId]) REFERENCES [Status] ([Id])
);
CREATE INDEX [EarningReport_AutoIndex_UpdatedBy] ON [EarningReport] ([UpdatedBy]);
CREATE INDEX [EarningReport_AutoIndex_CreatedBy] ON [EarningReport] ([CreatedBy]);
CREATE UNIQUE INDEX [EarningReport_UniqueIndex_ReportCode] ON [EarningReport] ([Code]);
CREATE INDEX [EarningReport_AutoIndex_StatusId] ON [EarningReport] ([StatusId]);
CREATE INDEX [EarningReport_AutoIndex_SubmitedBy] ON [EarningReport] ([SubmitedBy]);

-- Entity: Expense  (PrettyName: Expense)
CREATE TABLE [Expense] (
    [Id] BIGINT NOT NULL,  -- primary key
    [Date] DATE NULL,
    [Title] NVARCHAR(50) NULL,
    [Description] NVARCHAR(1500) NULL,
    [ExpenseTypeId] INT NULL,  -- FK -> ExpenseType
    [Distance] DECIMAL(37,8) NULL,
    [Amount] DECIMAL(19,4) NULL,
    [CurrencyId] INT NULL,  -- FK -> Currency
    [AmountInEuros] DECIMAL(19,4) NULL,
    [ExpenseReportId] BIGINT NULL,  -- FK -> ExpenseReport
    [CreatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [CreatedOn] DATETIME2 NULL,
    [UpdatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedOn] DATETIME2 NULL,
    [IsActive] BIT NULL,
    CONSTRAINT [PK_Expense] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Expense_ExpenseTypeId] FOREIGN KEY ([ExpenseTypeId]) REFERENCES [ExpenseType] ([Id]),
    CONSTRAINT [FK_Expense_CurrencyId] FOREIGN KEY ([CurrencyId]) REFERENCES [Currency] ([Id]),
    CONSTRAINT [FK_Expense_ExpenseReportId] FOREIGN KEY ([ExpenseReportId]) REFERENCES [ExpenseReport] ([Id])
);
CREATE INDEX [Expense_AutoIndex_CurrencyId] ON [Expense] ([CurrencyId]);
CREATE INDEX [Expense_AutoIndex_CreatedBy] ON [Expense] ([CreatedBy]);
CREATE INDEX [Expense_AutoIndex_UpdatedBy] ON [Expense] ([UpdatedBy]);
CREATE INDEX [Expense_AutoIndex_ExpenseReportId] ON [Expense] ([ExpenseReportId]);
CREATE INDEX [Expense_AutoIndex_ExpenseTypeId] ON [Expense] ([ExpenseTypeId]);

-- Entity: Earning  (PrettyName: Earning)
CREATE TABLE [Earning] (
    [Id] BIGINT NOT NULL,  -- primary key
    [Date] DATE NULL,
    [Title] NVARCHAR(50) NULL,
    [Description] NVARCHAR(1500) NULL,
    [Distance] DECIMAL(37,8) NULL,
    [Amount] DECIMAL(19,4) NULL,
    [CurrencyId] INT NULL,  -- FK -> Currency
    [AmountInEuros] DECIMAL(19,4) NULL,
    [CreatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [CreatedOn] DATETIME2 NULL,
    [UpdatedBy] BIGINT NULL,  -- FK -> User (external: System module)
    [UpdatedOn] DATETIME2 NULL,
    [IsActive] BIT NULL,
    [EarningTypeId] INT NULL,  -- FK -> EarningType
    [EarningReportId] BIGINT NULL,  -- FK -> EarningReport
    CONSTRAINT [PK_Earning] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Earning_CurrencyId] FOREIGN KEY ([CurrencyId]) REFERENCES [Currency] ([Id]),
    CONSTRAINT [FK_Earning_EarningTypeId] FOREIGN KEY ([EarningTypeId]) REFERENCES [EarningType] ([Id]),
    CONSTRAINT [FK_Earning_EarningReportId] FOREIGN KEY ([EarningReportId]) REFERENCES [EarningReport] ([Id])
);
CREATE INDEX [Earning_AutoIndex_EarningTypeId] ON [Earning] ([EarningTypeId]);
CREATE INDEX [Earning_AutoIndex_CreatedBy] ON [Earning] ([CreatedBy]);
CREATE INDEX [Earning_AutoIndex_EarningReportId] ON [Earning] ([EarningReportId]);
CREATE INDEX [Earning_AutoIndex_CurrencyId] ON [Earning] ([CurrencyId]);
CREATE INDEX [Earning_AutoIndex_UpdatedBy] ON [Earning] ([UpdatedBy]);

-- Entity: InvoiceExpense  (PrettyName: Invoice Expense)
CREATE TABLE [InvoiceExpense] (
    [Id] BIGINT NOT NULL,  -- FK -> Expense; primary key
    [Content] VARBINARY(MAX) NULL,
    [Filename] NVARCHAR(50) NULL,
    [Filetype] NVARCHAR(50) NULL,
    [Datetime] DATETIME2 NULL,
    CONSTRAINT [PK_InvoiceExpense] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_InvoiceExpense_Id] FOREIGN KEY ([Id]) REFERENCES [Expense] ([Id])
);

-- Entity: InvoiceEarning  (PrettyName: Invoice Earning)
CREATE TABLE [InvoiceEarning] (
    [Id] BIGINT NOT NULL,  -- FK -> Earning; primary key
    [Content] VARBINARY(MAX) NULL,
    [Filename] NVARCHAR(50) NULL,
    [Filetype] NVARCHAR(50) NULL,
    [Datetime] DATETIME2 NULL,
    CONSTRAINT [PK_InvoiceEarning] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_InvoiceEarning_Id] FOREIGN KEY ([Id]) REFERENCES [Earning] ([Id])
);

-- ---------------------------------------------------------------------------
-- Static Entity seed data
--
-- These records are defined at design time in the module, not in table data.
-- OutSystems code refers to them by name, e.g. Entities.Status.Approved, so the
-- Id values below are effectively constants that logic depends on. Preserve them.
--
-- Note: Status.Draft and Status.Submitted both carry Order = 2 in the source
-- app. That duplicate is reproduced here as-is.
-- ---------------------------------------------------------------------------

INSERT INTO [Currency] ([Id], [Label], [Order], [Is_Active]) VALUES (2, N'Dollar', 2, 1);
INSERT INTO [Currency] ([Id], [Label], [Order], [Is_Active]) VALUES (1, N'Euro', 1, 1);

INSERT INTO [Status] ([Id], [Label], [Order], [Is_Active]) VALUES (1, N'Draft', 2, 1);
INSERT INTO [Status] ([Id], [Label], [Order], [Is_Active]) VALUES (2, N'Submitted', 2, 1);
INSERT INTO [Status] ([Id], [Label], [Order], [Is_Active]) VALUES (3, N'Approved', 3, 1);
INSERT INTO [Status] ([Id], [Label], [Order], [Is_Active]) VALUES (4, N'Declined', 4, 1);

INSERT INTO [ExpenseType] ([Id], [Label], [Order], [Is_Active]) VALUES (4, N'Other', 4, 1);
INSERT INTO [ExpenseType] ([Id], [Label], [Order], [Is_Active]) VALUES (1, N'Restaurant', 1, 1);
INSERT INTO [ExpenseType] ([Id], [Label], [Order], [Is_Active]) VALUES (3, N'Kilometers', 3, 1);
INSERT INTO [ExpenseType] ([Id], [Label], [Order], [Is_Active]) VALUES (2, N'Travel', 2, 1);

INSERT INTO [EarningType] ([Id], [Label], [Order], [Is_Active]) VALUES (4, N'Other', 4, 1);
INSERT INTO [EarningType] ([Id], [Label], [Order], [Is_Active]) VALUES (3, N'Service', 3, 1);
INSERT INTO [EarningType] ([Id], [Label], [Order], [Is_Active]) VALUES (1, N'Salary', 1, 1);
INSERT INTO [EarningType] ([Id], [Label], [Order], [Is_Active]) VALUES (2, N'Investment', 2, 1);

