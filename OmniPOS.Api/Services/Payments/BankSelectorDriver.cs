namespace OmniPOS.Api.Services.Payments;

public class BankSelectorDriver : IPaymentGateway
{
    public async Task<PaymentResponse> ProcessPaymentAsync(PaymentRequest request)
    {
        // Simulate external bank API call
        await Task.Delay(1000); 

        if (request.PaymentMethod == "Card" && request.CardDetails != null)
        {
            if (string.IsNullOrWhiteSpace(request.CardDetails.CardNumber) || request.CardDetails.CardNumber.Length < 13)
            {
                return new PaymentResponse { Success = false, Message = "Invalid Card Number" };
            }
        }

        return new PaymentResponse
        {
            TransactionId = "BANK-" + Guid.NewGuid().ToString().Substring(0, 8),
            Success = true,
            Status = "Completed",
            Message = "Payment authorized by Bank Selector"
        };
    }

    public Task<PaymentResponse> GetStatusAsync(string transactionId)
    {
        return Task.FromResult(new PaymentResponse
        {
            TransactionId = transactionId,
            Success = true,
            Status = "Completed"
        });
    }
}
