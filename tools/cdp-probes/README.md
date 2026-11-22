# CDP probe scripts (historical)

One-off Chrome DevTools Protocol scripts used during the October 2026 memory and
render investigation that produced `docs/mem-audit.md` and
`docs/adr/0009-rendering-budget.md`.

They are kept for provenance, not as tooling. Each one hardcodes a DevTools page
GUID and a debugging port from the session it was written for, so none of them run
as-is. Launch Chrome with `--remote-debugging-port=9222`, take a page id from
`http://localhost:9222/json`, and substitute it if you want to re-run one.

Live verification lives in the test suite (`npm test`) and in `npm run preview`
plus Chrome's own memory tooling.
