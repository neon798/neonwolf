/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const { CustomizableUI } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableUI.sys.mjs"
);

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("version").textContent = AppConstants.MOZ_APP_VERSION;
  document.getElementById("brandName").textContent = "Neonwolf";

  let neonwolfLink = document.getElementById("neonwolfLink");
  if (neonwolfLink) {
    neonwolfLink.href = "https://neonwolf.browser";
  }
});
