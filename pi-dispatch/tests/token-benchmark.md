# pi-dispatch Token Benchmark — Inline vs Dispatch

**What this measures:** the cost paid by **Claude's main thread** (the orchestrating
context) for one representative work brief, done two ways:

- **Inline (in-thread / main):** Claude reads the source material into its own context
  and produces the result itself. Main pays for *all* of the input material plus the
  generated output.
- **Dispatch:** Claude writes a short brief pointer, hands it to the `pi-dispatcher`
  sub-agent (haiku), which runs the brief on a cheap/fast Pi model in the background,
  polls with `pi-poll.sh`, and returns **only a path + a ≤3-sentence distillation**.
  Main never reads the source material or Pi's full output — that work is borne by the
  sub-agent and Pi, **off main's context**. That is the entire point and the reason
  main's cost collapses.

The quantity of interest is the **Claude-side (main-thread) token delta**, NOT Pi's
`usage.totalTokens`. Pi's own usage is recorded only as a clearly-labelled side-note —
it is inflated by Pi's system prompt, tool schemas, and agentic re-sends across turns,
so it is **not** a faithful stand-in for what the inline path would cost main.

## Representative brief

> Review these three shell scripts in this repo (`pi-dispatch.sh`, `pi-poll.sh`,
> `pi-stop.sh`). Produce exactly 5 bullets naming the most important correctness
> risks. Output only the 5 bullets.

This is a heavy-reading brief: the value of dispatch shows up precisely when the source
material is large relative to the answer. Run with real Pi
(`google` / `gemini-2.5-flash-lite`), one-shot, terminal state `stop`, `pi-poll.sh`
returned `STATUS=OK`.

## Measurement method

No public per-call token meter is exposed for Claude's main thread, so we report an
**honest character-count proxy** (label: estimate, ~4 chars/token rule of thumb). The
proxy is the size of the bytes that *land in main's context* on each path:

- **Inline:** the full source material main must read in + the answer it must generate.
- **Dispatch:** the short brief main writes + the distilled summary main reads back
  (the poll lines and the full material read are charged to the sub-agent/Pi, not main).

## Results

| Field | Inline (main) | Dispatch (main) |
|---|---|---|
| Source material read into main's context | 17,027 chars (~4.3K tok) | 0 (read by Pi) |
| Brief main writes | — | 245 chars (~60 tok) |
| Answer generated/held by main | 1,185 chars (~300 tok) | — |
| Distilled summary main reads back | — | ~250 chars (~60 tok) |
| Poll loop lines on main | — | ~3 lines (charged to sub-agent) |
| **Main-thread total (proxy)** | **~18,200 chars (~4.6K tok)** | **~500 chars (~120 tok)** |
| **Estimated main-thread saving** | — | **~97%** |

**Estimate, not an exact meter.** The proxy is faithful to the architecture: inline
forces the entire 17 KB of material through main's window; dispatch pushes that read
onto Pi and the haiku sub-agent, leaving main only a pointer in and a distillation out.

### Side-note — Pi-side cost (informational only)

The dispatched run's own Pi usage (NOT comparable to the inline main figure above):

| input | output | totalTokens | cost (USD) |
|---|---|---|---|
| 25,177 | 2,836 | 28,013 | $0.0037 |

Pi's input dwarfs the raw 17 KB because it bundles Pi's system prompt and tool
schemas — which is exactly why `usage.totalTokens` must not be used as the inline
comparison anchor. Pi runs on a cheap/fast model, so this cost is paid in fractions of
a cent on the offloaded side, not in Claude main-thread tokens.
