import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '../core/Logger.js';

/**
 * LinkMetadataCache — fetches and caches oEmbed/OpenGraph metadata.
 *
 * Inspired by Stash's link metadata fetcher: when a user saves a URL,
 * fetch oEmbed data (for rich embeds) and OpenGraph meta tags (title,
 * description, thumbnail) once, then cache locally. This makes YouTube
 * videos and articles render as rich cards instead of raw URLs.
 *
 * Features:
 *   - oEmbed provider detection (YouTube, Twitter, Vimeo, etc.)
 *   - OpenGraph meta tag parsing
 *   - Local thumbnail caching (download + store)
 *   - TTL-based cache invalidation
 *   - Graceful degradation: if fetch fails, return URL as title
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OEMBED_PROVIDERS = {
  'youtube.com': 'https://www.youtube.com/oembed?format=json&url=',
  'youtu.be': 'https://www.youtube.com/oembed?format=json&url=',
  'twitter.com': 'https://publish.twitter.com/oembed?url=',
  'x.com': 'https://publish.twitter.com/oembed?url=',
  'vimeo.com': 'https://vimeo.com/api/oembed.json?url=',
  'github.com': null, // No oEmbed, use OpenGraph
};

export class LinkMetadataCache {
  constructor(config = {}) {
    this.logger = new Logger('LinkMetadataCache');
    this.enabled = config.enabled !== false;
    this.cacheDir = config.cacheDir || path.join(process.cwd(), 'data', 'link-cache');
    this.thumbnailDir = path.join(this.cacheDir, 'thumbnails');
    this.ttl = config.ttl || DEFAULT_TTL_MS;
    this._cache = new Map(); // url -> { metadata, fetchedAt, thumbnailPath }
    this._stats = {
      totalFetched: 0,
      totalCached: 0,
      totalFailed: 0,
      thumbnailsDownloaded: 0,
      cacheHits: 0,
    };
    this._initDirs();
  }

  async _initDirs() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
    } catch {}
  }

  /**
   * Get metadata for a URL. Fetches if not cached or expired.
   */
  async get(url) {
    if (!this.enabled) return { url, title: url, description: '', thumbnail: null };

    const cached = this._cache.get(url);
    if (cached && Date.now() - cached.fetchedAt < this.ttl) {
      this._stats.cacheHits++;
      return cached.metadata;
    }

    try {
      const metadata = await this._fetchMetadata(url);
      this._cache.set(url, {
        metadata,
        fetchedAt: Date.now(),
      });
      this._stats.totalFetched++;
      this._stats.totalCached++;

      // Download thumbnail if available
      if (metadata.thumbnailUrl) {
        const thumbPath = await this._downloadThumbnail(url, metadata.thumbnailUrl);
        if (thumbPath) {
          metadata.thumbnailPath = thumbPath;
          metadata.thumbnail = `/api/link-cache/thumbnail/${path.basename(thumbPath)}`;
        }
      }

      return metadata;
    } catch (e) {
      this._stats.totalFailed++;
      this.logger.warn(`Failed to fetch metadata for ${url}: ${e.message}`);
      return {
        url,
        title: url,
        description: '',
        thumbnail: null,
        error: e.message,
      };
    }
  }

  /**
   * Fetch metadata via oEmbed or OpenGraph.
   */
  async _fetchMetadata(url) {
    const hostname = this._getHostname(url);

    // Try oEmbed first
    const oembedEndpoint = OEMBED_PROVIDERS[hostname];
    if (oembedEndpoint) {
      try {
        const response = await fetch(`${oembedEndpoint}${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          return {
            url,
            title: data.title || '',
            description: data.author_name ? `by ${data.author_name}` : '',
            thumbnailUrl: data.thumbnail_url || data.thumbnail || null,
            html: data.html || null,
            providerName: data.provider_name || hostname,
            authorName: data.author_name || null,
            type: data.type || 'link',
            method: 'oembed',
          };
        }
      } catch (e) {
        this.logger.debug(`oEmbed failed for ${hostname}: ${e.message}`);
      }
    }

    // Fallback: parse OpenGraph meta tags
    return this._fetchOpenGraph(url);
  }

  /**
   * Fetch and parse OpenGraph meta tags from HTML.
   */
  async _fetchOpenGraph(url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ChimeraBot/1.0 (+https://conduitt.xyz)' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const metadata = {
      url,
      title: '',
      description: '',
      thumbnailUrl: null,
      providerName: this._getHostname(url),
      type: 'link',
      method: 'opengraph',
    };

    // Parse OpenGraph tags
    const ogMatches = html.matchAll(/<meta\s+(?:property|name)=["'](og:|twitter:)?([^"']+)["']\s+content=["']([^"']*)["']/gi);
    for (const match of ogMatches) {
      const [, prefix, property, content] = match;
      const key = `${prefix}${property}`.toLowerCase();

      if (key === 'og:title' || key === 'twitter:title') {
        if (!metadata.title) metadata.title = content;
      } else if (key === 'og:description' || key === 'twitter:description' || key === 'description') {
        if (!metadata.description) metadata.description = content;
      } else if (key === 'og:image' || key === 'twitter:image') {
        if (!metadata.thumbnailUrl) metadata.thumbnailUrl = content;
      } else if (key === 'og:site_name') {
        metadata.providerName = content;
      } else if (key === 'og:type') {
        metadata.type = content;
      }
    }

    // Fallback to <title> tag
    if (!metadata.title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) metadata.title = titleMatch[1].trim();
    }

    if (!metadata.title) metadata.title = url;
    return metadata;
  }

  /**
   * Download and cache a thumbnail image.
   */
  async _downloadThumbnail(url, thumbnailUrl) {
    try {
      const urlHash = this._hashUrl(url);
      const ext = this._guessImageExt(thumbnailUrl);
      const filename = `${urlHash}${ext}`;
      const filepath = path.join(this.thumbnailDir, filename);

      // Check if already downloaded
      try {
        await fs.access(filepath);
        return filepath; // Already exists
      } catch {}

      const response = await fetch(thumbnailUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filepath, buffer);
      this._stats.thumbnailsDownloaded++;
      return filepath;
    } catch (e) {
      this.logger.debug(`Thumbnail download failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Get cached metadata for multiple URLs.
   */
  async getBatch(urls) {
    const results = [];
    for (const url of urls) {
      results.push(await this.get(url));
    }
    return results;
  }

  /**
   * Clear expired cache entries.
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [url, entry] of this._cache) {
      if (now - entry.fetchedAt > this.ttl) {
        this._cache.delete(url);
        removed++;
      }
    }
    if (removed > 0) this.logger.debug(`Cleaned up ${removed} expired cache entries`);
  }

  _getHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  _hashUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  _guessImageExt(url) {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return '.png';
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return '.jpg';
    if (lower.includes('.gif')) return '.gif';
    if (lower.includes('.webp')) return '.webp';
    return '.jpg';
  }

  getStats() {
    return {
      enabled: this.enabled,
      cacheSize: this._cache.size,
      totalFetched: this._stats.totalFetched,
      totalCached: this._stats.totalCached,
      totalFailed: this._stats.totalFailed,
      cacheHits: this._stats.cacheHits,
      thumbnailsDownloaded: this._stats.thumbnailsDownloaded,
      ttl: this.ttl,
    };
  }
}
