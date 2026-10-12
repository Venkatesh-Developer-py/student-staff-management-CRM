document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("adminLoginForm");
  const errorBox = document.getElementById("formError");
  const submitBtn = document.getElementById("adminLoginBtn");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.classList.remove("show");

    // Shared Admin/Trainer login - the backend decides which role this
    // identifier belongs to and returns a JWT accordingly (see
    // AuthService.adminLogin). admin-dashboard.js reads that role and
    // shows the right view; there is nothing role-specific to pick here.
    const payload = {
      identifier: document.getElementById("adminEmail").value.trim(),
      password: document.getElementById("adminPassword").value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    try {
      const resp = await apiRequest("/api/admin/auth/login", { method: "POST", body: payload });
      Auth.save(resp);
      window.location.href = "admin-dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in to Admin";
    }
  });
});
