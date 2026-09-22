# The Living Family Wall

Static web MVP with a global, browser-local family archive search.

## Public code / private data

The expanded archive is **not** part of this public repository. Supply `archive-data.json`
only to an owner-private deployment. Its absence produces a clear empty state, not
a broken application. Existing pilot content and previously published assets remain
unchanged; a code-only update does not remove them from Git history.

Never push `archive-data.json`, `dist/`, source reports, screenshots of family data,
deployment archives, credentials, or Python caches to public GitHub. The ignore rules
are a safeguard, not a substitute for reviewing staged files.

## Search

- Global search in the app header on every main view; Control/Command K focuses it.
- Autocomplete for people, places, years, and reports. Arrow keys select; Enter opens;
  Escape dismisses. Person suggestions open the matching archive profile.
- Names in any word order, recorded aliases/nicknames, accent-insensitive matching,
  and optional one-edit spelling tolerance. Approximate results are labeled.
- Quoted phrases for exact contiguous words; numeric years never fuzzy-match.
- Combined name, place, report, profile-status, and inclusive year-range filters.
- State abbreviations and full state names match places.
- Sorting by relevance, name, earliest reported birth, or source-location count.
- Removable filter chips, clear/reset, incremental result loading, and retry states.

Dates currently mean **recorded years**, not day-level dates or inferred lifespans.
The search indexes profile names/aliases, allowed places/years, and source titles;
it does not index arbitrary raw report narratives. Search does not verify genealogy,
perform identity matching, infer new relationships, or correct extraction errors.

## Run and test

No browser runtime dependencies or paid services are required.

```sh
python3 -m http.server 8080
node --test tests/*.test.js
```

Open `http://localhost:8080`. Camera preview needs HTTPS or localhost and user permission.
To package the static files, run `node scripts/build-static.mjs`. The script copies the
locally supplied archive only if present, so never publish a private `dist/` publicly.
The GitHub Pages workflow tests the code and rejects a tracked private dataset.

## Private archive format

```json
{
  "profiles": [{
    "id": "stable-id",
    "name": "Display name",
    "aliases": [],
    "birthYear": null,
    "deathYear": null,
    "years": [],
    "places": [],
    "facts": [],
    "restricted": true,
    "sources": [{"reportId": "source-id", "title": "Report title", "page": 1}]
  }]
}
```

These are schema placeholders, not example family records. `scripts/build_archive.py`
is the existing PDF extraction utility (requires pdfplumber). It is a draft extraction
pipeline, not a completeness guarantee: same-name merges, page attribution, birth/death
attribution, living-status inference, and narratives require curator review.

## Security and limitations

The private Sites deployment's owner-only access protects the collection. The static
app's `restricted` field hides a profile's details from search and display; it is not
server-side person-level authorization. All allowed Site viewers can retrieve its data
file. Other profiles' imported narratives may mention living relatives. Keep the full
collection owner-private until it has been reviewed or a server-side policy is added.

Queries are processed locally with no external search service, analytics, or stored
search history. The service worker removes the older archive caches and only caches
the app shell; archive requests are network-only. Offline access to family records is
therefore intentionally unavailable.

The existing guide is a small deterministic pilot, not a general conversational AI.
Archive intake, wall-registration editing, and backup import are still previews.
Source labels point to the supplied reports and do not establish independent proof.

## Files

- `search-engine.js`: data-independent indexing, matching, suggestions, and filters
- `search-ui.js`: global combobox, archive results, and profile dialogs
- `archive.css`: responsive search styling
- `app.js`, `index.html`, `styles.css`: existing app and pilot interface
- `tests/`: synthetic-only regression checks
- `scripts/build-static.mjs`: explicit static package preparation

Family collection material retains its existing rights. Confirm permission before
publishing additional records or media.
