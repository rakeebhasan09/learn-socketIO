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
