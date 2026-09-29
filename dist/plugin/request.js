import * as crypto from 'crypto';
import * as os from 'os';
import { KIRO_CONSTANTS, buildUrl, extractRegionFromArn } from '../constants.js';
import { buildHistory, extractToolNamesFromHistory, historyHasToolCalling, injectSystemPrompt } from '../infrastructure/transformers/history-builder.js';
import { findOriginalToolCall, findThinkingTextReplayIndex, getContentText, mergeAdjacentMessages } from '../infrastructure/transformers/message-transformer.js';
import { convertToolsToCodeWhisperer, deduplicateToolResults } from '../infrastructure/transformers/tool-transformer.js';
import { getEffectiveEffort, resolveEffort } from './effort.js';
import { convertImagesToKiroFormat, extractAllImages, extractTextFromParts } from './image-handler.js';
import { resolveModelVariant } from './models.js';
import { reconstructAssistantResponse } from './reasoning/request-replay.js';
function jsonSchemaTypeOf(value) {
    if (Array.isArray(value))
        return 'array';
    if (value === null)
        return 'string';
    const t = typeof value;
    if (t === 'number' || t === 'boolean' || t === 'string' || t === 'object')
        return t;
    return 'string';
}
// No `required` fields are inferred: fabricated required keys risk a 400.
function inferToolSpecFromHistory(name, toolUsesInHistory) {
    const sample = toolUsesInHistory.find((tu) => tu.name === name && tu.input && typeof tu.input === 'object' && !Array.isArray(tu.input));
    const properties = {};
    if (sample && sample.input) {
        for (const [key, val] of Object.entries(sample.input)) {
            properties[key] = { type: jsonSchemaTypeOf(val) };
        }
    }
    const json = Object.keys(properties).length > 0 ? { type: 'object', properties } : { type: 'object' };
    return { name, description: `Tool ${name}`, inputSchema: { json } };
}
function buildCodeWhispererRequest(body, model, auth, think = false, budget = 20000, _showToast) {
    const req = typeof body === 'string' ? JSON.parse(body) : body;
    const { messages, tools, system } = req;
    const convId = crypto.randomUUID();
    if (!messages || messages.length === 0)
        throw new Error('No messages');
    const { wireId: resolved, effort: variantEffort } = resolveModelVariant(model);
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');
    let sys = system || '';
    if (systemMsgs.length > 0) {
        const extractedSystem = systemMsgs.map((m) => getContentText(m)).join('\n\n');
        sys = sys ? `${sys}\n\n${extractedSystem}` : extractedSystem;
    }
    if (think) {
        const pfx = `<thinking_mode>enabled</thinking_mode><max_thinking_length>${budget}</max_thinking_length>`;
        sys = sys.includes('<thinking_mode>') ? sys : sys ? `${pfx}\n${sys}` : pfx;
    }
    const msgs = mergeAdjacentMessages([...otherMsgs]);
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && getContentText(lastMsg) === '{')
        msgs.pop();
    const cwTools = tools ? convertToolsToCodeWhisperer(tools) : [];
    const thinkingReplayIndex = findThinkingTextReplayIndex(msgs);
    let history = buildHistory(msgs, resolved);
    const curMsg = msgs[msgs.length - 1];
    if (!curMsg)
        throw new Error('Empty');
    const isRealUserMsg = curMsg.role === 'user' &&
        !(Array.isArray(curMsg.content) && curMsg.content.some((p) => p.type === 'tool_result'));
    if (isRealUserMsg && msgs.length >= 2) {
        const prevMsg = msgs[msgs.length - 2];
        if (prevMsg?.role === 'assistant') {
            const lastHistEntry = history[history.length - 1];
            const historyEndsWithUser = lastHistEntry?.userInputMessage;
            if (historyEndsWithUser) {
                const reconstructed = reconstructAssistantResponse(prevMsg, resolved, {
                    recoverReasoning: false,
                    allowThinkingText: msgs.length - 2 === thinkingReplayIndex
                });
                const arm = reconstructed.response;
                if (arm.content || arm.toolUses || arm.reasoningContent) {
                    history.push({ assistantResponseMessage: arm });
                }
            }
        }
    }
    history = injectSystemPrompt(history, sys, resolved);
    let curContent = '';
    const curTrs = [];
    const curImgs = [];
    if (curMsg.role === 'assistant') {
        const arm = reconstructAssistantResponse(curMsg, resolved, {
            recoverReasoning: true,
            allowThinkingText: msgs.length - 1 === thinkingReplayIndex
        }).response;
        if (arm.content || arm.toolUses || arm.reasoningContent) {
            history.push({ assistantResponseMessage: arm });
        }
        curContent = '[system: conversation continues]';
    }
    else {
        const prev = history[history.length - 1];
        // `currentMessage` is always a user turn, so a trailing user-shaped history entry
        // breaks Kiro's alternation. Unlike two adjacent history turns this pair cannot be
        // merged: they straddle the history/currentMessage boundary, and the trailing entry
        // is usually the injected system-prompt turn, which has to stay in history. An
        // empty assistant turn is the official tool-only shape and, unlike a placeholder
        // string, gives the model no text of its own voice to reproduce.
        if (prev && !prev.assistantResponseMessage)
            history.push({ assistantResponseMessage: { content: '' } });
        if (curMsg.role === 'tool') {
            if (curMsg.tool_results) {
                for (const tr of curMsg.tool_results)
                    curTrs.push({
                        content: [{ text: getContentText(tr) }],
                        status: 'success',
                        toolUseId: tr.tool_call_id
                    });
            }
            else {
                curTrs.push({
                    content: [{ text: getContentText(curMsg) }],
                    status: 'success',
                    toolUseId: curMsg.tool_call_id
                });
            }
        }
        else if (Array.isArray(curMsg.content)) {
            curContent = extractTextFromParts(curMsg.content);
            for (const p of curMsg.content) {
                if (p.type === 'tool_result') {
                    curTrs.push({
                        content: [{ text: getContentText(p.content || p) }],
                        status: 'success',
                        toolUseId: p.tool_use_id
                    });
                }
            }
            const unifiedImages = extractAllImages(curMsg.content);
            if (unifiedImages.length > 0) {
                const { images, omitted } = convertImagesToKiroFormat(unifiedImages);
                curImgs.push(...images);
                if (omitted > 0) {
                    curContent += `\n\n[${omitted} image(s) omitted due to API limits]`;
                }
            }
        }
        else
            curContent = getContentText(curMsg);
        if (!curContent && !curTrs.length)
            curContent = '[system: conversation continues]';
    }
    const request = {
        conversationState: {
            chatTriggerType: KIRO_CONSTANTS.CHAT_TRIGGER_TYPE_MANUAL,
            conversationId: convId,
            currentMessage: {
                userInputMessage: {
                    content: curContent,
                    modelId: resolved,
                    origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR
                }
            }
        }
    };
    if (auth.profileArn)
        request.profileArn = auth.profileArn;
    const toolUsesInHistory = history.flatMap((h) => h.assistantResponseMessage?.toolUses || []);
    const allToolUseIdsInHistory = new Set(toolUsesInHistory.map((tu) => tu.toolUseId));
    const finalCurTrs = [];
    const orphanedTrs = [];
    for (const tr of curTrs) {
        if (allToolUseIdsInHistory.has(tr.toolUseId))
            finalCurTrs.push(tr);
        else {
            const originalCall = findOriginalToolCall(messages, tr.toolUseId);
            if (originalCall) {
                orphanedTrs.push({
                    call: {
                        name: originalCall.name || originalCall.function?.name || 'tool',
                        toolUseId: tr.toolUseId,
                        input: originalCall.input ||
                            (originalCall.function?.arguments ? JSON.parse(originalCall.function.arguments) : {})
                    },
                    result: tr
                });
            }
            else {
                curContent += `\n\n[Output for tool call ${tr.toolUseId}]:\n${tr.content?.[0]?.text || ''}`;
            }
        }
    }
    if (orphanedTrs.length > 0) {
        const prev = history[history.length - 1];
        if (!prev || prev.assistantResponseMessage) {
            history.push({
                userInputMessage: {
                    content: 'Running tools...',
                    modelId: resolved,
                    origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR
                }
            });
        }
        history.push({
            assistantResponseMessage: {
                content: 'I will execute the following tools.',
                toolUses: orphanedTrs.map((o) => o.call)
            }
        });
        finalCurTrs.push(...orphanedTrs.map((o) => o.result));
    }
    if (history.length > 0)
        request.conversationState.history = history;
    const uim = request.conversationState.currentMessage.userInputMessage;
    if (uim) {
        uim.content = curContent;
        if (curImgs.length)
            uim.images = curImgs;
        const ctx = {};
        if (finalCurTrs.length)
            ctx.toolResults = deduplicateToolResults(finalCurTrs);
        if (cwTools.length)
            ctx.tools = cwTools;
        if (Object.keys(ctx).length)
            uim.userInputMessageContext = ctx;
        const hasToolsInHistory = historyHasToolCalling(history);
        if (hasToolsInHistory) {
            const toolNamesInHistory = extractToolNamesFromHistory(history);
            if (toolNamesInHistory.size > 0) {
                const existingTools = uim.userInputMessageContext?.tools || [];
                const existingToolNames = new Set(existingTools.map((t) => t.toolSpecification?.name).filter(Boolean));
                const missingToolNames = Array.from(toolNamesInHistory).filter((name) => !existingToolNames.has(name));
                if (missingToolNames.length > 0) {
                    const placeholderTools = missingToolNames.map((name) => {
                        const inferred = inferToolSpecFromHistory(name, toolUsesInHistory);
                        return { toolSpecification: inferred };
                    });
                    if (!uim.userInputMessageContext)
                        uim.userInputMessageContext = {};
                    uim.userInputMessageContext.tools = [...existingTools, ...placeholderTools];
                }
            }
        }
    }
    return { request, resolved, convId, variantEffort };
}
export function transformToCodeWhisperer(_url, body, model, auth, think = false, budget = 20000) {
    const { request, resolved, convId } = buildCodeWhispererRequest(body, model, auth, think, budget);
    const osP = os.platform(), osR = os.release(), nodeV = process.version.replace('v', '');
    const osN = osP === 'win32' ? `windows#${osR}` : osP === 'darwin' ? `macos#${osR}` : `${osP}#${osR}`;
    const ua = `aws-sdk-js/3.738.0 ua/2.1 os/${osN} lang/js md/nodejs#${nodeV} api/codewhisperer#3.738.0 m/E KiroIDE`;
    return {
        url: buildUrl(KIRO_CONSTANTS.BASE_URL, extractRegionFromArn(auth.profileArn) ?? auth.region),
        init: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${auth.access}`,
                'amz-sdk-invocation-id': crypto.randomUUID(),
                'amz-sdk-request': 'attempt=1; max=1',
                'x-amzn-kiro-agent-mode': 'vibe',
                'x-amz-user-agent': 'aws-sdk-js/3.738.0 KiroIDE',
                'user-agent': ua,
                Connection: 'close'
            },
            body: JSON.stringify(request)
        },
        streaming: true,
        effectiveModel: resolved,
        conversationId: convId
    };
}
// A partially-stripped history is still a 400: Kiro validates every replayed
// signature, so signature-rejection recovery must remove ALL of them, including
// the current turn's.
export function stripReasoningContent(conversationState) {
    const strip = (message) => {
        if (message?.assistantResponseMessage) {
            delete message.assistantResponseMessage.reasoningContent;
        }
    };
    for (const entry of conversationState.history ?? [])
        strip(entry);
    strip(conversationState.currentMessage);
}
export function transformToSdkRequest(body, model, auth, think = false, budget = 20000, showToast, options) {
    const { request, resolved, convId, variantEffort } = buildCodeWhispererRequest(body, model, auth, think, budget, showToast);
    if (options?.disableReasoningReplay) {
        stripReasoningContent(request.conversationState);
    }
    const effort = variantEffort
        ? resolveEffort(resolved, variantEffort)
        : getEffectiveEffort(resolved, think, budget, options?.effort, options?.autoEffortMapping ?? true);
    return {
        conversationState: request.conversationState,
        profileArn: request.profileArn,
        streaming: true,
        effectiveModel: resolved,
        conversationId: convId,
        region: extractRegionFromArn(auth.profileArn) ?? auth.region,
        effort
    };
}
