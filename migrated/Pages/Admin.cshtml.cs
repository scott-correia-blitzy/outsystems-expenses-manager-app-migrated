using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ExpensesManager.Data;

namespace ExpensesManager.Pages;

/// <summary>
/// Migration of the AdminDashboard screen.
/// Role restriction: Administrator or Approver, from the RoleException elements
/// on this screen in ExpensesManager_Frontend.xml.
/// </summary>
[Authorize(Policy = "Approver")]
public class AdminModel : PageModel
{
    readonly AppDbContext _db;
    public AdminModel(AppDbContext db) => _db = db;

    public record QueueRow(string Kind, string? Code, string? Title, DateTime? SubmittedOn, decimal Total, string Status);

    public int TotalReports { get; private set; }
    public int Pending { get; private set; }
    public decimal ApprovalRate { get; private set; }
    public decimal TotalValue { get; private set; }
    public List<QueueRow> Queue { get; private set; } = new();

    public void OnGet()
    {
        var ex = _db.ExpenseReport.Include(r => r.Status).Include(r => r.Expenses).ToList();
        var ea = _db.EarningReport.Include(r => r.Status).Include(r => r.Earnings).ToList();

        Queue = ex.Select(r => new QueueRow("Expense", r.Code, r.Title, r.SubmitedOn,
                                            r.Expenses.Sum(x => x.AmountInEuros ?? 0), r.Status?.Label ?? "Draft"))
            .Concat(ea.Select(r => new QueueRow("Earning", r.Code, r.Title, r.SubmitedOn,
                                                r.Earnings.Sum(x => x.AmountInEuros ?? 0), r.Status?.Label ?? "Draft")))
            .Where(r => r.Status != "Draft")
            .OrderByDescending(r => r.SubmittedOn)
            .ToList();

        TotalReports = ex.Count + ea.Count;
        Pending = Queue.Count(r => r.Status == "Submitted");
        var processed = Queue.Where(r => r.Status is "Approved" or "Declined").ToList();
        ApprovalRate = processed.Count == 0 ? 0 : (decimal)processed.Count(r => r.Status == "Approved") / processed.Count * 100m;
        TotalValue = Queue.Sum(r => r.Total);
    }
}
