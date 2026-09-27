# QuBe Sync docs

The public documentation at [docs.qubesync.com](https://docs.qubesync.com), built with
[Mintlify](https://mintlify.com). A push to `main` deploys it.

## Preview

```bash
npm i -g mint
mint dev              # http://localhost:3000
mint broken-links     # run before every push
```

## What's here

- The guides are the `.mdx` pages at the root. Navigation, redirects and site settings live in `docs.json`.
- The API Reference tab is generated from `api-reference/v2/openapi.json` and `api-reference/v1/openapi.json`.
  **Never edit those by hand.** They're exported from the app (the `qube` repo), which serves the same
  documents at `/api/v2/openapi.json` and `/api/v1/openapi.json`:

  ```bash
  # from the qube repo, with this repo checked out beside it
  docker compose run --rm --no-deps -v "$PWD/../qube_docs:/qube_docs" qube mix openapi.export
  docker compose run --rm --no-deps -v "$PWD/../qube_docs:/qube_docs" qube mix openapi.export --check
  ```

- The app links to pages here (`grep -rn docs.qubesync.com lib priv` in the qube repo). If you rename or
  move a page, update those links or add a redirect in `docs.json`.

## Writing

- Guides describe the v2 API only. v1 appears only in its generated reference.
- The guides double as the product's sales pitch: lead with what the reader gets, then show exactly how.
- Prefer a Mermaid diagram (a fenced ` ```mermaid ` block) to a screenshot. Diagrams don't go stale when the
  dashboard changes.
- Examples use the simulator's seeded company (Riverbend Electric, Hillcrest Dental, Consulting, Widget...),
  so readers can reproduce them against a simulated connection.
