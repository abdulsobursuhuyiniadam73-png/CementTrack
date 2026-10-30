const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { z } = require("zod");

initializeApp();

const db = getFirestore();

// Only this verified administrator can use the initial backend.
const ADMIN_EMAIL = "adamabdulsobursuhuyini65@gmail.com";

// Validate every new cement variety before saving it.
const cementSchema = z.object({
  name: z.string().trim().min(1).max(100),
  brand: z.string().trim().min(1).max(100),
  buyingPrice: z.number().finite().nonnegative(),
  sellingPrice: z.number().finite().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative().default(20),
});

// Check that the caller is the verified administrator.
function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in before continuing."
    );
  }

  if (
    request.auth.token.email !== ADMIN_EMAIL ||
    request.auth.token.email_verified !== true
  ) {
    throw new HttpsError(
      "permission-denied",
      "Only the verified system administrator can perform this action."
    );
  }
}

// Add a cement variety to Firestore.
exports.addCementVariety = onCall(async (request) => {
  requireAdmin(request);

  const parsed = cementSchema.safeParse(request.data);

  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues
        .map((issue) => issue.message)
        .join("; ")
    );
  }

  const cement = parsed.data;
  const now = new Date().toISOString();

  const variety = {
    name: cement.name,
    brand: cement.brand,
    buyingPrice: cement.buyingPrice,
    sellingPrice: cement.sellingPrice,
    lowStockThreshold: cement.lowStockThreshold,
    stockQuantity: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection("cementVarieties").add(variety);

  return {
    success: true,
    id: docRef.id,
    message: "Cement variety added successfully.",
  };
});

/**
 * Record a cement delivery and update stock safely.
 * The Firestore transaction ensures stock and delivery records
 * are saved together, preventing partial updates.
 */
exports.recordStockDelivery = onCall(async (request) => {
  requireAdmin(request);

  const deliverySchema = z.object({
    varietyId: z.string().trim().min(1),
    quantity: z.number().int().positive(),
    unitCost: z.number().finite().nonnegative(),
    supplier: z.string().trim().max(150).optional(),
    reference: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
  });

  const parsed = deliverySchema.safeParse(request.data);

  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }

  const delivery = parsed.data;
  const varietyRef = db
    .collection("cementVarieties")
    .doc(delivery.varietyId);

  const deliveryRef = db.collection("stockDeliveries").doc();
  const movementRef = db.collection("stockMovements").doc();

  await db.runTransaction(async (transaction) => {
    const varietySnapshot = await transaction.get(varietyRef);

    if (!varietySnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "The selected cement variety does not exist."
      );
    }

    const variety = varietySnapshot.data();

    if (variety.active !== true) {
      throw new HttpsError(
        "failed-precondition",
        "This cement variety is inactive."
      );
    }

    const previousStock = variety.stockQuantity || 0;
    const newStock = previousStock + delivery.quantity;
    const now = new Date().toISOString();

    transaction.update(varietyRef, {
      stockQuantity: newStock,
      updatedAt: now,
    });

    transaction.set(deliveryRef, {
      varietyId: delivery.varietyId,
      varietyName: variety.name,
      brand: variety.brand,
      quantity: delivery.quantity,
      unitCost: delivery.unitCost,
      totalCost: delivery.quantity * delivery.unitCost,
      previousStock,
      newStock,
      supplier: delivery.supplier || "",
      reference: delivery.reference || "",
      notes: delivery.notes || "",
      recordedAt: now,
      recordedBy: request.auth.uid,
    });

    transaction.set(movementRef, {
      varietyId: delivery.varietyId,
      type: "delivery",
      quantity: delivery.quantity,
      stockBefore: previousStock,
      stockAfter: newStock,
      deliveryId: deliveryRef.id,
      recordedAt: now,
      recordedBy: request.auth.uid,
    });
  });

  return {
    success: true,
    deliveryId: deliveryRef.id,
    movementId: movementRef.id,
    message: "Stock delivery recorded successfully.",
  };
});

/**
 * Create a sale containing one or more cement varieties.
 * Stock updates and the sale record are committed atomically.
 */
exports.createSale = onCall(async (request) => {
  requireAdmin(request);

  const saleSchema = z.object({
    customerName: z.string().trim().max(150).optional(),
    customerId: z.string().trim().min(1).optional(),
    paymentMethod: z.enum([
      "cash",
      "mobile_money",
      "bank_transfer",
      "credit",
      "mixed",
    ]),
    amountPaid: z.number().finite().nonnegative(),
    discount: z.number().finite().nonnegative().default(0),
    items: z.array(
      z.object({
        varietyId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().finite().nonnegative(),
      })
    ).min(1).max(50),
  });

  const parsed = saleSchema.safeParse(request.data);

  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }

  const sale = parsed.data;

  if (
    sale.paymentMethod === "credit" &&
    !sale.customerId &&
    !sale.customerName
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A customer name or customer ID is required for a credit sale."
    );
  }

  // Prevent repeated variety IDs from causing inconsistent stock updates.
  const quantitiesByVariety = new Map();

  for (const item of sale.items) {
    const existing = quantitiesByVariety.get(item.varietyId);

    if (existing) {
      throw new HttpsError(
        "invalid-argument",
        "Each cement variety must appear only once in a sale."
      );
    }

    quantitiesByVariety.set(item.varietyId, item);
  }

  const saleRef = db.collection("sales").doc();
  const receiptRef = db.collection("receiptCounters").doc("sales");

  const varietyRefs = sale.items.map((item) =>
    db.collection("cementVarieties").doc(item.varietyId)
  );

  const result = await db.runTransaction(async (transaction) => {
    // Read all required documents before writing.
    const snapshots = [];

    for (const ref of varietyRefs) {
      snapshots.push(await transaction.get(ref));
    }

    const lines = [];
    let subtotal = 0;

    for (let i = 0; i < sale.items.length; i++) {
      const item = sale.items[i];
      const snapshot = snapshots[i];

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          `Cement variety ${item.varietyId} was not found.`
        );
      }

      const variety = snapshot.data();

      if (variety.active !== true) {
        throw new HttpsError(
          "failed-precondition",
          `${variety.name} is inactive.`
        );
      }

      const available = variety.stockQuantity || 0;

      if (available < item.quantity) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient stock for ${variety.name}. Available: ${available}.`
        );
      }

      const lineTotal = item.quantity * item.unitPrice;
      subtotal += lineTotal;

      lines.push({
        varietyId: item.varietyId,
        varietyName: variety.name,
        brand: variety.brand,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
        stockBefore: available,
        stockAfter: available - item.quantity,
      });
    }

    if (sale.discount > subtotal) {
      throw new HttpsError(
        "invalid-argument",
        "The discount cannot exceed the sale subtotal."
      );
    }

    const total = subtotal - sale.discount;

    if (sale.amountPaid > total) {
      throw new HttpsError(
        "invalid-argument",
        "Amount paid cannot exceed the sale total in this version."
      );
    }

    const balance = total - sale.amountPaid;

    if (balance > 0 && !sale.customerId && !sale.customerName) {
      throw new HttpsError(
        "invalid-argument",
        "Provide a customer name or customer ID when payment is incomplete."
      );
    }

    if (sale.paymentMethod === "credit" && sale.amountPaid !== 0) {
      throw new HttpsError(
        "invalid-argument",
        "For a credit sale, record an initial payment of zero. Partial payments can use another payment method."
      );
    }

    const counterSnapshot = await transaction.get(receiptRef);
    const nextNumber = (counterSnapshot.exists
      ? counterSnapshot.data().lastNumber
      : 0) + 1;

    const receiptNumber = `CSR-${String(nextNumber).padStart(6, "0")}`;
    const now = new Date().toISOString();

    for (let i = 0; i < lines.length; i++) {
      transaction.update(varietyRefs[i], {
        stockQuantity: lines[i].stockAfter,
        updatedAt: now,
      });

      const movementRef = db.collection("stockMovements").doc();

      transaction.set(movementRef, {
        varietyId: lines[i].varietyId,
        type: "sale",
        quantity: -lines[i].quantity,
        stockBefore: lines[i].stockBefore,
        stockAfter: lines[i].stockAfter,
        saleId: saleRef.id,
        recordedAt: now,
        recordedBy: request.auth.uid,
      });
    }

    transaction.set(receiptRef, { lastNumber: nextNumber });

    transaction.set(saleRef, {
      receiptNumber,
      customerName: sale.customerName || "",
      customerId: sale.customerId || "",
      items: lines,
      subtotal,
      discount: sale.discount,
      total,
      amountPaid: sale.amountPaid,
      balance,
      paymentMethod: sale.paymentMethod,
      status: balance === 0 ? "paid" : "partially_paid",
      createdAt: now,
      createdBy: request.auth.uid,
    });

    return {
      saleId: saleRef.id,
      receiptNumber,
      subtotal,
      discount: sale.discount,
      total,
      amountPaid: sale.amountPaid,
      balance,
    };
  });

  return {
    success: true,
    message: "Sale recorded successfully.",
    ...result,
  };
});