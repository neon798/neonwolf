# scripts/validate — privacy scorecard harness

The measurement rig for `PLAN_OF_ACTION.md` Part 2. It drives the **built**
Neonwolf binary over Marionette through the privacy benchmarks and writes a JSON
scorecard so every milestone reports a measured delta.

This exists because the project's biggest credibility gap was that native
ad-blocking was **never validated on d3ward in a real GUI**. No milestone is
"done" until this harness confirms it.

## Setup

```sh
pip install -r scripts/validate/requirements.txt
```

You need a built binary. With the dist build present:
`neonwolf-152.0.1-1/obj-x86_64-pc-linux-gnu/dist/bin/neonwolf`.

## Capture a scorecard

```sh
python3 scripts/validate/run_scorecard.py \
  --binary neonwolf-152.0.1-1/obj-x86_64-pc-linux-gnu/dist/bin/neonwolf \
  --label baseline-pre-M1
```

Output lands in `scripts/validate/scorecards/<timestamp>_<label>/`:
`scorecard.json` + `shots/*.png`.

## The baseline (do this FIRST, before any M1 work)

Capture `--label baseline-pre-M1` now, against the current build. Expected:
- **d3ward ~55–61%** (network-only; cosmetic effectively off) — this is the
  number M1/M2 must drive to **>95%**.
- A uniform RFP fingerprint on browserleaks (same canvas/audio/WebGL hash every
  run) — M4 farbling must make these **vary per site**.

Every later milestone re-runs this and diffs against the baseline scorecard.

## Caveats

- Selectors in `run_scorecard.py` are best-effort against each tool's current
  markup. **The screenshots are ground truth** — if a scraped value is `null`,
  open the shot, read the real number, and tighten the selector.
- d3ward and Cover Your Tracks self-run with timers; the script sleeps to let
  them finish. Bump the sleeps on a slow machine if scores read low/empty.
- `scorecards/` is intended to be git-ignored except for a curated set of
  milestone reference scorecards you choose to commit.
