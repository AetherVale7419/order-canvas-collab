import assert from "node:assert/strict";
import test from "node:test";
import { DocumentAccessError, assertCustomerOwnsDocument, publishRequestSchema } from "../src/order_editor";

test("the order customer may enter the document", () => {
  assert.doesNotThrow(() => assertCustomerOwnsDocument({ user_id: "customer-7" }, "customer-7"));
});

test("another signed-in customer is denied", () => {
  assert.throws(
    () => assertCustomerOwnsDocument({ user_id: "customer-8" }, "customer-7"),
    DocumentAccessError,
  );
});

test("a fulfillment update keeps its operation id at the request boundary", () => {
  const request = publishRequestSchema.parse({
    sessionId: "session-2",
    orderId: "order-1042",
    customerId: "customer-7",
    editorId: "shipping-desk",
    operationId: "5d9edc0b-b927-4b05-a50c-3ed3bad47b2c",
    change: { kind: "fulfillment.changed", payload: { status: "shipped" } },
  });
  assert.equal(request.operationId, "5d9edc0b-b927-4b05-a50c-3ed3bad47b2c");
  assert.equal(request.change.kind, "fulfillment.changed");
});
