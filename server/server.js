const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./database');
const { sendVerificationEmail, sendPreRegisterConfirmation } = require('./email');
const { setupChat } = require('./chat');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'https://kaelfreelancecore.qzz.io'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Setup Socket.io
setupChat(io);

// ========== SAMPLE DATA ==========
const gigCount = db.prepare('SELECT COUNT(*) AS count FROM gigs').get().count;
if (gigCount === 0) {
  const sampleGigs = [
    { title: 'Build a Responsive React Web App', description: 'Modern single-page application', category: 'Web Development', price: 299, delivery_time: '5 days', image_url: 'https://images.unsplash.com/photo-1547658719-da2b51169166?w=600&h=400&fit=crop', freelancer_id: 1 },
    { title: 'Premium UI/UX Design for Mobile', description: 'Figma prototype included', category: 'Graphic Design', price: 449, delivery_time: '4 days', image_url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=400&fit=crop', freelancer_id: 1 }
  ];
  const insertStmt = db.prepare('INSERT INTO gigs (title, description, category, price, delivery_time, image_url, freelancer_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  sampleGigs.forEach(gig => insertStmt.run(gig.title, gig.description, gig.category, gig.price, gig.delivery_time, gig.image_url, gig.freelancer_id));
}

// ========== ROOT ==========
app.get('/', (req, res) => res.send('Kael Backend is running!'));

// ========== PRE-REGISTRATION ==========
app.post('/api/pre-register', async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email are required' });
  try {
    const stmt = db.prepare('INSERT INTO prereg_users (name, email, role) VALUES (?, ?, ?)');
    const result = stmt.run(name, email, role || 'freelancer');
    sendPreRegisterConfirmation(email, name).catch(err => console.error('Email error:', err));
    res.json({ success: true, message: 'Pre-registration successful!', userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ success: false, message: 'This email is already pre-registered' });
  }
});

app.get('/api/pre-register/count', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM prereg_users').get();
  res.json({ success: true, count: count.count });
});

// ========== AUTH ==========
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = require('bcrypt').hashSync(password, 10);
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    const stmt = db.prepare('INSERT INTO users (name, email, password, role, verification_code, is_verified) VALUES (?, ?, ?, ?, ?, 0)');
    const result = stmt.run(name, email, hashedPassword, role || 'freelancer', verificationCode);
    sendVerificationEmail(email, verificationCode).catch(err => console.error('Email error:', err));
    res.json({ success: true, userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Email already exists' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  const bcrypt = require('bcrypt');
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  if (!user.is_verified) return res.status(403).json({ success: false, message: 'Verify your email first' });
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, 'kael-secret-key-2026', { expiresIn: '7d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/verify-email', (req, res) => {
  const { email, code } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.is_verified) return res.json({ success: true, message: 'Already verified' });
  if (user.verification_code !== code) return res.status(400).json({ success: false, message: 'Invalid code' });
  db.prepare('UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?').run(user.id);
  res.json({ success: true, message: 'Email verified!' });
});

app.post('/api/resend-code', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.is_verified) return res.json({ success: true, message: 'Already verified' });
  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
  db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(newCode, user.id);
  try { await sendVerificationEmail(email, newCode); res.json({ success: true }); }
  catch { res.status(500).json({ success: false }); }
});

// ========== GIGS ==========
app.get('/api/gigs', (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM gigs';
  const conditions = [], params = [];
  if (search) { conditions.push('title LIKE ?'); params.push(`%${search}%`); }
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  res.json({ success: true, gigs: db.prepare(sql).all(...params) });
});

app.post('/api/gigs', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
  const { title, description, category, price, delivery_time, image_url } = req.body;
  const stmt = db.prepare('INSERT INTO gigs (title, description, category, price, delivery_time, image_url, freelancer_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  res.json({ success: true, gigId: stmt.run(title, description, category, price, delivery_time, image_url, userId).lastInsertRowid });
});

// ========== ORDERS ==========
app.post('/api/orders', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
  const { gig_id } = req.body;
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(gig_id);
  if (!gig) return res.status(404).json({ success: false, message: 'Gig not found' });
  if (gig.freelancer_id === userId) return res.status(400).json({ success: false, message: 'Cannot order own gig' });
  const invoiceNo = 'INV-' + Date.now().toString().slice(-8) + '-' + userId;
  try {
    const stmt = db.prepare('INSERT INTO orders (gig_id, client_id, freelancer_id, status, invoice_no, payment_status) VALUES (?, ?, ?, ?, ?, ?)');
    const result = stmt.run(gig_id, userId, gig.freelancer_id, 'pending', invoiceNo, 'pending');
    const order = db.prepare(`
      SELECT orders.*, gigs.title AS gig_title, gigs.price AS gig_price,
             client.name AS client_name, client.email AS client_email,
             freelancer.name AS freelancer_name
      FROM orders JOIN gigs ON orders.gig_id = gigs.id
      JOIN users AS client ON orders.client_id = client.id
      JOIN users AS freelancer ON orders.freelancer_id = freelancer.id
      WHERE orders.id = ?
    `).get(result.lastInsertRowid);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

app.get('/api/orders', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
  const orders = db.prepare(`
    SELECT orders.*, gigs.title AS gig_title, gigs.price AS gig_price,
           client.name AS client_name, freelancer.name AS freelancer_name
    FROM orders JOIN gigs ON orders.gig_id = gigs.id
    JOIN users AS client ON orders.client_id = client.id
    JOIN users AS freelancer ON orders.freelancer_id = freelancer.id
    WHERE orders.client_id = ? OR orders.freelancer_id = ?
    ORDER BY orders.created_at DESC
  `).all(userId, userId);
  res.json({ success: true, orders });
});

app.put('/api/orders/:id/cancel', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.client_id !== userId) return res.status(403).json({ success: false, message: 'Only client can cancel' });
  if (order.status !== 'pending') return res.status(400).json({ success: false, message: 'Can only cancel pending orders' });
  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', req.params.id);
  res.json({ success: true, message: 'Order cancelled' });
});

app.put('/api/orders/:id/deliver', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false });
  if (order.freelancer_id !== userId) return res.status(403).json({ success: false });
  const autoCompleteAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE orders SET status = ?, auto_complete_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('delivered', autoCompleteAt, req.params.id);
  res.json({ success: true, message: 'Order delivered' });
});

app.put('/api/orders/:id/accept', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false });
  if (order.client_id !== userId) return res.status(403).json({ success: false });
  db.prepare('UPDATE orders SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', 'released', req.params.id);
  res.json({ success: true, message: 'Order completed' });
});

// ========== MESSAGES ==========
app.get('/api/messages/:orderId', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false });
  const token = authHeader.split(' ')[1];
  let userId;
  try { const jwt = require('jsonwebtoken'); userId = jwt.verify(token, 'kael-secret-key-2026').id; }
  catch { return res.status(401).json({ success: false }); }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ success: false });
  if (order.client_id !== userId && order.freelancer_id !== userId) return res.status(403).json({ success: false });
  const messages = db.prepare(`
    SELECT messages.*, sender.name AS sender_name
    FROM messages JOIN users AS sender ON messages.sender_id = sender.id
    WHERE messages.order_id = ? ORDER BY messages.created_at ASC
  `).all(req.params.orderId);
  res.json({ success: true, messages });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
