import { getCollection } from "../config/database.js";
import {
    calculateTotal,
    createOrderDocument,
    generateOrderId,
    isValidStatusTransition,
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

    // Admin Event Start Here
    // Admin Login
    socket.on("adminLogin", (data, callback) => {
        try {
            if (data.password === process.env.ADMIN_PASSWORD) {
                socket.isAdmin = true;
                socket.join("admins");
                console.log(`Admin logged in: ${socket.id}`);
                callback({
                    success: true,
                    message: "Admin login successful",
                });
            } else {
                callback({
                    success: false,
                    message: "Invalid password",
                });
            }
        } catch (error) {
            console.error("Admin login error:", error);
            callback({
                success: false,
                message: error.message || "Admin login failed",
            });
        }
    });

    // Get All Orders (Admin)
    socket.on("getAllOrders", async (data, callback) => {
        try {
            if (!socket.isAdmin) {
                return callback({
                    success: false,
                    message: "Unauthorized",
                });

                const ordersCollection = getCollection("orders");
                const filter = data?.status ? { status: data.status } : {};
                const orders = await ordersCollection
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .limit(20)
                    .toArray();

                callback({
                    success: true,
                    orders,
                });
            }
        } catch (error) {
            console.error("Get all orders error:", error);
            callback({
                success: false,
                message: error.message || "Failed to get all orders",
            });
        }
    });

    // Update Order Status (Admin)
    socket.on("updateOrderStatus", async (data, callback) => {
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

            if (!isValidStatusTransition(order.status, data.newStatus)) {
                return callback({
                    success: false,
                    message: `Invalid status transition from ${order.status} to ${data.newStatus}`,
                });
            }

            const result = await ordersCollection.findOneAndUpdate(
                {
                    orderId: data.orderId,
                },
                {
                    $set: {
                        status: data.newStatus,
                        updatedAt: new Date(),
                    },
                    $push: {
                        statusHistory: {
                            status: data.newStatus,
                            timestamp: new Date(),
                            by: socket.id,
                            note:
                                data.note ||
                                `Status changed to ${data.newStatus} by admin`,
                        },
                    },
                },
                { returnDocument: "after" },
            );

            io.to(`order-${data.orderId}`).emit("orderStatusUpdated", {
                orderId: data.orderId,
                status: data.newStatus,
                order: result,
            });

            socket.to("admin").emit("orderStatusChanged", {
                orderId: data.orderId,
                newStatus: data.newStatus,
            });

            callback({
                success: true,
                order: result,
            });
        } catch (error) {
            console.error("Update order status error:", error);
            callback({
                success: false,
                message: error.message || "Failed to update order status",
            });
        }
    });

    // Accept Order (Admin)
    socket.on("acceptOrder", async (data, callback) => {
        try {
            if (!socket.isAdmin) {
                return callback({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const ordersCollection = getCollection("orders");
            const order = await ordersCollection.findOne({
                orderId: data.orderId,
            });

            if (!order || order.status !== "pending") {
                return callback({
                    success: false,
                    message: "Order not found or cannot be accepted",
                });
            }

            const estimatedTime = data.estimatedTime || 30;
            const result = await ordersCollection.findOneAndUpdate(
                {
                    orderId: data.orderId,
                },
                {
                    $set: {
                        status: "confirmed",
                        estimatedTime,
                        updatedAt: new Date(),
                    },
                    $push: {
                        statusHistory: {
                            status: "confirmed",
                            timestamp: new Date(),
                            by: socket.id,
                            note: `Order accepted with estimated time ${estimatedTime} mins`,
                        },
                    },
                },
                { returnDocument: "after" },
            );

            oi.to(`order-${data.orderId}`).emit("orderAccepted", {
                orderId: data.orderId,
                estimatedTime,
            });

            socket.on("admins").emit("orderAcceptedByAdmin", {
                orderId: data.orderId,
                estimatedTime,
            });

            callback({
                success: true,
                order: result,
            });
        } catch (error) {
            console.error("Accept order error:", error);
            callback({
                success: false,
                message: error.message || "Failed to accept order",
            });
        }
    });

    // Reject Order (Admin)
    socket.on("rejectOrder", async (data, callback) => {
        try {
            if (!socket.isAdmin) {
                return callback({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const ordersCollection = getCollection("orders");
            const order = await ordersCollection.findOne({
                orderId: data.orderId,
            });

            if (!order || order.status !== "pending") {
                return callback({
                    success: false,
                    message: "Order not found or cannot be rejected",
                });
            }

            const result = await ordersCollection.findOneAndUpdate(
                {
                    orderId: data.orderId,
                },
                {
                    $set: {
                        status: "cancelled",
                        estimatedTime,
                        updatedAt: new Date(),
                    },
                    $push: {
                        statusHistory: {
                            status: "cancelled",
                            timestamp: new Date(),
                            by: socket.id,
                            note: "Rejected by admin",
                        },
                    },
                },
                { returnDocument: "after" },
            );

            oi.to(`order-${data.orderId}`).emit("orderRejected", {
                orderId: data.orderId,
                reason: data.reason || "Order rejected by admin",
            });

            socket.on("admins").emit("orderRejectedByAdmin", {
                reason: data.reason || "Order rejected by admin",
            });

            callback({
                success: true,
            });
        } catch (error) {
            console.error("Reject order error:", error);
            callback({
                success: false,
                message: error.message || "Failed to reject order",
            });
        }
    });

    // Get Live Stats
    socket.on("getLiveStats", async (data, callback) => {
        try {
            if (!socket.isAdmin) {
                return callback({
                    success: false,
                    message: "Unauthorized",
                });
            }
            const ordersCollection = getCollection("orders");
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const stats = {
                totalToday: await ordersCollection.countDocuments({
                    createdAt: { $gte: today },
                }),
                pending: await ordersCollection.countDocuments({
                    status: "pending",
                }),
                confirmed: await ordersCollection.countDocuments({
                    status: "confirmed",
                }),
                preparing: await ordersCollection.countDocuments({
                    status: "preparing",
                }),
                ready: await ordersCollection.countDocuments({
                    status: "ready",
                }),
                outForDelivery: await ordersCollection.countDocuments({
                    status: "out_for_delivery",
                }),
                delivered: await ordersCollection.countDocuments({
                    status: "delivered",
                }),
                cancelled: await ordersCollection.countDocuments({
                    status: "cancelled",
                }),
            };

            callback({
                success: true,
                stats,
            });
        } catch (error) {
            console.error("Get live stats error:", error);
            callback({
                success: false,
                message: error.message || "Failed to get live stats",
            });
        }
    });
};
