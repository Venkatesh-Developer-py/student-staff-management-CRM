document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("formError");
  const submitBtn = document.getElementById("loginBtn");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.classList.remove("show");

    const payload = {
      identifier: document.getElementById("identifier").value.trim(),
      password: document.getElementById("password").value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    try {
      const resp = await apiRequest("/api/auth/login", { method: "POST", body: payload });
      Auth.save(resp);
      window.location.href = "student-dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "LOGIN";
    }
  });
});
