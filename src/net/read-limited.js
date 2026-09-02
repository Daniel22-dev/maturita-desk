export class ResponseLimitError extends Error {
  constructor(message = 'Odpověď je příliš velká nebo ji nelze bezpečně přečíst.') {
    super(message);
    this.name = 'ResponseLimitError';
    this.code = 'RESPONSE_LIMIT';
  }
}

export async function readTextLimited(response, maxBytes, { message } = {}) {
  const limit = Number(maxBytes);
  const publicMessage = String(message || 'Odpověď je příliš velká nebo ji nelze bezpečně přečíst.');
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('maxBytes musí být kladné celé číslo.');

  const declared = parseContentLength(response?.headers?.get?.('Content-Length'));
  if (declared > limit) throw new ResponseLimitError(publicMessage);

  const reader = response?.body?.getReader?.();
  // Fetch Response bodies in supported production browsers are ReadableStreams. If a
  // transport cannot provide a stream, do not fall back to response.text(): that would
  // reintroduce an unbounded allocation when Content-Length is missing or dishonest.
  if (!reader) throw new ResponseLimitError(publicMessage);

  const decoder = new TextDecoder();
  const textParts = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      total += bytes.byteLength;
      if (total > limit) {
        try { await reader.cancel('response-too-large'); } catch {}
        throw new ResponseLimitError(publicMessage);
      }
      if (bytes.byteLength) textParts.push(decoder.decode(bytes, { stream: true }));
    }
    textParts.push(decoder.decode());
  } catch (error) {
    if (error instanceof ResponseLimitError) throw error;
    throw new ResponseLimitError(publicMessage);
  }
  return textParts.join('');
}

export async function readJsonLimited(response, maxBytes, { tooLargeMessage, invalidJsonMessage } = {}) {
  const text = await readTextLimited(response, maxBytes, {
    message: tooLargeMessage || invalidJsonMessage || 'Odpověď je příliš velká nebo ji nelze bezpečně přečíst.'
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(String(invalidJsonMessage || 'Odpověď není platný JSON.'));
  }
}

function parseContentLength(value) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return 0;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
