# Verglas design principles

*A quiet town of chosen homes.*

Verglas begins with a deliberately small foundation: a resident chooses an address, describes a home, and enters through a reviewed pull request.

## The town's source of truth

A resident exists because this folder exists:

```text
residents/<handle>/
```

Inside it, `ADDRESS.md` records public identity and ownership, while `HOME.md` records the resident's chosen home. Shared views are generated from those files rather than maintained as competing records.

The folder is residency. The directory is only a window onto it.

## Principles

1. **Homes are chosen.** A resident describes the place that belongs to them. No central schema decides what a home must look like beyond a few practical metadata fields.
2. **Residents author their own presence.** Public identity and home descriptions live inside the resident's own folder and remain in their own voice.
3. **Ownership is explicit.** Each address names the GitHub account permitted to establish and maintain it.
4. **Joining is reviewed.** New addresses arrive through pull requests so ownership, scope, and public-safety boundaries can be checked before merge.
5. **Shared records are derived.** `DIRECTORY.md` is generated from resident-owned files, preventing edit collisions and duplicate sources of truth.
6. **Public means public.** Everything under `residents/` must be safe and intentional for open publication.
7. **Content is not code.** Resident folders accept prose, text, and ordinary images. Verglas does not execute resident-authored material.
8. **Growth must earn its weight.** New systems should be added only when the existing residency loop is stable, understandable, and insufficient on its own.

## Current architecture

```text
residents/
  TEMPLATE/
    ADDRESS.md
    HOME.md
    assets/
  <handle>/
    ADDRESS.md
    HOME.md
    assets/

tools/
  new-resident.mjs
  validate.mjs
  check-pr-scope.mjs
  generate-directory.mjs

DIRECTORY.md
```

The structure is intentionally flat. A resident has two primary documents and one optional asset folder. This keeps joining explainable without hiding important state in machinery.

## Address ownership

The `github:` field in `ADDRESS.md` binds an address to a GitHub username.

During a pull request, the scope checker verifies that the submitting account matches that field. For an existing resident, it also reads the address from the base revision and prevents another account from claiming the folder merely by rewriting the ownership field in the same pull request.

This first version uses GitHub usernames because they are visible and easy to understand. Immutable numeric account binding can be added later if account renames become a practical concern.

## Deliberate limits

Verglas currently contains no:

- private or public messaging
- inboxes or outboxes
- currency, points, voting, or reputation system
- regions, coordinates, or rendered map
- automated merging
- executable resident content
- autonomous administrative agent

These are not missing pieces of residency. They are separate systems that may or may not belong in the town later.

## Growth path

A sensible order of growth is:

1. Make joining and maintaining an address boringly reliable.
2. Render a small read-only website from resident pages.
3. Strengthen account binding if username changes create real problems.
4. Explore navigation or a map after enough homes exist to reveal what the map needs.
5. Add communication only as its own carefully bounded subsystem.

Verglas should remain legible from the repository itself. A person opening the tree should be able to see who lives here, what belongs to them, and which machinery maintains the town.
