// Entity model migrated from the OutSystems Core module.
// Source of truth: legacy-oml-xml/ExpensesManager_Core.xml, via legacy-db/schema.sql.
//
// OutSystems Static Entities become enums plus seeded lookup tables. The Id values
// are NOT arbitrary: OutSystems logic refers to records by name (Entities.Status.Approved)
// and those names compile down to these Ids, so they must be preserved exactly.

namespace ExpensesManager.Data;

/// <summary>Static Entity: Status. Ids fixed by the source module.</summary>
public enum StatusId { Draft = 1, Submitted = 2, Approved = 3, Declined = 4 }

/// <summary>Static Entity: Currency. Ids fixed by the source module.</summary>
public enum CurrencyId { Euro = 1, Dollar = 2 }

/// <summary>Static Entity: ExpenseType. Ids fixed by the source module.</summary>
public enum ExpenseTypeId { Restaurant = 1, Travel = 2, Kilometers = 3, Other = 4 }

/// <summary>Static Entity: EarningType. Ids fixed by the source module.</summary>
public enum EarningTypeId { Salary = 1, Investment = 2, Service = 3, Other = 4 }

public abstract class StaticRecord
{
    public int Id { get; set; }
    public string Label { get; set; } = "";
    public int Order { get; set; }
    public bool Is_Active { get; set; } = true;
}

public class Status : StaticRecord { }
public class Currency : StaticRecord { }
public class ExpenseType : StaticRecord { }
public class EarningType : StaticRecord { }

/// <summary>
/// Audit columns present on every non-static entity in the source module.
/// CreatedBy/UpdatedBy referenced the User entity of the OutSystems System module,
/// which lives outside the app. Kept as a plain id here.
/// </summary>
public abstract class Auditable
{
    public long Id { get; set; }
    public long? CreatedBy { get; set; }
    public DateTime? CreatedOn { get; set; }
    public long? UpdatedBy { get; set; }
    public DateTime? UpdatedOn { get; set; }
    public bool? IsActive { get; set; } = true;
}

public abstract class ReportBase : Auditable
{
    public string? Code { get; set; }
    public string? Title { get; set; }
    public int? StatusId { get; set; }
    public long? SubmitedBy { get; set; }   // spelling preserved from the source module
    public DateTime? SubmitedOn { get; set; }
    public DateTime? ProcessedOn { get; set; }
    public Status? Status { get; set; }
}

public class ExpenseReport : ReportBase
{
    public List<Expense> Expenses { get; set; } = new();
}

public class EarningReport : ReportBase
{
    public List<Earning> Earnings { get; set; } = new();
}

public abstract class LineItem : Auditable
{
    public DateOnly? Date { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public decimal? Distance { get; set; }
    public decimal? Amount { get; set; }
    public int? CurrencyId { get; set; }
    public decimal? AmountInEuros { get; set; }
    public Currency? Currency { get; set; }
}

public class Expense : LineItem
{
    public int? ExpenseTypeId { get; set; }
    public long? ExpenseReportId { get; set; }
    public ExpenseType? ExpenseType { get; set; }
    public ExpenseReport? ExpenseReport { get; set; }
}

public class Earning : LineItem
{
    public int? EarningTypeId { get; set; }
    public long? EarningReportId { get; set; }
    public EarningType? EarningType { get; set; }
    public EarningReport? EarningReport { get; set; }
}

public class BlogPost : Auditable
{
    public string? Title { get; set; }
    public string? Description { get; set; }
}

public class InvoiceExpense
{
    public long Id { get; set; }
    public byte[]? Content { get; set; }
    public string? Filename { get; set; }
    public string? Filetype { get; set; }
    public DateTime? Datetime { get; set; }
}

public class InvoiceEarning
{
    public long Id { get; set; }
    public byte[]? Content { get; set; }
    public string? Filename { get; set; }
    public string? Filetype { get; set; }
    public DateTime? Datetime { get; set; }
}
