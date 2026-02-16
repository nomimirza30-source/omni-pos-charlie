# PowerShell script to open port 5173 in Windows Firewall for Vite mobile testing
$ruleName = "Allow Vite Inbound"
$port = 5173

if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Host "Creating firewall rule to allow inbound traffic on port $port..." -ForegroundColor Green
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port
} else {
    Write-Host "Firewall rule '$ruleName' already exists." -ForegroundColor Yellow
}

Write-Host "`nYour computer's IP addresses:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object IPAddress, InterfaceAlias

Write-Host "`nInstructions:" -ForegroundColor White
Write-Host "1. Ensure your phone is on the same Wi-Fi as this computer."
Write-Host "2. If you have NordVPN or McAfee active, PLEASE TEMPORARILY DISABLE THEM."
Write-Host "3. Open the Branding tab in OmniPOS and set the 'System Public URL' to your Wi-Fi IP (e.g., http://192.168.1.100:5173)."
Write-Host "4. Try scanning the QR code again."
