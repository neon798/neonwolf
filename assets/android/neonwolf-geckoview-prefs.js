// === Neonwolf Android privacy defaults ===
// Appended/injected into mobile/android/app/geckoview-prefs.js at patch time.
// Mirrors the Gecko-shared surface of assets/neonwolf.overrides.cfg + critical
// LibreWolf baseline items that Fenix would otherwise leave open.
// Prefer pref() here (static defaults). Fenix must not clobber these on start.

// --- Branding / support ---
pref("app.support.baseURL", "https://github.com/neon798/neonwolf/");
pref("app.releaseNotesURL", "https://github.com/neon798/neonwolf/releases/");

// --- Native uBO / content-classifier (must init on GV) ---
pref("privacy.trackingprotection.content.protection.enabled", true);
pref("privacy.trackingprotection.content.protection.list_names", "easylist,easyprivacy,peterlowe,ubo-filters,ubo-badware,ubo-privacy,ubo-quickfixes,adguard-mobile,adguard-base,adguard-tracking,neonwolf-extra");
pref("privacy.trackingprotection.defer_annotation_enabled", true);
pref("privacy.trackingprotection.content.network_cancel.enabled", false);
pref("privacy.trackingprotection.ubo.cosmetic.enabled", true);
pref("privacy.trackingprotection.ubo.scriptlet.enabled", false);
pref("privacy.trackingprotection.enabled", true);
pref("privacy.trackingprotection.pbmode.enabled", true);
pref("privacy.trackingprotection.socialtracking.enabled", true);
pref("privacy.trackingprotection.fingerprinting.enabled", true);
pref("privacy.trackingprotection.cryptomining.enabled", true);

// Live list refresh (same contract as desktop)
pref("neonwolf.shields.lists.autoRefresh", true);
pref("neonwolf.shields.lists.refreshIntervalHours", 24);
pref("neonwolf.shields.lists.refreshNow", false);
pref("neonwolf.shields.lists.lastRefresh", 0);
pref("neonwolf.shields.lists.subscriptions", "");

// --- FPP-forward farbling (RFP off) ---
pref("privacy.resistFingerprinting", false);
pref("privacy.fingerprintingProtection", true);
pref("privacy.fingerprintingProtection.remoteOverrides.enabled", false);
pref("privacy.fingerprintingProtection.overrides", "+WebGLRandomization,+WebGLRenderInfo,+NavigatorHWConcurrency,+AudioContext,+AudioSampleRate,+FontVisibilityBaseSystem,+ReduceTimerPrecision");
pref("privacy.spoof_english", 2);
pref("layout.css.prefers-color-scheme.content-override", 2);

// --- DNS-over-HTTPS Mullvad TRR-only ---
pref("network.trr.mode", 3);
pref("network.trr.uri", "https://base.dns.mullvad.net/dns-query");
pref("network.trr.default_provider_uri", "https://base.dns.mullvad.net/dns-query");
pref("network.trr.wait-for-portal", true);
pref("network.trr.skip-address-validation", true);

// --- Credential / autofill: remove, don't manage ---
pref("signon.rememberSignons", false);
pref("signon.autofillForms", false);
pref("extensions.formautofill.addresses.enabled", false);
pref("extensions.formautofill.creditCards.enabled", false);
pref("extensions.formautofill.addresses.supported", "off");
pref("extensions.formautofill.creditCards.supported", "off");

// --- Permissions default block ---
pref("permissions.default.geo", 2);
pref("permissions.default.camera", 2);
pref("permissions.default.microphone", 2);
pref("permissions.default.desktop-notification", 2);

// --- Extra hardening ---
pref("browser.send_pings", false);
pref("network.http.referer.defaultPolicy", 0);
pref("dom.security.https_only_mode", true);
pref("dom.security.mixed_content.block_active_content", true);
pref("webgl.disabled", false);
pref("device.sensors.enabled", false);
pref("dom.battery.enabled", false);
pref("dom.gamepad.enabled", false);
pref("dom.netinfo.enabled", false);
pref("media.peerconnection.ice.no_host", true);
pref("privacy.globalprivacycontrol.enabled", true);
pref("privacy.globalprivacycontrol.functionality.enabled", true);
pref("network.cookie.cookieBehavior", 5);

// --- Safe Browsing: no Google phone-home (malware via uBO lists) ---
pref("browser.safebrowsing.malware.enabled", false);
pref("browser.safebrowsing.phishing.enabled", false);
pref("browser.safebrowsing.downloads.enabled", false);
pref("browser.safebrowsing.provider.google4.enabled", false);
pref("browser.safebrowsing.provider.google5.enabled", false);
pref("browser.safebrowsing.provider.google5.updateURL", "");
pref("browser.safebrowsing.provider.google5.gethashURL", "");

// --- Telemetry / experiments off (belt + suspenders with Lite) ---
pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("app.shield.optoutstudies.enabled", false);
pref("browser.discovery.enabled", false);
pref("nimbus.remote-settings.enabled", false);

// --- Clear on shutdown defaults (Fenix also has its own clear-on-exit) ---
pref("privacy.clearOnShutdown_v2.cookiesAndStorage", true);

// RemoteSettings dump allowlist (LibreWolf/Neonwolf rs-blocker)
pref("librewolf.services.settings.allowedCollectionsFromDump", "main/devtools-devices,main/devtools-compatibility-browsers,main/search-config-icons,main/search-config-v2,main/search-config-overrides-v2,main/content-classifier-lists");
pref("librewolf.services.settings.allowedCollections", "security-state/intermediates,security-state/onecrl,security-state/cert-revocations,security-state/message-signatures,main/anti-tracking-url-decoration,main/query-stripping,main/url-parser-default-unknown-schemes-interventions,main/partitioning-exempt-urls,main/url-classifier-skip-urls,main/fingerprinting-protection-overrides,main/translations-models,main/translations-wasm");
