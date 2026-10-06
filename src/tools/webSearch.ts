/**
 * Built-in Web Search Tool
 * Searches the web for live information, current events, and articles.
 */

export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResult {
  query: string;
  results: SearchResultItem[];
  source: string;
}

export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult> {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return { query: '', results: [], source: 'empty_query' };
  }

  // 1. Try server-side web-search proxy endpoint first
  try {
    const res = await fetch(`/api/tools/web-search?q=${encodeURIComponent(cleanQuery)}&limit=${maxResults}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        return {
          query: cleanQuery,
          results: data.results.slice(0, maxResults),
          source: data.source || 'server_proxy',
        };
      }
    }
  } catch {
    // Continue to browser-side fallbacks
  }

  // 2. Browser fallback: DuckDuckGo Instant Answer API (CORS friendly)
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl);
    if (res.ok) {
      const data = await res.json();
      const results: SearchResultItem[] = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || cleanQuery,
          snippet: data.AbstractText,
          url: data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(cleanQuery),
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 40),
              snippet: topic.Text,
              url: topic.FirstURL,
            });
            if (results.length >= maxResults) break;
          } else if (Array.isArray(topic.Topics)) {
            for (const sub of topic.Topics) {
              if (sub.Text && sub.FirstURL) {
                results.push({
                  title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 40),
                  snippet: sub.Text,
                  url: sub.FirstURL,
                });
                if (results.length >= maxResults) break;
              }
            }
          }
        }
      }

      if (results.length > 0) {
        return {
          query: cleanQuery,
          results: results.slice(0, maxResults),
          source: 'duckduckgo_instant',
        };
      }
    }
  } catch {
    // Continue to Wikipedia fallback
  }

  // 3. Browser fallback: Wikipedia search
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&origin=*`;
    const res = await fetch(wikiUrl);
    if (res.ok) {
      const data = await res.json();
      const items = data.query?.search || [];
      const results: SearchResultItem[] = items.slice(0, maxResults).map((item: any) => ({
        title: item.title,
        snippet: (item.snippet || '').replace(/<[^>]*>?/gm, ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
      }));

      return {
        query: cleanQuery,
        results,
        source: 'wikipedia_search',
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Web search failed';
    throw new Error(`Web search error for "${cleanQuery}": ${msg}`);
  }

  return {
    query: cleanQuery,
    results: [],
    source: 'no_results',
  };
}
