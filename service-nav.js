(() => {
  const menu = document.getElementById("mobileMenu");
  if (!menu) return;

  const loginLink = Array.from(menu.querySelectorAll("a")).find(link =>
    /login/i.test(link.textContent) || /#login/.test(link.getAttribute("href") || "")
  );

  fetch("/api/me", { credentials: "include", cache: "no-store" })
    .then(response => {
      if (!response.ok) return false;
      return response.json().then(() => true);
    })
    .then(signedIn => {
      if (!signedIn || !loginLink) return;

      const dashboardLink = document.createElement("a");
      dashboardLink.href = "/dashboard.html";
      dashboardLink.textContent = "Dashboard";
      loginLink.replaceWith(dashboardLink);

      const logoutLink = document.createElement("a");
      logoutLink.href = "#logout";
      logoutLink.textContent = "Logout";
      logoutLink.dataset.serviceLogout = "true";
      logoutLink.className = "menu-logout";
      menu.append(logoutLink);
    })
    .catch(() => {});

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