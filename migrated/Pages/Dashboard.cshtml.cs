using System.Security.Claims;
using Microsoft.AspNetCore.Mvc.RazorPages;
using ExpensesManager.Data;
using ExpensesManager.Services;

namespace ExpensesManager.Pages;

/// <summary>
/// Migration of the UserDashboard screen and its Data Actions.
/// Source: NRNodes.WebScreen "UserDashboard" in ExpensesManager_Frontend.xml.
/// </summary>
public class DashboardModel : PageModel
{
    readonly ReportingService _svc;
    public DashboardModel(ReportingService svc) => _svc = svc;

    public record Day(DateOnly Date, decimal Exp, decimal Earn);

    public DashboardStats Stats { get; private set; } = new();
    public List<Day> Chart { get; private set; } = new();
    public DateTime AsOf => Seed.AsOf;
    public string CurrentMonthRange { get; private set; } = "";
    public string LastMonthRange { get; private set; } = "";

    decimal _max = 1;

    public void OnGet()
    {
        Stats = _svc.GetDashboard(AsOf);

        var userId = long.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 1;
        Chart = _svc.GetLast30Days(userId, AsOf)
            .GroupBy(p => p.Date)
            .OrderBy(g => g.Key)
            .Select(g => new Day(
                g.Key,
                g.Where(x => x.Type == "Expense").Sum(x => x.Amount),
                g.Where(x => x.Type == "Earning").Sum(x => x.Amount)))
            .ToList();

        if (Chart.Count > 0)
        {
            _max = Math.Max(1, Chart.Max(d => Math.Max(d.Exp, d.Earn)));
        }

        var cur = new DateOnly(AsOf.Year, AsOf.Month, 1);
        var last = cur.AddMonths(-1);
        CurrentMonthRange = $"{cur:MMMM dd} - {cur.AddMonths(1).AddDays(-1):MMMM dd}";
        LastMonthRange = $"{last:MMMM dd} - {cur.AddDays(-1):MMMM dd}";
    }

    public int BarHeight(decimal v) => (int)Math.Round(Math.Max(4m, v / _max * 185m));
}
