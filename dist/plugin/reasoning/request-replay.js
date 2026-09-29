import { applyThinkingToContent, extractReasoningText, parseAssistantMessage, spansMultipleAssistantSourceTurns } from '../../infrastructure/transformers/message-transformer.js';
import { reasoningCorrelationCache } from './correlation-cache.js';
import { normalizeToolArguments } from './turn-identity.js';
function resolveSignedReasoning(input) {
    const reasoningText = extractReasoningText(input.message);
    if (reasoningText.length === 0)
        return undefined;
    const result = reasoningCorrelationCache.lookup({
        reasoningText,
        visibleText: input.visibleText,
        toolUses: (input.toolUses ?? []).map((toolUse) => ({
            toolUseId: toolUse.toolUseId,
            name: toolUse.name,
            argumentsJson: normalizeToolArguments(toolUse.input)
        })),
        effectiveModel: input.effectiveModel
    });
    const envelope = result.envelope;
    if (envelope?.kind !== 'reasoningText' || envelope.signature.length === 0)
        return undefined;
    return {
        reasoningText: {
            text: envelope.text,
            signature: envelope.signature
        }
    };
}
/**
 * Rebuild one assistant turn from its inbound OpenAI-compatible shape.
 *
 * A signature hit emits native `reasoningContent` and no thinking text. On a miss the
 * thinking-text fallback is retained byte-for-byte, but only for the turn the caller
 * marks with `allowThinkingText`; every other turn keeps its visible content and tool
 * uses and drops the thinking text. This is the single funnel for both channels the
 * fallback reaches — `response.content` and the `fallbackContent` the history builder
 * restores when it merges adjacent assistant turns.
 */
export function reconstructAssistantResponse(message, effectiveModel, scope) {
    const parsed = parseAssistantMessage(message, { recoverReasoning: scope.recoverReasoning });
    const thinkingText = scope.allowThinkingText ? parsed.thinking : '';
    const fallbackContent = applyThinkingToContent(parsed.content, thinkingText);
    const reasoningContent = scope.recoverReasoning && !spansMultipleAssistantSourceTurns(message)
        ? resolveSignedReasoning({
            message,
            visibleText: parsed.content,
            toolUses: parsed.toolUses,
            effectiveModel
        })
        : undefined;
    const response = {
        content: applyThinkingToContent(parsed.content, thinkingText, reasoningContent !== undefined)
    };
    if (parsed.toolUses.length > 0)
        response.toolUses = parsed.toolUses;
    if (reasoningContent !== undefined)
        response.reasoningContent = reasoningContent;
    return { response, fallbackContent };
}
