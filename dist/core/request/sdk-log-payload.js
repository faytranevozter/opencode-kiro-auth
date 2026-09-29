import { describeReasoningContentForLog } from '../../plugin/log-redaction.js';
import { accountLogAlias } from './recovery-request-identity.js';
export function summarizeHistoryReasoning(history) {
    if (!history)
        return [];
    const summaries = [];
    history.forEach((entry, index) => {
        const envelope = entry.assistantResponseMessage?.reasoningContent;
        if (envelope)
            summaries.push({ index, envelope: describeReasoningContentForLog(envelope) });
    });
    return summaries;
}
/**
 * The API-log payload for one outbound `generateAssistantResponse` call. Carries the
 * request shape, never the replayed history itself: only `historyLength` plus a
 * per-turn sanitized reasoning summary (§6.8).
 */
export function buildSdkRequestLogPayload(prep, account) {
    const history = prep.conversationState.history;
    const historyReasoning = summarizeHistoryReasoning(history);
    return {
        url: `https://q.${prep.region}.amazonaws.com/generateAssistantResponse`,
        method: 'POST',
        headers: { 'x-amzn-kiro-agent-mode': 'vibe' },
        body: {
            conversationState: {
                chatTriggerType: prep.conversationState.chatTriggerType,
                conversationId: prep.conversationState.conversationId,
                historyLength: history?.length ?? 0,
                ...(historyReasoning.length > 0 ? { historyReasoning } : {}),
                currentMessage: prep.conversationState.currentMessage
            },
            profileArn: prep.profileArn
        },
        conversationId: prep.conversationId,
        model: prep.effectiveModel,
        accountAlias: accountLogAlias(account.id),
        email: account.email
    };
}
