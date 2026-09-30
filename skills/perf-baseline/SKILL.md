---
name: perf-baseline
description: Measure Windows performance (boot, logon, app launch, disk, CPU) with WPR/WPA and repeatable runs, and compare a change against a baseline. Use before claiming any change made devices faster or slower.
---

# Performance baseline

"It feels faster" is not a result. A claim needs a baseline, repeat runs and the same conditions.

## Plan the test first

1. **One question**: for example "does removing these AppX packages shorten first logon?"
2. **One change** between baseline and test. Two changes at once can't be told apart.
3. **The metric** and where it comes from:
   - boot and logon: WPR `-boottrace` or the `GeneralProfile`, read in WPA (Boot Phases, Winlogon);
     or `Microsoft-Windows-Diagnostics-Performance/Operational` event IDs 100 (boot) and 200 (shutdown);
   - first logon: time from credential entry to desktop, from the Winlogon and Shell events;
   - app launch, disk, CPU: WPR profiles for CPU, DiskIO and FileIO.
4. **Conditions**: same model, same firmware, same image apart from the change, on AC power,
   the network the same, and a settle period after setup finishes (MECM client activity and
   Windows Update skew the first minutes).

## Run it

- At least **three runs** per configuration; five if the results spread widely.
- Save each trace with a name that says configuration, run number and date.
- Record the hardware model, image build, and WPR profile with the results.

## Report it

- A table: configuration, each run, median, and the spread (min to max).
- The difference between medians, in seconds and percent.
- Say when the spread overlaps: then the change made no measurable difference.
- Summaries go in `performance/results/`; raw `.etl` traces stay on the lab share.

## Handing it to ptrip3

Agents can't run traces on lab hardware. Give the exact commands, for example
`wpr -start GeneralProfile -filemode` / `wpr -stop <file>.etl`, how many runs, and what to send back
(the `.etl` files or the WPA export). Then analyse what comes back.
