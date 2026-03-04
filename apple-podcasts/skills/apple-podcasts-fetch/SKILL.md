---
name: Apple Podcasts Fetch
description: >-
  This skill should be used when the user asks to "download an Apple Podcast episode",
  "get podcast audio from Apple Podcasts", "fetch podcast MP3", "extract audio URL from
  Apple Podcasts link", provides an Apple Podcasts URL (podcasts.apple.com), or mentions
  downloading or extracting audio from Apple Podcasts. Provides the complete iTunes API +
  RSS feed workflow to resolve episode audio download URLs without a browser.
---

# Apple Podcasts Episode Audio Fetch

Fetch audio download URLs from Apple Podcasts episodes using only HTTP APIs. No browser, no scraping — just iTunes Lookup API and RSS feed parsing.

## Overview

Apple Podcasts does not expose direct audio URLs on its web pages. To obtain the audio file URL for a specific episode, follow a three-step API pipeline:

1. **Parse the Apple Podcasts URL** to extract `show_id` and `track_id`
2. **Call iTunes Lookup API** to get the podcast's RSS feed URL
3. **Call iTunes Episode Lookup** to get the `episodeGuid`, then **fetch the RSS feed** and match the guid to extract the audio `<enclosure>` URL

## Step 1: Parse the Apple Podcasts URL

Apple Podcasts episode URLs follow this structure:

```
https://podcasts.apple.com/{region}/podcast/{slug}/id{show_id}?i={track_id}
```

Example:
```
https://podcasts.apple.com/tw/podcast/ep640/id1500839292?i=1000752065662
                                                ^^^^^^^^^^  ^^^^^^^^^^^^^
                                                show_id     track_id
```

Extract two values:
- **`show_id`**: The numeric ID after `id` in the URL path (e.g., `1500839292`)
- **`track_id`**: The value of the `?i=` query parameter (e.g., `1000752065662`)

Both values are required. If the URL lacks `?i=`, prompt the user to provide a URL that includes the episode-specific `?i=` parameter, or use the iTunes Episode Lookup (Step 3a) to list recent episodes for the user to choose from.

## Step 2: Get RSS Feed URL via iTunes Lookup API

Make a GET request:

```
GET https://itunes.apple.com/lookup?id={show_id}
```

The response JSON contains a `results` array. The first result includes:

| Field | Description |
|-------|-------------|
| `feedUrl` | The podcast's RSS feed URL |
| `collectionName` | Podcast title |
| `trackCount` | Total episode count |

Extract the `feedUrl` value for Step 3.

**Example using curl:**

```bash
curl -s "https://itunes.apple.com/lookup?id=1500839292" | jq '.results[0].feedUrl'
```

## Step 3: Get Episode Audio URL

This step has two sub-steps: first get the `episodeGuid` from iTunes, then match it in the RSS feed.

### 3a: Get episodeGuid via iTunes Episode Lookup

Make a GET request:

```
GET https://itunes.apple.com/lookup?id={show_id}&entity=podcastEpisode&limit=200
```

The response `results` array contains the podcast info (index 0) followed by episode objects. Each episode includes:

| Field | Description |
|-------|-------------|
| `trackId` | iTunes track ID — match this against `track_id` from the URL |
| `episodeGuid` | The RSS `<guid>` value for this episode |
| `trackName` | Episode title |
| `episodeUrl` | Audio file URL (try this first; fall back to RSS if missing or broken) |

Find the episode where `trackId` equals the `track_id` from Step 1. Extract its `episodeGuid`.

**Example using curl + jq:**

```bash
curl -s "https://itunes.apple.com/lookup?id=1500839292&entity=podcastEpisode&limit=200" \
  | jq '.results[] | select(.trackId == 1000752065662) | .episodeGuid'
```

### 3b: Fetch RSS Feed and Match guid

Fetch the RSS feed URL obtained in Step 2. Parse the XML to find the `<item>` whose `<guid>` matches the `episodeGuid` from Step 3a.

From the matching `<item>`, extract:

| XML Element | Data |
|-------------|------|
| `<title>` | Episode title |
| `<pubDate>` | Publication date |
| `<enclosure url="...">` | **Audio file download URL** |
| `<guid>` | Episode unique identifier |

**Example using curl + xmllint:**

```bash
FEED_URL="https://feeds.soundon.fm/podcasts/..."
GUID="360acf81-2bca-4f2f-b2b7-11647b8f10d4"

curl -s "$FEED_URL" | xmllint --xpath \
  "//item[guid='$GUID']/enclosure/@url" - 2>/dev/null
```

Alternatively, use Python with `xml.etree.ElementTree` or a simple `grep`/`sed` approach on the raw XML, since RSS feeds are well-structured.

## Complete Workflow Summary

```
Apple Podcasts URL
        │
        ├── Extract show_id (from path: id{show_id})
        └── Extract track_id (from query: ?i={track_id})
                │
                ▼
    iTunes Lookup API: /lookup?id={show_id}
        → feedUrl (RSS feed URL)
                │
                ▼
    iTunes Episode Lookup: /lookup?id={show_id}&entity=podcastEpisode&limit=200
        → Match trackId == track_id
        → episodeGuid
                │
                ▼
    Fetch RSS Feed (feedUrl)
        → Match <guid> == episodeGuid
        → <enclosure url="..."> = audio download URL
```

## Limitations and Edge Cases

- **`limit` parameter**: iTunes Episode Lookup returns at most ~50 recent episodes. Older episodes may not appear. Increase `limit` up to `200` if needed, but very old episodes may still be unreachable via this API.
- **No direct episode lookup**: iTunes API does not support `/lookup?id={track_id}` for individual episodes — it returns empty results.
- **Missing `?i=` parameter**: Without the `track_id` query parameter, a specific episode cannot be identified. The URL must include `?i=`.
- **`episodeUrl` shortcut**: The iTunes Episode Lookup response includes an `episodeUrl` field that often contains the direct audio URL. Try this first as a shortcut before fetching the full RSS feed. Fall back to RSS if the URL is missing or returns an error.
- **Large RSS feeds**: Some podcasts have hundreds of episodes. The RSS feed may be several MB. Consider streaming or partial parsing for efficiency.

## Tool Selection

When executing this workflow in Claude Code:

- Use **WebFetch** to call the iTunes API endpoints and parse the JSON responses
- Use **Bash** with `curl` for RSS feed fetching (RSS/XML is too large for WebFetch in many cases)
- Use **Bash** with `xmllint`, `grep`, or Python for XML parsing of the RSS feed
