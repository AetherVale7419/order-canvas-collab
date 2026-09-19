export {};

const serviceUrl = process.env.ORDER_EDITOR_URL ?? "http://localhost:3000";
const sessionId = process.env.DEMO_SESSION_ID;
const customerId = process.env.DEMO_CUSTOMER_ID;

if (!sessionId || !customerId) {
  throw new Error("Set DEMO_SESSION_ID and DEMO_CUSTOMER_ID for the demo customer");
}

const response = await fetch(`${serviceUrl}/editor/access`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId,
    customerId,
    orderId: "order-1042",
    editorId: "receipt-designer",
  }),
});

const result: unknown = await response.json();
if (!response.ok) throw new Error(`Document access failed: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result, null, 2));
