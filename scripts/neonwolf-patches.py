#!/usr/bin/env python3

#
# The script that patches the firefox source into the neonwolf source.
#
# Neonwolf is a thin overlay on LibreWolf: this script is upstream's
# librewolf-patches.py with a small, clearly-marked Neonwolf delta:
#   - source dir named neonwolf-*
#   - synthwave theme injected via fail-loud helpers (replace_or_die)
#   - Neonwolf settings layered as overrides on top of librewolf.cfg
# Everything else is intentionally kept identical to upstream so that
# version bumps stay a `git merge upstream` away.
#


import os
import sys
import base64
import optparse
import time
from pathlib import Path
from tempfile import TemporaryDirectory


#
# general functions, skip these, they are not that interesting
#

start_time = time.time()
parser = optparse.OptionParser()
parser.add_option('-n', '--no-execute', dest='no_execute', default=False, action="store_true")
parser.add_option('-P', '--no-settings-pane', dest='settings_pane', default=True, action="store_false")
options, args = parser.parse_args()


def script_exit(statuscode):
    if (time.time() - start_time) > 60:
        # print elapsed time
        elapsed = time.strftime("%H:%M:%S", time.gmtime(time.time() - start_time))
        print("\n\aElapsed time: {elapsed}")
        sys.stdout.flush()

    sys.exit(statuscode)

def exec(cmd, exit_on_fail = True, do_print = True):
    if cmd != '':
        if do_print:
            print(cmd)
            sys.stdout.flush()
        if not options.no_execute:
            retval = os.system(cmd)
            if retval != 0 and exit_on_fail:
                print("fatal error: command '{}' failed".format(cmd))
                sys.stdout.flush()
                script_exit(1)
            return retval
        return None

def patch(patchfile):
    cmd = "patch -p1 -i {}".format(patchfile)
    print("\n*** -> {}".format(cmd))
    sys.stdout.flush()
    if not options.no_execute:
        retval = os.system(cmd)
        if retval != 0:
            print("fatal error: patch '{}' failed".format(patchfile))
            sys.stdout.flush()
            script_exit(1)


def replace_or_die(path, old, new, desc):
    """Fail-loud string injection: aborts the build if the anchor `old`
    is not found in `path`. This is the Neonwolf fix for the previous
    silent-failure theme injection — if upstream Firefox moves the
    anchor, the build stops instead of shipping an unthemed browser."""
    if options.no_execute:
        return
    with open(path, 'r') as f:
        content = f.read()
    if old not in content:
        print("fatal error: theme injection anchor not found for {} in {}".format(desc, path))
        print("             (upstream Firefox likely changed this string; update neonwolf-patches.py)")
        sys.stdout.flush()
        script_exit(1)
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("injected: {} -> {}".format(desc, path))
    sys.stdout.flush()


def require_file(path, desc):
    if options.no_execute:
        return
    if not os.path.exists(path):
        print("fatal error: expected file missing for {}: {}".format(desc, path))
        sys.stdout.flush()
        script_exit(1)


def enter_srcdir(_dir = None):
    if _dir == None:
        dir = "neonwolf-{}-{}".format(version, release)
    else:
        dir = _dir
    print("cd {}".format(dir))
    sys.stdout.flush()
    if not options.no_execute:
        try:
            os.chdir(dir)
        except:
            print("fatal error: can't change to '{}' folder.".format(dir))
            sys.stdout.flush()
            script_exit(1)

def leave_srcdir():
    print("cd ..")
    sys.stdout.flush()
    if not options.no_execute:
        os.chdir("..")



#
# This is the only interesting function in this script
#


def neonwolf_patches():

    enter_srcdir()

    # remove OpenAI integration
    exec('rm -vf toolkit/components/ml/content/backends/OpenAIPipeline.mjs')
    exec('rm -vrf toolkit/components/ml/vendor/openai')

    # create the right mozconfig file..
    exec('cp -v ../assets/mozconfig.new mozconfig')

    # copy branding + theme files (includes branding/neonwolf and the
    # synthwave theme assets under base/content)..
    exec("cp -r ../themes/browser .")

    # copy the right search-config.json file
    exec('cp -v ../assets/search-config.json services/settings/dumps/main/search-config.json')

    # read lines of .txt file into 'patches'
    with open('../assets/patches.txt'.format(version), "r") as f:
        for line in f.readlines():
            patch('../'+line)

    # apply xmas.patch seperately because not all builders use this repo the same way, and
    # we don't want to disturbe those workflows.
    patch('../patches/xmas.patch')


    # vs_pack.py issue... should be temporary
    exec('cp -v ../patches/pack_vs.py build/vs/')

    # https://codeberg.org/librewolf/source/pulls/97#issuecomment-5654510
    exec("sed -i '/# This must remain last./i gkrust_features += [\"glean_disable_upload\"]\\n' toolkit/library/rust/gkrust-features.mozbuild")

    #
    # === Neonwolf synthwave theme injection (fail-loud) ===
    #
    # neonwolf-theme.css is chrome CSS linked from browser.xhtml; the new
    # tab is a content page so its CSS must be appended to activity-stream.
    # These anchors are validated against the current Firefox source at
    # build time by replace_or_die / require_file above.

    # 1) register theme assets in jar.mn so they land in omni.ja
    replace_or_die(
        'browser/base/jar.mn',
        'content/browser/contentTheme.js                     (content/contentTheme.js)',
        'content/browser/contentTheme.js                     (content/contentTheme.js)\n'
        '        content/browser/neonwolf-theme.css                  (content/neonwolf-theme.css)\n'
        '        content/browser/synthwave-mountains.svg             (content/synthwave-mountains.svg)',
        'jar.mn theme entries')

    # 2) load neonwolf-theme.css from the main browser window
    replace_or_die(
        'browser/base/content/browser.xhtml',
        '<link rel="stylesheet" href="chrome://browser/skin/places/editBookmark.css" />',
        '<link rel="stylesheet" href="chrome://browser/skin/places/editBookmark.css" />\n'
        '  <link rel="stylesheet" href="chrome://browser/content/neonwolf-theme.css" />',
        'browser.xhtml theme link')

    # 3) synthwave-mountains.svg must sit beside the theme css in content/.
    #    The themes/browser copy already placed neonwolf-theme.css and the
    #    icons under browser/base/content/; jar.mn expects the mountains svg
    #    directly in content/, so copy it up out of icons/.
    require_file('browser/base/content/neonwolf-theme.css', 'neonwolf-theme.css (from themes/browser)')
    require_file('browser/base/content/icons/synthwave-mountains.svg', 'synthwave-mountains.svg')
    exec('cp -v browser/base/content/icons/synthwave-mountains.svg browser/base/content/synthwave-mountains.svg')

    # 4) append synthwave new tab CSS (logo base64-inlined; chrome:// URIs
    #    don't resolve from content pages). NOTE: newtab moved from
    #    browser/components/newtab to browser/extensions/newtab in FF152.
    newtab_css = 'browser/extensions/newtab/css/activity-stream.css'
    require_file(newtab_css, 'activity-stream.css (new tab styles)')
    with open('../themes/browser/base/content/icons/neonwolf-logo.svg', 'rb') as lf:
        logo_uri = 'data:image/svg+xml;base64,' + base64.b64encode(lf.read()).decode()
    with open(newtab_css, 'a') as f:
        f.write(NEWTAB_CSS.replace('@LOGO_URI@', logo_uri))
    print("appended: synthwave new tab CSS -> {}".format(newtab_css))

    #
    # Apply most recent `settings` repository files.
    # Neonwolf layers its overrides on top of upstream librewolf.cfg so the
    # privacy baseline tracks LibreWolf automatically.
    #

    exec('mkdir -p lw')
    enter_srcdir('lw')
    exec('cp -v ../../settings/librewolf.cfg .')
    # Append Neonwolf overrides after the LibreWolf baseline (later prefs win).
    # Kept in assets/ (not the settings submodule) so the submodule stays a
    # clean upstream mirror; cfg filename stays librewolf.cfg so upstream
    # patches that reference librewolf.* prefs keep working.
    exec('cat ../../assets/neonwolf.overrides.cfg >> librewolf.cfg')
    exec('cp -v ../../settings/distribution/policies.json .')
    exec('cp -v ../../settings/defaults/pref/local-settings.js .')
    leave_srcdir();



    #
    # pref-pane patches (upstream LibreWolf pref pane; Neonwolf rebrand is a
    # follow-up — kept identical to upstream for now to stay buildable)
    #

    # 1) patch it in
    patch('../patches/pref-pane/pref-pane-small.patch')
    # 2) new files
    exec('cp ../patches/pref-pane/category-librewolf.svg browser/themes/shared/preferences/category-librewolf.svg')
    exec('cp ../patches/pref-pane/librewolf.css browser/themes/shared/preferences/librewolf.css')
    exec('cp ../patches/pref-pane/librewolf.inc.xhtml browser/components/preferences/librewolf.inc.xhtml')
    exec('cp ../patches/pref-pane/librewolf.js browser/components/preferences/librewolf.js')

    # provide a script that fetches and bootstraps Nightly and some mozconfigs
    exec('cp -v ../scripts/mozfetch.sh lw/')
    exec('cp -v ../assets/mozconfig.new lw/')

    # override the firefox version
    for file in ["browser/config/version.txt", "browser/config/version_display.txt"]:
        with open(file, "w") as f:
            f.write("{}-{}".format(version,release))

    print("-> Downloading locales from https://github.com/mozilla-l10n/firefox-l10n")
    with TemporaryDirectory() as tmpdir:
        exec(f"curl -fsSL -o {tmpdir}/l10n.zip 'https://codeload.github.com/mozilla-l10n/firefox-l10n/zip/refs/heads/main'")
        exec(f"unzip -qo {tmpdir}/l10n.zip -d {tmpdir}/l10n")
        exec(f"mv {tmpdir}/l10n/firefox-l10n-main lw/l10n")

    print("-> Patching appstrings.properties")
    # Why is "Firefox" hardcoded there???
    exec("find . -path '*/appstrings.properties' -exec sed -i s/Firefox/Neonwolf/ {} \\;")

    print("-> Applying Neonwolf locales")
    l10n_dir = Path("..", "l10n")
    for source_path in l10n_dir.rglob("*"):
        if source_path.is_dir() or source_path.name.endswith(".md"):
            continue

        rel_path = source_path.relative_to(l10n_dir)
        if rel_path.parts[0] == "en-US":
            target_path = Path(
                rel_path.parts[1],
                "locales", "en-US",
                *rel_path.parts[2:]
            )
        else:
            target_path = Path(
                "lw", "l10n",
                *rel_path.parts
            )

        target_path.parent.mkdir(parents=True, exist_ok=True)

        write_mode = "w"
        if ".inc" in target_path.name:
            target_path = target_path.with_name(target_path.name.replace(".inc", ""))
            write_mode = "a"

        print(f"{source_path} {'>' if write_mode == 'w' else '>>'} {target_path}")

        if not target_path.exists() and write_mode == "a":
            print(f"warning: target file {target_path} doesn't exist")
        with open(target_path, write_mode) as target_file:
            with open(source_path, "r") as source_file:
                target_file.write(("\n\n" if write_mode == "a" else "") + source_file.read())

    leave_srcdir()


# Synthwave new tab CSS, appended verbatim to activity-stream.css.
# @LOGO_URI@ is replaced with the base64-inlined Neonwolf logo at patch time.
NEWTAB_CSS = '''
/* === Neonwolf Synthwave New Tab Background === */
body {
  background: linear-gradient(180deg,
    #0d001a 0%,
    #1a0033 15%,
    #2d0050 30%,
    #4a0070 45%,
    #8b0060 55%,
    #ff0040 62%,
    #ff6600 67%,
    #ffcc00 71%,
    #ffe600 73%,
    #ffcc00 75%,
    #ff6600 77%,
    #ff00ff 79%,
    #b000ff 82%,
    #0d001a 100%
  ) !important;
  background-position: center bottom !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
}
/* Neonwolf logo above mountains */
body::before {
  content: "";
  position: fixed;
  top: 38%;
  left: 50%;
  width: 420px;
  height: 420px;
  transform: translate(-50%, 0);
  background: url("@LOGO_URI@") no-repeat center;
  background-size: contain;
  pointer-events: none;
  z-index: 3;
}
/* Mountains + grid overlay */
body::after {
  content: "";
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 35%;
  background: url("chrome://browser/content/synthwave-mountains.svg") no-repeat center top;
  background-size: cover;
  pointer-events: none;
  z-index: 2;
}
/* Hide Firefox's own new-tab logo + wordmark — Neonwolf shows its synthwave
   hero logo via body::before above. (FF152 renders these inside
   .logo-and-wordmark; hiding the children avoids the duplicate logo while
   leaving the container's spacing intact.) */
.logo-and-wordmark .logo,
.logo-and-wordmark .wordmark {
  display: none !important;
}
/* Neon halo behind the mid-page search bar. FF152 replaced the old
   .search-handoff-button with a <content-search-handoff-ui> custom element
   inside .search-inner-wrapper, so the glow now anchors to that wrapper
   (which already sets position: relative). */
.search-wrapper .search-inner-wrapper {
  position: relative;
  z-index: 1;
}
.search-wrapper .search-inner-wrapper::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  box-shadow:
    0 0 10px #00ffff,
    0 0 20px rgba(0, 255, 255, 1),
    0 0 34px rgba(0, 255, 255, 0.75),
    0 0 52px rgba(255, 0, 255, 0.55),
    0 0 72px rgba(255, 0, 255, 0.3);
  z-index: -1;
  pointer-events: none;
}
'''


#
# Main functionality in this script.. which is to call neonwolf_patches()
#

if len(args) != 2:
    sys.stderr.write('error: please specify version and release of neonwolf source')
    sys.exit(1)
version = args[0]
release = args[1]
srcdir = "neonwolf-{}-{}".format(version, release)
if not os.path.exists(srcdir + '/configure.py'):
    sys.stderr.write('error: folder doesn\'t look like a Firefox folder.')
    sys.exit(1)

neonwolf_patches()

sys.exit(0) # ensure 0 exit code
