using System.Security.Claims;
using Microsoft.AspNetCore.Mvc.RazorPages;
using ExpensesManager.Data;
using ExpensesManager.Services;

namespace ExpensesManager.Pages;

/// <summary>
/// Not part of the original app. A demo aid that shows where each piece of this
/// build came from in the extracted module, and what does and does not count as
/// evidence that the extraction was faithful.
/// </summary>
public class MigrationModel : PageModel
{
    readonly AppDbContext _db;
    readonly ReportingService _svc;
    public MigrationModel(AppDbContext db, ReportingService svc) { _db = db; _svc = svc; }

    public record Map(string Concept, string Source, string Target);
    public record StaticRow(string Entity, int Id, string Label, int Order, bool Active);
    public record Check(string What, string Screenshot, string Extracted);

    public int SqlRowCount { get; private set; }
    public List<StaticRow> StaticRecords { get; private set; } = new();

    public List<Map> Mappings { get; } = new()
    {
        new("Entity", "Entity (11 in the Core module)", "EF Core entity class plus a table"),
        new("Static Entity", "Entity with IsStaticEntity=Yes", "enum with fixed Ids, plus a seeded lookup table"),
        new("Entity attribute", "EntityAttribute, with Length and Decimals", "typed property; NVARCHAR(50) becomes string, Currency becomes decimal(19,4)"),
        new("Entity index", "EntityIndex, Unique=Yes", "HasIndex().IsUnique() in AppDbContext"),
        new("Aggregate", "NRNodes.WebScreenDataSet (40 of them)", "LINQ query in ReportingService"),
        new("SQL node", "Nodes.AdvancedQuery \"SQL1\"", "raw SQL, kept as SQL so it stays reviewable"),
        new("Server action", "Flows.UserAction (21 of them)", "service method"),
        new("Client action", "NRFlows.ClientScreenActionFlow (144)", "page handler or request parameter"),
        new("Screen", "NRNodes.WebScreen (14)", "Razor Page"),
        new("Screen input parameter", "InputParameters on the screen", "page route or query parameter"),
        new("Role", "Role / SystemRole (5)", "role claim"),
        new("Role restriction", "RoleException on a screen", "authorization policy in Program.cs"),
        new("Site Property", "Variables.SiteProperty (3)", "configuration value; MileageReimbursement = 0.37 EUR/km"),
        new("Timer", "Timers (none defined)", "nothing to migrate"),
    };

    public List<Check> Corroboration { get; } = new()
    {
        new("Expense type labels", "Travel, Restaurant, Other, Kilometers",
            "Exactly those four, from the ExpenseType Static Entity"),
        new("Status labels", "Draft, Submitted, Approved, Declined",
            "Exactly those four, from the Status Static Entity"),
        new("Report code format", "\"10/2024 EA\", \"9/2024 EA\"",
            "A GenerateReportCode server action exists in the module"),
        new("Currency", "All amounts shown in euro",
            "Currency Static Entity has Euro with Id 1, Dollar with Id 2"),
        new("Mileage expense type", "Kilometers appears as an expense type",
            "MileageReimbursement Site Property, 0.37 EUR per kilometre"),
    };

    public void OnGet()
    {
        var userId = long.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 1;
        SqlRowCount = _svc.GetLast30Days(userId, Seed.AsOf).Count;

        StaticRecords = _db.Status.AsEnumerable().Select(s => new StaticRow("Status", s.Id, s.Label, s.Order, s.Is_Active))
            .Concat(_db.Currency.AsEnumerable().Select(s => new StaticRow("Currency", s.Id, s.Label, s.Order, s.Is_Active)))
            .Concat(_db.ExpenseType.AsEnumerable().Select(s => new StaticRow("ExpenseType", s.Id, s.Label, s.Order, s.Is_Active)))
            .Concat(_db.EarningType.AsEnumerable().Select(s => new StaticRow("EarningType", s.Id, s.Label, s.Order, s.Is_Active)))
            .ToList();
    }
}
