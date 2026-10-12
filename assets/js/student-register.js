document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("formError");
  const submitBtn = document.getElementById("registerBtn");

  const fullNameInput = document.getElementById("fullName");
  const phoneInput = document.getElementById("phone");

  // Keep the phone field digits-only as the user types, capped at 10 digits -
  // this alone prevents the most common mistake (typing +91 or a leading 0).
  phoneInput.addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9]/g, "").slice(0, 10);
  });

  // Block digits/symbols in the name field as the user types.
  fullNameInput.addEventListener("input", function () {
    this.value = this.value.replace(/[^A-Za-z ]/g, "");
  });

  function validateClientSide(payload) {
    if (!/^[A-Za-z ]{2,60}$/.test(payload.fullName)) {
      return "Name should contain only alphabets and spaces";
    }
    if (!/^[6-9]\d{9}$/.test(payload.phone)) {
      return "Enter a valid 10-digit Indian mobile number";
    }
    if (!payload.branch) {
      return "Please select your training branch";
    }
    if (!payload.department) {
      return "Please select your department";
    }
    if (payload.password !== payload.confirmPassword) {
      return "Passwords do not match";
    }
    if (payload.password.length < 6) {
      return "Password must be at least 6 characters";
    }
    return null;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.classList.remove("show");

    const payload = {
      fullName: fullNameInput.value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: phoneInput.value.trim(),
      studentId: document.getElementById("studentId").value.trim(),
      branch: document.getElementById("branch").value,
      department: document.getElementById("department").value,
      dateOfJoin: document.getElementById("dateOfJoin").value || null,
      password: document.getElementById("password").value,
      confirmPassword: document.getElementById("confirmPassword").value
    };

    const clientError = validateClientSide(payload);
    if (clientError) {
      errorBox.textContent = clientError;
      errorBox.classList.add("show");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating your account…";

    try {
      const resp = await apiRequest("/api/auth/register", { method: "POST", body: payload });
      Auth.save(resp);
      window.location.href = "student-dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
    }
  });
});
