# Documentation Task Plan

## Objective
- Create delivery-ready documentation for the current `ttangbu` project by Tuesday, March 17, 2026.
- Outputs: requirements specification, development storyboard (screen design document), database design.

## Checklist
- [x] Inspect project structure and existing documentation
- [x] Explore frontend and backend implementation in parallel
- [x] Consolidate product, screen, and data requirements
- [x] Create deliverable folder in project root
- [x] Write requirements specification
- [x] Write storyboard / screen design document
- [x] Write database design document
- [x] Verify document consistency against code and existing docs
- [x] Add review notes and delivery summary

## Review
- Deliverables created under `deliverables-2026-03-17/`.
- Verified against current frontend routes/components, backend routes/migrations, and existing `docs/*.md`.
- Validation completed:
- `npm test` passed (frontend 3 tests, backend 5 tests).
- `npm run build` passed (frontend and backend).

---

# Listings Search Redesign Plan

## Requirements Summary
- Rework the listings search experience into a map-first Korean real-estate layout with stronger search controls and a tighter list/detail rail.
- Keep backend filters unchanged, but improve the location search UX for region-style queries such as `서울시 강남` and `서산시 동문동`.
- Make point markers the primary selection model using `center_lat` / `center_lng`, while keeping parcel polygons as subtle context.
- Track map bounds so the visible listing rail only shows listings currently inside the map view.
- Keep marker, rail, and detail selection synchronized and preserve accessible focus/empty/loading states.

## Implementation Plan
- [ ] Update `frontend/src/pages/ListingsPage.tsx` to support the new map-first search header, search helper copy, and map-panel data flow.
- [ ] Refactor `frontend/src/components/ListingsMapPanel.tsx` to render point markers, compute map-visible listings, synchronize selection, and keep parcel overlays subtle.
- [ ] Extend `frontend/src/lib/leaflet.ts` if needed for marker, popup, bounds, and map event typings.
- [ ] Refresh `frontend/src/index.css` for the restrained green/navy real-estate-search styling, denser cards, stronger controls, and focus-visible states.
- [ ] Run LSP diagnostics on changed files and fix any TypeScript issues that surface.

## Risks
- Leaflet typings are currently polygon-focused, so marker and bounds helpers may need careful expansion without weakening types.
- Visible-list synchronization must avoid selection flicker when bounds or fetched listings change.
