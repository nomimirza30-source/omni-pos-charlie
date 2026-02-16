using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniPOS.Api.Data;
using OmniPOS.Api.Services.Payments;

namespace OmniPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PaymentController : ControllerBase
{
    private readonly OmniDbContext _dbContext;
    private readonly IPaymentGateway _paymentGateway;
    private readonly QrCodeService _qrService;
    private readonly IWiseService _wiseService;

    public PaymentController(OmniDbContext dbContext, IPaymentGateway paymentGateway, QrCodeService qrService, IWiseService wiseService)
    {
        _dbContext = dbContext;
        _paymentGateway = paymentGateway;
        _qrService = qrService;
        _wiseService = wiseService;
    }

    [HttpGet("generate-qr/{orderId}")]
    [Authorize(Policy = "RequireServer")]
    public async Task<IActionResult> GetQrCode(Guid orderId)
    {
        var order = await _dbContext.Orders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order == null) return NotFound("Order not found or access denied.");

        var link = _qrService.GeneratePaymentLink(order.OrderId, order.TotalAmount, order.TenantId);
        
        // In a real app, we would use a library like QRCoder to return an actual image.
        // For MVP, we return the encoded link.
        return Ok(new { PaymentLink = link });
    }

    [HttpPost("process")]
    [Authorize(Policy = "RequireServer")]
    public async Task<IActionResult> ProcessPayment([FromBody] PaymentRequest request)
    {
        return await ProcessPaymentInternal(request);
    }

    [HttpPost("public-process")]
    [AllowAnonymous]
    public async Task<IActionResult> ProcessPublicPayment([FromBody] PaymentRequest request)
    {
        // In a real scenario, validate a secure token here to prevent abuse
        return await ProcessPaymentInternal(request);
    }

    private async Task<IActionResult> ProcessPaymentInternal(PaymentRequest request)
    {
        var order = await _dbContext.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.OrderId == request.OrderId);
        if (order == null) return NotFound("Order not found.");

        var result = await _paymentGateway.ProcessPaymentAsync(request);

        if (result.Success)
        {
            order.Status = "Paid";
            order.WorkflowStatus = "Paid"; // Ensure workflow status is updated too
            order.PaidAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync();

            // Notify clients via SignalR (optional but good)
        }

        return Ok(result);
    }

    // Generate a secure payment link for an order
    [HttpPost("generate-link/{orderId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GeneratePaymentLink(string orderId)
    {
        var order = await _dbContext.Orders
            .FirstOrDefaultAsync(o => o.OrderId.ToString() == orderId);

        if (order == null)
        {
            return NotFound(new { message = "Order not found" });
        }

        // Generate payment link using QR service
        var link = _qrService.GeneratePaymentLink(order.OrderId, order.TotalAmount, order.TenantId);
        
        // Extract token from link (last segment)
        var token = link.Split('/').Last();

        return Ok(new
        {
            token = token,
            url = $"{Request.Scheme}://{Request.Host}/pay/{token}"
        });
    }

    // Get order details by payment token (public endpoint for customer payment page)
    [HttpGet("details/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPaymentDetails(string token)
    {
        if (!Guid.TryParse(token, out Guid orderId))
        {
            return BadRequest(new { message = "Invalid payment token" });
        }

        var order = await _dbContext.Orders
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null)
        {
            return NotFound(new { message = "Payment link not found or expired" });
        }

        var tenant = await _dbContext.Tenants.FirstOrDefaultAsync(t => t.TenantId == order.TenantId);
        
        if (tenant == null)
        {
            System.Console.WriteLine($"[GetPaymentDetails] Tenant {order.TenantId} not found. Falling back to first available tenant.");
            tenant = await _dbContext.Tenants.FirstOrDefaultAsync();
        }

        System.Console.WriteLine($"[GetPaymentDetails] OrderId: {order.OrderId} TenantId: {order.TenantId}");
        System.Console.WriteLine($"[GetPaymentDetails] Tenant Found: {tenant != null}");
        if (tenant != null)
        {
             System.Console.WriteLine($"[GetPaymentDetails] WiseHandle: '{tenant.WiseHandle}' CardUrl: '{tenant.CardPaymentUrl}'");
        }

        string wisePaymentUrl = "";
        System.Console.WriteLine($"[DEBUG] Checking Wise API condition - Key: {!string.IsNullOrEmpty(tenant?.WiseApiKey)}, Profile: {!string.IsNullOrEmpty(tenant?.WiseProfileId)}");
        if (tenant != null && !string.IsNullOrEmpty(tenant.WiseApiKey) && !string.IsNullOrEmpty(tenant.WiseProfileId))
        {
             System.Console.WriteLine($"[DEBUG] Calling WiseService. ProfileId: {tenant.WiseProfileId}");
             // Use FinalTotal if it has a value (non-zero) or if there's a discount making it zero
             decimal amountToPay = (order.FinalTotal > 0 || order.Discount > 0) ? order.FinalTotal : order.TotalAmount;
             string reference = $"Order-{order.OrderId.ToString().Substring(0, 8)}";
             
             // Generate Dynamic Link
             wisePaymentUrl = await _wiseService.CreatePaymentRequestAsync(amountToPay, "GBP", reference, tenant.WiseApiKey, tenant.WiseProfileId);
             System.Console.WriteLine($"[DEBUG] WiseService Result: {wisePaymentUrl}");
        }

        return Ok(new
        {
            reference = $"Order-{order.OrderId.ToString().Substring(0, 8)}",
            tableNumber = order.TableId ?? "N/A",
            // Use FinalTotal if it has a value (non-zero) or if there's a discount making it zero
            amount = (order.FinalTotal > 0 || order.Discount > 0) ? order.FinalTotal : order.TotalAmount,
            status = order.WorkflowStatus,
            wiseHandle = tenant?.WiseHandle,
            revolutHandle = tenant?.RevolutHandle,
            cardPaymentUrl = tenant?.CardPaymentUrl,
            wisePaymentUrl = wisePaymentUrl // New Field
        });
    }
}

