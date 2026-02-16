using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniPOS.Api.Data;
using System.Text.Json;
using System.Text.Json.Serialization;

using Microsoft.AspNetCore.SignalR;
using OmniPOS.Api.Hubs;

namespace OmniPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OfflineSyncController : ControllerBase
{
    private readonly OmniDbContext _dbContext;
    private readonly IHubContext<NotificationHub> _hubContext;

    public OfflineSyncController(OmniDbContext dbContext, IHubContext<NotificationHub> hubContext)
    {
        _dbContext = dbContext;
        _hubContext = hubContext;
    }

    [HttpPost("sync-orders")]
    public async Task<IActionResult> SyncOrders([FromBody] List<OrderSyncDto> localOrders)
    {
        var syncResults = new List<SyncResultDto>();
        Console.WriteLine($"[SyncOrders] Processing {localOrders.Count} orders...");
        foreach (var localOrder in localOrders)
        {
            Console.WriteLine($"[SyncOrders] Order ID: {localOrder.OrderId}, Amount: {localOrder.TotalAmount}, Status: {localOrder.Status}");
            var existingOrder = await _dbContext.Orders
                .IgnoreQueryFilters() // Need to check if it exists even if filtered initially (security logic handles TenantId later)
                .FirstOrDefaultAsync(o => o.OrderId == localOrder.OrderId);

            if (existingOrder == null)
            {
                // New order from local device
                var newOrder = new Order
                {
                    OrderId = localOrder.OrderId,
                    StaffId = localOrder.StaffId,
                    CustomerName = localOrder.CustomerName,
                    TableId = localOrder.TableId,
                    TotalAmount = localOrder.TotalAmount,
                    Status = localOrder.Status,
                    WorkflowStatus = localOrder.Status, // Keep consistent
                    MetadataJson = localOrder.MetadataJson,
                    PendingAmendmentsJson = localOrder.PendingAmendmentsJson,
                    Notes = localOrder.Notes,
                    GuestCount = localOrder.GuestCount,
                    PaymentMethod = localOrder.PaymentMethod,
                    VectorClock = localOrder.VectorClock,
                    CreatedAt = localOrder.CreatedAt,
                    PaidAt = localOrder.PaidAt,
                    DiscountReason = localOrder.DiscountReason,
                    ServiceCharge = localOrder.ServiceCharge,
                    Discount = localOrder.Discount,
                    DiscountType = localOrder.DiscountType,
                    FinalTotal = localOrder.FinalTotal,
                    IsAmended = localOrder.IsAmended
                };

                _dbContext.Orders.Add(newOrder);
                
                // Notify Kitchen/Admin/Manager
                var tableInfo = !string.IsNullOrEmpty(localOrder.TableId) ? $"Table {localOrder.TableId}" : "Walk-in";
                var message = $"New Order placed by {localOrder.CustomerName} ({tableInfo})";
                
                var rolesToNotify = new[] { "Kitchen", "Chef", "Assistant Chef", "Admin", "Manager", "Owner" };
                foreach (var role in rolesToNotify)
                {
                    var notification = new Notification
                    {
                        NotificationId = Guid.NewGuid(),
                        OrderId = localOrder.OrderId,
                        TargetRole = role,
                        Message = message,
                        Type = "info",
                        CreatedAt = DateTime.UtcNow,
                        IsRead = false
                    };
                    _dbContext.Notifications.Add(notification);

                    var targetGroup = role == "Chef" || role == "Assistant Chef" ? "Kitchen" : role;
                    await _hubContext.Clients.Group($"Tenant_{newOrder.TenantId}_{targetGroup}").SendAsync("ReceiveNotification", new 
                    {
                        id = notification.NotificationId,
                        title = "New Order Placed",
                        message = message,
                        type = "info",
                        orderId = localOrder.OrderId,
                        timestamp = notification.CreatedAt
                    });
                }

                // Global tenant-wide broadcast for UI refresh (New Order)
                await _hubContext.Clients.Group($"Tenant_{newOrder.TenantId}").SendAsync("ReceiveOrderUpdate", new { id = newOrder.OrderId, status = newOrder.WorkflowStatus });

                Console.WriteLine($"[SyncOrders] Success: Order {localOrder.OrderId} added to context.");
                
                // Update Table Status to 'Occupied'
                if (!string.IsNullOrEmpty(localOrder.TableId))
                {
                    var tableIds = localOrder.TableId.Split(',', StringSplitOptions.RemoveEmptyEntries);
                    var tablesToUpdate = await _dbContext.RestaurantTables
                        .Where(t => tableIds.Contains(t.RestaurantTableId.ToString()))
                        .ToListAsync();

                    foreach (var table in tablesToUpdate)
                    {
                        table.Status = "Occupied";
                        Console.WriteLine($"[SyncOrders] Table {table.TableNumber} marked as Occupied.");
                    }
                }

                syncResults.Add(new SyncResultDto { OrderId = localOrder.OrderId, Status = "Synchronized" });
            }
            else
            {
                // Conflict resolution using Vector Clocks
                if (IsChangeSuperior(localOrder.VectorClock, existingOrder.VectorClock))
                {
                    bool isAmendment = existingOrder.MetadataJson != localOrder.MetadataJson || 
                                     existingOrder.Notes != localOrder.Notes ||
                                     existingOrder.PendingAmendmentsJson != localOrder.PendingAmendmentsJson;

                    bool isPaidStatus = existingOrder.Status != "Paid" && localOrder.Status == "Paid";

                    existingOrder.Status = localOrder.Status;
                    existingOrder.TotalAmount = localOrder.TotalAmount;
                    existingOrder.CustomerName = localOrder.CustomerName;
                    existingOrder.TableId = localOrder.TableId;
                    existingOrder.MetadataJson = localOrder.MetadataJson;
                    existingOrder.PendingAmendmentsJson = localOrder.PendingAmendmentsJson;
                    existingOrder.Notes = localOrder.Notes;
                    existingOrder.GuestCount = localOrder.GuestCount;
                    existingOrder.PaymentMethod = localOrder.PaymentMethod;
                    existingOrder.VectorClock = localOrder.VectorClock;
                    existingOrder.PaidAt = localOrder.PaidAt;
                    existingOrder.DiscountReason = localOrder.DiscountReason;
                    existingOrder.ServiceCharge = localOrder.ServiceCharge;
                    existingOrder.Discount = localOrder.Discount;
                    existingOrder.DiscountType = localOrder.DiscountType;
                    existingOrder.FinalTotal = localOrder.FinalTotal;
                    existingOrder.IsAmended = localOrder.IsAmended;
                    
                    if (isPaidStatus)
                    {
                        var tableInfo = !string.IsNullOrEmpty(localOrder.TableId) ? $"Table {localOrder.TableId}" : "Walk-in";
                        var payMsg = $"Payment received for {tableInfo}";
                        var payRoles = new[] { "Till", "Admin", "Manager", "Kitchen", "Chef", "Assistant Chef", "Waiter", "Owner" };
                        
                        foreach (var role in payRoles)
                        {
                            var notification = new Notification
                            {
                                NotificationId = Guid.NewGuid(),
                                OrderId = existingOrder.OrderId,
                                TargetRole = role,
                                Message = payMsg,
                                Type = "success",
                                CreatedAt = DateTime.UtcNow,
                                IsRead = false
                            };
                            _dbContext.Notifications.Add(notification);

                             var targetGroup = role == "Chef" || role == "Assistant Chef" || role == "Kitchen" ? "Kitchen" : role;
                             await _hubContext.Clients.Group($"Tenant_{existingOrder.TenantId}_{targetGroup}").SendAsync("ReceiveNotification", new 
                            {
                                id = notification.NotificationId,
                                title = "Payment Received",
                                message = payMsg,
                                type = "success",
                                orderId = existingOrder.OrderId,
                                timestamp = notification.CreatedAt
                            });
                        }
                    }

                    if (isAmendment && !isPaidStatus) // Don't double-notify if it's just a payment
                    {
                        var tableInfoUpdate = !string.IsNullOrEmpty(localOrder.TableNumber) ? $"Table {localOrder.TableNumber}" : (!string.IsNullOrEmpty(localOrder.TableId) ? $"Table {localOrder.TableId}" : "Walk-in");
                        var amendMsg = $"Order for {tableInfoUpdate} has been amended.";
                        var amendRoles = new[] { "Kitchen", "Chef", "Assistant Chef", "Admin", "Manager", "Owner" };
                        
                        foreach (var role in amendRoles)
                        {
                            var notification = new Notification
                            {
                                NotificationId = Guid.NewGuid(),
                                OrderId = existingOrder.OrderId,
                                TargetRole = role,
                                Message = amendMsg,
                                Type = "info",
                                CreatedAt = DateTime.UtcNow,
                                IsRead = false
                            };
                            _dbContext.Notifications.Add(notification);

                             var targetGroup = role == "Chef" || role == "Assistant Chef" ? "Kitchen" : role;
                             await _hubContext.Clients.Group($"Tenant_{existingOrder.TenantId}_{targetGroup}").SendAsync("ReceiveNotification", new 
                            {
                                id = notification.NotificationId,
                                title = "Order Amended",
                                message = amendMsg,
                                type = "info",
                                orderId = existingOrder.OrderId,
                                timestamp = notification.CreatedAt
                            });
                        }
                    }

                    // Global tenant-wide broadcast for UI refresh (Update)
                    await _hubContext.Clients.Group($"Tenant_{existingOrder.TenantId}").SendAsync("ReceiveOrderUpdate", new { id = existingOrder.OrderId, status = existingOrder.WorkflowStatus });

                    syncResults.Add(new SyncResultDto { OrderId = localOrder.OrderId, Status = "Updated" });
                }
                else
                {
                    syncResults.Add(new SyncResultDto { OrderId = localOrder.OrderId, Status = "Conflict - Server Wins" });
                }
            }
        }

        await _dbContext.SaveChangesAsync();
        Console.WriteLine($"[SyncOrders] SaveChangesAsync completed for {localOrders.Count} items.");

        return Ok(syncResults);
    }

    [HttpGet("orders")]
    public async Task<IActionResult> GetOrders()
    {
        var orders = await _dbContext.Orders
            .OrderByDescending(o => o.CreatedAt)
            .Take(100)
            .Select(o => new OrderSyncDto
            {
                OrderId = o.OrderId,
                StaffId = o.StaffId,
                CustomerName = o.CustomerName,
                TableId = o.TableId,
                TotalAmount = o.TotalAmount,
                Status = o.Status,
                MetadataJson = o.MetadataJson,
                PendingAmendmentsJson = o.PendingAmendmentsJson,
                Notes = o.Notes,
                GuestCount = o.GuestCount,
                PaymentMethod = o.PaymentMethod,
                VectorClock = o.VectorClock,
                CreatedAt = o.CreatedAt,
                PaidAt = o.PaidAt,
                DiscountReason = o.DiscountReason,
                ServiceCharge = o.ServiceCharge,
                Discount = o.Discount,
                DiscountType = o.DiscountType,
                FinalTotal = o.FinalTotal,
                IsAmended = o.IsAmended
            })
            .ToListAsync();

        return Ok(orders);
    }

    [HttpPost("order/{orderId}/respond-amendment")]
    public async Task<IActionResult> RespondToAmendment(Guid orderId, [FromBody] AmendmentResponseDto request)
    {
        var order = await _dbContext.Orders
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null) return NotFound();
        
        // Lookup Table Number for better UX
        string tableNum = order.TableId; // Fallback
        if (!string.IsNullOrEmpty(order.TableId))
        {
            var tableIds = order.TableId.Split(',', StringSplitOptions.RemoveEmptyEntries);
            var tableObj = await _dbContext.RestaurantTables
                .Where(t => tableIds.Contains(t.RestaurantTableId.ToString()))
                .FirstOrDefaultAsync();
            if (tableObj != null) tableNum = tableObj.TableNumber;
        }

        string action = request.Approve ? "ACCEPTED" : "DECLINED";
        string msg = $"Kitchen has {action} changes for order on Table {tableNum}";
        
        if (!request.Approve)
        {
            order.PendingAmendmentsJson = "[]"; // Clear if declined
        }
        else 
        {
             if (!string.IsNullOrEmpty(request.UpdatedMetadataJson))
             {
                 order.MetadataJson = request.UpdatedMetadataJson;
                 order.TotalAmount = request.UpdatedTotalAmount;
             }
             order.PendingAmendmentsJson = "[]"; // Always clear if approved
             order.IsAmended = true;
             order.WorkflowStatus = "Amended-Preparing";
             order.Status = "Amended-Preparing";
             if (!order.CustomerName.StartsWith("[AMENDED]"))
             {
                 order.CustomerName = "[AMENDED] " + order.CustomerName;
             }
        }

        await _dbContext.SaveChangesAsync();

        var rolesToNotify = new[] { "Waiter", "Chef", "Assistant Chef", "Kitchen", "Admin", "Manager", "Owner" };
        foreach (var role in rolesToNotify)
        {
             var notification = new Notification
            {
                NotificationId = Guid.NewGuid(),
                OrderId = order.OrderId,
                TargetRole = role,
                Message = msg,
                Type = request.Approve ? "success" : "warning",
                CreatedAt = DateTime.UtcNow,
                IsRead = false
            };
            _dbContext.Notifications.Add(notification);

            var targetGroup = role == "Chef" || role == "Assistant Chef" || role == "Kitchen" ? "Kitchen" : role;
            await _hubContext.Clients.Group($"Tenant_{order.TenantId}_{targetGroup}").SendAsync("ReceiveNotification", new 
            {
                id = notification.NotificationId,
                title = request.Approve ? "Amendment Approved" : "Amendment Declined",
                message = msg,
                type = request.Approve ? "success" : "warning",
                orderId = order.OrderId,
                timestamp = notification.CreatedAt
            });
        }

        await _dbContext.SaveChangesAsync();

        // Broadcast Order Update to all clients (IMPORTANT for sync)
        await _hubContext.Clients.Group($"Tenant_{order.TenantId}").SendAsync("ReceiveOrderUpdate", new { id = order.OrderId, status = order.WorkflowStatus });

        return Ok(new { status = "Updated" });
    }

    [HttpDelete("order/{orderId}")]
    public async Task<IActionResult> DeleteOrder(Guid orderId)
    {
        var order = await _dbContext.Orders
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null)
        {
            return NotFound();
        }

        _dbContext.Orders.Remove(order);
        await _dbContext.SaveChangesAsync();

        Console.WriteLine($"[DeleteOrder] Order {orderId} deleted successfully.");
        return Ok(new { status = "Deleted", orderId = orderId });
    }

    [HttpDelete("customer/{customerId}")]
    public async Task<IActionResult> DeleteCustomer(Guid customerId)
    {
        var customer = await _dbContext.Customers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.CustomerId == customerId);

        if (customer == null)
        {
            return NotFound();
        }

        _dbContext.Customers.Remove(customer);
        await _dbContext.SaveChangesAsync();

        Console.WriteLine($"[DeleteCustomer] Customer {customerId} deleted successfully.");
        return Ok(new { status = "Deleted", customerId = customerId });
    }

    private bool IsChangeSuperior(string localClockJson, string serverClockJson)
    {
        // Primitive Vector Clock comparison logic
        // In a production app, we would parse JSON and compare logical counters per device ID.
        // For this MVP, we compare string lengths or timestamps as a placeholder for the logic.
        try 
        {
            var localClock = JsonSerializer.Deserialize<Dictionary<string, int>>(localClockJson);
            var serverClock = JsonSerializer.Deserialize<Dictionary<string, int>>(serverClockJson);

            if (localClock == null || serverClock == null) return true;

            bool localGreaterAtLeastOnce = false;
            foreach (var kvp in localClock)
            {
                if (serverClock.TryGetValue(kvp.Key, out int serverVal))
                {
                    if (kvp.Value < serverVal) return false; // Server is ahead in one dimension
                    if (kvp.Value > serverVal) localGreaterAtLeastOnce = true;
                }
                else
                {
                    localGreaterAtLeastOnce = true;
                }
            }

            return localGreaterAtLeastOnce;
        }
        catch
        {
            return false;
        }
    }
}

public class OrderSyncDto
{
    [JsonPropertyName("orderId")]
    public Guid OrderId { get; set; }

    [JsonPropertyName("staffId")]
    public Guid? StaffId { get; set; }

    [JsonPropertyName("customerName")]
    public string CustomerName { get; set; } = string.Empty;

    [JsonPropertyName("tableId")]
    public string TableId { get; set; } = string.Empty;

    [JsonPropertyName("totalAmount")]
    public decimal TotalAmount { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("metadataJson")]
    public string MetadataJson { get; set; } = "[]"; // Serialized items

    [JsonPropertyName("pendingAmendmentsJson")]
    public string PendingAmendmentsJson { get; set; } = "[]";

    [JsonPropertyName("notes")]
    public string Notes { get; set; } = string.Empty;
    
    [JsonPropertyName("guestCount")]
    public int GuestCount { get; set; } = 1;

    [JsonPropertyName("paymentMethod")]
    public string PaymentMethod { get; set; } = string.Empty;

    [JsonPropertyName("vectorClock")]
    public string VectorClock { get; set; } = "{}";

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("discountReason")]
    public string DiscountReason { get; set; } = string.Empty;

    [JsonPropertyName("serviceCharge")]
    public decimal ServiceCharge { get; set; }

    [JsonPropertyName("discount")]
    public decimal Discount { get; set; }

    [JsonPropertyName("discountType")]
    public string DiscountType { get; set; } = "none";

    [JsonPropertyName("finalTotal")]
    public decimal FinalTotal { get; set; }

    [JsonPropertyName("paidAt")]
    public DateTime? PaidAt { get; set; }

    [JsonPropertyName("isAmended")]
    public bool IsAmended { get; set; }

    [JsonPropertyName("tableNumber")]
    public string TableNumber { get; set; } = string.Empty;
}

public class SyncResultDto
{
    [JsonPropertyName("orderId")]
    public Guid OrderId { get; set; }
    
    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

public class AmendmentResponseDto
{
    [JsonPropertyName("approve")]
    public bool Approve { get; set; }

    [JsonPropertyName("updatedMetadataJson")]
    public string UpdatedMetadataJson { get; set; } = string.Empty;

    [JsonPropertyName("updatedTotalAmount")]
    public decimal UpdatedTotalAmount { get; set; }
}
