import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

import type {
  ExternalUserMessageDispatchError,
  ProviderContinuationRequest,
} from "../orchestration-v2/ProviderContinuationRequests.ts";

/** Wait until the orchestrator has accepted terminal input before acknowledging it. */
export const requestHerdrInput = Effect.fn("HerdrInput.request")(function* (
  offer: (request: ProviderContinuationRequest) => Effect.Effect<void>,
  request: Pick<ProviderContinuationRequest, "threadId" | "providerThreadId" | "driver" | "detail">,
  messageId: NonNullable<ProviderContinuationRequest["externalUserMessage"]>["messageId"],
) {
  const result = yield* Deferred.make<void, ExternalUserMessageDispatchError>();
  yield* offer({ ...request, externalUserMessage: { messageId, result } });
  yield* Deferred.await(result);
});
