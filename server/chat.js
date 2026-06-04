const db = require('./database');

function containsContactInfo(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const numbersOnly = /\d{7,15}/;
  const socialRegex = /(?:telegram|whatsapp|viber|facebook|fb|instagram|ig|skype|discord|signal|line|wechat)[:\s]*[@\/]?\w+/i;
  const urlRegex = /(?:https?:\/\/)?(?!kaelfreelancecore\.qzz\.io|localhost)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?/;
  const usernameRegex = /@[a-zA-Z0-9_]{3,}/;
  return emailRegex.test(text) || phoneRegex.test(text) || numbersOnly.test(text) || socialRegex.test(text) || urlRegex.test(text) || usernameRegex.test(text);
}

function setupChat(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_order', (orderId) => {
      socket.join(`order_${orderId}`);
    });

    socket.on('send_message', (data) => {
      const { orderId, senderId, receiverId, text } = data;
      if (containsContactInfo(text)) {
        socket.emit('warning', { message: '⚠️ Contact information sharing is not allowed. Violation may result in account suspension.' });
        return;
      }
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order || (order.client_id !== senderId && order.freelancer_id !== senderId)) {
        socket.emit('warning', { message: 'Access denied' });
        return;
      }
      const stmt = db.prepare('INSERT INTO messages (order_id, sender_id, receiver_id, text) VALUES (?, ?, ?, ?)');
      const result = stmt.run(orderId, senderId, receiverId, text);
      const message = db.prepare(`
        SELECT messages.*, sender.name AS sender_name 
        FROM messages JOIN users AS sender ON messages.sender_id = sender.id 
        WHERE messages.id = ?
      `).get(result.lastInsertRowid);
      io.to(`order_${orderId}`).emit('new_message', message);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
}

module.exports = { setupChat };
