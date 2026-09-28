# Packs this folder into crewroom-wake-<version>.vsix: a zip with a manifest and the extension under extension/.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$here = $PSScriptRoot
$package = Get-Content -Raw (Join-Path $here 'package.json') | ConvertFrom-Json
$out = Join-Path $here "crewroom-wake-$($package.version).vsix"
if (Test-Path $out) { Remove-Item -LiteralPath $out }

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($package.name)" Version="$($package.version)" Publisher="$($package.publisher)" />
    <DisplayName>$($package.displayName)</DisplayName>
    <Description xml:space="preserve">$($package.description)</Description>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($package.engines.vscode)" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
"@
$types = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json" /><Default Extension=".js" ContentType="application/javascript" /><Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>'

$zip = [IO.Compression.ZipFile]::Open($out, 'Create')
try {
    function Add-Text($name, $text) {
        $entry = $zip.CreateEntry($name)
        $writer = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding($false)))
        try { $writer.Write($text) } finally { $writer.Dispose() }
    }
    Add-Text '[Content_Types].xml' $types
    Add-Text 'extension.vsixmanifest' $manifest
    foreach ($file in 'package.json', 'extension.js') {
        Add-Text "extension/$file" ([IO.File]::ReadAllText((Join-Path $here $file)))
    }
} finally { $zip.Dispose() }
"built $out"
