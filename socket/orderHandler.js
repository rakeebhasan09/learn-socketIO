const orderHandler = (io, socket) => {
    console.log("A user connected", socket.id);

    // Place Order
    socket.on("placeOrder", async (data, callback) => {
        try {
            console.log(`Placed order from ${socket.id}`);
            const validation = validateOrder(data);
        } catch (error) {
            console.log(error);
        }
    });
};
