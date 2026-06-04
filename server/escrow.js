const db = require('./database');

class EscrowService {
  static async depositToEscrow(orderId, amount, clientId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.client_id !== clientId) throw new Error('Only client can deposit');
    if (order.payment_status !== 'pending') throw new Error('Payment already made');
    const commissionRate = 0.15;
    const commission = amount * commissionRate;
    const freelancerAmount = amount - commission;
    db.prepare('UPDATE orders SET payment_status = ?, escrow_amount = ?, commission_amount = ?, freelancer_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('in_escrow', amount, commission, freelancerAmount, 'paid', orderId);
    return { success: true, escrowAmount: amount, commission, freelancerWillReceive: freelancerAmount };
  }

  static async markDelivered(orderId, freelancerId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.freelancer_id !== freelancerId) throw new Error('Only freelancer can deliver');
    if (order.status !== 'paid') throw new Error('Order must be paid first');
    const autoCompleteAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE orders SET status = ?, auto_complete_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('delivered', autoCompleteAt, orderId);
    return { success: true, message: 'Delivered. Client has 3 days to confirm.' };
  }

  static async confirmAndRelease(orderId, clientId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.client_id !== clientId) throw new Error('Only client can confirm');
    if (order.status !== 'delivered') throw new Error('Order must be delivered first');
    db.prepare('UPDATE orders SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', 'released', orderId);
    return { success: true, message: 'Payment released', freelancerReceived: order.freelancer_amount, platformCommission: order.commission_amount };
  }

  static async autoComplete() {
    const overdueOrders = db.prepare("SELECT * FROM orders WHERE status = 'delivered' AND auto_complete_at IS NOT NULL AND auto_complete_at <= datetime('now')").all();
    for (const order of overdueOrders) {
      await this.confirmAndRelease(order.id, order.client_id);
    }
  }

  static async dispute(orderId, userId, reason) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.client_id !== userId && order.freelancer_id !== userId) throw new Error('Only involved users can dispute');
    db.prepare('UPDATE orders SET status = ?, dispute_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('disputed', reason, orderId);
    return { success: true, message: 'Dispute filed.' };
  }
}

module.exports = EscrowService;
