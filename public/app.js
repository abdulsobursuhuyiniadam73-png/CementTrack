
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  getDocs,
  getDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// =========================================
// 1. CONFIGURATION
// =========================================

const ADMIN_EMAIL = "adamabdulsobursuhuyini65@gmail.com";

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const overlay = document.getElementById("overlay");

const pageTitle = document.getElementById("pageTitle");
const breadcrumb = document.getElementById("breadcrumb");
const currentDate = document.getElementById("currentDate");
const pageContent = document.getElementById("pageContent");

let stopInventoryListener = null;
let stopDeliveryListener = null;

let inventoryItems = [];

// =========================================
// 2. ICONS AND DATE
// =========================================

function initializeIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function displayCurrentDate() {
  if (!currentDate) return;

  currentDate.textContent = new Date().toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// =========================================
// 3. MOBILE SIDEBAR
// =========================================

function openSidebar() {
  if (!sidebar || !overlay || !menuToggle) return;

  sidebar.classList.add("open");
  overlay.classList.add("show");
  menuToggle.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  if (!sidebar || !overlay || !menuToggle) return;

  sidebar.classList.remove("open");
  overlay.classList.remove("show");
  menuToggle.setAttribute("aria-expanded", "false");
}

menuToggle?.addEventListener("click", () => {
  if (sidebar?.classList.contains("open")) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

overlay?.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

// =========================================
// 4. PAGE NAVIGATION
// =========================================

const dashboardHTML = pageContent?.innerHTML || "";

const pageNames = {
  dashboard: "Dashboard",
  inventory: "Cement Inventory",
  deliveries: "Stock Deliveries",
  sales: "Sales & Receipts",
  customers: "Customers",
  expenses: "Expenses",
  reports: "Reports"
};

function stopInventoryUpdates() {
  if (stopInventoryListener) {
    stopInventoryListener();
    stopInventoryListener = null;
  }
}

function stopDeliveryUpdates() {
  if (stopDeliveryListener) {
    stopDeliveryListener();
    stopDeliveryListener = null;
  }
}

function showPage(page) {
  if (!Object.prototype.hasOwnProperty.call(pageNames, page)) return;

  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === page;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (pageTitle) {
    pageTitle.textContent =
      page === "dashboard" ? "Dashboard Overview" : pageNames[page];
  }

  if (breadcrumb) {
    breadcrumb.textContent = pageNames[page];
  }

  if (page !== "inventory") {
    stopInventoryUpdates();
  }

  if (page !== "deliveries") {
    stopDeliveryUpdates();
  }

  if (!pageContent) return;

  if (page === "dashboard") {
    pageContent.innerHTML = dashboardHTML;
    displayCurrentDate();
    initializeIcons();
    closeSidebar();
    return;
  }

  if (page === "inventory") {
    renderInventoryPage();
    closeSidebar();
    return;
  }

  if (page === "deliveries") {
    renderDeliveriesPage();
    closeSidebar();
    return;
  }

  pageContent.innerHTML = `
    <section class="panel" style="padding:30px 20px;margin-top:10px;">
      <div style="text-align:center;padding:30px 10px;">
        <i data-lucide="construction"
           style="width:42px;height:42px;color:var(--primary);"></i>

        <h2 style="font-size:20px;margin:15px 0 10px;">
          ${pageNames[page]}
        </h2>

        <p style="color:var(--text-secondary);">
          This module is being prepared.
        </p>

        <button type="button" id="backToDashboard"
          class="text-button" style="margin-top:20px;">
          <i data-lucide="arrow-left"></i>
          Back to Dashboard
        </button>
      </div>
    </section>
  `;

  initializeIcons();

  document.getElementById("backToDashboard")?.addEventListener(
    "click",
    () => showPage("dashboard")
  );

  closeSidebar();
}

// =========================================
// 5. INVENTORY PAGE
// =========================================

function renderInventoryPage() {
  stopInventoryUpdates();
  inventoryItems = [];

  pageContent.innerHTML = `
    <section class="panel" style="padding:22px;margin-top:10px;">

      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;
                  align-items:center;gap:12px;margin-bottom:20px;">

        <div>
          <h2 style="font-size:20px;margin-bottom:6px;">Cement Inventory</h2>
          <p style="color:var(--text-secondary);font-size:13px;">
            Manage cement varieties, prices and stock levels.
          </p>
        </div>

        <button type="button" id="showAddCement"
          style="padding:11px 15px;border:0;border-radius:8px;
                 background:var(--primary);color:white;cursor:pointer;">
          + Add Cement Variety
        </button>
      </div>

      <div id="inventoryMessage" role="status" aria-live="polite"
           style="margin-bottom:15px;"></div>

      <!-- ADD CEMENT FORM -->

      <div id="addCementSection" hidden
           style="border:1px solid var(--border);border-radius:10px;
                  padding:18px;margin-bottom:22px;">

        <h3 style="margin-bottom:16px;">Add a Cement Variety</h3>

        <form id="addCementForm">
          <div style="display:grid;
                      grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
                      gap:15px;">

            <label style="display:grid;gap:7px;">
              Cement name
              <input name="name" type="text" maxlength="100"
                placeholder="e.g. Ordinary Portland Cement" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Brand
              <input name="brand" type="text" maxlength="100"
                placeholder="e.g. CIMAF" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Buying price per bag (GH₵)
              <input name="buyingPrice" type="number" min="0" step="0.01"
                placeholder="0.00" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Selling price per bag (GH₵)
              <input name="sellingPrice" type="number" min="0" step="0.01"
                placeholder="0.00" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Low-stock alert (bags)
              <input name="lowStockThreshold" type="number" min="0" step="1"
                value="20" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;">
            <button type="submit" id="saveCementButton"
              style="padding:11px 18px;border:0;border-radius:7px;
                     background:var(--primary);color:white;cursor:pointer;">
              Save Cement Variety
            </button>

            <button type="button" id="cancelAddCement"
              style="padding:11px 18px;border:1px solid var(--border);
                     border-radius:7px;background:transparent;
                     color:var(--text-primary);cursor:pointer;">
              Cancel
            </button>
          </div>
        </form>
      </div>

      <!-- EDIT CEMENT FORM -->

      <div id="editCementSection" hidden
           style="border:1px solid var(--primary);border-radius:10px;
                  padding:18px;margin-bottom:22px;">

        <h3 style="margin-bottom:16px;">Edit Cement Variety</h3>

        <form id="editCementForm">

          <input type="hidden" name="cementId">

          <div style="display:grid;
                      grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
                      gap:15px;">

            <label style="display:grid;gap:7px;">
              Cement name
              <input name="name" type="text" maxlength="100" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Brand
              <input name="brand" type="text" maxlength="100" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Buying price per bag (GH₵)
              <input name="buyingPrice" type="number" min="0" step="0.01" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Selling price per bag (GH₵)
              <input name="sellingPrice" type="number" min="0" step="0.01" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Low-stock alert (bags)
              <input name="lowStockThreshold" type="number" min="0" step="1"
                required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;">
            <button type="submit" id="updateCementButton"
              style="padding:11px 18px;border:0;border-radius:7px;
                     background:var(--primary);color:white;cursor:pointer;">
              Save Changes
            </button>

            <button type="button" id="cancelEditCement"
              style="padding:11px 18px;border:1px solid var(--border);
                     border-radius:7px;background:transparent;
                     color:var(--text-primary);cursor:pointer;">
              Cancel
            </button>
          </div>

        </form>
      </div>

      <!-- INVENTORY SEARCH -->

      <div style="margin-bottom:16px;">
        <input id="inventorySearch" type="search"
          placeholder="Search by cement name or brand..."
          aria-label="Search inventory"
          style="width:100%;max-width:400px;padding:11px;
                 border:1px solid var(--border);border-radius:8px;
                 background:var(--card-bg,transparent);
                 color:var(--text-primary);">
      </div>

      <!-- INVENTORY TABLE -->

      <div style="width:100%;overflow-x:auto;">
        <table style="width:100%;min-width:850px;border-collapse:collapse;">
          <thead>
            <tr style="text-align:left;border-bottom:1px solid var(--border);">
              <th style="padding:13px 10px;">Cement Name</th>
              <th style="padding:13px 10px;">Brand</th>
              <th style="padding:13px 10px;">Buying Price</th>
              <th style="padding:13px 10px;">Selling Price</th>
              <th style="padding:13px 10px;">Stock (Bags)</th>
              <th style="padding:13px 10px;">Status</th>
              <th style="padding:13px 10px;">Actions</th>
            </tr>
          </thead>

          <tbody id="inventoryTableBody">
            <tr>
              <td colspan="7" style="padding:25px;text-align:center;">
                Loading inventory...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p id="inventoryCount"
         style="margin-top:15px;color:var(--text-secondary);font-size:13px;">
        Loading...
      </p>
    </section>
  `;

  // ADD FORM EVENTS

  document.getElementById("showAddCement").addEventListener("click", () => {
    const section = document.getElementById("addCementSection");

    section.hidden = !section.hidden;

    if (!section.hidden) {
      document.getElementById("editCementSection").hidden = true;
      document.getElementById("showAddCement").textContent = "− Close Form";
    } else {
      document.getElementById("showAddCement").textContent =
        "+ Add Cement Variety";
    }
  });

  document.getElementById("cancelAddCement").addEventListener("click", () => {
    document.getElementById("addCementForm").reset();
    document.getElementById("addCementSection").hidden = true;
    document.getElementById("showAddCement").textContent =
      "+ Add Cement Variety";
  });

  document.getElementById("addCementForm").addEventListener(
    "submit",
    saveCementVariety
  );

  // EDIT FORM EVENTS

  document.getElementById("cancelEditCement").addEventListener("click", () => {
    document.getElementById("editCementForm").reset();
    document.getElementById("editCementSection").hidden = true;
  });

  document.getElementById("editCementForm").addEventListener(
    "submit",
    saveCementEdits
  );

  // INVENTORY SEARCH

  document.getElementById("inventorySearch").addEventListener("input", () => {
    renderInventoryRows();
  });

  // EDIT BUTTON EVENT DELEGATION

  document.getElementById("inventoryTableBody").addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(".edit-cement-btn");

      if (!button) return;

      openEditCementForm(button.dataset.id);
    }
  );

  // FIRESTORE REAL-TIME LISTENER

  const inventoryQuery = query(
    collection(db, "cementVarieties"),
    orderBy("name")
  );

  stopInventoryListener = onSnapshot(
    inventoryQuery,
    (snapshot) => {
      inventoryItems = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data()
      }));

      renderInventoryRows();
    },
    (error) => {
      console.error("Inventory loading error:", error);

      document.getElementById("inventoryTableBody").innerHTML = `
        <tr>
          <td colspan="7" style="padding:25px;text-align:center;">
            Could not load inventory. Check your connection and Firestore rules.
          </td>
        </tr>
      `;

      document.getElementById("inventoryCount").textContent =
        "Inventory could not be loaded.";

      showInventoryMessage(
        "Unable to load inventory. Please check your internet connection and administrator permissions.",
        "error"
      );
    }
  );

  initializeIcons();
}

// =========================================
// 6. STOCK DELIVERIES PAGE
// =========================================

function renderDeliveriesPage() {
  stopDeliveryUpdates();

  pageContent.innerHTML = `
    <section class="panel" style="padding:22px;margin-top:10px;">

      <div style="margin-bottom:22px;">
        <h2 style="font-size:20px;margin-bottom:6px;">
          Stock Deliveries
        </h2>

        <p style="color:var(--text-secondary);font-size:13px;">
          Record new cement deliveries and update available stock.
        </p>
      </div>

      <div id="deliveryMessage" role="status" aria-live="polite"
           style="margin-bottom:15px;"></div>

      <div style="border:1px solid var(--border);border-radius:10px;
                  padding:18px;margin-bottom:25px;">

        <h3 id="deliveryFormTitle" style="margin-bottom:16px;">
  Record New Delivery
</h3>

        <form id="deliveryForm">
  <input type="hidden" name="deliveryId">

          <div style="display:grid;
                      grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
                      gap:15px;">

            <label style="display:grid;gap:7px;">
              Cement Variety
              <select name="cementId" id="deliveryCement" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
                <option value="">Loading cement varieties...</option>
              </select>
            </label>

            <label style="display:grid;gap:7px;">
              Number of Bags
              <input name="quantity" type="number" min="1" step="1"
                placeholder="e.g. 100" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Buying Price per Bag (GH₵)
              <input name="buyingPrice" type="number" min="0" step="0.01"
                placeholder="e.g. 85.00" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Supplier
              <input name="supplier" type="text" maxlength="100"
                placeholder="Supplier name"
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

            <label style="display:grid;gap:7px;">
              Delivery Date
              <input name="deliveryDate" type="date" required
                style="width:100%;padding:11px;border:1px solid var(--border);
                       border-radius:7px;background:var(--card-bg,transparent);
                       color:var(--text-primary);">
            </label>

          </div>

<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;">

  <button type="submit" id="saveDeliveryButton"
    style="padding:11px 18px;border:0;border-radius:7px;
           background:var(--primary);color:white;cursor:pointer;">
    Save Delivery
  </button>

  <button type="button" id="cancelDeliveryEdit" hidden
    style="padding:11px 18px;border:1px solid var(--border);
           border-radius:7px;background:transparent;
           color:var(--text-primary);cursor:pointer;">
    Cancel Edit
  </button>

</div>
        </form>
      </div>

      <div>
        <h3 style="margin-bottom:15px;">Recent Deliveries</h3>

        <div style="width:100%;overflow-x:auto;">
          <table style="width:100%;min-width:750px;border-collapse:collapse;">

            <thead>
              <tr style="text-align:left;border-bottom:1px solid var(--border);">
                <th style="padding:13px 10px;">Date</th>
                <th style="padding:13px 10px;">Cement</th>
                <th style="padding:13px 10px;">Bags</th>
                <th style="padding:13px 10px;">Price per Bag</th>
                <th style="padding:13px 10px;">Total Cost</th>
                <th style="padding:13px 10px;">Supplier</th>
                <th style="padding:13px 10px;">Actions</th>
              </tr>
            </thead>

            <tbody id="deliveriesTableBody">
              <tr>
                <td colspan="7" style="padding:25px;text-align:center;">
                  Loading deliveries...
                </td>
              </tr>
            </tbody>

          </table>
        </div>
      </div>

    </section>
  `;

  // Set today's date as the default.
  const today = new Date();

  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  document.querySelector(
    "#deliveryForm [name='deliveryDate']"
  ).value = localDate;

  loadDeliveryCementOptions();

  document.getElementById("deliveryForm").addEventListener(
    "submit",
    saveStockDelivery
  );

  loadStockDeliveries();
}

// =========================================
// 7. LOAD CEMENT OPTIONS FOR DELIVERIES
// =========================================

async function loadDeliveryCementOptions() {
  const select = document.getElementById("deliveryCement");

  if (!select) return;

  select.innerHTML = `
    <option value="">Loading cement varieties...</option>
  `;

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "cementVarieties"),
        orderBy("name")
      )
    );

    const activeCements = snapshot.docs
      .map((document) => ({
        id: document.id,
        ...document.data()
      }))
      .filter((item) => item.active === true);

    if (!document.getElementById("deliveryCement")) return;

    select.innerHTML = `
      <option value="">Select cement variety</option>
    `;

    activeCements.forEach((item) => {
      const option = document.createElement("option");

      option.value = item.id;
      option.textContent = `${item.name} (${item.brand})`;

      select.appendChild(option);
    });

    if (activeCements.length === 0) {
      select.innerHTML = `
        <option value="">No active cement varieties found</option>
      `;
    }

  } catch (error) {
    console.error("Error loading cement varieties:", error);

    select.innerHTML = `
      <option value="">Could not load cement varieties</option>
    `;

    showDeliveryMessage(
      "Unable to load cement varieties. Check your connection and permissions.",
      "error"
    );
  }
}

// =========================================
// 8. SAVE STOCK DELIVERY
// =========================================
async function saveStockDelivery(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("saveDeliveryButton");

  const data = new FormData(form);

  const deliveryId = String(data.get("deliveryId") || "").trim();
  const cementId = String(form.elements.cementId.value || "").trim();

  const quantityText = data.get("quantity");
  const buyingPriceText = data.get("buyingPrice");

  const quantity = Number(quantityText);
  const buyingPrice = Number(buyingPriceText);

  const supplier = String(data.get("supplier") || "").trim();
  const deliveryDate = String(data.get("deliveryDate") || "").trim();

  if (
    !cementId ||
    quantityText === "" ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    buyingPriceText === "" ||
    !Number.isFinite(buyingPrice) ||
    buyingPrice < 0 ||
    !deliveryDate
  ) {
    showDeliveryMessage("Please enter valid delivery details.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = deliveryId ? "Updating..." : "Saving...";

  try {
    const user = auth.currentUser;

    if (
      !user ||
      user.email?.toLowerCase() !== ADMIN_EMAIL ||
      !user.emailVerified
    ) {
      throw new Error("Please sign in with the verified administrator account.");
    }

    const cementRef = doc(db, "cementVarieties", cementId);

    const deliveryRef = deliveryId
      ? doc(db, "stockDeliveries", deliveryId)
      : doc(collection(db, "stockDeliveries"));

    await runTransaction(db, async (transaction) => {

      const cementSnapshot = await transaction.get(cementRef);

      if (!cementSnapshot.exists()) {
        throw new Error("The selected cement variety does not exist.");
      }

      const cement = cementSnapshot.data();

      if (cement.active !== true) {
        throw new Error("This cement variety is inactive.");
      }

      const currentStock = Number(cement.stockQuantity || 0);

      let newStock = currentStock;

      if (deliveryId) {

        const oldDeliverySnapshot = await transaction.get(deliveryRef);

        if (!oldDeliverySnapshot.exists()) {
          throw new Error("The delivery record no longer exists.");
        }

        const oldDelivery = oldDeliverySnapshot.data();

        if (oldDelivery.cementId !== cementId) {
          throw new Error("You cannot change the cement variety while editing.");
        }

        const oldQuantity = Number(oldDelivery.quantity || 0);

        newStock = currentStock - oldQuantity + quantity;

        if (!Number.isSafeInteger(newStock) || newStock < 0) {
          throw new Error("This change would result in invalid stock.");
        }

        transaction.update(deliveryRef, {
          quantity,
          buyingPrice,
          totalCost: quantity * buyingPrice,
          supplier,
          deliveryDate,
          cementName: cement.name || "",
          brand: cement.brand || "",
          updatedAt: serverTimestamp()
        });

      } else {

        newStock = currentStock + quantity;

        if (!Number.isSafeInteger(newStock)) {
          throw new Error("Stock quantity is too large.");
        }

        transaction.set(deliveryRef, {
          cementId,
          cementName: cement.name || "",
          brand: cement.brand || "",
          quantity,
          buyingPrice,
          totalCost: quantity * buyingPrice,
          supplier,
          deliveryDate,
          createdAt: serverTimestamp()
        });
      }

      transaction.update(cementRef, {
        stockQuantity: newStock,
        updatedAt: serverTimestamp()
      });
    });

    showDeliveryMessage(
      deliveryId
        ? "Delivery updated successfully. Stock has been adjusted."
        : `${quantity} bags added to stock successfully.`,
      "success"
    );

    cancelDeliveryEdit();

  } catch (error) {
    console.error("Stock delivery operation failed:", error);

    showDeliveryMessage(
      error.message || "Could not save the delivery.",
      "error"
    );

  } finally {
    button.disabled = false;

    button.textContent =
      document.querySelector("#deliveryForm [name='deliveryId']")?.value
        ? "Update Delivery"
        : "Save Delivery";
  }
}

// =========================================
// 9. LOAD DELIVERY HISTORY
// =========================================

function loadStockDeliveries() {
  const tbody = document.getElementById("deliveriesTableBody");

  if (!tbody) return;

  const deliveryQuery = query(
    collection(db, "stockDeliveries"),
    orderBy("createdAt", "desc")
  );

  stopDeliveryListener = onSnapshot(
    deliveryQuery,

    (snapshot) => {
      if (!document.getElementById("deliveriesTableBody")) return;

      if (snapshot.empty) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding:25px;text-align:center;">
              No stock deliveries recorded yet.
            </td>
          </tr>
        `;
        return;
      }

      const safe = (value) => String(value ?? "").replace(
        /[&<>"']/g,
        (character) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[character]
      );

      const money = (value) =>
        Number(value || 0).toLocaleString("en-GH", {
          style: "currency",
          currency: "GHS",
          minimumFractionDigits: 2
        });

      tbody.innerHTML = snapshot.docs.map((document) => {
        const item = document.data();
        const deliveryId = document.id;

        return `
          <tr style="border-bottom:1px solid var(--border);">

            <td style="padding:13px 10px;">
              ${safe(item.deliveryDate)}
            </td>

            <td style="padding:13px 10px;">
              ${safe(item.cementName)} (${safe(item.brand)})
            </td>

            <td style="padding:13px 10px;">
              ${Number(item.quantity || 0)}
            </td>

            <td style="padding:13px 10px;">
              ${money(item.buyingPrice)}
            </td>

            <td style="padding:13px 10px;">
              ${money(item.totalCost)}
            </td>

            <td style="padding:13px 10px;">
              ${safe(item.supplier || "—")}
            </td>

            <td style="padding:13px 10px;white-space:nowrap;">

              <button type="button"
                class="edit-delivery-btn"
                data-id="${safe(deliveryId)}"
                style="padding:7px 10px;border:1px solid var(--border);
                       border-radius:6px;background:transparent;
                       color:var(--text-primary);cursor:pointer;">
                Edit
              </button>

              <button type="button"
                class="delete-delivery-btn"
                data-id="${safe(deliveryId)}"
                style="padding:7px 10px;border:0;border-radius:6px;
                       background:#fee2e2;color:#b91c1c;
                       cursor:pointer;margin-left:5px;">
                Delete
              </button>

            </td>

          </tr>
        `;
      }).join("");
    },

    (error) => {
      console.error("Loading deliveries failed:", error);

      if (document.getElementById("deliveriesTableBody")) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding:25px;text-align:center;">
              Could not load delivery history.
            </td>
          </tr>
        `;
      }

      showDeliveryMessage(
        "Unable to load delivery history. Check your connection and permissions.",
        "error"
      );
    }
  );
}

// =========================================
// EDIT STOCK DELIVERY
// =========================================

async function editStockDelivery(id) {
  try {
    const deliveryRef = doc(db, "stockDeliveries", id);
    const deliverySnapshot = await getDoc(deliveryRef);

    if (!deliverySnapshot.exists()) {
      alert("Delivery record not found.");
      return;
    }

    const delivery = deliverySnapshot.data();

    const form = document.getElementById("deliveryForm");

    if (!form) return;

    form.elements.deliveryId.value = id;
    form.elements.cementId.value = delivery.cementId;
    form.elements.quantity.value = delivery.quantity;
    form.elements.buyingPrice.value = delivery.buyingPrice;
    form.elements.supplier.value = delivery.supplier || "";
    form.elements.deliveryDate.value = delivery.deliveryDate;

    // Prevent changing the cement variety during editing.
    form.elements.cementId.disabled = true;

    document.getElementById("deliveryFormTitle").textContent =
      "Edit Stock Delivery";

    document.getElementById("saveDeliveryButton").textContent =
      "Update Delivery";

    document.getElementById("cancelDeliveryEdit").hidden = false;

    form.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

  } catch (error) {
    console.error("Error loading delivery:", error);
    alert("Unable to load this delivery for editing.");
  }
}

// =========================================
// CANCEL DELIVERY EDIT
// =========================================

function cancelDeliveryEdit() {
  const form = document.getElementById("deliveryForm");

  if (!form) return;

  form.reset();

  form.elements.deliveryId.value = "";
  form.elements.cementId.disabled = false;

  document.getElementById("deliveryFormTitle").textContent =
    "Record New Delivery";

  document.getElementById("saveDeliveryButton").textContent =
    "Save Delivery";

  document.getElementById("cancelDeliveryEdit").hidden = true;

  const today = new Date();

  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  form.elements.deliveryDate.value = localDate;
}

// =========================================
// DELETE STOCK DELIVERY
// =========================================

async function deleteStockDelivery(id) {
  const confirmed = confirm(
    "Are you sure you want to delete this delivery? The stock quantity will also be reversed."
  );

  if (!confirmed) return;

  try {
    const user = auth.currentUser;

    if (
      !user ||
      user.email?.toLowerCase() !== ADMIN_EMAIL ||
      !user.emailVerified
    ) {
      throw new Error("Administrator verification required.");
    }

    const deliveryRef = doc(db, "stockDeliveries", id);

    await runTransaction(db, async (transaction) => {

      const deliverySnapshot = await transaction.get(deliveryRef);

      if (!deliverySnapshot.exists()) {
        throw new Error("Delivery record not found.");
      }

      const delivery = deliverySnapshot.data();

      const cementRef = doc(
        db,
        "cementVarieties",
        delivery.cementId
      );

      const cementSnapshot = await transaction.get(cementRef);

      if (!cementSnapshot.exists()) {
        throw new Error("The associated cement variety was not found.");
      }

      const cement = cementSnapshot.data();

      const currentStock = Number(cement.stockQuantity || 0);
      const quantity = Number(delivery.quantity || 0);

      const newStock = currentStock - quantity;

      if (newStock < 0) {
        throw new Error(
          "Cannot delete this delivery because some of its stock has already been sold or used."
        );
      }

      transaction.update(cementRef, {
        stockQuantity: newStock,
        updatedAt: serverTimestamp()
      });

      transaction.delete(deliveryRef);
    });

    showDeliveryMessage(
      "Delivery deleted successfully and stock adjusted.",
      "success"
    );

  } catch (error) {
    console.error("Error deleting delivery:", error);

    showDeliveryMessage(
      error.message || "Unable to delete this delivery.",
      "error"
    );
  }
}

// =========================================
// 10. DELIVERY FEEDBACK MESSAGES
// =========================================

function showDeliveryMessage(message, type) {
  const element = document.getElementById("deliveryMessage");

  if (!element) return;

  const color = type === "success" ? "#15803d" : "#dc2626";

  element.textContent = message;
  element.style.color = color;
  element.style.padding = "10px 12px";
  element.style.border = `1px solid ${color}`;
  element.style.borderRadius = "8px";
  element.style.background = "transparent";
}

// =========================================
// 11. DISPLAY INVENTORY ROWS
// =========================================

function renderInventoryRows() {
  const tbody = document.getElementById("inventoryTableBody");
  const count = document.getElementById("inventoryCount");
  const search = document.getElementById("inventorySearch");

  if (!tbody || !count || !search) return;

  const term = search.value.trim().toLowerCase();

  const filtered = inventoryItems.filter((item) =>
    `${item.name || ""} ${item.brand || ""}`.toLowerCase().includes(term)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:25px;text-align:center;">
          ${inventoryItems.length === 0
            ? "No cement varieties yet. Select Add Cement Variety to begin."
            : "No matching cement varieties found."}
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = filtered.map((item) => {
      const stock = Number(item.stockQuantity || 0);
      const threshold = Number(item.lowStockThreshold ?? 20);

      let status = "In Stock";
      let statusColor = "#15803d";

      if (item.active !== true) {
        status = "Inactive";
        statusColor = "#64748b";
      } else if (stock === 0) {
        status = "Out of Stock";
        statusColor = "#dc2626";
      } else if (stock <= threshold) {
        status = "Low Stock";
        statusColor = "#b45309";
      }

      const money = (value) =>
        Number(value || 0).toLocaleString("en-GH", {
          style: "currency",
          currency: "GHS",
          minimumFractionDigits: 2
        });

      const safe = (value) => String(value ?? "").replace(
        /[&<>"']/g,
        (character) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[character]
      );

      return `
        <tr style="border-bottom:1px solid var(--border);">

          <td style="padding:13px 10px;">${safe(item.name)}</td>

          <td style="padding:13px 10px;">${safe(item.brand)}</td>

          <td style="padding:13px 10px;">
            ${money(item.buyingPrice)}
          </td>

          <td style="padding:13px 10px;">
            ${money(item.sellingPrice)}
          </td>

          <td style="padding:13px 10px;font-weight:600;">
            ${stock}
          </td>

          <td style="padding:13px 10px;">
            <span style="color:${statusColor};font-weight:600;">
              ${status}
            </span>
          </td>

          <td style="padding:13px 10px;">
            <button type="button"
              class="edit-cement-btn"
              data-id="${safe(item.id)}"
              style="padding:7px 12px;border:1px solid var(--primary);
                     border-radius:6px;background:transparent;
                     color:var(--primary);cursor:pointer;">
              <i data-lucide="pencil" style="width:14px;height:14px;
                 vertical-align:middle;"></i>
              Edit
            </button>
          </td>

        </tr>
      `;
    }).join("");
  }

  count.textContent =
    `Showing ${filtered.length} of ${inventoryItems.length} cement varieties.`;

  initializeIcons();
}

// =========================================
// 12. OPEN EDIT CEMENT FORM
// =========================================

function openEditCementForm(id) {
  const item = inventoryItems.find((cement) => cement.id === id);

  if (!item) {
    showInventoryMessage(
      "The selected cement variety could not be found.",
      "error"
    );
    return;
  }

  const form = document.getElementById("editCementForm");

  if (!form) return;

  form.elements.cementId.value = item.id;
  form.elements.name.value = item.name || "";
  form.elements.brand.value = item.brand || "";
  form.elements.buyingPrice.value = item.buyingPrice ?? 0;
  form.elements.sellingPrice.value = item.sellingPrice ?? 0;
  form.elements.lowStockThreshold.value = item.lowStockThreshold ?? 20;

  document.getElementById("addCementSection").hidden = true;

  document.getElementById("showAddCement").textContent =
    "+ Add Cement Variety";

  document.getElementById("editCementSection").hidden = false;

  showInventoryMessage(
    `Editing ${item.name || "cement variety"}.`,
    "success"
  );

  document.getElementById("editCementSection").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// =========================================
// 13. SAVE CEMENT EDITS
// =========================================

async function saveCementEdits(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("updateCementButton");
  const data = new FormData(form);

  const id = String(data.get("cementId") || "").trim();
  const name = String(data.get("name") || "").trim();
  const brand = String(data.get("brand") || "").trim();

  const buyingPriceText = data.get("buyingPrice");
  const sellingPriceText = data.get("sellingPrice");
  const thresholdText = data.get("lowStockThreshold");

  const buyingPrice = Number(buyingPriceText);
  const sellingPrice = Number(sellingPriceText);
  const lowStockThreshold = Number(thresholdText);

  if (
    !id ||
    !name ||
    !brand ||
    buyingPriceText === "" ||
    sellingPriceText === "" ||
    thresholdText === "" ||
    !Number.isFinite(buyingPrice) ||
    !Number.isFinite(sellingPrice) ||
    !Number.isInteger(lowStockThreshold) ||
    buyingPrice < 0 ||
    sellingPrice < 0 ||
    lowStockThreshold < 0
  ) {
    showInventoryMessage(
      "Enter valid names, prices and a whole-number stock threshold of zero or more.",
      "error"
    );
    return;
  }

  button.disabled = true;
  button.textContent = "Updating...";

  try {
    const user = auth.currentUser;

    if (
      !user ||
      user.email?.toLowerCase() !== ADMIN_EMAIL ||
      !user.emailVerified
    ) {
      throw new Error(
        "Please sign in with the verified administrator account."
      );
    }

    await updateDoc(doc(db, "cementVarieties", id), {
      name,
      brand,
      buyingPrice,
      sellingPrice,
      lowStockThreshold,
      updatedAt: serverTimestamp()
    });

    showInventoryMessage(
      "Cement variety updated successfully.",
      "success"
    );

    form.reset();
    document.getElementById("editCementSection").hidden = true;

  } catch (error) {
    console.error("Updating cement variety failed:", error);

    let errorMessage =
      "Could not update the cement variety. Please try again.";

    if (error.code === "permission-denied") {
      errorMessage =
        "Firestore denied this update. Check your administrator login and security rules.";
    } else if (error.code === "unavailable") {
      errorMessage =
        "Firestore is unavailable. Check your internet connection.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    showInventoryMessage(errorMessage, "error");

  } finally {
    button.disabled = false;
    button.textContent = "Save Changes";
  }
}

// =========================================
// 14. SAVE A NEW CEMENT VARIETY
// =========================================

async function saveCementVariety(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("saveCementButton");
  const data = new FormData(form);

  const name = String(data.get("name") || "").trim();
  const brand = String(data.get("brand") || "").trim();

  const buyingPriceText = data.get("buyingPrice");
  const sellingPriceText = data.get("sellingPrice");
  const thresholdText = data.get("lowStockThreshold");

  const buyingPrice = Number(buyingPriceText);
  const sellingPrice = Number(sellingPriceText);
  const lowStockThreshold = Number(thresholdText);

  if (
    !name ||
    !brand ||
    buyingPriceText === "" ||
    sellingPriceText === "" ||
    thresholdText === "" ||
    !Number.isFinite(buyingPrice) ||
    !Number.isFinite(sellingPrice) ||
    !Number.isInteger(lowStockThreshold) ||
    buyingPrice < 0 ||
    sellingPrice < 0 ||
    lowStockThreshold < 0
  ) {
    showInventoryMessage(
      "Enter valid names, prices and a whole-number stock threshold of zero or more.",
      "error"
    );
    return;
  }

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const user = auth.currentUser;

    if (
      !user ||
      user.email?.toLowerCase() !== ADMIN_EMAIL ||
      !user.emailVerified
    ) {
      throw new Error(
        "Please sign in with the verified administrator account."
      );
    }

    await addDoc(collection(db, "cementVarieties"), {
      name,
      brand,
      buyingPrice,
      sellingPrice,
      lowStockThreshold,
      stockQuantity: 0,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showInventoryMessage(
      "Cement variety added successfully.",
      "success"
    );

    form.reset();

    document.getElementById("addCementSection").hidden = true;

    document.getElementById("showAddCement").textContent =
      "+ Add Cement Variety";

  } catch (error) {
    console.error("Saving cement variety failed:", error);

    let errorMessage =
      "Could not save the cement variety. Please try again.";

    if (error.code === "permission-denied") {
      errorMessage =
        "Firestore denied this operation. Check your administrator login and security rules.";
    } else if (error.code === "unavailable") {
      errorMessage =
        "Firestore is unavailable. Check your internet connection.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    showInventoryMessage(errorMessage, "error");

  } finally {
    button.disabled = false;
    button.textContent = "Save Cement Variety";
  }
}

// =========================================
// 15. INVENTORY FEEDBACK MESSAGES
// =========================================

function showInventoryMessage(text, type) {
  const message = document.getElementById("inventoryMessage");

  if (!message) return;

  const color = type === "success" ? "#15803d" : "#dc2626";

  message.textContent = text;
  message.style.color = color;
  message.style.padding = "10px 12px";
  message.style.border = `1px solid ${color}`;
  message.style.borderRadius = "8px";
  message.style.background = "transparent";
}

// =========================================
// 16. CONNECT NAVIGATION BUTTONS
// =========================================

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    showPage(link.dataset.page);
  });
});

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    showPage(button.dataset.open);
  });
});

// =========================================
// 17. AUTHENTICATE ADMINISTRATOR
// =========================================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopInventoryUpdates();
    stopDeliveryUpdates();

    window.location.replace("login.html");
    return;
  }

  const isAdmin =
    user.email?.toLowerCase() === ADMIN_EMAIL &&
    user.emailVerified;

  if (!isAdmin) {
    stopInventoryUpdates();
    stopDeliveryUpdates();

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign-out error:", error.code);
    }

    window.location.replace("login.html");
    return;
  }

  document.body.classList.add("auth-ready");

  displayCurrentDate();
  initializeIcons();

  console.log("CementTrack administrator authenticated.");
});

// =========================================
// DELIVERY EDIT AND DELETE EVENTS
// =========================================

document.addEventListener("click", (event) => {

  const editButton = event.target.closest(".edit-delivery-btn");
  const deleteButton = event.target.closest(".delete-delivery-btn");

  if (editButton) {
    editStockDelivery(editButton.dataset.id);
  }

  if (deleteButton) {
    deleteStockDelivery(deleteButton.dataset.id);
  }

  if (event.target.closest("#cancelDeliveryEdit")) {
    cancelDeliveryEdit();
  }

});
