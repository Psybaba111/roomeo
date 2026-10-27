# WhatsApp message templates (MappStore BSP → Meta)

Submit these four templates in the MappStore dashboard (mapp.mappstore.in). Language: **English (en)**.
Keep `OTP_PROVIDER=console` until Meta marks `roomeo_otp` **APPROVED**.

Rules followed:
- **Utility** templates are about one specific transaction the user started. They contain no offers, discounts, upsell, or "check out our" wording. If they include any of that, Meta reclassifies them as Marketing.
- **Authentication** uses Meta's fixed, non-editable body. Only the options (security note, expiry, button) can be configured.
- Variables are numbered `{{1}}`, `{{2}}`, … in order. None sits at the very start or end of the body. Each one has a sample value, which Meta requires for review.

---

## 1. `roomeo_otp`: AUTHENTICATION

| Setting | Value |
|---|---|
| Category | Authentication |
| Code delivery | Copy code button |
| Add security recommendation | ✅ on |
| Add expiry time | ✅ 10 minutes |
| Button text | Copy code |

Rendered by Meta (fixed text):

```
{{1}} is your verification code. For your security, do not share this code.
This code expires in 10 minutes.
[ Copy code ]
```

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | 6-digit OTP (also passed to the copy-code button parameter) | `482913` |

## 2. `roomeo_application_received`: UTILITY

```
Hi, {{1}} has asked to join your bed "{{2}}" on roomeo.
Open your roomeo dashboard to review their profile and reply yes or no.
```
Footer (optional): `Reply STOP to turn off these updates.`
Button (optional, URL): `Review request` → `https://roomeo.com/dashboard`

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | Seeker's first name | `Ananya` |
| `{{2}}` | Listing title | `Sunny twin room near HSR BDA complex` |

## 3. `roomeo_application_accepted`: UTILITY

```
Good news: the owner of "{{1}}" said yes to your request on roomeo.
Open the app to see the address and complete your move-in steps.
```
Button (optional, URL): `View details` → `https://roomeo.com/dashboard`

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | Listing title | `Sunny twin room near HSR BDA complex` |

## 4. `roomeo_payment_approved`: UTILITY

```
Your payment for the roomeo {{1}} plan of ₹{{2}} is confirmed.
Reference: {{3}}. Keep this for your records.
```

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | Plan name | `Move-in` |
| `{{2}}` | Amount in rupees, no symbol | `499` |
| `{{3}}` | Payment reference / UPI UTR | `RMO-7Q2K9X` |

---

### Why these should pass review
- No emoji, links to third parties, or promotional language in the utility templates.
- Each message is triggered by the recipient's own action: they applied, they got accepted, or they paid.
- Sample values look realistic and contain no real personal data.
