'use strict';

const express = require('express');
const Stripe = require('stripe');

const users = require('../db/users');
const { requireAuth } = require('../auth/middleware');
const {
  normalizePlan,
  getPlan,
  getPlanFromPriceId,
  getPlanLimit,
  getStripePriceId,
  isBillingEnabled,
  listPlans,
} = require('./plans');

let stripeClient = null;
let stripeClientKey = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient || stripeClientKey !== key) {
    stripeClient = new Stripe(key);
    stripeClientKey = key;
  }
  return stripeClient;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return {};
  }
}

function idFromStripeValue(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id ?? null;
}

function requestBaseUrl(req) {
  return (
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    req.headers.origin ||
    `${req.protocol}://${req.get('host')}`
  ).replace(/\/$/, '');
}

function checkoutUrls(req) {
  const baseUrl = requestBaseUrl(req);
  return {
    successUrl: process.env.STRIPE_SUCCESS_URL || `${baseUrl}/dashboard?billing=success`,
    cancelUrl: process.env.STRIPE_CANCEL_URL || `${baseUrl}/settings?billing=cancelled`,
  };
}

function subscriptionPriceId(subscription) {
  return subscription?.items?.data?.[0]?.price?.id ?? null;
}

function invoicePriceId(invoice) {
  return invoice?.lines?.data?.find((line) => line.price?.id)?.price?.id ?? null;
}

function invoiceSubscriptionId(invoice) {
  return (
    idFromStripeValue(invoice?.subscription) ||
    idFromStripeValue(invoice?.parent?.subscription_details?.subscription) ||
    null
  );
}

async function activateSubscription({ userId, customerId, subscriptionId, plan }) {
  if (!plan || !normalizePlan(plan) || plan === 'free') return null;

  if (userId) {
    return users.updateBillingByUserId({
      id: userId,
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    });
  }

  if (subscriptionId) {
    const updated = await users.updateBillingByStripeSubscriptionId({
      stripeSubscriptionId: subscriptionId,
      plan,
      stripeCustomerId: customerId,
    });
    if (updated) return updated;
  }

  if (customerId) {
    return users.updateBillingByStripeCustomerId({
      stripeCustomerId: customerId,
      plan,
      stripeSubscriptionId: subscriptionId,
    });
  }

  return null;
}

async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription') return;

  const userId = Number.parseInt(session.metadata?.user_id || session.client_reference_id, 10);
  const plan = normalizePlan(session.metadata?.plan);
  const customerId = idFromStripeValue(session.customer);
  const subscriptionId = idFromStripeValue(session.subscription);

  const updated = await activateSubscription({
    userId: Number.isInteger(userId) ? userId : null,
    customerId,
    subscriptionId,
    plan,
  });

  if (!updated) {
    console.warn('[billing] checkout.session.completed did not match a user');
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  const customerId = idFromStripeValue(invoice.customer);
  const subscriptionId = invoiceSubscriptionId(invoice);
  const plan = getPlanFromPriceId(invoicePriceId(invoice));

  if (!plan) return;

  const updated = await activateSubscription({
    customerId,
    subscriptionId,
    plan,
  });

  if (!updated) {
    console.warn('[billing] invoice.payment_succeeded did not match a user');
  }
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = idFromStripeValue(subscription.customer);
  const subscriptionId = idFromStripeValue(subscription.id);
  const status = subscription.status;

  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
    await handleSubscriptionCanceled(subscription);
    return;
  }

  if (status !== 'active' && status !== 'trialing' && status !== 'past_due') return;

  const plan = normalizePlan(subscription.metadata?.plan) ||
    getPlanFromPriceId(subscriptionPriceId(subscription));

  if (!plan) return;

  const updated = await activateSubscription({
    customerId,
    subscriptionId,
    plan,
  });

  if (!updated) {
    console.warn('[billing] customer.subscription.updated did not match a user');
  }
}

async function handleSubscriptionCanceled(subscription) {
  const subscriptionId = idFromStripeValue(subscription.id);
  const customerId = idFromStripeValue(subscription.customer);

  let updated = null;
  if (subscriptionId) {
    updated = await users.clearBillingByStripeSubscriptionId(subscriptionId);
  }
  if (!updated && customerId) {
    updated = await users.clearBillingByStripeCustomerId(customerId);
  }
  if (!updated) {
    console.warn('[billing] subscription cancellation did not match a user');
  }
}

function createBillingRouter({ getTunnelUsage } = {}) {
  const router = express.Router();

  router.get('/plans', (req, res) => {
    res.json(listPlans());
  });

  router.get('/usage', requireAuth, async (req, res) => {
    try {
      const user = await users.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'NotFound', message: 'User account not found' });
      }

      const activeTunnels = getTunnelUsage ? getTunnelUsage(user.id) : 0;
      const limit = getPlanLimit(user.plan);
      return res.json({
        plan: user.plan || 'free',
        plan_label: getPlan(user.plan).label,
        active_tunnels: activeTunnels,
        tunnel_limit: limit,
        at_limit: activeTunnels >= limit,
        plans: listPlans(),
      });
    } catch (err) {
      console.error('[billing] /usage error:', err.message);
      return res.status(500).json({ error: 'InternalError', message: 'Could not fetch billing usage' });
    }
  });

  router.post('/create-checkout', requireAuth, async (req, res) => {
    try {
      const payload = parseBody(req.body);
      const plan = normalizePlan(payload.plan);

      if (!plan) {
        return res.status(400).json({ error: 'ValidationError', message: 'Choose a valid plan' });
      }
      if (plan === 'free') {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'The Free plan does not require Stripe Checkout',
        });
      }
      if (!isBillingEnabled()) {
        return res.status(503).json({
          error: 'BillingNotEnabled',
          message: 'Paid plans are not enabled yet',
        });
      }

      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({
          error: 'BillingNotConfigured',
          message: 'STRIPE_SECRET_KEY is not configured',
        });
      }

      const priceId = getStripePriceId(plan);
      if (!priceId) {
        return res.status(503).json({
          error: 'BillingNotConfigured',
          message: `${getPlan(plan).label} price ID is not configured`,
        });
      }

      let user = await users.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'NotFound', message: 'User account not found' });
      }
      if (user.stripe_subscription_id && user.plan !== 'free') {
        return res.status(409).json({
          error: 'SubscriptionExists',
          message: 'This account already has an active Stripe subscription',
        });
      }

      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { user_id: String(user.id) },
        });
        customerId = customer.id;
        user = await users.updateStripeCustomerId(user.id, customerId);
      }

      const { successUrl, cancelUrl } = checkoutUrls(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: String(user.id),
        metadata: {
          user_id: String(user.id),
          plan,
        },
        subscription_data: {
          metadata: {
            user_id: String(user.id),
            plan,
          },
        },
      });

      return res.json({ id: session.id, url: session.url });
    } catch (err) {
      console.error('[billing] create-checkout error:', err.message);
      return res.status(500).json({ error: 'InternalError', message: 'Could not create checkout session' });
    }
  });

  router.post('/webhook', async (req, res) => {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      return res.status(503).json({
        error: 'BillingNotConfigured',
        message: 'Stripe webhook configuration is incomplete',
      });
    }

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'BadRequest', message: 'Missing stripe-signature header' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.warn('[billing] Invalid Stripe webhook signature:', err.message);
      return res.status(400).json({ error: 'InvalidSignature', message: 'Invalid Stripe signature' });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionCanceled(event.data.object);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`[billing] webhook handler failed for ${event.type}:`, err.message);
      return res.status(500).json({ error: 'WebhookHandlerFailed', message: 'Webhook handler failed' });
    }

    return res.json({ received: true });
  });

  return router;
}

module.exports = { createBillingRouter };
