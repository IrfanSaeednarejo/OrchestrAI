---
docId: faq-account-sec-sessions-003
domain: account
topic: account_security
documentType: faq
version: 1.0.0
effectiveDate: '2026-11-26T00:00:00Z'
title: "Account Security and Sessions Policy"
---

# Account Security and Sessions Policy
## How can I view all active login sessions on my account?

Customers can view all active login sessions by navigating to Account Security and selecting Active Sessions within the online portal. This dashboard displays the device type, approximate geographic location, and last-active timestamp for every connected connection. Reviewing these details helps identify any unfamiliar access points currently connected to the profile. Each entry provides sufficient metadata to determine whether the connection belongs to a recognized device. Users should systematically inspect these records whenever unauthorized activity is suspected. Prompt identification of active sessions ensures immediate threat mitigation across the network.

## When does Northvale send an unrecognized-device login alert?

Northvale automatically sends an email alert whenever a login occurs from a new device or an unrecognized geographic location. The notification message includes a direct link enabling customers to review the login details or freeze the account immediately. This automated messaging system ensures users stay informed about every access attempt made on their profile. Monitoring these alerts allows individuals to detect potential unauthorized access before significant damage occurs. Standard security protocols dictate that any unrecognized connection should be investigated without delay. Timely awareness of login events remains a core component of overall account safety.

## How does velocity monitoring detect suspicious login attempts?

Security velocity monitoring detects suspicious login attempts by evaluating authentication patterns across a rolling security velocity window of 24 hours. The automated detection system flags rapid multi-IP connection sequences and repeated authentication lockouts occurring within this specified period. When anomalous velocity thresholds are breached, the platform automatically triggers defensive measures to block potential attackers. This mechanism prevents automated credential stuffing tools from overwhelming customer accounts through brute-force methods. Continuous evaluation of login frequency protects the entire Northvale ecosystem from coordinated security breaches. All evaluated metrics adhere strictly to the established monitoring duration parameters.

## How do I sign out of a single unfamiliar session or all devices?

Customers can sign out of a single unfamiliar session by clicking the individual Revoke button next to the target entry, or terminate all connections using the Sign Out All Devices option. Activating either control results in the immediate session token invalidation across the selected endpoints. This action instantly blocks any further authenticated requests originating from those specific browser instances or applications. Users do not need to wait for background synchronization because token termination takes effect instantly. Maintaining active control over device connections ensures that unauthorized users lose access immediately. Immediate revocation serves as an effective remedy against compromised device credentials.

## What should I do immediately if I suspect my account was hijacked?

Individuals who suspect their account was hijacked must immediately report the incident through the support portal, revoke all active sessions, and change their account password. Prompt reporting initiates the compromised account freeze SLA protocol to secure the profile against further unauthorized transactions. Taking these rapid actions minimizes the window of opportunity for malicious actors to access sensitive data. Customer support agents rely on these immediate user-initiated steps to begin formal account recovery investigations. Swift compliance with security procedures significantly reduces the potential impact of a successful hijack attempt. Acting without delay is essential for restoring account integrity.

## How quickly is a compromised account placed into a frozen state?

A compromised account is placed into a frozen state within the compromised account freeze SLA timeframe of 15 minutes following a verified security report. This automated and manual quarantine blocks new orders, profile edits, and financial payouts until the investigation concludes. Freezing the account stops malicious actors from executing fraudulent purchases or altering destination addresses. System administrators enforce this restriction immediately to safeguard stored customer assets and personal information. The 15 minute SLA ensures rapid containment of active security threats across the platform. Normal functionality remains suspended until identity verification and unfreezing procedures are successfully completed.

## What happens to pending orders when an account is quarantined?

Pending orders are temporarily paused on unshipped high-risk transactions when an account is quarantined, requiring direct owner confirmation before fulfillment proceeds. This quarantine prevents fraudulent purchases from leaving the warehouse while the profile undergoes security review. Legitimate orders that have already shipped remain traceable through standard tracking links provided via customer support. Once the security investigation resolves, legitimate pending orders resume normal processing workflows. This temporary pause protects both the customer and Northvale from unauthorized financial losses. Comprehensive order reviews occur strictly during the active quarantine period.

## How does a password lockout protect against credential stuffing?

A password lockout protects against credential stuffing by enforcing a password lockout duration of 30 minutes after a series of failed login attempts. This temporary restriction blocks automated botnets from continuously guessing user passwords through rapid trial-and-error routines. Repeated lockouts escalate the security response, requiring the user to contact phone support for assistance. Restricting access frequency neutralizes the effectiveness of large-scale automated credential testing scripts. The 30 minute waiting period ensures that legitimate users retain future access while repelling malicious attackers. Such defensive measures form an essential barrier against widespread automated credential compromises.

## Can an administrator lock my account for suspicious activity?

Administrators can lock an account for suspicious activity through an admin-initiated security lock when system anomalies deviate significantly from standard behavior. This administrative action differs from automated lockouts by requiring manual intervention from authorized Northvale security personnel. Unlocking the profile requires a verified identity check before normal account access can be restored to the owner. This administrative safeguard protects accounts exhibiting irregular traffic patterns that bypass standard automated filters. Rigorous verification protocols prevent unauthorized third parties from tricking support staff into unlocking hijacked profiles. Administrative locks remain active until all security criteria are fully satisfied.

## How do I unfreeze my account after a compromise investigation?

Customers unfreeze their account after a compromise investigation by completing strict identity verification, submitting a confirmation code valid for 10 minutes, and executing a mandatory password reset. These sequential verification steps ensure that only the rightful owner regains control of the quarantined profile. Once the required verification criteria are met, the system restores a clean session environment free of prior threats. The 10-minute OTP validity window ensures that confirmation codes cannot be exploited if intercepted later. Completing this recovery sequence re-establishes secure baseline operations for the account. All security checkpoints must pass successfully before full access is granted.

## How long are security and unauthorized-activity logs retained?

Security and unauthorized-activity logs are retained for a standard 5-year retention period to support ongoing fraud-prevention and network protection initiatives. Storing these records over this 5 year timeframe allows compliance teams to analyze long-term threat trends and investigate historical incidents. The retained audit trails contain authentication timestamps, IP addresses, and device identifiers necessary for comprehensive security audits. Northvale protects these archives under strict internal access policies to safeguard user privacy. Maintaining historical logs improves the accuracy of automated velocity monitoring and anomaly detection algorithms. All retention periods adhere strictly to established data governance standards.

## Why did I receive a login alert when I used a VPN or mobile data?

Login alerts occur during VPN or mobile data usage because dynamic IP addresses and carrier geolocation shifts frequently mimic unrecognized access patterns. The automated security system detects a new network route and triggers a notification to confirm the legitimacy of the connection. Customers should review the session details to verify their own activity rather than immediately revoking the active session. Understanding how mobile routing and virtual private networks operate prevents unnecessary alarm among users. If the login matches the customer's actual connection behavior, no further action is required. Verifying connection parameters helps distinguish between authorized travel usage and genuine security threats.

## Does changing my email address revoke existing active sessions?

Security-critical credential changes, such as updating an account email address, trigger immediate security alerts and a complete session refresh across all connected devices. This policy requirement mandates successful OTP verification before any email modification can be saved to the profile. Refreshing all sessions invalidates existing authentication tokens to prevent persistent access by unauthorized parties. Users must log in again using their updated credentials after the email change procedure concludes. This preventative measure ensures that lingering browser tokens cannot be exploited following a primary credential update. Enforcing session termination during major profile updates protects against unauthorized account takeover.

## How do Bearer session tokens expire on shared computers?

Bearer session tokens expire on shared computers either through explicit sign-out actions performed by the user or via automatic token expiration protocols managed by the server. Customers using public or shared devices must manually sign out to prevent subsequent users from accessing active sessions. Relying solely on automatic expiration risks exposing sensitive account data on unsupervised hardware terminals. Explicit manual revocation immediately destroys the stored Bearer token on the client device. Northvale encourages best practices regarding public computer usage to maintain account security. Diligent sign-out habits complement automated token management systems.

## Are saved payment cards protected if someone accesses an active session?

Saved payment cards remain fully protected if an unauthorized party accesses an active session because full card numbers are masked and tokenized within the database. The system never displays complete payment card digits on any screen, preventing theft of raw financial data. Furthermore, performing sensitive changes such as adding new payout methods requires step-up verification through secondary confirmation channels. This architectural design ensures that even a compromised session cannot expose raw credit card credentials to intruders. Robust tokenization standards protect financial information across all customer interactions. Security layers work in tandem to secure payment instruments during active session abnormalities.
