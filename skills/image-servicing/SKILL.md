---
name: image-servicing
description: Change a Windows image offline with DISM (updates, features, AppX removal, drivers, default registry) or edit unattend.xml. Use for any work on WIM files, servicing scripts or answer files.
---

# Image servicing

A damaged WIM costs a rebuild. Every change is made on a copy, checked, and reversible.

## The safe flow

1. **Copy** the source WIM to a scratch folder. Never mount the original.
2. **Check the index**: `Get-WindowsImage -ImagePath <copy>`; name the index you change.
3. **Mount** to an empty folder: `Mount-WindowsImage -Path <mount> -ImagePath <copy> -Index <n>`.
4. **Change**, one kind at a time, logging each command's output:
   - updates: servicing stack first, then the cumulative update (`Add-WindowsPackage`);
   - features: `Enable-WindowsOptionalFeature` / `Disable-...` with `-Source` where needed;
   - AppX: `Remove-AppxProvisionedPackage` for provisioned packages only, from a reviewed list;
     never Store, VCLibs, UI.Xaml or frameworks other apps depend on;
   - default user registry: load `<mount>\Users\Default\NTUSER.DAT` under a temporary name, change
     it, **unload it** before unmounting.
5. **Check** before committing: `Get-WindowsPackage`, `Get-AppxProvisionedPackage`, and
   `DISM /Image:<mount> /Cleanup-Image /AnalyzeComponentStore`.
6. **Commit or discard**: `Dismount-WindowsImage -Save` only when every step succeeded; otherwise
   `-Discard`. A script must discard in its `catch`/`finally`.
7. **Clean up**: `DISM /Cleanup-Mountpoints` if a mount was left behind.

## Scripts

- `[CmdletBinding(SupportsShouldProcess)]` and a `-WhatIf` path that prints every command.
- Parameters for paths and index; no hard-coded share or server names.
- Stop on the first error (`$ErrorActionPreference = 'Stop'`) and discard the mount.
- A transcript or log file next to the output WIM.
- Parse-check with `[System.Management.Automation.Language.Parser]::ParseFile` before calling it ready.

## unattend.xml

- Each setting in the right pass (`windowsPE`, `specialize`, `oobeSystem`) and for the right
  architecture (`processorArchitecture="amd64"`).
- Check it is well-formed XML, and validate in Windows System Image Manager when ptrip3 can.
- In MECM, many settings are set by the task sequence (computer name, domain join, locale); don't
  set them twice.
- No real passwords or product keys. Use placeholders; real values go in `site-local/`.

## Handing it to ptrip3

Say what the script changes, how long it takes, how to run it with `-WhatIf` first, and what to check
afterwards (the package list, a test deployment of the image).
