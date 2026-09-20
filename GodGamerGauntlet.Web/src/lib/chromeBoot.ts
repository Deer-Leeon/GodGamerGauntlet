export const TOKEN_KEY = "ggg_token";
export const BROWSE_COLLAPSED_KEY = "ggg-browse-rail-collapsed";
export const CONTROL_RUN_KEY = "ggg-control-run-id";

function hideBrowse(path: string): boolean {
  return (
    path.startsWith("/overlay") ||
    path.startsWith("/control") ||
    path === "/login"
  );
}

function hideControl(path: string): boolean {
  return path.startsWith("/overlay/") || path.startsWith("/control/");
}

/** Keep rail padding in place after React hydrates over the boot script. */
export function applyChromeClasses() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const path = location.pathname || "";

  if (hideBrowse(path)) {
    html.classList.remove("ggg-has-browse-rail", "ggg-browse-rail-collapsed");
  } else {
    html.classList.add("ggg-has-browse-rail");
    const browse = localStorage.getItem(BROWSE_COLLAPSED_KEY);
    const collapsed =
      browse === "1" ||
      (browse !== "0" && !localStorage.getItem(TOKEN_KEY));
    html.classList.toggle("ggg-browse-rail-collapsed", collapsed);
  }

  if (hideControl(path) || !localStorage.getItem(CONTROL_RUN_KEY)) {
    html.classList.remove("ggg-has-control-rail");
  } else {
    html.classList.add("ggg-has-control-rail");
  }
}

/** Runs before first paint so rails do not animate the page inward on refresh. */
export const CHROME_BOOT_SCRIPT = `(function(){
  try {
    var html = document.documentElement;
    html.classList.add("ggg-chrome-booting");
    var path = location.pathname || "";
    var hideBrowse =
      path.indexOf("/overlay") === 0 ||
      path.indexOf("/control") === 0 ||
      path === "/login";
    if (!hideBrowse) {
      html.classList.add("ggg-has-browse-rail");
      var browse = localStorage.getItem("ggg-browse-rail-collapsed");
      var collapsed =
        browse === "1" ||
        (browse !== "0" && !localStorage.getItem("ggg_token"));
      if (collapsed) html.classList.add("ggg-browse-rail-collapsed");
    }
    var hideControl =
      path.indexOf("/overlay/") === 0 || path.indexOf("/control/") === 0;
    if (!hideControl && localStorage.getItem("ggg-control-run-id")) {
      html.classList.add("ggg-has-control-rail");
    }
  } catch (e) {}
})();`;
