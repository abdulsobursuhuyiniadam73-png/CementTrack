import { auth } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const ADMIN_EMAIL = "adamabdulsobursuhuyini65@gmail.com";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const button = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");

const togglePassword = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

// =========================================
// SHOW OR HIDE PASSWORD
// =========================================

if (togglePassword && eyeIcon && passwordInput) {
  togglePassword.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";

    togglePassword.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password"
    );

    togglePassword.setAttribute("aria-pressed", String(isHidden));

    eyeIcon.innerHTML = isHidden
      ? `
        <path d="M3 3l18 18"/>
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
        <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-4 4.8"/>
        <path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1 0 2-.2 2.9-.5"/>
      `
      : `
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/>
        <circle cx="12" cy="12" r="3"/>
      `;
  });
}

// =========================================
// ADMINISTRATOR LOGIN
// =========================================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  message.textContent = "";
  message.className = "login-message";

  if (email !== ADMIN_EMAIL) {
    message.textContent =
      "This account is not authorized as the system administrator.";
    message.classList.add("error");
    return;
  }

  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Send verification email if the account is not verified.
    if (!credential.user.emailVerified) {
      try {
        await sendEmailVerification(credential.user);

        message.textContent =
          "A verification email has been sent. Check your inbox and spam folder, then click the verification link.";
      } catch (verificationError) {
        console.error(
          "Verification email error:",
          verificationError.code
        );

        message.textContent =
          verificationError.code === "auth/too-many-requests"
            ? "Too many attempts. Please wait before trying again."
            : "We couldn't send the verification email. Please try again later.";
      }

      message.classList.add("error");

      // Sign out until the email has been verified.
      await signOut(auth);
      return;
    }

    // Login successful.
    message.textContent = "Login successful. Opening dashboard...";
    message.classList.add("success");

    window.location.replace("index.html");

  } catch (error) {
    console.error("Login error:", error.code);

    const errorMessages = {
      "auth/invalid-credential":
        "The email or password is incorrect.",

      "auth/invalid-email":
        "Enter a valid email address.",

      "auth/too-many-requests":
        "Too many attempts. Please wait and try again.",

      "auth/network-request-failed":
        "Network error. Check your internet connection.",

      "auth/invalid-api-key":
        "Firebase configuration is invalid. Check firebase-config.js."
    };

    message.textContent =
      errorMessages[error.code] ||
      "Sign-in failed. Please try again.";

    message.classList.add("error");

  } finally {
    button.disabled = false;
    button.textContent = "Sign In";
  }
});