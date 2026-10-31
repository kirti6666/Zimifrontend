/** New messages use the conversation's server sequence. Legacy rows retain a
 * deterministic timestamp/ObjectId order, independent of HTTP or socket arrival. */
type OrderedMessage = { sequence?: number; orderAfterSequence?: number; kind?: string; createdAt?: string; id?: string };
function position(message: OrderedMessage) {
  if (Number.isSafeInteger(message.sequence) && message.sequence! > 0) return { value: message.sequence!, after: 0 };
  if (message.kind === "gift" && Number.isSafeInteger(message.orderAfterSequence) && message.orderAfterSequence! >= 0) return { value: message.orderAfterSequence!, after: 1 };
}
export function compareChatMessages(a: OrderedMessage, b: OrderedMessage): number {
  const left = position(a), right = position(b), leftSequence = left !== undefined, rightSequence = right !== undefined;
  if (leftSequence !== rightSequence) return leftSequence ? 1 : -1;
  if (left && right && left.value !== right.value) return left.value - right.value;
  if (left && right && left.after !== right.after) return left.after - right.after;
  const time = (Date.parse(a.createdAt ?? "") || 0) - (Date.parse(b.createdAt ?? "") || 0);
  if (time) return time;
  const leftId = a.id ?? "", rightId = b.id ?? "";
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}
