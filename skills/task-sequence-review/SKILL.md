---
name: task-sequence-review
description: Design or review an SCCM/MECM operating system deployment task sequence. Use when writing, changing or checking task sequence steps, groups, conditions, variables or exported XML.
---

# Task sequence review

A task sequence fails on the one device nobody tested. Review it as that device.

## Read it in order

Walk the steps top to bottom as the engine runs them, once for each path: bare metal, refresh
(wipe and load), and, if used, in-place upgrade. For each step note:

1. **Where it runs**: WinPE or the full OS. Steps that need the full OS (most app installs,
   `Install Software Updates`) must come after `Setup Windows and ConfigMgr`.
2. **What it needs**: packages, driver packages, variables, network access, a signed-in account
   (Network Access Account or `Run as`).
3. **Its condition**: the WMI query, variable or file check that runs it. Test the condition's logic
   for a model it should match and one it should not.
4. **Continue on error**: only where a failure truly does not matter. A silently skipped driver step
   leaves a device with no network.
5. **Reboots**: whether it restarts, and whether the next step expects WinPE or the OS after it.

## Things that go wrong

- **Driver matching**: `Win32_ComputerSystem.Model` vs `Win32_ComputerSystemProduct.Version`
  (Lenovo uses the latter). Use `LIKE` with care; one loose match installs the wrong drivers.
- **Disk layout**: UEFI vs BIOS, `_SMSTSBootUEFI`, the partition sizes, and BitLocker pre-provisioning
  needing TPM checks first.
- **Apply Operating System**: the right image index, and the right unattend package.
- **Variables**: set before they are read; collection and device variables override task sequence
  ones; typos create a new, empty variable instead of failing.
- **Applications**: `Install Application` needs apps marked "Allow this application to be installed
  from the Install Application task sequence action"; a retry count for apps that return 1618.
- **Timing**: steps without a max run time can hang the build for hours.
- **Logs**: `smsts.log` moves (`X:\Windows\Temp\SMSTSLog`, `C:\_SMSTaskSequence\Logs`,
  `C:\Windows\CCM\Logs\SMSTSLog`); say where to look for each phase.

## Exported XML

When reviewing an export, check it is well-formed XML, list each step with its condition in a table,
and flag steps whose package IDs are placeholders or refer to content not in the change.

## Handing it to ptrip3

Agents can't run a task sequence. End with a lab test plan: which models, which path (bare metal,
refresh), what a pass looks like in `smsts.log`, and what to check on the finished device.
