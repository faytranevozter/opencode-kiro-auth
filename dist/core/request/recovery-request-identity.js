import { createHash, randomUUID } from 'node:crypto';
import { extractRegionFromArn } from '../../constants.js';
const FINGERPRINT_HEX_LENGTH = 16;
const accountAliases = new Map();
function canonicalize(value) {
    if (value instanceof Uint8Array) {
        return { $bytes: Buffer.from(value).toString('base64') };
    }
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (typeof value !== 'object' || value === null)
        return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
        const entry = value[key];
        if (entry !== undefined)
            result[key] = canonicalize(entry);
    }
    return result;
}
function cloneConversationState(state) {
    return structuredClone(state);
}
function semanticFingerprint(prepared, disableReasoningReplay) {
    const normalizedState = cloneConversationState(prepared.conversationState);
    normalizedState.conversationId = '<wire-conversation-id>';
    const canonical = canonicalize({
        conversationState: normalizedState,
        effectiveModel: prepared.effectiveModel,
        effort: prepared.effort,
        streaming: prepared.streaming,
        disableReasoningReplay
    });
    return createHash('sha256')
        .update(JSON.stringify(canonical))
        .digest('hex')
        .slice(0, FINGERPRINT_HEX_LENGTH);
}
export function createRecoverySemanticSnapshot(prepared, options, previous) {
    const fingerprint = semanticFingerprint(prepared, options.disableReasoningReplay);
    const sameGroup = previous !== undefined &&
        previous.semanticFingerprint === fingerprint &&
        previous.requestKind === options.requestKind &&
        previous.disableReasoningReplay === options.disableReasoningReplay;
    const conversationState = cloneConversationState(prepared.conversationState);
    return {
        recoveryGroupId: sameGroup ? previous.recoveryGroupId : randomUUID(),
        semanticFingerprint: fingerprint,
        initialSemanticFingerprint: previous?.initialSemanticFingerprint ?? fingerprint,
        conversationState,
        conversationId: prepared.conversationId,
        initialConversationId: previous?.initialConversationId ?? prepared.conversationId,
        streaming: prepared.streaming,
        effectiveModel: prepared.effectiveModel,
        ...(prepared.effort !== undefined ? { effort: prepared.effort } : {}),
        requestKind: options.requestKind,
        disableReasoningReplay: options.disableReasoningReplay
    };
}
export function bindRecoverySemanticSnapshot(snapshot, auth) {
    return {
        conversationState: cloneConversationState(snapshot.conversationState),
        ...(auth.profileArn !== undefined ? { profileArn: auth.profileArn } : {}),
        streaming: snapshot.streaming,
        effectiveModel: snapshot.effectiveModel,
        conversationId: snapshot.conversationId,
        region: extractRegionFromArn(auth.profileArn) ?? auth.region,
        ...(snapshot.effort !== undefined ? { effort: snapshot.effort } : {})
    };
}
export function recoveryIdentityLogFields(snapshot) {
    return {
        recoveryGroupId: snapshot.recoveryGroupId,
        semanticFingerprint: snapshot.semanticFingerprint,
        wireConversationId: snapshot.conversationId,
        conversationId: snapshot.conversationId,
        requestKind: snapshot.requestKind,
        sameSemanticAsInitial: snapshot.semanticFingerprint === snapshot.initialSemanticFingerprint,
        sameConversationIdAsInitial: snapshot.conversationId === snapshot.initialConversationId
    };
}
export function accountLogAlias(accountId) {
    const existing = accountAliases.get(accountId);
    if (existing)
        return existing;
    const alias = `account-${accountAliases.size + 1}`;
    accountAliases.set(accountId, alias);
    return alias;
}
