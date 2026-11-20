const homePage = document.getElementById("homePage");
const authPage = document.getElementById("authPage");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authSubmit = document.getElementById("authSubmit");
const authSwitch = document.getElementById("authSwitch");
const authNotice = document.getElementById("authNotice");
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const publicNav = document.getElementById("publicNav");
const accountNav = document.getElementById("accountNav");

function setSignedIn(signedIn) {
  publicNav.classList.toggle("hidden", signedIn);
  accountNav.classList.toggle("hidden", !signedIn);
  navLinks.classList.toggle("account-mode", signedIn);
}

async function checkSession() {
  try {
    const response = await fetch((window.NEXORA_API_URL || "/api") + "/me", { credentials: "include" });
    setSignedIn(response.ok);
  } catch {
    setSignedIn(false);
  }
}

function setAuthPage(page) {
  const registering = page === "register";
  homePage.classList.add("hidden");
  authPage.classList.remove("hidden");
  document.getElementById("nameField").classList.toggle("hidden", !registering);
  document.getElementById("emailField").classList.toggle("hidden", !registering);
  document.getElementById("phoneField").classList.toggle("hidden", !registering);
  document.getElementById("referralField").classList.toggle("hidden", !registering);
  const referralFromUrl = new URLSearchParams(location.search).get("ref");
  if (registering && referralFromUrl && !document.getElementById("referralCode").value) document.getElementById("referralCode").value = referralFromUrl.slice(0,32);
  document.getElementById("confirmField").classList.toggle("hidden", !registering);
  document.getElementById("fullName").required = registering;
  document.getElementById("email").required = registering;
  document.getElementById("confirmPassword").required = registering;
  authTitle.textContent = registering ? "Create your account" : "Sign in to your account";
  authSubtitle.textContent = registering ? "Join NEXORA and get started." : "Welcome back. Enter your details to continue.";
  authSubmit.textContent = registering ? "Create Account" : "Login";
  authSwitch.innerHTML = registering
    ? 'Already have an account? <button type="button" data-page="login">Login now</button>'
    : 'Don\'t have an account? <button type="button" data-page="register">Create account</button>';
  authNotice.textContent = "Secure account registration and login will be activated after the backend and authentication provider are configured. This form does not create or sign in to accounts yet.";
  history.replaceState(null, "", registering ? "#register" : "#login");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  authPage.classList.add("hidden");
  homePage.classList.remove("hidden");
  history.replaceState(null, "", "#home");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    event.preventDefault();
    setAuthPage(pageButton.dataset.page);
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation menu");
    menuToggle.querySelector("span").textContent = "☰";
  }
  if (event.target.closest('a[href="#home"]')) {
    showHome();
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation menu");
    menuToggle.querySelector("span").textContent = "☰";
  }
});

menuToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
  menuToggle.querySelector("span").textContent = isOpen ? "×" : "☰";
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const registering = !document.getElementById("confirmField").classList.contains("hidden");
  const form = new FormData(authForm);
  const payload = registering
    ? { fullName: form.get("fullName"), username: form.get("username"), email: form.get("email"), phone: form.get("phone"), referralCode: form.get("referralCode"), password: form.get("password") }
    : { login: form.get("username"), password: form.get("password") };
  if (registering && payload.password !== form.get("confirmPassword")) {
    authNotice.textContent = "Passwords do not match.";
    return;
  }
  authSubmit.disabled = true;
  authSubmit.textContent = registering ? "Creating account…" : "Signing in…";
  try {
    const response = await fetch((window.NEXORA_API_URL || "/api") + (registering ? "/auth/register" : "/auth/login"), {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Request failed.");
    authNotice.textContent = registering ? "Account created successfully." : "Login successful.";
    window.location.href = "/dashboard.html";
  } catch (error) {
    authNotice.textContent = error.message.includes("Failed to fetch")
      ? "The secure API is not deployed or configured yet. Your details were not saved."
      : error.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = registering ? "Create Account" : "Login";
  }
});

const themeButton = document.createElement("button");
themeButton.type = "button";
themeButton.className = "btn btn-ghost theme-toggle";
themeButton.setAttribute("aria-label", "Switch color theme");
themeButton.textContent = "☼";
themeButton.addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  themeButton.textContent = document.body.classList.contains("light-theme") ? "☾" : "☼";
});
document.querySelector("#publicNav .nav-actions").prepend(themeButton);

document.getElementById("homeLogoutBtn").addEventListener("click", async () => {
  const button = document.getElementById("homeLogoutBtn");
  button.disabled = true;
  try {
    await fetch((window.NEXORA_API_URL || "/api") + "/auth/logout", {
      method: "POST", credentials: "include"
    });
  } finally {
    setSignedIn(false);
    navLinks.classList.remove("open");
    button.disabled = false;
    showHome();
  }
});

checkSession();

document.getElementById("year").textContent = new Date().getFullYear();

if (location.hash === "#login" || location.hash === "#register") {
  setAuthPage(location.hash.slice(1));
}
