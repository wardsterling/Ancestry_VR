# The Living Family Wall

Static web MVP with a family tree, grouped hive, and browser-local archive search.

## Public code / private data

The expanded archive is **not** part of this public repository. Supply `archive-data.json`
only to an owner-private deployment. Its absence produces a clear empty state, not
a broken application. Existing pilot content and previously published assets remain
unchanged; a code-only update does not remove them from Git history.

Never push `archive-data.json`, `archive-tree.json`, `dist/`, source reports, screenshots of family data,
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

## Tree, hive, and permanent links

The archive opens in **Family tree** view. Select a family report, bring a generation
forward, then focus a person's branch to see that person's recorded ancestors and
descendants. The foreground stays readable while adjacent generations recede in
perspective. Mouse movement adds subtle parallax; touch users have the same generation
and branch controls. Depth zero gives a flat view, and reduced-motion preferences
disable animation and parallax.

The **Hive** groups profiles by place name, display-name initial, or report and
generation. A person can belong to multiple place groups. Groups and large collections
expand incrementally. **Profile list** preserves the original search and sorting tools.

Generations are relative to each report's root, not estimates based on birth years.
`scripts/build_tree.py` reads layout-preserving `.txt` exports of the source reports
beside the original uploads and writes private `archive-tree.json`. It matches existing
profile IDs, uses explicit generation headings and child lists, and cites report pages.
It never rebuilds or changes the existing profiles. Missing, conflicting, and restricted
generation assignments remain unassigned. Existing same-name merges limit the accuracy
of this view; report-derived links still require family review.

Profiles, places, report selections, recorded years, tree focus, and search/filter state
have hash-based URLs. They survive refresh and support browser Back/Forward and opening
in another tab. Copy profile link creates a minimal stable-ID link; Copy view link
includes the current view, filters, report, generation, and depth. Links grant no access
to the private Site. Search text is held in the URL fragment and browser history;
there is no external query logging or localStorage query history.

Examples using synthetic identifiers only:

- `#archive` — default family tree
- `#archive?view=hive&group=place` — place hive
- `#archive?person=stable-id` — profile
- `#archive?report=source-id&generation=3&focus=stable-id` — focused family branch

The optional tree file has `memberships` containing `profileId`, `reportId`,
`generation`, `page`, and `title`, and `edges` containing `parentId`, `childId`,
`reportId`, and `page`. Both data files are private runtime inputs, never public code.

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

Queries are processed locally with no external search service or analytics. Persistent
view links place the current query in browser history. The service worker removes the older archive caches and only caches
the app shell; archive requests are network-only. Offline access to family records is
therefore intentionally unavailable.

The existing guide is a small deterministic pilot, not a general conversational AI.
Archive intake, wall-registration editing, and backup import are still previews.
Source labels point to the supplied reports and do not establish independent proof.

## Files

- `search-engine.js`: data-independent indexing, matching, suggestions, and filters
- `search-ui.js`: global combobox, archive results, and profile dialogs
- `archive.css`: responsive search styling
- `archive-model.js`: validated URLs, report generations, groups, and family relations
- `archive-explorer.js`, `archive-explorer.css`: family tree, parallax, and hive interface
- `app.js`, `index.html`, `styles.css`: existing app and pilot interface
- `tests/`: synthetic-only regression checks
- `scripts/build-static.mjs`: explicit static package preparation

Family collection material retains its existing rights. Confirm permission before
publishing additional records or media.
