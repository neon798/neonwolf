#!/usr/bin/env python3

#
# The script that patches the firefox source into the neonwolf source.
#


import os
import sys
import optparse
import time


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
    
    # create the right mozconfig file..
    exec('cp -v ../assets/mozconfig.new mozconfig')

    # copy branding files..
    exec("cp -r ../themes/browser .")

    # copy the right search-config.json file
    exec('cp -v ../assets/search-config.json services/settings/dumps/main/search-config.json')

    # copy neonwolf replacement assets over Firefox-branded ones
    exec('cp -v ../assets/neonwolf-newtab-logo.svg browser/components/newtab/data/content/assets/firefox.svg')
    exec('cp -v ../assets/neonwolf-firefox-view.svg browser/themes/shared/icons/firefox-view.svg')
    # replace all devtools about:debugging Firefox channel SVGs with the neonwolf logo
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/aboutdebugging-firefox-neonwolf.svg')
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/aboutdebugging-firefox-aurora.svg')
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/aboutdebugging-firefox-beta.svg')
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/aboutdebugging-firefox-nightly.svg')
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/aboutdebugging-firefox-release.svg')
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/aboutdebugging-firefox-logo.svg')
    exec('cp -v ../themes/browser/base/content/icons/neonwolf-logo.svg devtools/client/themes/images/browsers/firefox.svg')

    # read lines of .txt file into 'patches'
    with open('../assets/patches.txt'.format(version), "r") as f:
        for line in f.readlines():
            patch('../'+line)

    # add neonwolf-theme.css to jar.mn so it gets packaged into omni.ja
    with open('browser/base/jar.mn', 'r') as f:
        jarmn = f.read()
    jarmn = jarmn.replace(
        'content/browser/contentTheme.js                     (content/contentTheme.js)',
        'content/browser/contentTheme.js                     (content/contentTheme.js)\n        content/browser/neonwolf-theme.css                  (content/neonwolf-theme.css)'
    )
    with open('browser/base/jar.mn', 'w') as f:
        f.write(jarmn)
    # load neonwolf-theme.css from browser.xhtml
    with open('browser/base/content/browser.xhtml', 'r') as f:
        bxhtml = f.read()
    bxhtml = bxhtml.replace(
        '<link rel="stylesheet" href="chrome://browser/skin/places/editBookmark.css" />',
        '<link rel="stylesheet" href="chrome://browser/skin/places/editBookmark.css" />\n  <link rel="stylesheet" href="chrome://browser/content/neonwolf-theme.css" />'
    )
    with open('browser/base/content/browser.xhtml', 'w') as f:
        f.write(bxhtml)

    # apply xmas.patch seperately because not all builders use this repo the same way, and
    # we don't want to disturbe those workflows.
    patch('../patches/xmas.patch')


    # vs_pack.py issue... should be temporary
    exec('cp -v ../patches/pack_vs.py build/vs/')


    #
    # Apply most recent `settings` repository files.
    #

    exec('mkdir -p lw')
    enter_srcdir('lw')
    exec('cp -v ../../settings/neonwolf.cfg .')
    exec('cp -v ../../settings/distribution/policies.json .')
    exec('cp -v ../../settings/defaults/pref/local-settings.js .')
    leave_srcdir();


    
    #
    # pref-pane patches
    #

    # 1) patch it in
    patch('../patches/pref-pane/pref-pane-small.patch')
    # 2) new files
    exec('cp ../patches/pref-pane/category-neonwolf.svg browser/themes/shared/preferences/category-neonwolf.svg')
    exec('cp ../patches/pref-pane/neonwolf.css browser/themes/shared/preferences/neonwolf.css')
    exec('cp ../patches/pref-pane/neonwolf.inc.xhtml browser/components/preferences/neonwolf.inc.xhtml')
    exec('cp ../patches/pref-pane/neonwolf.js browser/components/preferences/neonwolf.js')
    # 3) append our locale string values to preferences.ftl
    exec('cat browser/locales/en-US/browser/preferences/preferences.ftl ../patches/pref-pane/preferences.ftl > preferences.ftl')
    exec('mv preferences.ftl browser/locales/en-US/browser/preferences/preferences.ftl')


    
    # provide a script that fetches and bootstraps Nightly and some mozconfigs
    exec('cp -v ../scripts/mozfetch.sh lw/', exit_on_fail=False)
    exec('cp -v ../assets/mozconfig.new ../scripts/setup-wasi-linux.sh lw/', exit_on_fail=False)

    # override the firefox version
    for file in ["browser/config/version.txt", "browser/config/version_display.txt"]:
        with open(file, "w") as f:
            f.write("{}-{}".format(version,release))

    # generate locales
    exec("bash ../scripts/generate-locales.sh")
    
    leave_srcdir()



#
# Main functionality in this script.. which is to call neonwolf_patches()
#

if len(args) != 2:
    sys.stderr.write('error: please specify version and release of neonwolf source')
    sys.exit(1)
version = args[0]
release = args[1]
if not os.path.exists('neonwolf-{}-{}'.format(version, release) + '/configure.py'):
    sys.stderr.write('error: folder doesn\'t look like a Firefox folder.')
    sys.exit(1)

neonwolf_patches()

sys.exit(0) # ensure 0 exit code
