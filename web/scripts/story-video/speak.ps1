# Offline text-to-speech with the Windows SAPI voices (no network, no keys).
# Usage: powershell -File speak.ps1 -Jobs <jobs.json> [-Voice "Microsoft Zira Desktop"] [-Rate 0]
# jobs.json: [{ "text": "...", "out": "C:\path\clip.wav" }, ...]   One process synthesises the whole batch.
param(
  [Parameter(Mandatory = $true)][string]$Jobs,
  [string]$Voice = "Microsoft Zira Desktop",
  [int]$Rate = 0
)
Add-Type -AssemblyName System.Speech
$items = Get-Content -Raw -Encoding UTF8 -Path $Jobs | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($Voice) } catch { Write-Warning "voice '$Voice' not found, using the default" }
$synth.Rate = $Rate
foreach ($i in @($items)) {
  $synth.SetOutputToWaveFile($i.out)
  $synth.Speak([string]$i.text)
  $synth.SetOutputToNull()
}
$synth.Dispose()
