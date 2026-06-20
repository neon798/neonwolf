var NeonwolfShieldsPanel = {
  async show(event) {
    let panel = document.getElementById("neonwolf-shields-panel");
    if (!panel) {
      return;
    }
    panel.openPopup(event.target, "bottomcenter topright");

    let host = gBrowser.currentURI.host;
    let hostEl = document.getElementById("neonwolf-shields-host");
    if (hostEl) {
      hostEl.textContent = host || "Unknown";
    }

    let countEl = document.getElementById("neonwolf-shields-count");
    if (countEl) {
      let count = Services.prefs.getIntPref("neonwolf.shields.blockedCount", 0);
      countEl.textContent = count;
    }

    let toggles = ["ads", "trackers", "fingerprinting", "cookies", "httpsUpgrade"];
    for (let toggle of toggles) {
      let enabled = Services.prefs.getBoolPref(`neonwolf.shields.${toggle}`, true);
      let el = document.getElementById(`neonwolf-shields-${toggle}`);
      if (el) {
        el.checked = enabled;
      }
    }
  },

  toggleShield(type, enabled) {
    Services.prefs.setBoolPref(`neonwolf.shields.${type}`, enabled);
  },

  toggleAll(enabled) {
    Services.prefs.setBoolPref("neonwolf.shields.enabled", enabled);
    let g = NeonwolfShields;
    if (g) {
      g._enabled = enabled;
    }
    let btn = document.getElementById("neonwolf-shields-button");
    if (btn) {
      btn.setAttribute("shields", enabled ? "up" : "down");
    }
  }
};
