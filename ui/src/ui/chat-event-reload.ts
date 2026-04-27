import type { ChatEventPayload } from "./controllers/chat.ts";

export function shouldReloadHistoryForFinalEvent(payload?: ChatEventPayload): boolean {
  return Boolean(
    payload &&
    (payload.state === "final" ||
      (payload.state === "error" && payload.errorKind === "hook_block")),
  );
}
