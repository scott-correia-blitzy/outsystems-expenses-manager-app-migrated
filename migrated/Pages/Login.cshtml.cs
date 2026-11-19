using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace ExpensesManager.Pages;

/// <summary>
/// Migration of the Login screen and the DoLogin / ClientLogin actions.
///
/// The original delegated to the OutSystems Users module. This demo keeps a fixed
/// account list so it runs with no identity provider. A real migration would wire
/// this to the target's identity system.
/// </summary>
[AllowAnonymous]
public class LoginModel : PageModel
{
    public string? Error { get; set; }

    static readonly Dictionary<string, (long Id, string Display, string[] Roles)> Accounts = new()
    {
        ["em_user1"] = (1, "John Smith", new[] { "User" }),
        ["em_admin"] = (2, "Admin User", new[] { "Administrator", "Approver" }),
    };

    public IActionResult OnGet()
        => User.Identity?.IsAuthenticated == true ? Redirect("/Dashboard") : Page();

    public async Task<IActionResult> OnPostAsync(string username, string password)
    {
        if (!Accounts.TryGetValue(username?.Trim() ?? "", out var acct) || password != "123456")
        {
            Error = "Unknown username or password.";
            return Page();
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, acct.Id.ToString()),
            new(ClaimTypes.Name, acct.Display),
            new("username", username!),
        };
        claims.AddRange(acct.Roles.Select(r => new Claim(ClaimTypes.Role, r)));

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));

        return Redirect("/Dashboard");
    }
}
