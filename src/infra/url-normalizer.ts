export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);

    // List of tracking query parameters to remove
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'msclkid',
      'ref',
      'srsltid',
      '__cft__',
      '__tn__',
      'sfnsn',
      'mibextid'
    ];

    trackingParams.forEach(param => parsed.searchParams.delete(param));

    // Normalize protocol and trailing slash for standard domain root
    let clean = parsed.toString();
    if (clean.endsWith('/') && parsed.pathname === '/') {
      clean = clean.slice(0, -1);
    }

    return clean;
  } catch {
    return rawUrl.trim();
  }
}
