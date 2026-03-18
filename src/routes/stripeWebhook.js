import { Router } from 'express';
import Stripe from 'stripe';
import { hasProcessedStripeEvent, markStripeEventProcessed, updateUserBalance } from '../data/store.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-01-27.acacia' });
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

router.post('/', async (req, res) => {
  const stripe = getStripe();
  const secret = getWebhookSecret();
  if (!stripe || !secret) {
    return res.status(500).send('Stripe webhook not configured');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).send('Missing Stripe-Signature');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err?.message || err);
    return res.status(400).send('Invalid signature');
  }

  if (hasProcessedStripeEvent(event.id)) {
    return res.status(200).json({ received: true, deduped: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const paid = session.payment_status === 'paid';
      const userId = session.metadata?.userId || session.client_reference_id;
      const amountTotal = session.amount_total; // cents
      if (paid && userId && Number.isFinite(amountTotal) && amountTotal > 0) {
        updateUserBalance(userId, amountTotal / 100);
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const userId = pi.metadata?.userId;
      const amount = pi.amount_received ?? pi.amount; // cents
      if (userId && Number.isFinite(amount) && amount > 0) {
        // If you only use Checkout, checkout.session.completed should be enough.
        // This provides a fallback for PaymentIntent-based deposits.
        updateUserBalance(userId, amount / 100);
      }
    }

    markStripeEventProcessed(event.id);
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).send('Webhook handler failed');
  }
});

export default router;

