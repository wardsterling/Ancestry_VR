# The Living Family Wall — MVP

An executable, privacy-first prototype for exploring a physical family picture wall and conversing with an evidence-grounded family-history guide.

## What the MVP demonstrates

- Explore the Ward Family picture wall using family-confirmed hotspots.
- Open Howard Pearson Kennedy’s pilot profile with report-derived facts.
- Ask a local, deterministic guide common questions without invented answers.
- Open the report page behind substantive biographical claims.
- Browse a minimal archive and source-readiness workflow.
- Preview curator controls for identity assignments and privacy.
- Export a portable JSON backup and validate an imported backup.
- Use a live device camera preview when the browser grants permission.
- Install and revisit the progressive web app offline after its first load.

The MVP does **not** perform facial recognition, impersonate an ancestor, call a generative-AI service, upload family data, or connect to Ancestry/FamilySearch. Those require a reviewed backend, permissions, and current provider agreements.

## Run locally

No build step or dependencies are required.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Camera permission generally requires `localhost` or HTTPS.

## Evidence boundaries

Pilot data comes from *Descendants of Minger Brimage*, a RootsMagic report dated April 7, 2008, page 9. This compiled report is treated as a source, not automatic proof. Primary records and the report’s underlying citations should be added during the next archive phase.

The wall-position assignment for Howard is a demonstrative pilot marker and must be confirmed by the family before it is treated as authoritative.

## Suggested production architecture

1. Object storage for immutable originals and linked derivatives.
2. PostgreSQL plus a relationship model for people, sources, events, places, wall positions, permissions, and claims.
3. Search and retrieval that filters by access before sending approved excerpts to an AI model.
4. Structured answers with claim-level citations and explicit uncertainty.
5. Passwordless family accounts, roles, audit logs, backups, and full export.
6. Optional AR image anchors after manual registration; no unrestricted face identification.

## Repository layout

- `index.html` — accessible single-page interface
- `styles.css` — responsive visual system
- `data.js` — small reviewed pilot dataset and bounded answers
- `app.js` — navigation, conversation, camera preview, evidence, import/export
- `assets/` — family wall, source page, and source-derived portraits
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Privacy

This version is fully static. It sends no archive or conversation content to a server. Curator changes are demonstrative; exported JSON is the portable backup mechanism.

## Rights

Family photographs and report reproductions remain part of the Ward family collection. Confirm rights and privacy before broad public distribution.
