using Microsoft.AspNetCore.Mvc.RazorPages;
using ExpensesManager.Data;

namespace ExpensesManager.Pages;

/// <summary>Migration of the Blog and BlogPostDetail screens.</summary>
public class BlogModel : PageModel
{
    readonly AppDbContext _db;
    public BlogModel(AppDbContext db) => _db = db;

    public List<BlogPost> Posts { get; private set; } = new();
    public bool CanEdit => User.IsInRole("Administrator");

    public void OnGet() =>
        Posts = _db.BlogPost.OrderByDescending(p => p.CreatedOn).ToList();
}
