# The Living Family Wall

Report Portrait Edition: the original teal report cards, wide family-wall photograph,
and source-portrait gallery, with a family tree, grouped hive, and browser-local search.

## Public code / private data

The expanded archive is **not** part of this public repository. Supply `archive-data.json`
only to an owner-private deployment. Its absence produces a clear empty state, not
a broken application. Existing pilot content and previously published assets remain
unchanged; a code-only update does not remove them from Git history.

Never push `archive-data.json`, `archive-tree.json`, `archive-private-details.json`,
`assets/report-portraits/`, `source-documents/`, `source-pages/`, `wall-catalog.json`, `source-people.json`, `extraction-audit.json`, `rebuild-checks.json`, `dist/`, source reports, screenshots of family data,
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

Every report card and profile citation opens a readable **page preview** inside the
archive. Previous/Next, direct page entry, page zoom and extracted text work without a
PDF viewer. The original unmodified PDF remains available for opening or downloading.
Page previews and originals are unredacted, including when living profile details are
hidden. Original PDF bytes are checked against their source hashes.

## Explore wall and photograph research

The wall supports button/range zoom, touch pinch, drag to pan, keyboard navigation,
and a fit-to-wall reset. Select a picture boundary or use the accessible picture list.
Private `wall-catalog.json` defines normalized image regions, never facial identities.
A curator can add or adjust boxes with two corner taps and numeric coordinates.
No face recognition, face embeddings, biometric matching, or appearance-based identity
inference is used.

The visible three-step guide follows **Choose a photo → Choose a source person → Save connection**.
It highlights your current step and offers **Review saved connection** after saving.
From **Awaiting identification**, choose **Connect to source person**. Open the
photograph's report or another report, then tap a highlighted printed name or select
from **People in this source**. Search the current page or the whole report; each
result links to the existing tree and retains its exact citation. Same-name records
remain separate choices. Add an optional comment about how you know the person, then **Save proposed connection**.
If you already know the connection, leave the comment blank; the person and exact
report/page are still saved, with no claim that a caption or other explanation was supplied.
The private notebook saves the person and report/page citation together; review the
proposal there before explicitly confirming it. Group photographs can connect to
more than one person. Retry preserves drafts without duplicating the same connection.
Living-person connections require the global details switch to be on.

Written-name highlights come from PDF text coordinates, matched only to profiles
already cited on that page. They are not face detection or identity evidence by
themselves. The cited-person list works even if a printed name cannot be highlighted.
Private `source-people.json` is bound to the archive snapshot and original PDF hashes;
rebuild it whenever source documents or profile extraction changes.

Each photograph has a durable private research notebook:

- Find candidates by written name, recorded place/year, or family report. A candidate
  is always proposed, never automatically confirmed. Source portraits support manual review.
- Choose a person from the existing family tree, or record a possible name not in the
  archive. Group photographs can have multiple linked people and competing proposals.
- Attach report/page citations, external record URLs, caption transcriptions, and
  attributed family recollections. While browsing any report page, use **Cite for selected
  photograph** to prepare its exact citation.
- Select supporting evidence before confirming an identity. Removing cited evidence or
  changing the support selection reopens confirmation. Rejected proposals remain documented.
- Save to the authenticated curator's D1 notebook; optimistic revisions reject stale
  overwrites. Save failures retain the draft. Export backups or restore a backup as drafts
  for review before saving. Unsaved drafts are only held in the current page.
- Copy a saved picture's permanent `#wall?photo=stable-id` link. Site access is required.

Known living-person notebook details follow the global switch. Original wall images,
source pages, and unclassified research may contain living people; the switch remains
only a presentation preference within the private Site.

**Portraits from your reports** sorts by display name, surname, source, parent/family
group, report-relative generation, or birth date. Source and text filters combine.
Family groups use the existing cited relationship model and do not establish parentage.
A person can appear in multiple groups. **Awaiting identification** separates unconfirmed
wall and report photographs. On a report page, **Mark unidentified portrait** registers a
crop for research without assigning a name. Boxes may need adjustment for tilted frames,
collages, and group photographs; the original image is always preserved.

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
- `#archive?document=source-id&page=9` — source page preview at the cited page

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
python3 scripts/render_source_pages.py --root /private/candidate
python3 scripts/build_source_people.py --root /private/candidate
```

Media extraction requires PyMuPDF. Promote the candidate's runtime JSON files,
`assets/report-portraits/`, `source-documents/`, `source-pages/`, and `source-people.json` together to the private Site checkout.
The public GitHub workflow rejects all of these private paths. The packager also rejects
private media left behind in a code-only build and mismatched living-details snapshots.

Review `extraction-audit.json` before promoting the candidate's two runtime JSON
files together. It records source hashes, entry coverage, citations, conflicts,
generation/age warnings, retained legacy entries, and optional private family checks.
Structural failures cannot overwrite the live archive. A staged failed candidate
must not be published. The static packager also rejects a failed or mismatched snapshot.

Numbered child references bind report identities. Other merges require corroborating
full birth dates, explicit parent pairs plus birth information, or the same named
partner of an already resolved person. Undated duplicate children can merge when
the same two explicit parent identities and printed child ordinal agree, with no
conflicting recorded vitals or ancestry cycle. This resolution repeats through newly
connected families and partners. Placeholder names and unmatched same-name records
remain separate. Each additional merge retains its supporting citations in the
private extraction audit. Old profile URLs, family edges, source memberships, and
saved photo-notebook references follow the unique canonical identity. Ambiguous
redirects still require review. Name alone never merges people. Unknown or
approximate facts remain unknown or approximate; spouse and child narratives cannot
supply another person's life events. Same-name identities without enough evidence
remain separate and are flagged for review.

Private checks use a `checks` array with `label`, `subject`, `direction` (`parents` or
`children`), `expected` names, and optional `reportId` and `kind`. These source-reviewed
fixtures are never public test data. Public tests contain synthetic families only.
Passing automated checks verifies extraction structure and specified source claims;
it does not prove that the compiled reports themselves are historically correct.

## Run and test

The browser UI has no runtime package dependencies. The private Site adds a small
Cloudflare Worker and D1 for durable photograph research. A simple static server or
GitHub Pages serves the code-only UI but cannot save notebook records.

```sh
python3 -m http.server 8080
node --test tests/*.test.js
```

Open `http://localhost:8080`. Camera preview needs HTTPS or localhost and user permission.
To package the static files, run `node scripts/build-static.mjs`. The script copies the
locally supplied archive only if present, so never publish a private `dist/` publicly.
The **Validate code-only MVP** workflow tests and builds every push to `main`, and
rejects tracked private datasets. The full archive is published privately on Sites;
normal code updates do not attempt to create or publish a GitHub Pages site.

GitHub Pages is an optional code-only demo. To use it, a repository administrator must
first enable **Settings → Pages → Build and deployment → GitHub Actions**. Then choose
**Actions → Validate code-only MVP → Run workflow**, select `main`, and explicitly
check `deploy_pages`. Leaving that option unchecked runs validation only. An explicitly
requested Pages deployment still fails visibly if Pages setup or publishing fails.

For private Sites, retain its registered project ID, remove `static` from
`.openai/hosting.json`, and set `"d1": "DB"`. Run `npm ci`, `npm run db:generate` only
when the schema changes, then `node scripts/build-site.mjs`. The output separates
`dist/client` assets from `dist/server/index.js`. Generated Drizzle migrations live in
`drizzle/` and are applied by Sites before Worker publication. Never rewrite an applied
migration. The private archive and rendered pages must be supplied locally before building.

Photo writes require the platform's authenticated user header, a same-origin JSON
request, bounded data, valid archive references, and an expected revision. Each curator
can read and write only their own notebook records. The Site remains owner-private;
there is no public write endpoint or browser-storage substitute.

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
Archive intake remains a preview. Photograph registration, notebook saving, and backup
restoration are implemented. Camera mode remains a camera preview and does not recognize faces.
Source labels point to the supplied reports and do not establish independent proof.

## Files

- `search-engine.js`: data-independent indexing, matching, suggestions, and filters
- `search-ui.js`: global combobox, archive results, inline profiles, sorted gallery, and source-page controls
- `photo-workspace.js`, `photo-workspace.css`: wall gestures, photo notebook, and unidentified gallery
- `photo-research.js`: geometry, source/identity validation, and portrait grouping
- `worker/index.mjs`, `db/schema.ts`, `drizzle/`: durable authenticated photo records
- `scripts/render_source_pages.py`: full-report page previews and extracted text
- `scripts/build_source_people.py`: source-cited printed-name coordinates
- `scripts/build-site.mjs`: private Worker and asset build
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
