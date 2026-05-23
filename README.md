# Envelope Finance Server

**Authors:**
- Siamak Ashrafi <biologica@gmail.com>
- Solomon Wu <apiswswsw@gmail.com>

A Node.js/Express server that uses **Gemini 2.5 Flash** vision AI to analyse a product photo and determine whether it fits in your [envelope budget](https://www.nerdwallet.com/article/finance/envelope-budgeting).

---

## Quick Start

```bash
# 1. Install deps
npm install

# 2. Export your Gemini API key
export GEMINI_API_KEY="your-key-here"

# 3. Start the server
npm start          # production
npm run dev        # with --watch (auto-restart on file change)
```

Server listens on **port 3000** by default. Override with `PORT=8080 npm start`.

---

## API

### `POST /check-budget`

**Content-Type:** `multipart/form-data`

| Field   | Type   | Description                                      |
|---------|--------|--------------------------------------------------|
| `data`  | string | JSON string with `currency` and `envelopes`      |
| `photo` | file   | Product image (JPEG, PNG, WebP — max 20 MB)      |

#### `data` JSON schema

```json
{
  "currency": "USD",
  "envelopes": {
    "food": 450.00,
    "clothes": 120.50,
    "entertainment": 75.00,
    "travel": 1200.00,
    "home": 850.00
  }
}
```

#### Example response

```json
{
  "item": {
    "brand": "Nike",
    "name": "Air Max 270",
    "description": "Lifestyle sneaker with large Air unit in the heel.",
    "estimated_price": 150,
    "currency": "USD"
  },
  "envelope": "clothes",
  "envelope_balance": 120.50,
  "can_afford": false,
  "verdict": "❌ You can't afford this right now. It costs ~150 USD but you only have 120.5 USD left in your \"clothes\" envelope.",
  "reasoning": "Nike Air Max 270 retails for ~$150 USD. The clothes envelope only has $120.50 remaining, so the purchase exceeds the budget."
}
```

---

## cURL Example

```bash
curl -X POST http://localhost:3000/check-budget \
  -F 'data={"currency":"USD","envelopes":{"food":450,"clothes":120.50,"entertainment":75,"travel":1200,"home":850}}' \
  -F 'photo=@/path/to/product.jpg'
```

---

### `GET /health`

Returns `{"status":"ok"}` — useful for uptime checks.
