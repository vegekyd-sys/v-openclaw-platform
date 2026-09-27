// Parses the RFB client -> server byte stream after the handshake, one message
// at a time, so the proxy can decide per message whether it is forwarded.
//
// Message lengths follow the upstream OpenClaw view-only filter
// (src/gateway/desktop/rfb-view-only-filter.ts) so noVNC's extended messages
// are recognised. Anything unknown is an error: guessing a length would let a
// viewer smuggle input inside a "read-only" message.
const MAX_PENDING_BYTES = 64 * 1024;

export const INPUT_MESSAGE_TYPES = new Set([4, 5, 6, 251, 255]);
export const PASSIVE_MESSAGE_TYPES = new Set([0, 2, 3, 150, 248]);

// Client-side cursor pseudo-encodings. When a viewer does not advertise them,
// TigerVNC paints the pointer into the framebuffer, so everyone watching sees
// where the agent's mouse is and what it clicks.
export const CURSOR_PSEUDO_ENCODINGS = new Set([-239, -232, -261, -262, -314]);

/** Rewrites a SetEncodings message (type 2) without the cursor pseudo-encodings. */
export function stripCursorEncodings(message) {
  if (message[0] !== 2 || message.length < 4) {
    return message;
  }
  const count = message.readUInt16BE(2);
  const kept = [];
  for (let i = 0; i < count && 4 + i * 4 + 4 <= message.length; i += 1) {
    const encoding = message.readInt32BE(4 + i * 4);
    if (!CURSOR_PSEUDO_ENCODINGS.has(encoding)) {
      kept.push(encoding);
    }
  }
  const out = Buffer.alloc(4 + kept.length * 4);
  out[0] = 2;
  out[1] = 0;
  out.writeUInt16BE(kept.length, 2);
  kept.forEach((encoding, i) => out.writeInt32BE(encoding, 4 + i * 4));
  return out;
}

function targetLength(pending) {
  if (pending.length === 0) {
    return 1;
  }
  switch (pending[0]) {
    case 0:
      return 20; // SetPixelFormat
    case 2:
      return pending.length < 4 ? 4 : 4 + pending.readUInt16BE(2) * 4; // SetEncodings
    case 3:
      return 10; // FramebufferUpdateRequest
    case 4:
      return 8; // KeyEvent
    case 5:
      // noVNC's extended pointer event sets bit 7 of the button mask and appends one byte.
      return pending.length < 2 ? 2 : (pending.readUInt8(1) & 0x80) !== 0 ? 7 : 6;
    case 6:
      // noVNC marks extended clipboard payloads with a negative signed length.
      return pending.length < 8 ? 8 : 8 + Math.abs(pending.readInt32BE(4));
    case 150:
      return 10; // EnableContinuousUpdates
    case 248:
      return pending.length < 9 ? 9 : 9 + pending.readUInt8(8); // ClientFence
    case 251:
      return 24; // SetDesktopSize with one screen record (noVNC)
    case 255:
      return 12; // QEMU extended key event
    default:
      return `unsupported RFB client message type ${pending[0]}`;
  }
}

/**
 * Splits chunks into complete client messages. `onMessage(type, buffer)` is
 * called once per message; it returns true to forward the message.
 */
export function createRfbClientMessageSplitter() {
  let pending = Buffer.alloc(0);
  let failure;
  return {
    /** @returns {{forward: Buffer, messages: number[]} | {error: string}} */
    split(chunk, shouldForward) {
      if (failure) {
        return { error: failure };
      }
      const forwarded = [];
      const messages = [];
      let offset = 0;
      while (offset < chunk.length) {
        let target = targetLength(pending);
        if (typeof target === "string") {
          failure = target;
          return { error: target };
        }
        if (target > MAX_PENDING_BYTES) {
          failure = "RFB client message exceeds the 64 KiB buffer limit";
          return { error: failure };
        }
        const take = Math.min(target - pending.length, chunk.length - offset);
        pending = Buffer.concat([pending, chunk.subarray(offset, offset + take)]);
        offset += take;
        target = targetLength(pending);
        if (typeof target === "string") {
          failure = target;
          return { error: target };
        }
        if (target > MAX_PENDING_BYTES) {
          failure = "RFB client message exceeds the 64 KiB buffer limit";
          return { error: failure };
        }
        if (pending.length < target) {
          continue;
        }
        const type = pending[0];
        messages.push(type);
        const decision = shouldForward(type, pending);
        if (Buffer.isBuffer(decision)) {
          forwarded.push(decision);
        } else if (decision) {
          forwarded.push(pending);
        }
        pending = Buffer.alloc(0);
      }
      return { forward: Buffer.concat(forwarded), messages };
    },
  };
}
