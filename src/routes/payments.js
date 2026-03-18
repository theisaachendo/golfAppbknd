import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-01-27.acacia' });
}

router.use(requireAuth);

// POST /api/payments/create-checkout-session — body: { amount }
// amount is in dollars (e.g. 10) or cents (e.g. 1000) if you pass an integer >= 100.
router.post('/create-checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({ error: 'Misconfigured', message: 'Stripe not configured' });
  }

  const rawAmount = Number(req.body?.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return res.status(400).json({ error: 'Bad request', message: 'Valid amount required' });
  }

  const amountCents = Number.isInteger(rawAmount) && rawAmount >= 100 ? rawAmount : Math.round(rawAmount * 100);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return res.status(400).json({ error: 'Bad request', message: 'Amount too small' });
  }

  const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
  const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL || 'http://localhost:8081/deposit-success';
  const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL || 'http://localhost:8081/deposit-cancel';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: req.user.id,
      metadata: {
        userId: req.user.id,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: 'Account deposit',
            },
          },
        },
      ],
    });

    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe create checkout session error:', err);
    res.status(500).json({ error: 'Internal error', message: 'Failed to create checkout session' });
  }
});

export default router;

