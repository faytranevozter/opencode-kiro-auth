import { warn } from '../logger.js';
// Observes the `reasoningContentEvent`s of ONE stream attempt and finalizes them into a
// sendable envelope. Observation only — it never influences visible output.
export class ReasoningAccumulator {
    text = '';
    signature = '';
    redacted = null;
    textEventCount = 0;
    signatureEventCount = 0;
    redactedEventCount = 0;
    rejection = null;
    observe(event) {
        if (!event)
            return;
        if (typeof event.text === 'string' && event.text.length > 0) {
            this.text += event.text;
            this.textEventCount++;
        }
        if (typeof event.signature === 'string' && event.signature.length > 0) {
            this.signatureEventCount++;
            // Two differing non-empty signatures cover two different reasoning payloads, so
            // either choice would be a guess. Retain the last one but mark the envelope dead.
            if (this.signature.length > 0 && this.signature !== event.signature) {
                this.rejection = 'conflicting-signature';
            }
            this.signature = event.signature;
        }
        const redactedContent = event.redactedContent;
        if (redactedContent && redactedContent.byteLength > 0) {
            this.redactedEventCount++;
            this.redacted = concatBytes(this.redacted, redactedContent);
        }
    }
    reset() {
        this.text = '';
        this.signature = '';
        this.redacted = null;
        this.textEventCount = 0;
        this.signatureEventCount = 0;
        this.redactedEventCount = 0;
        this.rejection = null;
    }
    snapshot() {
        const snapshot = this.sanitizedShape();
        const rejection = this.resolveRejection();
        if (rejection)
            snapshot.rejection = rejection;
        return snapshot;
    }
    finalize() {
        const rejection = this.resolveRejection();
        if (rejection) {
            warn('Kiro reasoning envelope unsupported, no native reasoningContent captured', {
                reason: rejection,
                ...this.sanitizedShape()
            });
            return undefined;
        }
        if (this.redacted) {
            return { kind: 'redactedContent', bytes: copyBytes(this.redacted) };
        }
        // Unsigned reasoning is not a fault — some models emit none. It has no sendable form,
        // so it degrades silently to visible text only.
        if (this.text.length > 0 && this.signature.length > 0) {
            return { kind: 'reasoningText', text: this.text, signature: this.signature };
        }
        return undefined;
    }
    resolveRejection() {
        if (this.rejection)
            return this.rejection;
        if (this.text.length > 0 && this.redacted)
            return 'mixed-text-and-redacted';
        return null;
    }
    // Kinds and lengths only. A signature or redacted byte must never reach a log.
    sanitizedShape() {
        return {
            textLength: this.text.length,
            textEventCount: this.textEventCount,
            signaturePresent: this.signature.length > 0,
            signatureLength: this.signature.length,
            signatureEventCount: this.signatureEventCount,
            redactedByteLength: this.redacted?.byteLength ?? 0,
            redactedEventCount: this.redactedEventCount
        };
    }
}
function copyBytes(source) {
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy;
}
function concatBytes(existing, next) {
    if (!existing)
        return copyBytes(next);
    const merged = new Uint8Array(existing.byteLength + next.byteLength);
    merged.set(existing, 0);
    merged.set(next, existing.byteLength);
    return merged;
}
