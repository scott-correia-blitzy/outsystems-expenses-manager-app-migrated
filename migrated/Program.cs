using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using ExpensesManager.Data;
using ExpensesManager.Services;

var builder = WebApplication.CreateBuilder(args);

var dbPath = Path.Combine(builder.Environment.ContentRootPath, "expenses.db");
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={dbPath}"));
builder.Services.AddScoped<ReportingService>();

// OutSystems Roles become ASP.NET Core authorization policies.
// Source module roles: Anonymous, Registered, Administrator, Approver, User.
//   Anonymous   -> AllowAnonymous
//   Registered  -> any authenticated user
//   the rest    -> named role claims
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.LoginPath = "/Login";
        o.AccessDeniedPath = "/InvalidPermissions";   // mirrors the InvalidPermissions screen
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Administrator", p => p.RequireRole("Administrator"))
    .AddPolicy("Approver", p => p.RequireRole("Administrator", "Approver"));

builder.Services.AddRazorPages(o =>
{
    // Screen-level role restrictions, carried over from the source module.
    o.Conventions.AuthorizeFolder("/");                        // Registered
    o.Conventions.AllowAnonymousToPage("/Login");              // Anonymous
    o.Conventions.AllowAnonymousToPage("/InvalidPermissions");  // Anonymous
    o.Conventions.AuthorizePage("/Admin", "Approver");          // Administrator + Approver
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    Seed.Run(db);
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapRazorPages();
app.MapGet("/", () => Results.Redirect("/Dashboard"));

app.Run();
