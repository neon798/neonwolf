#!/usr/bin/env python3
"""Generate the content-classifier-lists RemoteSettings dump from the bundled
adblock filter lists, so Neonwolf's native ad/tracker blocking works out of the
box with no extension and no network fetch.

Mirrors Firefox's own attachment-dump layout (see services/settings/dumps/main/
search-config-icons). Inside the extracted Firefox tree this writes:

  services/settings/dumps/main/content-classifier-lists.json          (records)
  services/settings/dumps/main/content-classifier-lists/<id>          (raw list)
  services/settings/dumps/main/content-classifier-lists/<id>.meta.json (sidecar == record)

and appends the FINAL_TARGET_FILES packaging lines to
services/settings/dumps/main/moz.build.

The C++ ContentClassifierService loads these via ContentClassifierRemoteSettings-
Client (RemoteSettings("content-classifier-lists").get() + attachments.download
with fallbackToDump). The collection must be allowed *from dump only* (see
neonwolf.overrides.cfg); allowing it for network sync would delete the bundled
lists.

Usage: gen-adblock-dump.py <assets_adblock_dir> <firefox_tree_root>
"""

import hashlib
import json
import os
import sys
import uuid

COLLECTION = "content-classifier-lists"

# Fixed namespace + timestamp so the dump is byte-reproducible across builds.
# The actual timestamp value is arbitrary; it only has to be identical between
# each record and its meta.json sidecar (RemoteSettings matches on it).
_NAMESPACE = uuid.UUID("9f1c0a2e-7b3d-5e6f-8a91-2c4d6e8f0a1b")
_LAST_MODIFIED = 1718841600000

_MOZBUILD_MARKER = "# Neonwolf: native ad-block filter lists"

# Record name -> source filename in the assets/adblock dir. These are the lists
# enabled for blocking via privacy.trackingprotection.content.protection.list_names
# in neonwolf.overrides.cfg.
LISTS = [
    ("easylist", "easylist.txt"),
    ("easyprivacy", "easyprivacy.txt"),
    ("peterlowe", "peterlowe.txt"),
    ("ubo-filters", "ubo-filters.txt"),
    ("ubo-badware", "ubo-badware.txt"),
    ("ubo-privacy", "ubo-privacy.txt"),
    ("ubo-quickfixes", "ubo-quickfixes.txt"),
    ("adguard-mobile", "adguard-mobile.txt"),
    ("adguard-base", "adguard-base.txt"),
    ("adguard-tracking", "adguard-tracking.txt"),
    ("neonwolf-extra", "neonwolf-extra.txt"),
]


def main(assets_dir, tree):
    main_dir = os.path.join(tree, "services", "settings", "dumps", "main")
    coll_dir = os.path.join(main_dir, COLLECTION)
    os.makedirs(coll_dir, exist_ok=True)

    records = []
    packaged = []
    for name, fname in LISTS:
        src = os.path.join(assets_dir, fname)
        with open(src, "rb") as f:
            data = f.read()

        rid = str(uuid.uuid5(_NAMESPACE, name))
        record = {
            "id": rid,
            "last_modified": _LAST_MODIFIED,
            "Name": name,
            "attachment": {
                "hash": hashlib.sha256(data).hexdigest(),
                "size": len(data),
                "filename": fname,
                "location": "main/%s/%s.txt" % (COLLECTION, rid),
                "mimetype": "text/plain",
            },
        }

        # Attachment binary is named by record id (no extension); the .meta.json
        # sidecar is byte-identical to the record in the main dump.
        with open(os.path.join(coll_dir, rid), "wb") as f:
            f.write(data)
        with open(os.path.join(coll_dir, rid + ".meta.json"), "w") as f:
            json.dump(record, f, separators=(",", ":"))

        records.append(record)
        packaged.append("%s/%s" % (COLLECTION, rid))
        packaged.append("%s/%s.meta.json" % (COLLECTION, rid))

    with open(os.path.join(main_dir, COLLECTION + ".json"), "w") as f:
        json.dump({"data": records, "timestamp": _LAST_MODIFIED}, f,
                  separators=(",", ":"))

    _append_packaging(os.path.join(main_dir, "moz.build"), packaged)
    print("gen-adblock-dump: packaged %d lists into %s" % (len(records), COLLECTION))

    # M2 scriptlet/redirect resource bundle (assets/ubo-resources.json, vendored
    # by scripts/vendor-ubo/run.sh). Optional: if absent, scriptlet injection
    # gracefully degrades to empty. Packages to <GreD>/browser/defaults/settings/
    # ubo-resources.json, where ContentClassifierService reads it.
    _package_resource_bundle(assets_dir, main_dir)


def _package_resource_bundle(assets_dir, main_dir):
    src = os.path.join(assets_dir, "..", "ubo-resources.json")
    if not os.path.exists(src):
        print("gen-adblock-dump: no ubo-resources.json; scriptlets disabled")
        return
    # MUST live at the dumps ROOT, not under main/: gen_last_modified.py globs
    # services/settings/dumps/*/*.json and parses each as a RemoteSettings
    # changeset (requires a "data"/"timestamp" shape). ubo-resources.json is a
    # bare Resource array, so placing it one level deeper would break that build
    # step. A file directly in dumps/ is not matched by the */*.json glob.
    dumps_root = os.path.dirname(main_dir)  # services/settings/dumps
    with open(src, "rb") as f:
        data = f.read()
    with open(os.path.join(dumps_root, "ubo-resources.json"), "wb") as f:
        f.write(data)
    mozbuild = os.path.join(dumps_root, "moz.build")
    marker = "# Neonwolf M2: scriptlet/redirect resource bundle"
    with open(mozbuild, "r") as f:
        if marker in f.read():
            return  # idempotent
    with open(mozbuild, "a") as f:
        f.write('\n%s\nFINAL_TARGET_FILES.defaults.settings += ["ubo-resources.json"]\n'
                % marker)
    print("gen-adblock-dump: packaged ubo-resources.json (%d bytes)" % len(data))


def _append_packaging(mozbuild, packaged):
    with open(mozbuild, "r") as f:
        if _MOZBUILD_MARKER in f.read():
            return  # idempotent: already appended for this tree
    lines = [
        "\n%s (content-classifier).\n" % _MOZBUILD_MARKER,
        'FINAL_TARGET_FILES.defaults.settings.main += ["%s.json"]\n' % COLLECTION,
        'FINAL_TARGET_FILES.defaults.settings.main["%s"] += [\n' % COLLECTION,
    ]
    # FINAL_TARGET_FILES is a StrictOrderingOnAppendList: entries must be sorted.
    lines += ['    "%s",\n' % p for p in sorted(packaged)]
    lines.append("]\n")
    with open(mozbuild, "a") as f:
        f.write("".join(lines))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: gen-adblock-dump.py <assets_adblock_dir> <firefox_tree_root>")
    main(sys.argv[1], sys.argv[2])
