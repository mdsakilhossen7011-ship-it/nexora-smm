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

function setAuthPage(page) {
  const registering = page === "register";
  homePage.classList.add("hidden");
  authPage.classList.remove("hidden");
  document.getElementById("nameField").classList.toggle("hidden", !registering);
  document.getElementById("emailField").classList.toggle("hidden", !registering);
  document.getElementById("phoneField").classList.toggle("hidden", !registering);
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
  }
  if (event.target.closest('a[href="#home"]')) {
    showHome();
    navLinks.classList.remove("open");
  }
});

menuToggle.addEventListener("click", () => navLinks.classList.toggle("open"));

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authNotice.textContent = "Not connected yet: no account data was sent or saved. Backend authentication must be implemented before this form can be used.";
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
document.querySelector(".nav-actions").prepend(themeButton);

document.getElementById("year").textContent = new Date().getFullYear();

if (location.hash === "#login" || location.hash === "#register") {
  setAuthPage(location.hash.slice(1));
}
