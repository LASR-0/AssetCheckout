export type ParsedReason = {
  rejected?: string;
  request?: string;
  plain?: string;
};

/**
 * Split a request's reason into its parts. A rejection rewrites the column as
 * "REJECTED: <why>\n REQUEST: <original>" (the reject route and both cleanup
 * jobs), so a rejected row carries both; anything else is plain text.
 */
export const parseReason = (text?: string | null): ParsedReason | null => {
  if (!text?.trim()) return null;

  const rejected = text.match(/REJECTED\s*:?\s*([\s\S]*?)(?=REQUEST|$)/)?.[1]?.trim();
  const request = text.match(/REQUEST\s*:?\s*([\s\S]*)$/)?.[1]?.trim();

  if (!rejected && !request) return { plain: text.trim() };
  return { rejected, request };
};
