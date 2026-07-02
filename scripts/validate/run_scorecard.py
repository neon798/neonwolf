#!/usr/bin/env python3
"""
Neonwolf validation harness — drives the built browser through the privacy
benchmarks and emits a JSON scorecard, so every milestone can report a measured
delta instead of a vibe.

This is the "definition of done" rig from PLAN_OF_ACTION.md Part 2. The single
biggest credibility gap today is that native ad-blocking was *never validated on
d3ward in a real GUI*; this closes it.

It drives a Gecko build over **Marionette** (built into Firefox/Neonwolf — no
matching geckodriver needed). Point it at the dist binary:

    pip install -r scripts/validate/requirements.txt
    python3 scripts/validate/run_scorecard.py \
        --binary neonwolf-152.0.1-1/obj-x86_64-pc-linux-gnu/dist/bin/neonwolf \
        --label baseline-pre-M1 \
        --out scripts/validate/scorecards/

Output: one JSON file per run under --out, plus screenshots for manual
confirmation of the tests whose scores can't be scraped reliably yet.

NOTE: the DOM selectors below are best-effort against each tool's current markup.
On the first real run, eyeball the screenshots and tighten any selector that
returns null. Selector drift is expected; the screenshots are the ground truth.
"""

import argparse
import datetime
import json
import os
import sys
import time

try:
    from marionette_driver.marionette import Marionette
except ImportError:
    sys.exit(
        "marionette_driver missing — run: "
        "pip install -r scripts/validate/requirements.txt"
    )

D3WARD_URL = "https://toolz.d3ward.org/tools/adblock"
BROWSERLEAKS = {
    "canvas": "https://browserleaks.com/canvas",
    "webgl": "https://browserleaks.com/webgl",
    "audio": "https://browserleaks.com/audio",
    "fonts": "https://browserleaks.com/fonts",
}
COVERYOURTRACKS = "https://coveryourtracks.eff.org/"


def _js(client, script, timeout=5):
    try:
        client.set_script_timeout(timeout * 1000)
        return client.execute_script(script)
    except Exception as exc:  # noqa: BLE001 — harness must never hard-crash a run
        return {"_error": str(exc)}


def measure_d3ward(client, shotdir):
    """d3ward adblock test — the headline number (target >95%)."""
    client.navigate(D3WARD_URL)
    time.sleep(20)  # the test self-runs; give it room
    # d3ward renders the aggregate as a big percentage; try a few likely hooks.
    score = _js(
        client,
        """
        const el = document.querySelector('#percentage, .percentage, [id*="percent"]');
        if (el) return el.textContent.trim();
        // fallback: scrape any standalone "NN%" in the results region
        const m = document.body.innerText.match(/(\\d{1,3})\\s*%/);
        return m ? m[1] + '%' : null;
        """,
    )
    client.save_screenshot(os.path.join(shotdir, "d3ward.png"))
    return {"url": D3WARD_URL, "score": score, "screenshot": "d3ward.png"}


def measure_browserleaks(client, shotdir):
    """Canvas/WebGL/audio/font signatures — for farbling (M4) we want these to
    VARY per eTLD+1, so the scorecard records the raw hash to diff across runs."""
    out = {}
    for name, url in BROWSERLEAKS.items():
        client.navigate(url)
        time.sleep(8)
        sig = _js(
            client,
            """
            const rows = [...document.querySelectorAll('td,div,span')];
            const hit = rows.find(r => /signature|hash/i.test(r.textContent) && r.nextElementSibling);
            return hit && hit.nextElementSibling ? hit.nextElementSibling.textContent.trim() : null;
            """,
        )
        shot = f"browserleaks-{name}.png"
        client.save_screenshot(os.path.join(shotdir, shot))
        out[name] = {"url": url, "signature": sig, "screenshot": shot}
    return out


def measure_coveryourtracks(client, shotdir):
    """EFF Cover Your Tracks — uniqueness / 'is this a privacy browser' tell.
    The test takes a while and is JS-heavy; we capture a screenshot and a
    best-effort verdict string for manual review."""
    client.navigate(COVERYOURTRACKS)
    time.sleep(5)
    verdict = _js(
        client,
        "const h = document.querySelector('h1,h2,.results-text'); return h ? h.textContent.trim() : null;",
    )
    client.save_screenshot(os.path.join(shotdir, "coveryourtracks.png"))
    return {"url": COVERYOURTRACKS, "verdict": verdict, "screenshot": "coveryourtracks.png"}


def main():
    ap = argparse.ArgumentParser(description="Neonwolf privacy scorecard runner")
    ap.add_argument("--binary", required=True, help="path to the built neonwolf binary")
    ap.add_argument("--label", required=True, help="run label, e.g. baseline-pre-M1")
    ap.add_argument("--out", default="scripts/validate/scorecards", help="output dir")
    ap.add_argument("--profile", default=None, help="optional profile dir (fresh if omitted)")
    ap.add_argument("--port", type=int, default=2828)
    ap.add_argument("--headless", action="store_true",
                    help="run without a visible window (note: canvas/WebGL results "
                         "can differ headless — keep baseline and later runs consistent)")
    args = ap.parse_args()

    if not os.path.exists(args.binary):
        sys.exit(f"binary not found: {args.binary} (build it first: make build)")

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    rundir = os.path.join(args.out, f"{stamp}_{args.label}")
    shotdir = os.path.join(rundir, "shots")
    os.makedirs(shotdir, exist_ok=True)

    client = Marionette(bin=args.binary, port=args.port, headless=args.headless)
    client.start_session()
    try:
        scorecard = {
            "label": args.label,
            "timestamp": stamp,
            "binary": os.path.abspath(args.binary),
            "d3ward": measure_d3ward(client, shotdir),
            "browserleaks": measure_browserleaks(client, shotdir),
            "coveryourtracks": measure_coveryourtracks(client, shotdir),
        }
    finally:
        client.delete_session()

    path = os.path.join(rundir, "scorecard.json")
    with open(path, "w") as fh:
        json.dump(scorecard, fh, indent=2)
    print(f"wrote {path}")
    print(f"d3ward score: {scorecard['d3ward']['score']}  (target >95%)")
    print(f"screenshots in {shotdir} — eyeball them to confirm scraped values")


if __name__ == "__main__":
    main()
