export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  if (!(error instanceof Error)) return fallback;

  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && !messages.includes(current.message)) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join('\nCause: ');
}
