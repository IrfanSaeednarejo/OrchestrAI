export type PolicyDocumentSeed = {
  domain: 'orders' | 'payments' | 'account';
  documentType: string;
  topic: string;
  version: string;
  effectiveDate: string; // ISO date
  content: string;
};

export const policyDocuments: PolicyDocumentSeed[] = [
  // ─── Document 1 ───────────────────────────────────────────────────────────
  {
    domain: 'orders',
    documentType: 'policy',
    topic: 'returns',
    version: '1.0',
    effectiveDate: '2026-01-01',
    content: `Return Eligibility
Items may be returned within 30 days of the delivery date shown on your shipment tracking. The return window is calculated from the day your order was actually marked delivered — not the day it was placed or the estimated delivery date.

To be eligible for a return, your order must have a status of "delivered." Orders that are still pending, paid, or in transit are not yet eligible for return.

Only one active return request is allowed per order at a time. If a previous return request for the same order was rejected, you're welcome to submit a new return request — a rejected return does not permanently block future requests for that order.

What Happens Next
Once a return is approved, a refund is processed separately based on your original payment method. See our Refund Policy for details on refund timing and eligibility.`,
  },

  // ─── Document 2 ───────────────────────────────────────────────────────────
  {
    domain: 'payments',
    documentType: 'policy',
    topic: 'refunds',
    version: '1.0',
    effectiveDate: '2026-01-01',
    content: `When Refunds Are Issued
Refunds can only be issued against a payment that has been fully captured. Refunds are not available for payments that are still pending or only authorized (an authorization hold is not the same as a completed charge).

If your refund is tied to a returned item, the return must be approved before the refund can be processed. A refund cannot be issued while a return request is still pending review.

Refunds are also issued directly for confirmed duplicate charges, even when no item return is involved.

Refund Amount
Refunds are issued for the full amount of the original payment. Partial refunds are not currently supported.

One Refund Per Payment
Only one refund can be active per payment at a time. If a previous refund attempt on the same payment failed, a new refund can still be requested — a failed refund does not block a retry. However, if a refund for that payment is already pending, in progress, or completed, a duplicate refund request cannot be submitted.`,
  },

  // ─── Document 3 ───────────────────────────────────────────────────────────
  {
    domain: 'orders',
    documentType: 'faq',
    topic: 'shipping',
    version: '1.0',
    effectiveDate: '2026-01-01',
    content: `What do the different shipment statuses mean?

Pending: Your order has been placed but not yet shipped.
In Transit: Your package has left our facility and is on its way, typically with a tracking number and carrier assigned.
Delivered: Your package has arrived at the destination address. This date is what starts the return-eligibility window.
Returned to Sender: The carrier was unable to complete delivery and the package is being sent back.

My order shows an estimated delivery date — is that the same as the delivery date used for returns?
No. The estimated delivery date is a forecast. Only the actual recorded delivery date (once your shipment status changes to "Delivered") is used for return-eligibility calculations.

Can I track multiple shipments for one order?
In the current version of our system, each order has a single associated shipment record.`,
  },

  // ─── Document 4 ───────────────────────────────────────────────────────────
  {
    domain: 'payments',
    documentType: 'faq',
    topic: 'payments',
    version: '1.0',
    effectiveDate: '2026-01-01',
    content: `What do the different payment statuses mean?

Pending: Payment has not yet been processed.
Authorized: Funds have been reserved on your payment method but not yet charged.
Captured: The charge has been completed — this is a completed payment.
Failed: The payment attempt was unsuccessful.
Refunded: The payment has been refunded.

I think I was charged twice for the same order — what happens?
If two completed (captured) charges are found on your account for the same amount within a short window of each other (24 hours), on two different orders, our system flags it as a potential duplicate charge for review. An authorization hold that was never completed into a charge is not counted as a duplicate, since it was never an actual charge to begin with.

What if I was legitimately charged twice for two separate, unrelated orders of the same price?
Our duplicate detection is a helpful flag for review, not an automatic decision — a specialist will look into the specific case with you.`,
  },

  // ─── Document 5 ───────────────────────────────────────────────────────────
  {
    domain: 'account',
    documentType: 'faq',
    topic: 'account_security',
    version: '1.0',
    effectiveDate: '2026-01-01',
    content: `Why am I sometimes asked for extra verification?
Some actions only require light verification (your email and an order number), while more sensitive actions — like viewing payment details, requesting a refund, or updating your profile — require full verification (your email plus a one-time verification code).

I reset my password. Do I still need to verify my identity for sensitive actions?
Yes. Resetting your password does not automatically verify your identity for other purposes. If you need to perform a sensitive action afterward, you'll be asked to verify separately.

What if I enter the wrong verification code?
You have a limited number of attempts before you'll need to request a new code. Requesting a new code always replaces any code that was previously issued to you.`,
  },
];
