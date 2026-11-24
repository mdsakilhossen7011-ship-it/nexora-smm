/* Protect every standalone service page while keeping the catalogue public on the homepage. */
(() => {
  const menu = document.getElementById("mobileMenu");
  if (!menu) return;

  const destination = window.location.pathname + window.location.search + window.location.hash;
  const loginUrl = "/?next=" + encodeURIComponent(destination) + "#login";

  fetch("/api/me", { credentials: "include", cache: "no-store" })
    .then(async response => {
      if (!response.ok) {
        window.location.replace(loginUrl);
        return false;
      }
      try { await response.json(); } catch (_error) {}
      return true;
    })
    .then(signedIn => {
      if (!signedIn) return;
      const loginLink = Array.from(menu.querySelectorAll("a")).find(link =>
        /login/i.test(link.textContent) || /#login/.test(link.getAttribute("href") || "")
      );
      if (loginLink) loginLink.remove();
      if (menu.querySelector("[data-service-logout]")) return;

      const logoutLink = document.createElement("a");
      logoutLink.href = "#logout";
      logoutLink.textContent = "Logout";
      logoutLink.dataset.serviceLogout = "true";
      logoutLink.className = "menu-logout";
      menu.append(logoutLink);
    })
    .catch(() => {
      window.location.replace(loginUrl);
    });

  menu.addEventListener("click", async event => {
    const logout = event.target.closest("[data-service-logout]");
    if (!logout) return;
    event.preventDefault();
    logout.textContent = "Logging out…";
    logout.style.pointerEvents = "none";
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Logout failed");
      window.location.href = "/";
    } catch {
      logout.textContent = "Logout failed — try again";
      logout.style.pointerEvents = "";
    }
  });
})();
