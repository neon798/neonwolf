## Neonwolf preferences

# Sidebar
pane-neonwolf-title = Neonwolf
category-neonwolf =
    .tooltiptext = about:config changes, logically grouped and easily accessible

# Main content
neonwolf-header = Neonwolf Preferences
neonwolf-warning-title = Heads up!
neonwolf-warning-description = We carefully choose default settings to focus on privacy and security. When changing these settings, read the descriptions to understand the implications of those changes.

# Page Layout
neonwolf-general-heading = Browser Behavior
neonwolf-extension-update-checkbox =
    .label = Update add-ons automatically
neonwolf-sync-checkbox =
    .label = Enable Firefox Sync
neonwolf-autocopy-checkbox =
    .label = Enable middle click paste
neonwolf-styling-checkbox = 
    .label = Allow userChrome.css customization

neonwolf-network-heading = Networking
neonwolf-ipv6-checkbox =
    .label = Enable IPv6

neonwolf-privacy-heading = Privacy
neonwolf-xorigin-ref-checkbox =
    .label = Limit cross-origin referrers

neonwolf-broken-heading = Fingerprinting
neonwolf-webgl-checkbox =
    .label = Enable WebGL
neonwolf-rfp-checkbox =
    .label = Enable ResistFingerprinting
neonwolf-auto-decline-canvas-checkbox =
    .label = Silently block canvas access requests
neonwolf-letterboxing-checkbox =
    .label = Enable letterboxing

neonwolf-security-heading = Security
neonwolf-ocsp-checkbox =
    .label = Enforce OCSP hard-fail
neonwolf-goog-safe-checkbox =
    .label = Enable Google Safe Browsing
neonwolf-goog-safe-download-checkbox =
    .label = Scan downloads

# In-depth descriptions
neonwolf-extension-update-description = Keep extensions up to date without manual intervention. A good choice for your security.
neonwolf-extension-update-warning1 = If you don't review the code of your extensions before every update, you should enable this option.

neonwolf-ipv6-description = Allow { -brand-short-name } to connect using IPv6.
neonwolf-ipv6-warning1 = Instead of blocking IPv6 in the browser, we suggest enabling the IPv6 privacy extension in your OS.
neonwolf-ocsp-description = Prevent connecting to a website if the OCSP check cannot be performed.
neonwolf-ocsp-warning1 = This increases security, but it will cause breakage when an OCSP server is down.
neonwolf-sync-description = Sync your data with other browsers. Requires restart.
neonwolf-sync-warning1 = Firefox Sync encrypts data locally before transmitting it to the server.

neonwolf-autocopy-description = Select some text to copy it, then paste it with a middle-mouse click.

neonwolf-styling-description = Enable this if you want to customize the UI with a manually loaded theme.
neonwolf-styling-warning1 = Make sure you trust the provider of the theme.

neonwolf-xorigin-ref-description = Send a referrer only on same-origin.
neonwolf-xorigin-ref-warning1 = This may cause breakage. Additionally, even when sent referrers will still be trimmed.

neonwolf-webgl-description = WebGL is a strong fingerprinting vector.
neonwolf-webgl-warning1 = If you need to enable it, consider using an extension like Canvas Blocker.

neonwolf-rfp-description = ResistFingerprinting is the best in class anti-fingerprinting tool.
neonwolf-rfp-warning1 = If you need to disable it, consider using an extension like Canvas Blocker.

neonwolf-auto-decline-canvas-description = Automatically deny canvas access to websites, without prompting the user.
neonwolf-auto-decline-canvas-warning1 = It is still possible to allow canvas access from the urlbar.

neonwolf-letterboxing-description = Letterboxing applies margins around your windows, in order to return a limited set of rounded resolutions.

neonwolf-goog-safe-description = If you are worried about malware and phishing, consider enabling it.
neonwolf-goog-safe-warning1 = Disabled over censorship concerns but recommended for less advanced users. All the checks happen locally.

neonwolf-goog-safe-download-description = Allow Safe Browsing to scan your downloads to identify suspicious files.
neonwolf-goog-safe-download-warning1 = All the checks happen locally.

# Footer
neonwolf-footer = Useful links
neonwolf-config-link = All advanced settings (about:config)
neonwolf-open-profile = Open user profile directory
