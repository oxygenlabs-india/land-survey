# Product Roadmap — Land Intelligence Map

> **One line:** A single, parcel-centric map that tells you everything worth
> knowing about a piece of land in Tamil Nadu — starting with Chennai — assembled
> from records that are scattered across a dozen government silos, and given to
> citizens for free.

This document is the source of truth for **what we are building and in what
order**. If you are picking up development, read the "Current phase" marker below
and work only within that phase unless told otherwise.

---

## Current phase

| | |
|---|---|
| **Phase 0 — Foundation** | ✅ Done |
| **Phase 1 — Connectivity & Access** | 🟢 **In progress — this is where we focus now** |
| Phase 2 — Title & Legal | ⚪ Planned (deferred) |
| Phase 3 — Risk & Environment | ⚪ Planned (deferred) |
| Phase 4 — Intelligence Layer | ⚪ Planned (deferred) |

**Do not start Phase 2+ work yet.** Those layers are real value-adds, but they
carry heavier data-sourcing and privacy obligations and are deliberately held
back. Everything we ship now should serve Phase 1.

---

## The problem we solve

Land information is **fragmented**: the registration department knows who sold to
whom and for how much (the Encumbrance Certificate); the survey/revenue
department knows the actual plot, its shape and its extent; the planning
authority knows what you may build; and connectivity, risk and amenity data live
in yet more places. No ordinary buyer, lender, or investor can assemble this
themselves. **The consolidation is the value** — we sell clarity and trust in a
market defined by information asymmetry and fraud.

## Product principles

1. **Parcel-centric.** Everything keys to a parcel (`survey_number + sub_division
   + village`), with **ULPIN** as the canonical unifying ID.
2. **Layered.** Each dataset is an independent, toggleable map layer joined to the
   parcel — never a monolith.
3. **Free to citizens.** The public map stays free; value-added intelligence and
   B2B access is how it sustains itself (see [GO-TO-MARKET.md](GO-TO-MARKET.md)).
4. **Privacy by design.** Personal data (owner names, prices) is treated as
   sensitive from day one, not retrofitted.

---

## Phase 0 — Foundation ✅ (built)

The two hardest, highest-value layers already exist in this repo.

| Layer | Source | Status |
|---|---|---|
| **Parcel boundaries** — survey number, sub-division, ULPIN, full polygon geometry | TNGIS WFS (`cadastral_analysis:fmb_ulpin`) → `survey-numbers/` | ✅ |
| **Transaction history** — parties, dates, price, market value, nature, property schedules | Encumbrance Certificate, tnreginet → `ec-automation/` | ✅ |

This is the base single layer: *the plot, and its full sale/mortgage history.*

---

## Phase 1 — Connectivity & Access 🟢 (now)

Overlay the infrastructure that most drives land value and daily life. All open
data, universally useful, and highly shareable — the right wedge to build traffic
and trust.

**Layers to build:**
- **Chennai Metro** — operational lines + stations (Phase I / I-Extension) **and**
  under-construction / planned **Phase II** alignment and stations.
- **Local trains** — Suburban rail and MRTS lines & stations.
- **Roads** — Outer Ring Road (ORR), proposed **Peripheral Ring Road (PRR)**,
  national/state highways (GST Road, etc.), major arterial roads, and published
  **road-widening** proposals.
- **Bus network** (optional this phase) — major corridors and depots.

**Derived from the above (the actual feature users feel):**
- Distance to nearest metro / train station and major road, per parcel.
- A simple **connectivity score** per parcel.
- (Stretch) **Commute isochrones** — "15 / 30 / 45 min to key job hubs."

**Candidate sources:** TNGIS / open GIS layers, published CMRL alignment maps,
OpenStreetMap (roads + rail), government project notifications for planned lines.

**Definition of done for Phase 1:** a user can open the map, click any parcel, and
see its sale history *and* how well-connected it is (nearest metro/train/road +
score), with existing and upcoming transit shown as toggleable layers.

---

## Phase 2 — Title & Legal ⚪ (deferred)

The trust/fraud-prevention layer. High value, but heavier sourcing and strong
privacy obligations — hence deferred.

- Patta / Chitta, A-Register, FMB field sketch.
- **Encumbrance status** — clear vs mortgaged (derivable from our own EC data).
- **Poramboke / government land**, land classification (nanjai/punjai/natham/assigned).
- Litigation flags (e-Courts), land-acquisition notifications, power-of-attorney.

> ⚠️ This phase is personal-data heavy. See the privacy note in
> [GO-TO-MARKET.md](GO-TO-MARKET.md#legal--privacy) before building.

## Phase 3 — Risk & Environment ⚪ (deferred)

Good features to have, not immediate.

- Flood-prone / low-lying / waterlogging zones.
- **Water body / lake / tank boundaries** and encroachment buffers (overlap = major
  legal risk).
- CRZ and buffer zones.

## Phase 4 — Intelligence Layer ⚪ (deferred)

Where raw layers become a product. This is the eventual moat.

- **Title-clarity / risk score** per parcel.
- **Chain of title** — a clean ownership timeline from EC history.
- **Fair-value estimate** and price-trend heatmap (from our own transaction data).
- **One-click due-diligence report** and red-flag alerts.

---

## Additional value-add ideas (candidates, not scheduled)

Surfaced for discussion — most are cheap because they reuse data we already have:

1. **Upcoming-infrastructure layer** — announced / under-construction projects
   (Metro Ph II, PRR, new flyovers) with expected completion. Forward-looking
   appreciation signal; cheap to add, high perceived value.
2. **Price-trend heatmap & fair value** — turn our existing EC transactions into a
   per-area ₹/sqft trend. Near-free, highly shareable.
3. **Comparable sales** — "similar plots nearby sold for ₹X" straight from EC.
4. **Shareable parcel cards** — each survey number gets a clean WhatsApp/social
   snapshot → organic distribution.
5. **Watchlist / alerts** — follow a survey number, get notified on any new
   transaction or mortgage. Retention + a future premium hook.
6. **Neighborhood / livability snapshot** — proximity to schools, hospitals, parks,
   IT parks.
7. **RERA project overlay** — open data; adds legitimacy and project-level context.
8. **Guideline value vs market gap** — stamp-duty planning signal.
9. **Community corrections** — let locals flag data errors (quality + engagement).
10. **Developer/agent tools** — embeddable map widget + API (a B2B revenue path).

---

## How to read "which phase are we in"

The **Current phase** table at the top of this file is authoritative. Update it in
the same commit that moves work between phases, so the repo always reflects
reality. Keep each phase's layers independent so phases can ship without blocking
each other.
