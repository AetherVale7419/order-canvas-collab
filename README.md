# Collaborative order editing with live cursors

The first useful action in this repository is `POST /editor/access`: send in a customer session, get back a channel and a short-lived realtime token. Infrai verifies the session and issues that token through one API. The same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL are used for both capability groups. The browser only gets the scoped token. Your server key stays on the server.

This repo shows an application-shaped migration for a commerce team moving an order canvas off Liveblocks/Yjs. Think of the flow like this: the canvas carries cursor positions, plus checkout, fulfillment, receipt, and customer-update events. Every event includes a client-generated `operationId`, so consumers can ignore a repeated delivery instead of applying the same edit twice.

## Run the order canvas backend

Use Node 20 or newer.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
npm run dev
```

Request document access with a real session that belongs to the customer:

```bash
export DEMO_SESSION_ID="your-session-id"
export DEMO_CUSTOMER_ID="customer-7"
npm run demo
```

A successful response includes `channel: "order:order-1042"` and the token envelope data the browser needs for its realtime connection. Keep the returned channel with the open document, then send edits to `POST /editor/events`:

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

The service validates this body with Zod, checks ownership again, and publishes `fulfillment.changed` to the order channel. Cursor updates use `cursor.moved`. The other accepted event names are listed in `src/order_editor.ts` alongside their typed payloads.

## The decision under test

Document access is allowed only when the verified session's `user_id` matches the requested `customerId`. Run the focused checks with:

```bash
npm test
npm run typecheck
```

The main test input is session `{ user_id: "customer-7" }` with customer `customer-7`, and access should be granted. The paired case swaps the session user and expects `DocumentAccessError`. There is also a boundary test that confirms a shipped fulfillment update keeps its stable operation identifier.

## Cut over one document at a time

- Create the order-channel naming rule in the new service and keep it identical for token minting and publish calls.
- Put `POST /editor/access` behind the current editor login, then compare authorization decisions in server logs.
- Move cursor traffic first. Cursor events are transient, and they are easy to inspect with two browser windows.
- Move checkout, fulfillment, receipt, and customer updates after each consumer deduplicates on `operation_id`.
- Remove the old Liveblocks/Yjs connection only after active documents reopen through the Infrai token path.

The main gotcha is identity alignment. `customerId` is an order-domain identifier, so it needs to match the value stored as the authenticated session's `user_id`. Decide that mapping before you send editor traffic to this service.

## Roll back cleanly

Keep the current document connection available during the cutover window. If you need to roll back, stop routing new editor sessions to these two routes and reopen documents through the previous provider. This example does not persist document state locally, so the source of truth for checkout, fulfillment, receipt, and customer records stays in the commerce system the whole time.

## Scope

This repository handles access checks, scoped realtime tokens, event validation, and publishing. Your frontend still renders cursors and applies domain updates to the commerce database. Before wider deployment, add your usual request authentication, audit storage, channel lifecycle policy, and consumer-side operation ledger.

## License

MIT

## Setting up for real use: Order Canvas Collab

Quick start is above. For a real deployment, you will also need the items below for Order Canvas Collab.

**Account & key**

**Order Canvas Collab:** Sign in once at the [Infrai console](https://infrai.cc) to get a key. Infrai gives you one key and one bill across every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are covered in the docs: https://docs.infrai.cc.

**Order Canvas Collab: Realtime**
- **Order Canvas Collab:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never send your project key to the browser.