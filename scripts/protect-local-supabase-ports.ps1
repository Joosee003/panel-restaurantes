$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '..\local-schema\firewall-setup.log'
Start-Transcript -LiteralPath $log -Force | Out-Null
try {
$name = 'NEW-TALGO-LOCAL-SUPABASE-BLOCK-INBOUND'
$rule = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if (-not $rule) {
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Block `
    -Protocol TCP -LocalPort '54320-54329' -Profile Any -Enabled True | Out-Null
}
$rule = Get-NetFirewallRule -DisplayName $name -ErrorAction Stop
$ports = $rule | Get-NetFirewallPortFilter
Write-Output ("Firewall rule {0}: {1}, {2}, TCP {3}" -f $name, $rule.Enabled, $rule.Action, $ports.LocalPort)
} finally {
  Stop-Transcript | Out-Null
}
