import { getCollection } from "../config/database.js";
import {
    calculateTotal,
    createOrderDocument,
    generateOrderId,
} from "../utiles/helper.js";

export const orderHandler = (io, socket) => {
    console.log("A user connected", socket.id);

    // Place Order
    socket.on("placeOrder", async (data, callback) => {
        try {
            console.log(`Placed order from ${socket.id}`);
            const validation = validateOrder(data);
            if (!validation.valid) {
                return callback({
                    success: false,
                    message: validation.message,
                });
            }

            const totals = calculateTotal(data.items);
            const orderId = generateOrderId();
            const order = createOrderDocument(data, orderId, totals);

            const ordersCollection = getCollection("orders");
            await ordersCollection.insertOne({ order });

            socket.join(`order-${orderId}`);
            socket.join("customers");

            io.to("admins").emit("newOrder", { order });

            callback({
                success: true,
                message: "Order placed successfully",
                order,
            });

            console.log(`Order created with ID: ${orderId}`);
        } catch (error) {
            console.log(error);
            callback({
                success: false,
                message: "Failed to place order",
            });
        }
    });

    // Track Order
    socket.on("trackOrder", async (data, callback) => {
        try {
            const ordersCollection = getCollection("orders");
            const order = await ordersCollection.findOne({
                orderId: data.orderId,
            });
            if (!order) {
                return callback({
                    success: false,
                    message: "Order not found",
                });
            }

            socket.join(`order-${data.orderId}`);
            callback({
                success: true,
                order,
            });
        } catch (error) {
            console.error("Error tracking order:", error);
            callback({
                success: false,
                message: error.message || "Failed to track order",
            });
        }
    });

    // Cancel Order
    socket.on("cancelOrder", async (data, callback) => {
        try {
            const ordersCollection = getCollection("orders");
            const order = await ordersCollection.findOne({
                orderId: data.orderId,
            });

            // If order is not found
            if (!order) {
                return callback({
                    success: false,
                    message: "Order not found",
                });
            }

            if (!["pending", "confirmed"].includes(order.status)) {
                return callback({
                    success: false,
                    message: "Can not cancel the order.",
                });
            }

            await ordersCollection.updateOne(
                { orderId: data.orderId },
                {
                    $set: {
                        status: "cancelled",
                        updatedAt: new Date(),
                    },
                    $push: {
                        statusHistory: {
                            status: "cancelled",
                            timestamp: new Date(),
                            by: socket.id,
                            note: data.reason || "Order cancelled by customer",
                        },
                    },
                },
            );

            io.to(`order-${data.orderId}`).emit("orderCancelled", {
                orderId: data.orderId,
            });
            io.to("admins").emit("orderCancelled", {
                orderId: data.orderId,
                customerName: order.customerName,
            });

            callback({
                success: true,
            });
        } catch (error) {
            console.error("Error canceling order:", error);
            callback({
                success: false,
                message: error.message || "Failed to cancel order",
            });
        }
    });

    // Get All My Orders
    socket.on("getMyOrders", async (data, callback) => {
        try {
            const ordersCollection = getCollection("orders");
            const orders = await ordersCollection
                .find({
                    customerPhone: data.customerPhone,
                })
                .sort({ createdAt: -1 })
                .limit(20)
                .toArray();

            callback({
                success: true,
                orders,
            });
        } catch (error) {
            console.error("Get orders error:", error);
            callback({
                success: false,
                message: error.message || "Failed to get orders",
            });
        }
    });
};
