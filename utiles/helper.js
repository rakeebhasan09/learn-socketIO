// Helper function to validate order data
export function validateOrder(data) {
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        return { valid: false, message: "At least one item is required." };
    }

    if (!data.customerName?.trim()) {
        return { valid: false, message: "Customer name is required." };
    }

    if (!data.customerPhone?.trim()) {
        return { valid: false, message: "Customer phone is required." };
    }

    if (!data.customerAddress?.trim()) {
        return { valid: false, message: "Customer address is required." };
    }

    return { valid: true };
}

// Helper function to generate unique order ID -> format: ORD-20260127-TodayOrderNumber
export function generateOrderId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0"); // Random number to ensure uniqueness
    return `ORD-${year}${month}${day}-${random}`;
}

// Helper function to Calculate total price of an order
export function calculateTotal(items) {
    const subTotal = items.reduce((sum, item) => {
        return sum + item.price * item.quantity;
    }, 0);
    const tax = subTotal * 0.1; // Assuming 10% tax
    const deliveryFee = 45.0; // Flat delivery fee
    const total = subTotal + tax + deliveryFee;

    return {
        subTotal: Math.round(subTotal * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        deliveryFee,
        total: Math.round(total * 100) / 100,
    };
}

// Helper function to create order document
export function createOrderDocument(orderData, orderId, totals) {
    return {
        orderId,
        customerName: orderData.customerName.trim(),
        customerPhone: orderData.customerPhone.trim(),
        customerAddress: orderData.customerAddress.trim(),
        items: orderData.items,
        subTotal: totals.subTotal,
        tax: totals.tax,
        deliveryFee: totals.deliveryFee,
        totalAmount: totals.total,
        specialNotes: orderData.specialNotes?.trim() || "",
        paymentMethod: orderData.paymentMethod || "Cash on Delivery",
        paymentStatus: "pending",
        status: "pending",
        statusHistory: [
            {
                status: "pending",
                timestamp: new Date(),
                by: "customer",
                note: "Order placed",
            },
        ],
        estimatedTime: null, // To be calculated by the system
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

// Helper function for update order status
export function isValidStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
        pending: ["preparing", "cancelled"],
        confirmed: ["preparing", "cancelled"],
        preparing: ["ready", "cancelled"],
        ready: ["out_for_delivery", "cancelled"],
        out_for_delivery: ["delivered", "cancelled"],
        delivered: [],
        cancelled: [],
    };
    return validTransitions[currentStatus]?.includes(newStatus) || false;
}
