# ADR 0001: Match on named zones with a one-hop adjacency list, not on distances

**Status:** Accepted
**Date:** 2026-09-14

## Context

Students commute from five or six towns along two highways. The obvious design is to
store home addresses, geocode them and match drivers to riders within some distance of
the route. That needs a geocoding service, a map, and a privacy conversation about
storing home addresses in a JSON file on a shared laptop. The coordinator already thinks
in towns ("the Sandy crowd", "anyone from Hood River") and drivers describe their detours
the same way.

## Decision

We will identify every pick-up location by a zone id from a fixed list in
`data/zones.json`, and record which zones a driver will detour through as `viaZones`.
A rider is reachable (R2) when their zone is the offer's `fromZone`, one of its
`viaZones`, or one adjacency hop from one of those, with the adjacency list kept in the
same file and required to be symmetric. Reach is graded exact / via / adjacent and is
the first ranking key (R6).

## Alternatives considered

- **Geocoded addresses and a distance threshold** -- needs a network service and a
  routing model to be any good (straight-line distance across the Columbia is useless),
  and stores home addresses we would rather not hold.
- **Free-text town names** -- what the spreadsheet did before. Typos ("Troutdale" vs
  "troutdale" vs "Trout Dale") made every report unreliable.
- **Two-hop adjacency** -- would reach almost every zone from almost every other zone
  in a graph this small, which makes the exact / via / adjacent distinction meaningless.

## Consequences

Matching is explainable: the coordinator can say "Boring is next to Estacada" and point
at the file. Adding a town is a one-line data change. The cost is that distances within
a zone are invisible (a rider at the far edge of Gresham is "exact" for a driver at the
near edge), and the adjacency list is hand-maintained opinion rather than geography.
The rule is also easy to get subtly wrong in code; `reachable()` in `zones.ts` is the
only place that implements it and should stay that way.
