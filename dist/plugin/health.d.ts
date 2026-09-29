/** REFRESH-token-dead signals (needs re-login). Historical permanent set. */
export declare function isRefreshTokenDead(reason?: string): boolean
/**
 * ACCESS-token-error signals (refreshable, transient). The canonical case is
 * the CodeWhisperer invalid-bearer 403 whose message is "The bearer token
 * included in the request is invalid". Matched case-insensitively so a
 * capitalization drift on the wire does not misclassify it as dead.
 */
export declare function isAccessTokenError(reason?: string): boolean
/**
 * Back-compat alias. Semantics == refresh-token-dead == permanent (needs
 * re-auth). Preserved so callers that gate exclude/auto-heal/needs-reauth on
 * "permanent" keep working unchanged.
 */
export declare function isPermanentError(reason?: string): boolean
/**
 * Ensure a reason string classifies as refresh-token-dead when persisted via
 * markUnhealthy (which decides permanence from the reason string). If the raw
 * message already matches a dead keyword it is returned unchanged; otherwise a
 * dead marker is prepended so the stored reason is recognized as permanent by
 * isRefreshTokenDead / isPermanentError.
 */
export declare function toDeadReason(reason?: string): string
