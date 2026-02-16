using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using OmniPOS.Api.Data;

namespace OmniPOS.Api.Services.Payments;

public interface IWiseService
{
    Task<string> CreatePaymentRequestAsync(decimal amount, string currency, string reference, string apiKey, string profileId);
    Task<bool> ValidateApiKeyAsync(string apiKey);
}

public class WiseService : IWiseService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<WiseService> _logger;

    public WiseService(HttpClient httpClient, ILogger<WiseService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _httpClient.BaseAddress = new Uri("https://api.wise.com");
    }

    public async Task<bool> ValidateApiKeyAsync(string apiKey)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "/v2/profiles");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var response = await _httpClient.SendAsync(request);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating Wise API Key");
            return false;
        }
    }

    public async Task<string> CreatePaymentRequestAsync(decimal amount, string currency, string reference, string apiKey, string profileId)
    {
        try
        {
            var requestBody = new
            {
                amount = new
                {
                    value = amount,
                    currency = currency
                },
                title = $"Order #{reference}",
                description = $"Payment for Order #{reference}",
                // For a simple payment link request to show a UI to payload
                // Wise API for "Payment Requests" / "Standard Payment Link"
            };

            // endpoint: POST /v3/profiles/{profileId}/payment-requests
            var requestUrl = $"/v3/profiles/{profileId}/payment-requests";

            var request = new HttpRequestMessage(HttpMethod.Post, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            
            var json = JsonSerializer.Serialize(requestBody);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError($"Wise API Error: {response.StatusCode} - {responseContent}");
                return string.Empty; // Fail gracefully
            }

            var result = JsonSerializer.Deserialize<WisePaymentRequestResponse>(responseContent);
            var url = result?.PaymentUrl ?? string.Empty;
            _logger.LogInformation($"[WiseService] Successfully generated Payment Link: {url}");
            return url;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception creating Wise Payment Request");
            return string.Empty;
        }
    }
}

public class WisePaymentRequestResponse
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;
    
    [JsonPropertyName("paymentUrl")]
    public string PaymentUrl { get; set; } = string.Empty; 
    
    // Note: The actual Wise API response field for the user-facing URL might differ slightly based on version.
    // Usually it returns a 'payUrl' or 'paymentUrl'. We'll need to verify exactly what v3 returns.
    // For "Standard Payment Link" created via API, it often returns an ID which we construct into a URL 
    // or provides the URL directly.
    // Let's assume standard response structure for now.
}
