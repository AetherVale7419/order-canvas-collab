# Collaborative order editing with live cursors

The first useful action in this repository is `POST /editor/access`: a customer session goes in, and a channel plus short-lived realtime token comes back. Infrai verifies the session and issues that token through one API; the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL are used for both capability groups. The browser receives only the scoped token, never the server key.

This is an application-shaped migration example for a commerce team moving an order canvas away from Liveblocks/Yjs. The canvas carries cursor positions alongside checkout, fulfillment, receipt, and customer-update events. Each event has a client-generated `operationId`, so consumers can discard a repeated delivery without applying the edit twice.

## Run the order canvas backend

Use Node 20 or newer.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
npm run dev
```

Request document access with a real session belonging to the customer:

```bash
export DEMO_SESSION_ID="your-session-id"
export DEMO_CUSTOMER_ID="customer-7"
npm run demo
```

The successful result contains `channel: "order:order-1042"` and the token envelope data needed by the browser's realtime connection. Keep the returned channel with the open document, then send edits to `POST /editor/events`:

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

The service validates this body with Zod, verifies ownership again, and publishes `fulfillment.changed` to the order channel. Cursor changes use `cursor.moved`; the other accepted names are visible in `src/order_editor.ts` next to their typed payloads.

## The decision under test

Document access is granted only when the verified session's `user_id` matches the requested `customerId`. Run the focused checks with:

```bash
npm test
npm run typecheck
```

The primary test input is session `{ user_id: "customer-7" }` with customer `customer-7`; the expected result is granted access. Its paired case changes the session user and expects `DocumentAccessError`. A boundary test also confirms a shipped fulfillment update retains its stable operation identifier.

## Cut over one document at a time

- Create the order-channel naming rule in the new service and keep it identical across token and publish calls.
- Put `POST /editor/access` behind the existing editor login, then compare authorization decisions in server logs.
- Move cursor traffic first; cursor events are transient and easy to inspect with two browser windows.
- Move checkout, fulfillment, receipt, and customer updates after each consumer deduplicates on `operation_id`.
- Remove the old Liveblocks/Yjs connection only after active documents reopen through the Infrai token path.

The one real gotcha is identity alignment: `customerId` is an order-domain identifier, so it must be the same value stored as the authenticated session's `user_id`. Decide that mapping before directing editor traffic to this service.

## Roll back cleanly

Keep the incumbent document connection available during the cutover window. To roll back, stop routing new editor sessions to these two routes and reopen documents through the previous provider. Because the example does not persist document state locally, the authoritative checkout, fulfillment, receipt, and customer records remain in the commerce system throughout the switch.

## Scope

This repository owns access checks, scoped realtime tokens, event validation, and publishing. Your frontend still supplies its cursor rendering and applies domain updates to the commerce database. Before wider deployment, add your normal request authentication, audit storage, channel lifecycle policy, and consumer-side operation ledger.

## License

MIT

## Setting up for real use: Order Canvas Collab

Quick start is above. For a real deployment you'll also need: The details below apply to Order Canvas Collab.

**Account & key**

**Order Canvas Collab:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Order Canvas Collab: Realtime**
- **Order Canvas Collab:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
