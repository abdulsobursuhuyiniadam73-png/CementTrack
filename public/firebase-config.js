import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCv8B79cQOTEGjiMZ15hNNVhZ1-3dCPMyY",
  authDomain: "cement-sales-tracking-system.firebaseapp.com",
  projectId: "cement-sales-tracking-system",
  storageBucket: "cement-sales-tracking-system.firebasestorage.app",
  messagingSenderId: "492598391847",
  appId: "1:492598391847:web:c13b2ab9725d39a3088a02"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);