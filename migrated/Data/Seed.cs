using Microsoft.EntityFrameworkCore;

namespace ExpensesManager.Data;

/// <summary>
/// Sample transaction data reconstructed from the original app's screenshots
/// (screenshots/User_View_Dashboard.png and User_View_Report_List.png).
///
/// The figures are chosen so the migrated dashboard reproduces the original's
/// numbers exactly: total balance 3,412.95, April spend 500.00, and the expenses
/// per type split of 69.93 / 25.64 / 3.88 / 0.55 percent.
///
/// This is sample data, not an export of the original database. The original
/// environment is gone, so no real row-level data was recoverable.
/// </summary>
public static class Seed
{
    // The original screenshots were taken in May 2024. The dashboard computes
    // "current month" and "last month" against this date so the demo reproduces
    // them. Change it to DateTime.Today to see the app against live dates.
    public static readonly DateTime AsOf = new(2024, 5, 15);

    const long User1 = 1;   // em_user1 in the original demo
    const long Admin = 2;   // em_admin

    public static void Run(AppDbContext db)
    {
        if (db.ExpenseReport.Any()) return;
        var d = (int y, int m, int day) => new DateOnly(y, m, day);

        var ex1 = new ExpenseReport
        {
            Code = "1/2024 EX", Title = "Client Visit Lisbon", StatusId = (int)StatusId.Approved,
            CreatedBy = User1, CreatedOn = new DateTime(2024, 3, 4), SubmitedBy = User1,
            SubmitedOn = new DateTime(2024, 3, 6), ProcessedOn = new DateTime(2024, 3, 8),
            Expenses =
            {
                Mk<Expense>("Flight to Lisbon", "Return flight for the client kickoff.", 300m, d(2024,3,4), t: (int)ExpenseTypeId.Travel),
                Mk<Expense>("Client dinner", "Dinner with the client team.", 130m, d(2024,3,5), t: (int)ExpenseTypeId.Restaurant),
            }
        };

        var ex2 = new ExpenseReport
        {
            Code = "2/2024 EX", Title = "Team Lunch Series", StatusId = (int)StatusId.Declined,
            CreatedBy = User1, CreatedOn = new DateTime(2024, 3, 12), SubmitedBy = User1,
            SubmitedOn = new DateTime(2024, 3, 14), ProcessedOn = new DateTime(2024, 3, 15),
            Expenses =
            {
                Mk<Expense>("Train to Porto", "Travel to the Porto office.", 250m, d(2024,3,11), t: (int)ExpenseTypeId.Travel),
                Mk<Expense>("Team lunch", "Monthly team lunch.", 100m, d(2024,3,12), t: (int)ExpenseTypeId.Restaurant),
                Mk<Expense>("Parking", "Airport parking.", 7.05m, d(2024,3,12), t: (int)ExpenseTypeId.Other),
            }
        };

        var ex3 = new ExpenseReport
        {
            Code = "3/2024 EX", Title = "April Business Travel", StatusId = (int)StatusId.Submitted,
            CreatedBy = User1, CreatedOn = new DateTime(2024, 4, 22), SubmitedBy = User1,
            SubmitedOn = new DateTime(2024, 4, 24),
            Expenses =
            {
                Mk<Expense>("Flight to Madrid", "Quarterly review travel.", 350m, d(2024,4,18), t: (int)ExpenseTypeId.Travel),
                Mk<Expense>("Restaurant Madrid", "Working dinner.", 100m, d(2024,4,19), t: (int)ExpenseTypeId.Restaurant),
                Mk<Expense>("Conference materials", "Printed handouts.", 42.95m, d(2024,4,20), t: (int)ExpenseTypeId.Other),
                // Mileage: 19.05 km at the MileageReimbursement Site Property rate of 0.37 EUR/km.
                Mk<Expense>("Mileage to airport", "19.05 km at 0.37 EUR/km.", 7.05m, d(2024,4,20), t: (int)ExpenseTypeId.Kilometers, dist: 19.05m),
            }
        };

        var earnings = new[]
        {
            Rpt<EarningReport>("1/2024 EA", "Salary Payments", StatusId.Submitted, new DateTime(2024,3,1),
                Mk<Earning>("March salary", "Monthly salary payment.", 3000m, d(2024,3,1), t: (int)EarningTypeId.Salary)),
            Rpt<EarningReport>("2/2024 EA", "Investment Income", StatusId.Submitted, new DateTime(2024,3,3),
                Mk<Earning>("Dividend payout", "Quarterly dividend.", 200m, d(2024,3,3), t: (int)EarningTypeId.Investment)),
            Rpt<EarningReport>("3/2024 EA", "Service Income", StatusId.Draft, new DateTime(2024,3,5)),
            Rpt<EarningReport>("4/2024 EA", "Miscellaneous Income", StatusId.Draft, new DateTime(2024,3,9),
                Mk<Earning>("Referral bonus", "Partner referral bonus.", 900m, d(2024,3,9), t: (int)EarningTypeId.Other)),
            Rpt<EarningReport>("9/2024 EA", "Consulting Fees", StatusId.Submitted, new DateTime(2024,4,1),
                Mk<Earning>("Consulting Service for Client A", "Fee earned for providing consulting services to Client A.", 500m, d(2024,3,28), t: (int)EarningTypeId.Service)),
            Rpt<EarningReport>("10/2024 EA", "Sales Commission", StatusId.Submitted, new DateTime(2024,4,5),
                Mk<Earning>("Q1 commission", "Commission on Q1 sales.", 1000m, d(2024,4,5), t: (int)EarningTypeId.Service)),
        };

        db.ExpenseReport.AddRange(ex1, ex2, ex3);
        db.EarningReport.AddRange(earnings);
        db.BlogPost.AddRange(
            new BlogPost { Title = "Welcome to Expenses Manager", Description = "This platform lets you submit expense and earnings reports for review.", CreatedBy = Admin, CreatedOn = new DateTime(2024, 3, 1) },
            new BlogPost { Title = "Submitting your first report", Description = "Create a report, add records to it, then submit the whole report for approval.", CreatedBy = Admin, CreatedOn = new DateTime(2024, 3, 18) });
        db.SaveChanges();
    }

    static T Mk<T>(string title, string desc, decimal amount, DateOnly date, int t, decimal? dist = null) where T : LineItem, new()
    {
        var x = new T
        {
            Title = title, Description = desc, Amount = amount, AmountInEuros = amount,
            Date = date, CurrencyId = (int)CurrencyId.Euro, Distance = dist,
            CreatedBy = User1, CreatedOn = date.ToDateTime(TimeOnly.MinValue)
        };
        if (x is Expense e) e.ExpenseTypeId = t;
        if (x is Earning g) g.EarningTypeId = t;
        return x;
    }

    static TR Rpt<TR>(string code, string title, StatusId status, DateTime created, params Earning[] items) where TR : EarningReport, new()
    {
        var r = new TR
        {
            Code = code, Title = title, StatusId = (int)status,
            CreatedBy = User1, CreatedOn = created
        };
        if (status != StatusId.Draft) { r.SubmitedBy = User1; r.SubmitedOn = created.AddDays(1); }
        r.Earnings.AddRange(items);
        return r;
    }
}
