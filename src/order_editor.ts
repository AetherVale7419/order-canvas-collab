import { z } from "zod";
import { InfraiRealtime } from "./infrai_realtime";

export const accessRequestSchema = z.object({
  sessionId: z.string().min(1),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  editorId: z.string().min(1),
});

const cursorPayload = z.object({ x: z.number(), y: z.number(), section: z.string().min(1) });
const checkoutPayload = z.object({ status: z.enum(["draft", "ready", "submitted"]) });
const fulfillmentPayload = z.object({ status: z.enum(["unfulfilled", "packing", "shipped"]) });
const receiptPayload = z.object({ receiptId: z.string().min(1), status: z.enum(["draft", "sent"]) });
const customerUpdatePayload = z.object({ note: z.string().min(1).max(500) });

export const orderEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cursor.moved"), payload: cursorPayload }),
  z.object({ kind: z.literal("checkout.changed"), payload: checkoutPayload }),
  z.object({ kind: z.literal("fulfillment.changed"), payload: fulfillmentPayload }),
  z.object({ kind: z.literal("receipt.changed"), payload: receiptPayload }),
  z.object({ kind: z.literal("customer.updated"), payload: customerUpdatePayload }),
]);

export const publishRequestSchema = z.object({
  sessionId: z.string().min(1),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  editorId: z.string().min(1),
  operationId: z.string().uuid(),
  change: orderEventSchema,
});

type AccessRequest = z.infer<typeof accessRequestSchema>;
type PublishRequest = z.infer<typeof publishRequestSchema>;

export class DocumentAccessError extends Error {}

function sessionUserId(session: Record<string, unknown>): string | undefined {
  const value = session.user_id ?? session.account_id;
  return typeof value === "string" ? value : undefined;
}

export function assertCustomerOwnsDocument(session: Record<string, unknown>, customerId: string): void {
  if (sessionUserId(session) !== customerId) {
    throw new DocumentAccessError("The signed-in customer does not own this order document");
  }
}

const orderChannel = (orderId: string) => `order:${orderId}`;

export class OrderEditorService {
  private readonly infrai: InfraiRealtime;

  constructor(infrai: InfraiRealtime) {
    this.infrai = infrai;
  }

  async openDocument(input: AccessRequest): Promise<{ channel: string; token: Record<string, unknown> }> {
    const session = await this.infrai.verifySession(input.sessionId);
    assertCustomerOwnsDocument(session, input.customerId);
    const channel = orderChannel(input.orderId);
    const token = await this.infrai.issueDocumentToken({
      client_id: input.editorId,
      channels: [channel],
      capabilities: ["subscribe", "publish"],
      ttl_seconds: 900,
    });
    return { channel, token };
  }

  async publishChange(input: PublishRequest): Promise<{ channel: string; event: string; operationId: string }> {
    const session = await this.infrai.verifySession(input.sessionId);
    assertCustomerOwnsDocument(session, input.customerId);
    const channel = orderChannel(input.orderId);
    await this.infrai.publish({
      channel,
      event: input.change.kind,
      data: {
        operation_id: input.operationId,
        order_id: input.orderId,
        editor_id: input.editorId,
        payload: input.change.payload,
      },
      account_id: input.customerId,
    });
    return { channel, event: input.change.kind, operationId: input.operationId };
  }
}
