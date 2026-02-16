using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using OmniPOS.Api.Data;
using OmniPOS.Api.Hubs;
using OmniPOS.Api.Services;
using OmniPOS.Api.Middleware;
using System.Text.Json;

namespace OmniPOS.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class OrderController : ControllerBase
{
    private readonly OmniDbContext _context;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly ITenantProvider _tenantProvider;

    public OrderController(OmniDbContext context, IHubContext<NotificationHub> hubContext, ITenantProvider tenantProvider)
    {
        _context = context;
        _hubContext = hubContext;
        _tenantProvider = tenantProvider;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Order>>> GetOrders()
    {
        try
        {
            Console.WriteLine("[GetOrders] Fetching all orders...");
            var orders = await _context.Orders.OrderByDescending(o => o.CreatedAt).ToListAsync();
            Console.WriteLine($"[GetOrders] Found {orders.Count} orders.");
            return orders;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[GetOrders] CRITICAL ERROR: {ex.Message}");
            Console.WriteLine($"[GetOrders] StackTrace: {ex.StackTrace}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Order>> GetOrder(Guid id)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();
        return order;
    }

    [HttpPost("{id}/status")]
    [Authorize(Policy = "RequireServer")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] StatusUpdateDto request)
    {
        try
        {
            Console.WriteLine($"[UpdateStatus] Request received for Order {id} -> {request.NewStatus}");
            Console.WriteLine($"[UpdateStatus] Adjustments: Srv={request.ServiceCharge}, Disc={request.Discount}, Total={request.FinalTotal}, Method={request.PaymentMethod}");
            var order = await _context.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.OrderId == id);
            if (order == null) 
            {
                Console.WriteLine($"[UpdateStatus] Order {id} not found.");
                return NotFound();
            }

            var oldStatus = order.WorkflowStatus;
            string newStatus = request.NewStatus;
            
            // Auto-prefix status if order is amended
            if (order.IsAmended && !newStatus.StartsWith("Amended-") && newStatus != "Paid" && newStatus != "Declined")
            {
                newStatus = "Amended-" + newStatus;
            }

            Console.WriteLine($"[UpdateStatus] Transitioning from {oldStatus} to {newStatus}");
            
            order.WorkflowStatus = newStatus;
            order.Status = newStatus; // Sync legacy/offline status field

            // Add to history
            var history = string.IsNullOrEmpty(order.StatusHistory) 
                ? new List<StatusHistoryItem>() 
                : JsonSerializer.Deserialize<List<StatusHistoryItem>>(order.StatusHistory);
                
            history.Add(new StatusHistoryItem 
            { 
                Status = newStatus, 
                Timestamp = DateTime.UtcNow, 
                UserId = User.Identity?.Name ?? "Unknown" 
            });
            order.StatusHistory = JsonSerializer.Serialize(history);

            // Transition Logic
            if (newStatus == "Paid")
            {
                order.CanAmend = false;
                order.PaidAt = DateTime.UtcNow;
                if (!string.IsNullOrEmpty(request.PaymentMethod))
                {
                    order.PaymentMethod = request.PaymentMethod;
                }
                
                // Save payment adjustments
                if (request.ServiceCharge.HasValue)
                {
                    order.ServiceCharge = request.ServiceCharge.Value;
                }
                if (request.Discount.HasValue)
                {
                    order.Discount = request.Discount.Value;
                }
                if (!string.IsNullOrEmpty(request.DiscountType))
                {
                    order.DiscountType = request.DiscountType;
                }
                if (request.FinalTotal.HasValue)
                {
                    order.FinalTotal = request.FinalTotal.Value;
                }
                if (!string.IsNullOrEmpty(request.DiscountReason))
                {
                    order.DiscountReason = request.DiscountReason;
                }
                
                // Simple loyalty update (TotalSpend) - Not Shadow VIP
                if (order.CustomerId.HasValue)
                {
                    var customer = await _context.Customers.FindAsync(order.CustomerId.Value);
                    if (customer != null)
                    {
                        customer.TotalSpend += request.FinalTotal ?? order.TotalAmount;
                        customer.TotalOrders += 1;
                        customer.LastVisit = DateTime.UtcNow;
                    }
                }
            }
            
            // Global tenant-wide broadcast for UI refresh
            await _hubContext.Clients.Group($"Tenant_{order.TenantId}").SendAsync("ReceiveOrderUpdate", new { id = order.OrderId, status = order.WorkflowStatus });

            await _context.SaveChangesAsync();
            Console.WriteLine($"[UpdateStatus] Order status saved.");

            // Notification Logic based on Business Rules
            var notifications = new List<(string Role, string Message, string Type)>();
            string tableInfo = order.TableId != null ? $"Table {order.TableId}" : "Walk-in";
            string orderLabel = order.IsAmended ? "AMENDED order" : "order";

            switch (newStatus)
            {
                case "Preparing":
                case "Amended-Preparing": // Kitchen Accepts
                    notifications.Add(("Waiter", $"Kitchen ACCEPTED {orderLabel} for {tableInfo}", "info"));
                    notifications.Add(("Manager", $"Kitchen ACCEPTED {orderLabel} for {tableInfo}", "info"));
                    notifications.Add(("Admin", $"Kitchen ACCEPTED {orderLabel} for {tableInfo}", "info"));
                    notifications.Add(("Owner", $"Kitchen ACCEPTED {orderLabel} for {tableInfo}", "info"));
                    break;

                case "Declined": // Kitchen Declines
                    notifications.Add(("Waiter", $"Kitchen DECLINED {orderLabel} for {tableInfo}", "error"));
                    notifications.Add(("Manager", $"Kitchen DECLINED {orderLabel} for {tableInfo}", "error"));
                    notifications.Add(("Admin", $"Kitchen DECLINED {orderLabel} for {tableInfo}", "error"));
                    notifications.Add(("Owner", $"Kitchen DECLINED {orderLabel} for {tableInfo}", "error"));
                    break;

                case "Ready":
                case "Amended-Ready": // Kitchen signals Ready
                    notifications.Add(("Waiter", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} is READY to serve!", "success"));
                    notifications.Add(("Manager", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} is READY to serve!", "success"));
                    notifications.Add(("Admin", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} is READY to serve!", "success"));
                    notifications.Add(("Owner", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} is READY to serve!", "success"));
                    break;

                case "Served":
                case "Amended-Served": // Waiter Delivers
                    notifications.Add(("Manager", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} has been SERVED.", "info"));
                    notifications.Add(("Kitchen", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} has been SERVED.", "info"));
                    notifications.Add(("Chef", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} has been SERVED.", "info"));
                    notifications.Add(("Assistant Chef", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} has been SERVED.", "info"));
                    notifications.Add(("Admin", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} has been SERVED.", "info"));
                    notifications.Add(("Owner", $"{char.ToUpper(orderLabel[0]) + orderLabel.Substring(1)} for {tableInfo} has been SERVED.", "info"));
                    break;
                    
                case "Paid":
                    notifications.Add(("Admin", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Manager", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Kitchen", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Chef", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Assistant Chef", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Waiter", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Till", $"Payment received for {tableInfo}", "success"));
                    notifications.Add(("Owner", $"Payment received for {tableInfo}", "success"));
                    break;
            }

            foreach (var note in notifications)
            {
                // Persist
                var notification = new Notification
                {
                    NotificationId = Guid.NewGuid(),
                    OrderId = order.OrderId,
                    TenantId = order.TenantId,
                    TargetRole = note.Role,
                    Message = note.Message,
                    Type = note.Type,
                    CreatedAt = DateTime.UtcNow,
                    IsRead = false
                };
                _context.Notifications.Add(notification);
                
                 // Broadcast
                 var targetGroup = note.Role == "Chef" || note.Role == "Assistant Chef" || note.Role == "Kitchen" ? "Kitchen" : note.Role;
                 await _hubContext.Clients.Group($"Tenant_{order.TenantId}_{targetGroup}").SendAsync("ReceiveNotification", new 
                 {
                     id = notification.NotificationId,
                     title = note.Type == "error" ? "Order Alert" : 
                             newStatus.Contains("Preparing") ? (order.IsAmended ? "Amendment Accepted" : "Kitchen Accepted") :
                             newStatus.Contains("Ready") ? (order.IsAmended ? "Amended Order Ready" : "Order Ready") :
                             newStatus == "Paid" ? "Payment Received" : "Order Update",
                     message = note.Message,
                     type = note.Type,
                     orderId = order.OrderId,
                     timestamp = notification.CreatedAt
                 });
            }
            
            await _context.SaveChangesAsync();
            Console.WriteLine($"[UpdateStatus] Notifications saved and sent.");

            // Global tenant-wide broadcast for UI refresh (AFTER save to prevent race condition)
            await _hubContext.Clients.Group($"Tenant_{order.TenantId}").SendAsync("ReceiveOrderUpdate", new { id = order.OrderId, status = order.WorkflowStatus });

            return Ok(new { status = "Updated", workflowStatus = order.WorkflowStatus });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UpdateStatus] CRITICAL ERROR: {ex.Message}");
            Console.WriteLine($"[UpdateStatus] StackTrace: {ex.StackTrace}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"[UpdateStatus] Inner: {ex.InnerException.Message}");
            }
            return StatusCode(500, new { error = ex.Message, stack = ex.StackTrace });
        }
    }

    [HttpPut("{id}/financials")]
    [Authorize(Policy = "RequireServer")]
    public async Task<IActionResult> UpdateFinancials(Guid id, [FromBody] FinancialUpdateDto request)
    {
        try
        {
            var order = await _context.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.OrderId == id);
            if (order == null) return NotFound();

            bool changed = false;

            if (request.ServiceCharge.HasValue)
            {
                order.ServiceCharge = request.ServiceCharge.Value;
                changed = true;
            }
            if (request.Discount.HasValue)
            {
                order.Discount = request.Discount.Value;
                changed = true;
            }
            if (!string.IsNullOrEmpty(request.DiscountType))
            {
                order.DiscountType = request.DiscountType;
                changed = true;
            }
            if (!string.IsNullOrEmpty(request.DiscountReason))
            {
                order.DiscountReason = request.DiscountReason;
                changed = true;
            }
            if (request.FinalTotal.HasValue)
            {
                order.FinalTotal = request.FinalTotal.Value;
                changed = true;
            }

            if (changed)
            {
                await _context.SaveChangesAsync();
                
                // Broadcast update silently so other clients (like the QR page) get the latest data
                await _hubContext.Clients.Group($"Tenant_{order.TenantId}").SendAsync("ReceiveOrderUpdate", new { id = order.OrderId, status = order.WorkflowStatus });
            }

            return Ok(new { status = "Updated" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

public class FinancialUpdateDto
{
    public decimal? ServiceCharge { get; set; }
    public decimal? Discount { get; set; }
    public string? DiscountType { get; set; }
    public string? DiscountReason { get; set; }
    public decimal? FinalTotal { get; set; }
}

public class StatusUpdateDto
{
    public string NewStatus { get; set; } = string.Empty;
    public string? PaymentMethod { get; set; } // Optional
    
    // Payment Adjustments
    public decimal? ServiceCharge { get; set; }
    public decimal? Discount { get; set; }
    public string? DiscountType { get; set; } // "percentage", "amount", or "none"
    public decimal? FinalTotal { get; set; }
    public string? DiscountReason { get; set; }
}

public class StatusHistoryItem
{
    public string Status { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public string UserId { get; set; } = string.Empty;
}
