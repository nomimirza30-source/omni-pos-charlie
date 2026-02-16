namespace OmniPOS.Api.Services.Payments;

public interface IPaymentGateway
{
    Task<PaymentResponse> ProcessPaymentAsync(PaymentRequest request);
    Task<PaymentResponse> GetStatusAsync(string transactionId);
}

public class PaymentRequest
{
    public Guid OrderId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "GBP";
    public string PaymentMethod { get; set; } = "Card";
    public CardDetails? CardDetails { get; set; }
}

public class CardDetails
{
    public string Name { get; set; } = string.Empty;
    public string CardNumber { get; set; } = string.Empty;
    public string Expiry { get; set; } = string.Empty;
    public string Cvv { get; set; } = string.Empty;
}

public class PaymentResponse
{
    public string TransactionId { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Status { get; set; } = "Pending";
    public string Message { get; set; } = string.Empty;
}
