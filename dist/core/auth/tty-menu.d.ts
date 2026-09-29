/**
 * Minimal, dependency-free interactive TTY helpers for auth account management.
 *
 * Ported (in spirit) from opencode-antigravity-auth's ui/{select,confirm,ansi}.js.
 * Kept small on purpose: raw-mode stdin, ANSI cursor control, arrow/enter/esc,
 * ctrl-c to cancel. No external deps. All rendering is self-drawn so it never
 * routes through OpenCode's prompt system (which would force a key prompt).
 */
/** True only when both stdin and stdout are interactive terminals. */
export declare function isInteractiveTty(): boolean
/** Wrap an index into [0, length) — exported for pure unit testing. */
export declare function wrapIndex(index: number, length: number): number
export interface TtySelectItem<T> {
  label: string
  value: T
}
export interface TtySelectOptions {
  message: string
}
/**
 * Render an interactive single-select menu on the TTY.
 * Resolves with the chosen item's value, or `null` if the user cancels
 * (esc / ctrl-c) or raw mode cannot be enabled.
 *
 * Requires an interactive TTY; callers must gate with {@link isInteractiveTty}.
 */
export declare function ttySelect<T>(
  items: ReadonlyArray<TtySelectItem<T>>,
  options: TtySelectOptions
): Promise<T | null>
/**
 * Interactive yes/no confirmation built on {@link ttySelect}.
 * Defaults the cursor to "No" for safety. Cancel (esc/ctrl-c) resolves false.
 */
export declare function ttyConfirm(message: string): Promise<boolean>
