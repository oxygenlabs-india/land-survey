# Go-To-Market — How We Sell This Idea

Companion to [ROADMAP.md](ROADMAP.md). This is the story and the business logic:
why this matters, who pays, and how a free citizen product sustains itself.

---

## Positioning (the one-liner)

> **The single map that tells you the whole truth about a piece of land — free.**

Not "another property portal." Property portals sell *listings* (what's for sale).
We sell **ground truth about the land itself** — its history, its plot, its
connectivity, and eventually its legal cleanliness — whether or not it's for sale.
That is a different, more trusted, and more defensible position.

## Why now (tailwinds)

- **ULPIN rollout** — the government is assigning a unique ID to every parcel
  nationally. Standardization on ULPIN is exactly the join key our product needs;
  we ride the wave instead of fighting fragmentation.
- **Digitization of land records** — registration and survey data are increasingly
  online and machine-readable (this repo already extracts two of them).
- **Real-estate fraud & disputes** are endemic — double-selling, encroachment,
  disputed title. Trust is scarce and valuable.
- **Chennai infrastructure boom** — Metro Phase II, Peripheral Ring Road, and
  corridor expansion are actively reshaping land value, so connectivity data is
  timely and in demand.

## Who it's for (users & jobs-to-be-done)

| User | Job to be done | Willingness to pay |
|---|---|---|
| **Home / plot buyers** | "Is this land clean, and is it well-located?" | Medium (per-report) |
| **Real-estate agents / brokers** | Pull credible data fast, look professional | Medium (subscription) |
| **Banks / NBFCs** | Verify collateral before a property loan | **High (B2B)** |
| **Property lawyers** | Title search, chain of ownership | Medium–High |
| **Developers** | Land aggregation, feasibility, connectivity | High (B2B) |
| **Urban planners / researchers** | Aggregate spatial + transaction analysis | Institutional |

## The free-to-paid wedge

1. **Free public map** (Phases 0–1) builds three assets: **traffic**, **trust**, and
   **SEO** — every parcel becomes an indexable landing page that ranks for
   "survey number / area + land details."
2. **Monetize on top of that traffic:**
   - **Premium due-diligence reports** (B2C, per report) — the ₹500–2,000 a buyer
     happily pays before a ₹50-lakh decision.
   - **Subscriptions** for agents and lawyers (unlimited lookups, saved searches,
     watchlists).
   - **B2B API & data licensing** — banks for collateral checks, developers for
     land intelligence. This is where the large cheques are.
   - **Qualified lead-gen** to verified brokers / lawyers (referral, not spam).

Free is the acquisition engine; intelligence and B2B access is the revenue.

## Distribution

- **SEO at parcel scale** — thousands of parcel pages = a long-tail search moat.
- **Shareable parcel cards** — clean WhatsApp/social snapshots drive organic reach
  in a country where property is discussed on WhatsApp.
- **Partnerships** — brokers and lawyers who embed or cite the map.
- **Content** — area guides ("Where Metro Phase II moves land value").

## The moat

Anyone can copy one layer. The defensibility compounds from:
- **Entity resolution** — correctly matching messy records (reused survey numbers,
  sub-divisions, Tamil/English spellings) to one parcel. Hard to do well; hard to
  copy once done.
- **Accumulated + cleaned data** and the **traffic/SEO** flywheel.
- **Trust** — being the neutral, free, citizen-first source.

---

## The pitch (for a partner, co-founder, or investor)

1. **Problem** — Land data is scattered and untrustworthy; buyers, lenders, and
   lawyers each re-do the same painful assembly, and fraud thrives in the gaps.
2. **Solution** — A parcel-centric single source of truth: plot + full transaction
   history + connectivity today; title, risk, and a due-diligence score next.
   Free to citizens.
3. **Why now** — ULPIN standardization + record digitization + an infra boom
   remaking Chennai land value.
4. **Moat** — Entity resolution, accumulated clean data, and an SEO/traffic
   flywheel; trust as the neutral free source.
5. **Business model** — Free map for reach; revenue from premium reports,
   subscriptions, and B2B API/data licensing (banks, developers).
6. **Traction to show** — parcels covered, layers live, monthly users, parcel-page
   search impressions, B2B pilot interest.
7. **The ask** — (fill in: capital / data partnerships / a technical co-founder).

---

## Legal & privacy

This is the one thing that can sink the business if ignored — treat it as a
first-class product constraint, not an afterthought.

- The **Encumbrance Certificate layer contains personal data** — names of
  buyers/sellers and transaction prices. It is public record, but **bulk
  aggregation and commercial republishing** of personal + financial data is a very
  different legal risk from an individual looking up one record.
- Under **India's DPDP Act 2023** and the source portals' terms of use, plan to:
  - Show transaction *prices and history* openly, but **gate or mask personal
    names** behind a legitimate-purpose flow (e.g. only inside a parcel's own
    due-diligence report).
  - Get a **lawyer's opinion on bulk scraping + resale before launch**, not after.
- Bake privacy-by-design into the data model and access controls from Phase 1, so
  Phase 2 (title/legal, the most personal-data-heavy phase) can build safely.
