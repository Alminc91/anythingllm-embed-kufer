// <think>…</think>-Blöcke (Reasoning-Modelle) aus einer Antwort entfernen.
// Gemeinsam für PromptReply, HistoricalMessage und die Kurskarten oben.
export const THINK_BLOCK_RX = /<think>[\s\S]*?<\/think>/g;

/**
 * @param {string} text
 * @returns {string} Text ohne vollständige <think>-Blöcke
 */
export function stripThink(text) {
  return String(text ?? "").replace(THINK_BLOCK_RX, "");
}
