# The Living Family Wall

Report Portrait Edition: the original teal report cards, wide family-wall photograph,
and source-portrait gallery, with a family tree, grouped hive, and browser-local search.

## Public code / private data

The expanded archive is **not** part of this public repository. Supply `archive-data.json`
only to an owner-private deployment. Its absence produces a clear empty state, not
a broken application. Existing pilot content and previously published assets remain
unchanged; a code-only update does not remove them from Git history.

Never push `archive-data.json`, `archive-tree.json`, `archive-private-details.json`,
`assets/report-portraits/`, `source-documents/`, `extraction-audit.json`, `rebuild-checks.json`, `dist/`, source reports, screenshots of family data,
deployment archives, credentials, or Python caches to public GitHub. The ignore rules
are a safeguard, not a substitute for reviewing staged files.

## Search

- Global search in the app header on every main view; Control/Command K focuses it.
- Autocomplete for people, places, years, and reports. Arrow keys select; Enter opens;
  Escape dismisses. Person suggestions focus the matching person in the existing tree.
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

The **Family connections** panel is a navigable tree of the selected person, recorded
parents, and recorded children. Every card has a thumbnail slot, name, **DoB**, **PoB**,
and **DoD**. Select a portrait/name to make that person the center, with their evidence
in a panel beside the tree. Profile selections no longer open a modal popup.
Up/Down on a name moves to a reported parent/child. Wide families
scroll horizontally, and every person/focus link supports reopening and browser history.
The generation and hive cards show the same photo and life-event fields.

Portraits come from the photographs printed beside named PDF entries. The media
extractor joins adjoining image strips, matches the nearby name to a cited source
identity, disambiguates printed record/child markers and birth years, and retains the
page, bounding box, and printed anchor in a private audit. It performs no face matching
and generates no faces. Ambiguous placements remain unassigned. Missing photos use
labeled initials. Explicit private `portrait.src` assignments and pilot assets remain supported.

The **Show living-person details** switch starts off on each page load. It reveals
available dates, places, and source portraits for living or status-unknown profiles
inside the owner-private Site. The same display projection feeds search, autocomplete,
tree, hive, list, gallery, and evidence panels. Switching off removes those details
and closes any original PDF currently displayed. Names and cited relationships remain
navigable. This switch is a display preference, not an access-control boundary.

Every report card and profile citation can open the **original PDF** at its cited page
inside the archive, with page controls, download, and a new-tab fallback for browsers
with limited embedded PDF support. Originals are unredacted, including when living
profile details are hidden. Original PDF bytes are checked against their source hashes.

`profile-presentation.js` uses rebuilt structured `birthDate`, `birthPlace`, and
`deathDate` strings. For older archives it conservatively reads the named subject's report excerpt. It
stops before spouse narratives, preserves approximate dates, and marks conflicts or
unknown values. The old inferred birth/death years and general place arrays are not
used as substitutes: they can contain relatives' events. A place is displayed as a
birthplace only when explicitly attached to the subject's birth. Truncated or ambiguous
excerpts can leave a field unrecorded even when another source could resolve it.

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
Cited connections remain navigable for profiles with restricted dates or photos,
including when reports assign conflicting generations. Tree cards, hive groups, and
inline profile panels use the same relationship model. Profile panels show every report's
connections with page citations.

Relationship labels distinguish explicit reported, biological, adoptive, and step
parentage from a child merely listed in a family group. Family-group membership does
not establish parentage. The interface preserves these distinctions rather than
silently converting every family listing into a biological parent–child link.

Profiles, places, report selections, recorded years, tree focus, and search/filter state
have hash-based URLs. They survive refresh and support browser Back/Forward and opening
in another tab. Copy profile link creates a minimal stable-ID link; Copy view link
includes the current view, filters, report, generation, and depth. Links grant no access
to the private Site. Search text is held in the URL fragment and browser history;
there is no external query logging or localStorage query history.
Old profile/focus links redirect to matched source identities. A previously merged
name with multiple candidates opens a chooser; the app does not guess which person
the old link meant. Unmatched legacy entries remain available with their facts withheld.

Examples using synthetic identifiers only:

- `#archive` — default family tree
- `#archive?view=hive&group=place` — place hive
- `#archive?person=stable-id` — profile
- `#archive?report=source-id&generation=3&focus=stable-id` — focused family branch
- `#archive?document=source-id&page=9` — original PDF at the cited page

The optional tree file has `memberships` containing `profileId`, `reportId`,
`generation`, `page`, and `title`, and `edges` containing `parentId`, `childId`,
`reportId`, `page`, `kind`, and `evidence`. Version 2 includes restricted profiles'
cited connections. Both files share a validated `snapshotId`; mismatched files cannot
be packaged or loaded together. Both are private runtime inputs, never public code.

## Rebuild and validate the private archive

`scripts/extract_reports.py` rebuilds profiles and relationships together from the
original PDFs with Poppler's `pdftotext -layout` and the Python standard library.
The older `build_archive.py` and `build_tree.py` commands call this same pipeline.

```sh
python3 scripts/extract_reports.py --source-dir /private/reports --output-dir /private/candidate --previous /private/current/archive-data.json --checks /private/rebuild-checks.json
python3 -m unittest discover -s tests -p 'test_*.py'
```

For source thumbnails, original-PDF links, and the living-details switch, add
`--include-private-details` to that rebuild, then run:

```sh
python3 scripts/build_source_media.py --source-dir /private/reports --archive-dir /private/candidate
```

Media extraction requires PyMuPDF. Promote the candidate's runtime JSON files,
`assets/report-portraits/`, and `source-documents/` together to the private Site checkout.
The public GitHub workflow rejects all of these private paths. The packager also rejects
private media left behind in a code-only build and mismatched living-details snapshots.

Review `extraction-audit.json` before promoting the candidate's two runtime JSON
files together. It records source hashes, entry coverage, citations, conflicts,
generation/age warnings, retained legacy entries, and optional private family checks.
Structural failures cannot overwrite the live archive. A staged failed candidate
must not be published. The static packager also rejects a failed or mismatched snapshot.

Numbered child references bind report identities. Other merges require corroborating
full birth dates, explicit parent pairs plus birth information, or the same named
partner of an already resolved person. Name alone never merges people. Unknown or
approximate facts remain unknown or approximate; spouse and child narratives cannot
supply another person's life events. Same-name identities without enough evidence
remain separate and are flagged for review.

Private checks use a `checks` array with `label`, `subject`, `direction` (`parents` or
`children`), `expected` names, and optional `reportId` and `kind`. These source-reviewed
fixtures are never public test data. Public tests contain synthetic families only.
Passing automated checks verifies extraction structure and specified source claims;
it does not prove that the compiled reports themselves are historically correct.

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

These are schema placeholders, not example family records. Living-status inference,
same-name identity decisions, and source inconsistencies still require curator review.

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
- `search-ui.js`: global combobox, archive results, inline profiles, gallery, and PDF controls
- `archive-privacy.js`: reversible living-details display projection
- `source-viewer.js`: constrained original-PDF URLs and page bounds
- `report-edition.css`: restored report-portrait visual design
- `scripts/build_source_media.py`: source-image extraction and private document packaging
- `archive.css`: responsive search styling
- `archive-model.js`: validated URLs, report generations, groups, and family relations
- `archive-explorer.js`, `archive-explorer.css`: family tree, parallax, and hive interface
- `app.js`, `index.html`, `styles.css`: existing app and pilot interface
- `tests/`: synthetic-only regression checks
- `scripts/build-static.mjs`: explicit static package preparation

Family collection material retains its existing rights. Confirm permission before
publishing additional records or media.
