// Server-only, fixed destination. The secret is never bundled in Vite or sent to a browser.
export function sharedNashmiConfigured(): boolean {
  return Buffer.byteLength(process.env.NASHMI_SHARED_SECRET || '') >= 32;
}

export async function askSharedNashmi(params: {
  kind: 'chat' | 'judge';
  message: string;
  systemInstruction: string;
  timeoutMs: number;
}): Promise<string> {
  const secret = process.env.NASHMI_SHARED_SECRET || '';
  if (!sharedNashmiConfigured()) throw new Error('Shared assistant is not configured.');
  if (!params.message.trim() || params.message.length > 16000 || params.systemInstruction.length > 16000) {
    throw new Error('Assistant request is too large.');
  }
  const response = await fetch('https://three0s-guai.onrender.com/api/bot/platform', {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'X-Nashmi-Secret': secret },
    body: JSON.stringify({ game: 'yemken_hay', kind: params.kind, message: params.message, systemInstruction: params.systemInstruction }),
    signal: AbortSignal.timeout(params.timeoutMs),
  });
  if (!response.ok) throw new Error('Shared assistant temporarily unavailable.');
  const data = await response.json() as { reply?: unknown };
  if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Empty shared assistant reply.');
  return data.reply;
}
