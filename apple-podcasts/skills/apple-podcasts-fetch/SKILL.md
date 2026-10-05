---
name: apple-podcasts-fetch
description: >-
  This skill should be used when the user asks to "download an Apple Podcast episode",
  "get podcast audio from Apple Podcasts", "fetch podcast MP3", "extract audio URL from
  Apple Podcasts link", provides an Apple Podcasts URL (podcasts.apple.com), or mentions
  downloading or extracting audio from Apple Podcasts. Provides the complete iTunes API +
  RSS feed workflow to resolve episode audio download URLs without a browser.
---

# Apple Podcasts Episode Audio Fetch

Fetch audio download URLs from Apple Podcasts episodes using only HTTP APIs. No browser, no scraping — one iTunes Lookup API call, with the RSS feed as a fallback.

Apple Podcasts does not expose direct audio URLs on its web pages, so resolve them through the API in the steps below.

**Requirements:** `curl`, `jq`, and `xmllint` (python3 replaces `xmllint` only when it is absent). Run every call through Bash with `curl` + `jq`; WebFetch converts the response to markdown and answers through a small model, which can garble IDs and URLs picked out of a 200-item array.

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

If the URL lacks `?i=`, run Step 2, list the recent episodes (`trackName`, `releaseDate`, `trackId`) for the user to choose from, and continue with the chosen `trackId`.

## Step 2: Look up the show and its episodes

One request returns the podcast and its most recent episodes. Save it so later steps reuse it:

```bash
curl -sf "https://itunes.apple.com/lookup?id=1500839292&entity=podcastEpisode&limit=200" \
  -o "${TMPDIR:-/tmp}/apple-podcasts-lookup.json"
```

The `results` array holds the podcast at index 0 (its `feedUrl` is the RSS feed) followed by episode objects. Each episode includes:

| Field | Description |
|-------|-------------|
| `trackId` | iTunes track ID — match this against `track_id` from the URL |
| `trackName` | Episode title |
| `episodeUrl` | Direct audio file URL |
| `episodeGuid` | The RSS `<guid>` value, used only by the RSS fallback |

## Step 3: Match the episode

```bash
jq --argjson id 1000752065662 \
  '.results[] | select(.trackId == $id) | {trackName, episodeUrl, episodeGuid}' \
  "${TMPDIR:-/tmp}/apple-podcasts-lookup.json"
```

Pass the ID with `--argjson`: `trackId` is a JSON number, and `--arg` would compare it as a string and match nothing. Empty output means the episode is not among the most recent 200 (see Limitations).

## Step 4: Verify the audio URL

```bash
curl -sIL -o /dev/null -w '%{http_code} %{content_type}\n' "EPISODE_URL"
```

The URL is good when this prints `200` and an `audio/*` content type. Return it to the user. When `episodeUrl` is missing or fails this check, take the RSS fallback (Step 5) and verify its URL the same way.

## Step 5 (fallback): Match the guid in the RSS feed

Read `.results[0].feedUrl` from the saved lookup, then extract the `<enclosure url>` of the `<item>` whose `<guid>` equals the episode's `episodeGuid`:

```bash
FEED_URL=$(jq -r '.results[0].feedUrl' "${TMPDIR:-/tmp}/apple-podcasts-lookup.json")
GUID="360acf81-2bca-4f2f-b2b7-11647b8f10d4"

curl -sf "$FEED_URL" | xmllint --xpath "string(//item[guid='$GUID']/enclosure/@url)" -
```

Keep stderr visible to tell the outcomes apart: a parser error message with exit code 1 means the feed is not valid XML; empty output with exit code 0 means no item has that guid.

If `xmllint` is absent, set `FEED_URL` and `GUID` as above and use python3 instead (exits 1 when no item matches):

```bash
curl -sf "$FEED_URL" | python3 -c '
import sys, xml.etree.ElementTree as ET
guid = sys.argv[1]
for item in ET.parse(sys.stdin).getroot().iter("item"):
    if item.findtext("guid") == guid:
        print(item.find("enclosure").get("url")); sys.exit(0)
sys.exit(1)' "$GUID"
```

## Limitations and Edge Cases

- **Only the newest 200 episodes**: the lookup's `limit` defaults to 50 and caps at 200, so episodes older than the newest 200 cannot be resolved through this API. Tell the user when Step 3 finds no match.
- **No direct episode lookup**: iTunes API does not support `/lookup?id={track_id}` for individual episodes — it returns empty results.
- **Large RSS feeds**: Some podcasts have hundreds of episodes, so the RSS feed may be several MB. Pipe it straight into the parser rather than reading it into context.
