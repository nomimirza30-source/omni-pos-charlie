using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniPOS.Api.Data;
using Microsoft.AspNetCore.SignalR;

namespace OmniPOS.Api.Controllers;

[Authorize(Policy = "RequireServer")]
[ApiController]
[Route("api/[controller]")]
public class TableController : ControllerBase
{
    private readonly OmniDbContext _context;
    private readonly Microsoft.AspNetCore.SignalR.IHubContext<OmniPOS.Api.Hubs.NotificationHub> _hubContext;

    public TableController(OmniDbContext context, Microsoft.AspNetCore.SignalR.IHubContext<OmniPOS.Api.Hubs.NotificationHub> hubContext)
    {
        _context = context;
        _hubContext = hubContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<RestaurantTable>>> GetTables()
    {
        return await _context.RestaurantTables.ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<RestaurantTable>> GetTable(Guid id)
    {
        var table = await _context.RestaurantTables.FindAsync(id);
        if (table == null) return NotFound();
        return table;
    }

    [HttpPost]
    public async Task<ActionResult<RestaurantTable>> CreateTable(RestaurantTable table)
    {
        _context.RestaurantTables.Add(table);
        await _context.SaveChangesAsync();

        // Broadcast update
        await _hubContext.Clients.Group($"Tenant_{table.TenantId}").SendAsync("ReceiveTableUpdate", "Create", table);

        return CreatedAtAction(nameof(GetTable), new { id = table.RestaurantTableId }, table);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateTable(Guid id, RestaurantTable table)
    {
        if (id != table.RestaurantTableId) return BadRequest();
        _context.Entry(table).State = EntityState.Modified;
        await _context.SaveChangesAsync();

        // Broadcast update
        await _hubContext.Clients.Group($"Tenant_{table.TenantId}").SendAsync("ReceiveTableUpdate", "Update", table);

        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTable(Guid id)
    {
        var table = await _context.RestaurantTables.FindAsync(id);
        if (table == null) return NotFound();
        _context.RestaurantTables.Remove(table);
        await _context.SaveChangesAsync();

        // Broadcast update
        await _hubContext.Clients.Group($"Tenant_{table.TenantId}").SendAsync("ReceiveTableUpdate", "Delete", id);

        return NoContent();
    }
}
