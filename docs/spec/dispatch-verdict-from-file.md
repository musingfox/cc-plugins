---
id: dispatch-verdict-from-file
status: accepted
scope:
  - "pi-dispatch/**"
  - "context-flow/scripts/**"
verify: null
related: [cross-plugin-runtime-resolution, judge-seats-cannot-edit]
source: null
adr: null
---
A dispatched worker's verdict is read from one agreed file, never extracted by
parsing a transcript or a session jsonl. The brief names the artifact and makes
the worker verify before claiming; the worker writes exactly one line:

    STATUS=DONE <check command + exit code>
    STATUS=BLOCKED <what is missing and what you need>

The caller routes on that line alone: `DONE` goes to independent review (the
caller re-runs the check — a mismatch with the worker's claim is itself a
high-signal finding), `BLOCKED` goes to replan, and file-absent plus a dead
process is a mechanical failure needing no judgement seat.

Reading the stream is legitimate for exactly one purpose: recovering the cause
(quota, auth, model) of a mechanical failure. It is never a source of task
completion semantics — `rc=0` proves the process did not crash, not that the
work is done.

This entry carries no executable verify. The prohibition is on where a verdict
comes from, and the legitimate stream reads make any repo-wide grep a false-
positive generator. It stays prose until a narrower assertion is found.
