/**
 * Native share sheet (WhatsApp, Messages…) on phones; clipboard elsewhere.
 * Returns what happened so the caller can say "Link copied".
 */
export async function shareLink(text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title: '6/7 Numbers', text, url });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return 'copied';
}
