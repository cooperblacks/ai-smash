/**
 * Built-in Wikipedia Tool
 * Queries Wikipedia article summaries, overviews, and deep factual context.
 */

export interface WikipediaSummaryResult {
  found: boolean;
  title: string;
  description?: string;
  extract: string;
  url: string;
  thumbnail?: string;
}

export async function queryWikipedia(query: string): Promise<WikipediaSummaryResult> {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return {
      found: false,
      title: '',
      extract: 'No search term specified.',
      url: 'https://en.wikipedia.org',
    };
  }

  try {
    // 1. Search for closest matching article title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      throw new Error(`Wikipedia search returned status ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const topHit = searchData.query?.search?.[0];

    if (!topHit) {
      return {
        found: false,
        title: cleanQuery,
        extract: `No Wikipedia article found matching "${cleanQuery}".`,
        url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(cleanQuery)}`,
      };
    }

    const articleTitle = topHit.title;

    // 2. Fetch full summary using Wikipedia REST API
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle.replace(/\s+/g, '_'))}`;
    const summaryRes = await fetch(summaryUrl);

    if (summaryRes.ok) {
      const summaryData = await summaryRes.json();
      return {
        found: true,
        title: summaryData.title || articleTitle,
        description: summaryData.description,
        extract: summaryData.extract || (topHit.snippet || '').replace(/<[^>]*>?/gm, ''),
        url: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replace(/\s+/g, '_'))}`,
        thumbnail: summaryData.thumbnail?.source,
      };
    }

    // Fallback if summary REST fails
    return {
      found: true,
      title: articleTitle,
      extract: (topHit.snippet || '').replace(/<[^>]*>?/gm, ''),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replace(/\s+/g, '_'))}`,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Wikipedia query error';
    return {
      found: false,
      title: cleanQuery,
      extract: `Error querying Wikipedia: ${msg}`,
      url: 'https://en.wikipedia.org',
    };
  }
}
