---
docId: faq-payments-payments-auth-holds-002
domain: payments
topic: payments
documentType: faq
version: 1.0.0
effectiveDate: '2026-11-26T00:00:00Z'
title: "Payment Authorization Holds FAQ"
---

# Payment Authorization Holds FAQ
## What is a payment pre-authorization hold at checkout?

A payment pre-authorization hold at checkout is a temporary reservation of funds established by the financial institution to verify available balances. Northvale initiates this verification to ensure that sufficient funds exist before order processing begins. This temporary reservation differs entirely from a final settlement or captured payment. Northvale does not collect the funds during this initial authorization phase. Customers should understand that these holds are not completed charges on the account.

## Why can an initial authorization exceed my order total?

An initial authorization can exceed the order total due to the maximum authorization buffer of 20% applied for estimated shipping and incidental fees. Northvale calculates this buffer to accommodate potential delivery variations or weight adjustments. The final capture processed by Northvale reflects the exact order total only. Customers will never be billed more than the verified final purchase price. Any amount exceeding the final invoice is released automatically by the issuing bank.

## How long do uncaptured authorization holds remain active?

Uncaptured authorization holds remain active for a duration governed strictly by the 7-day expiry window. Northvale submits no capture request during this period if the associated order remains unfulfilled or uncaptured. Upon reaching this expiration timeframe, the financial institution releases the reserved funds back to the available balance. The exact timing of the balance update depends entirely on the processing policies of the card issuer. Customers can monitor their account statements for the automatic removal of the hold.

## When are funds captured on split-shipment orders?

Funds are captured on split-shipment orders incrementally as individual packages are dispatched from Northvale facilities. Northvale processes a partial capture corresponding directly to the specific items included in each separate shipment. This ensures that customers are only billed for merchandise as it leaves the warehouse. The remaining balance of the order is captured only upon the final dispatch of all remaining items. This incremental billing method aligns payment collection precisely with physical fulfillment.

## Why do I see two pending entries on my bank statement?

Seeing two pending entries on a bank statement results from retry attempts or the standard display lag between authorization and capture records. Northvale systems process transactions securely through payment gateways that may temporarily display duplicate lines during processing. These pending duplicates drop off automatically once the financial institution reconciles the ledger entries. Customers do not need to contact support for these temporary display artifacts to resolve. The bank statement will normalize shortly as the single valid transaction settles.

## How long do debit card holds take to release after cancellation?

Debit card holds take 3 to 5 business days to release following an order cancellation. Northvale transmits immediate void notifications to the acquiring network upon confirming any cancellation request. However, individual card-issuing banks control the internal processing timeline required to credit the funds back to the debit account. Customers must wait for this designated business day window to elapse for the bank to reflect the released balance. Northvale cannot override the processing duration mandated by the financial institution.

## How long are orders held when a payment authorization fails?

Orders are held for 72 hours when an initial payment authorization fails. Northvale maintains the reservation of the ordered items during this operational window to allow for payment updates. Automated email notifications and dashboard alerts are dispatched to prompt customers to update their billing details. If valid payment information is not provided within this timeframe, the order is automatically canceled. Customers can submit a new payment method at any point before the expiration of the window.

## What is the waiting period after a hard card decline?

The waiting period after a hard card decline is 24 hours before further attempts can be made with that card. Northvale distinguishes this mandatory waiting period from immediate soft-decline retry schedules. Customers must utilize an alternate payment method during this cooldown period if they wish to complete an immediate purchase. Attempting to use the declined card before the expiration of the waiting period will result in automated rejection. This security measure prevents automated fraud patterns associated with severely rejected cards.

## When does a payment card get temporarily locked from retries?

A payment card gets temporarily locked from retries for 24 hours following consecutive failed authorizations. Northvale implements this restriction to protect accounts from unauthorized access attempts and repeated transaction errors. Customers experiencing this lockout are strongly advised to use an alternate payment method to complete their checkout. The locked card becomes eligible for use again automatically after the full lockout duration expires. Support agents cannot manually bypass this security lockout on individual payment cards.

## When does an account get locked from checkout due to failed payments?

An account gets locked from checkout for 48 hours following repeated payment failures. Northvale enforces this account-level restriction as a security protection measure against card-testing abuse and fraudulent activity. During this lockout period, all purchasing capabilities associated with the user profile are temporarily suspended. Customers must wait for the designated lockout window to conclude before attempting new transactions. Northvale security policies require this cooling period to maintain platform integrity.

## How does the subscription renewal retry schedule work?

The subscription renewal retry schedule operates up to the 7-day maximum retry window before an unpaid subscription is canceled. Northvale automatically attempts to process renewal payments periodically throughout this designated timeframe following an initial failure. Automated email alerts are transmitted to the customer between these scheduled retry attempts to request updated billing details. If the payment cannot be successfully captured by the end of the retry window, the subscription is terminated. Customers can update their payment method at any time during this schedule to maintain active service.

## Why might my bank show a pending hold after an AVS decline?

A bank might show a pending hold after an Address Verification System decline due to issuer-side hold behaviors on gateway-rejected transactions. Northvale transmits the transaction details, and the issuing bank reserves the funds before evaluating the address match. When the gateway rejects the transaction due to a mismatch, the bank may retain the pending status temporarily. This authorization hold expires automatically without any capture by Northvale. Customers should allow standard banking processing times for the pending indicator to disappear from the account view.

## How can I verify whether a charge is pending or captured?

Verifying whether a charge is pending or captured requires comparing the order payment status in the Northvale dashboard against the bank account pending label. Northvale updates the transaction ledger to show settled status only when funds are successfully collected. Bank statements often display the word pending next to authorized holds that have not yet converted to permanent charges. Customers seeking absolute clarity can contact Northvale support to request a formal transaction trace. Support agents can confirm whether an authorization has been voided or settled.

## Do authorization holds earn or consume credit card rewards?

Authorization holds neither earn nor consume credit card rewards because rewards and cashback post exclusively on settled captures. Northvale notes that temporary holds only reduce the available credit limit on a revolving credit account during the active reservation window. Once a hold expires or is voided, the temporary credit limit reduction is fully reversed by the issuer. Customers will only accumulate reward points for transactions that successfully complete the final capture process. Pending holds have no permanent impact on earned loyalty balances.

## What should I do if an expired hold still appears after the release window?

An expired hold that still appears after the release window requires contacting the card issuer directly with the provided authorization code. Northvale releases all holds immediately upon expiration, but individual banks occasionally lag in updating account interfaces. Customers can request a support-provided void confirmation letter from Northvale to expedite the bank review process. This formal documentation explicitly proves that Northvale has relinquished any claim to the authorized funds. Presenting the letter to the financial institution usually prompts an immediate manual removal of the stale entry.
