using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniPOS.Api.Data;
using OmniPOS.Api.Services;
using OmniPOS.Api.Middleware;

namespace OmniPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Require login for all actions
public class StaffController : ControllerBase
{
    private readonly OmniDbContext _context;
    private readonly ITenantProvider _tenantProvider;

    public StaffController(OmniDbContext context, ITenantProvider tenantProvider)
    {
        _context = context;
        _tenantProvider = tenantProvider;
    }

    // GET: api/staff
    [HttpGet]
    [Authorize(Roles = "Admin,Owner,Manager")]
    public async Task<ActionResult<IEnumerable<object>>> GetStaff()
    {
        var staff = await _context.StaffMembers
            .Select(s => new
            {
                s.StaffId,
                s.FullName,
                s.Username,
                s.Role,
                s.Email,
                s.PayRate,
                s.WorkingDays,
                s.Status,
                s.TenantId // Validate tenant isolation
            })
            .ToListAsync();

        return Ok(staff);
    }

    // GET: api/staff/{id}
    [HttpGet("{id}")]
    [Authorize(Roles = "Admin,Owner,Manager")]
    public async Task<ActionResult<object>> GetStaffById(Guid id)
    {
        var s = await _context.StaffMembers.FirstOrDefaultAsync(x => x.StaffId == id);
        if (s == null) return NotFound();

        return Ok(new
        {
            s.StaffId,
            s.FullName,
            s.Username,
            s.Role,
            s.Email,
            s.PayRate,
            s.WorkingDays,
            s.Status,
            s.TenantId
        });
    }

    // POST: api/staff
    [HttpPost]
    [Authorize(Roles = "Admin,Owner,Manager")]
    public async Task<ActionResult> CreateStaff(CreateStaffRequest request)
    {
        try
        {
            // Check uniqueness globally across all tenants to prevent DB constraint errors
            if (await _context.StaffMembers.IgnoreQueryFilters().AnyAsync(s => s.Username == request.Username))
            {
                return BadRequest("Username already exists.");
            }

            var newStaff = new Staff
            {
                StaffId = Guid.NewGuid(),
                FullName = request.FullName,
                Username = request.Username,
                Role = request.Role,
                Email = request.Email,
                PasswordHash = PasswordHasher.HashPassword(request.Password),
                PayRate = request.PayRate,
                WorkingDays = request.WorkingDays,
                Status = "Active"
                // TenantId handled by context/middleware/EnforceTenantId
            };

            _context.StaffMembers.Add(newStaff);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetStaffById), new { id = newStaff.StaffId }, new
            {
                newStaff.StaffId,
                newStaff.FullName,
                newStaff.Username,
                newStaff.Role,
                newStaff.PayRate,
                newStaff.WorkingDays,
                newStaff.Status
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[StaffController] Error creating staff: {ex.Message}");
            return StatusCode(500, $"Internal server error: {ex.Message}");
        }
    }

    // PUT: api/staff/{id}/role
    [HttpPut("{id}/role")]
    [Authorize(Roles = "Admin,Owner,Manager")]
    public async Task<IActionResult> UpdateStaffRole(Guid id, [FromBody] UpdateRoleRequest request)
    {
        var staff = await _context.StaffMembers.FindAsync(id);
        if (staff == null)
        {
            return NotFound();
        }

        // Prevent modifying own role to lock oneself out (optional but good practice)
        // var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        staff.Role = request.Role;
        if (request.PayRate.HasValue) staff.PayRate = request.PayRate.Value;
        if (!string.IsNullOrEmpty(request.WorkingDays)) staff.WorkingDays = request.WorkingDays;
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // PUT: api/staff/{id}/password
    [HttpPut("{id}/password")]
    [Authorize(Roles = "Admin,Owner,Manager")]
    public async Task<IActionResult> ChangePassword(Guid id, [FromBody] ChangePasswordRequest request)
    {
        var staff = await _context.StaffMembers.FindAsync(id);
        if (staff == null)
        {
            return NotFound();
        }

        staff.PasswordHash = PasswordHasher.HashPassword(request.NewPassword);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}

public class CreateStaffRequest
{
    public string FullName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = "Waiter";
    public string Email { get; set; } = string.Empty;
    public decimal PayRate { get; set; } = 0.00m;
    public string WorkingDays { get; set; } = "[]";
}

public class UpdateRoleRequest
{
    public string Role { get; set; } = string.Empty;
    public decimal? PayRate { get; set; }
    public string WorkingDays { get; set; }
}

public class ChangePasswordRequest
{
    public string NewPassword { get; set; } = string.Empty;
}
