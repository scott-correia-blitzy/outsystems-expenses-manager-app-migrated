using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ExpensesManager.Data;

namespace ExpensesManager.Pages;

/// <summary>
/// Migration of the User_ExpenseReportDetail and User_EarningReportDetail screens.
/// Both take a report id as a screen input parameter, which the extracted XML shows
/// as ExpenseReportId / EarningReportId.
/// </summary>
public class ReportDetailsModel : PageModel
{
    readonly AppDbContext _db;
    public ReportDetailsModel(AppDbContext db) => _db = db;

    public record Item(DateOnly? Date, string? Title, string? Description, decimal Amount, string? Type);

    public string Kind { get; private set; } = "Expenses";
    public long Id { get; private set; }
    public bool NotFound { get; private set; }
    public string? Code { get; private set; }
    public string? Title { get; private set; }
    public string Status { get; private set; } = "Draft";
    public decimal Total { get; private set; }
    public List<Item> Items { get; private set; } = new();

    public void OnGet(string? kind, long id)
    {
        Kind = kind == "Earnings" ? "Earnings" : "Expenses";
        Id = id;

        if (Kind == "Expenses")
        {
            var r = _db.ExpenseReport.Include(x => x.Status)
                       .Include(x => x.Expenses).ThenInclude(e => e.ExpenseType)
                       .FirstOrDefault(x => x.Id == id);
            if (r is null) { NotFound = true; return; }
            Code = r.Code; Title = r.Title; Status = r.Status?.Label ?? "Draft";
            Items = r.Expenses.OrderBy(e => e.Date)
                .Select(e => new Item(e.Date, e.Title, e.Description, e.AmountInEuros ?? 0, e.ExpenseType?.Label)).ToList();
        }
        else
        {
            var r = _db.EarningReport.Include(x => x.Status)
                       .Include(x => x.Earnings).ThenInclude(e => e.EarningType)
                       .FirstOrDefault(x => x.Id == id);
            if (r is null) { NotFound = true; return; }
            Code = r.Code; Title = r.Title; Status = r.Status?.Label ?? "Draft";
            Items = r.Earnings.OrderBy(e => e.Date)
                .Select(e => new Item(e.Date, e.Title, e.Description, e.AmountInEuros ?? 0, e.EarningType?.Label)).ToList();
        }

        Total = Items.Sum(i => i.Amount);
    }
}
