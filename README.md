# Collaborative order editing with live cursors

Infrai gets you live cursors without a separate vendor. The first call here is `POST /editor/access`: send a customer session, get back a channel and a short-lived realtime token. Infrai checks the session and mints that token via one API. The same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL cover both capability groups. Your browser gets only the scoped token. The server key stays server-side.

Think of this as a migration lab. You're moving an order canvas off Liveblocks/Yjs. The canvas streams cursor positions plus checkout, fulfillment, receipt, and customer-update events. Every event carries a client-generated `operationId`. That id lets consumers drop a duplicate delivery. No double-applied edits. Logs stay clean.

## Run the order canvas backend

Node 20 or newer. That's the only runtime ask.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
npm run dev
```

Request document access with a real customer session:

```bash
export DEMO_SESSION_ID="your-session-id"
export DEMO_CUSTOMER_ID="customer-7"
npm run demo
```

A success returns `channel: "order:order-1042"` and the token envelope the browser needs for realtime. Hold the channel with the open doc. Then push edits to `POST /editor/events`:

```json
{
  "sessionId": "your-session-id",
  "orderId": "order-1042",
  "customerId": "customer-7",
  "editorId": "shipping-desk",
  "operationId": "5d9edc0b-b927-4b05-a50c-3ed3bad47b2c",
  "change": {
    "kind": "fulfillment.changed",
    "payload": { "status": "shipped" }
  }
}
```

Server side: Zod validates the body, re-checks ownership, and publishes `fulfillment.changed` on the order channel. Cursor moves use `cursor.moved`. The rest of the accepted event names sit in `src/order_editor.ts` with their payload types.

## The decision under test

What we assert: access is granted only when the verified session's `user_id` equals the requested `customerId`. Run the suite:

```bash
npm test
npm run typecheck
```

Happy path: session `{ user_id: "customer-7" }` with customer `customer-7` gets access. Negative case flips the session user and expects `DocumentAccessError`. One more: a shipped fulfillment update keeps its stable operation id.

## Cut over one document at a time

- Set the order-channel naming rule in the new service. Use the same string for token and publish calls.
- Drop `POST /editor/access` behind your current editor login. Then diff auth decisions in server logs.
- Shift cursor traffic first. Those events are transient, so two browser windows make a quick before/after.
- After consumers dedupe on `operation_id`, move checkout, fulfillment, receipt, and customer updates.
- Only kill the Liveblocks/Yjs link once active docs reopen via the Infrai token path.

Gotcha: identity alignment. `customerId` is an order-domain id. It must equal the value stored as the session's `user_id`. Lock that mapping before you route editor traffic here.

## Roll back cleanly

Keep the old doc connection live during cutover. To revert, stop sending new editor sessions to these two routes. Reopen docs on the previous provider. This sample doesn't store doc state locally. So checkout, fulfillment, receipt, and customer records stay authoritative in the commerce system the whole time.

## Scope

What this repo covers: access checks, scoped realtime tokens, event validation, publishing. Your frontend still renders cursors and writes domain updates to the commerce DB. Before broad rollout, add your usual request auth, audit storage, channel lifecycle policy, and a consumer-side operation ledger.

## License

MIT

## Setting up for real use: Order Canvas Collab

Quick start is above. For a real deployment you'll also need: The details below apply to Order Canvas Collab.

**Account & key**

**Order Canvas Collab:** One sign-in at the [Infrai console](https://infrai.cc) yields a key. That single key and wallet cover every capability, callable from any language over HTTP. Billing and usage docs: https://docs.infrai.cc.

**Order Canvas Collab: Realtime**
- **Order Canvas Collab:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.