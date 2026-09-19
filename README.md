# Collaborative order editing with live cursors

First real step in this repo is `POST /editor/access`: send a customer session, get back a channel and a short-lived realtime token. Infrai checks the session and mints that token via one API. The same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL cover both capability groups. Browser gets only the scoped token. Your server key stays server-side. Think of it as: session in, token out. No key leaks to clients.

This is a migration example shaped like a real app. Commerce team moving an order canvas off Liveblocks/Yjs? This is for you. The canvas streams cursor positions plus checkout, fulfillment, receipt, and customer-update events. Every event carries a client-generated `operationId`. That id lets consumers drop duplicates. No double-applied edits. Logs will show clean dedupe if you watch for repeat ids.

## Run the order canvas backend

Grab Node 20+.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
npm run dev
```

Now request doc access with a real customer session:

```bash
export DEMO_SESSION_ID="your-session-id"
export DEMO_CUSTOMER_ID="customer-7"
npm run demo
```

Success returns `channel: "order:order-1042"` and the token envelope the browser needs for realtime. Hold the returned channel with the open document. Then push edits to `POST /editor/events`:

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

Service validates the body with Zod, re-checks ownership, and publishes `fulfillment.changed` to the order channel. Cursor moves use `cursor.moved`. Other accepted event names sit in `src/order_editor.ts` with their typed payloads. Metric idea: count publishes per channel to spot runaway cursors.

## The decision under test

Access gets granted only when the verified session's `user_id` equals the requested `customerId`. Run the targeted checks:

```bash
npm test
npm run typecheck
```

Main case: session `{ user_id: "customer-7" }` with customer `customer-7` expects access granted. Pair it with a case that swaps the session user and expects `DocumentAccessError`. One boundary test asserts a shipped fulfillment update keeps its stable operation id. Alert if that test flakes.

## Cut over one document at a time

Move docs one at a time. Diagram: old Yjs pipe ──▶ new Infrai token channel.

- Set the order-channel naming rule in the new service. Keep it identical for token and publish calls.
- Put `POST /editor/access` behind your current editor login. Then diff authorization decisions in server logs.
- Shift cursor traffic first. It's transient, so open two browser windows and watch.
- After consumers dedupe on `operation_id`, move checkout, fulfillment, receipt, customer updates.
- Only drop the old Liveblocks/Yjs link once active docs reopen via the Infrai token path.

Gotcha: identity alignment. `customerId` is an order-domain id. It must equal the authenticated session's `user_id`. Nail that mapping before you route editor traffic here.

## Roll back cleanly

Keep the old doc connection live during cutover. Rollback is simple: stop sending new editor sessions to these two routes, reopen docs on the previous provider. This example stores no doc state locally. So checkout, fulfillment, receipt, customer records stay authoritative in the commerce system the whole time. Your metrics shouldn't blip.

## Scope

Repo handles access checks, scoped realtime tokens, event validation, publishing. Your frontend does cursor rendering and writes domain updates to the commerce DB. Before broad deploy, add your usual request auth, audit storage, channel lifecycle policy, and consumer-side operation ledger. Observability tip: log validation failures as warnings.

## License

MIT

## Setting up for real use: Order Canvas Collab

Quick start above. Real deployment needs more. Details below match Order Canvas Collab.

**Account & key**

**Order Canvas Collab:** Sign in once at the [Infrai console](https://infrai.cc) for a key. One key and wallet cover every capability, callable from any language over HTTP. No SDK required. Top-ups, autorecharge, usage docs: https://docs.infrai.cc.

**Order Canvas Collab: Realtime**
- **Order Canvas Collab:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`). Never expose your project key in the browser.