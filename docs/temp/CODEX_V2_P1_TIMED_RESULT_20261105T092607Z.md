# P1 timed admin status comparison

2026-11-05T09:26:07.203Z

Protocol PASS on c5d21f1: exactly1login200 and1logout200, dashboard/no banner,0console errors/0page exceptions/0blockedrequests. First ML-status200/unavailable/bad_response at09:19:18.503UTC; second200/unavailable/bad_response received09:20:20.416UTC. Second dispatch occurred60004ms after the first reply. Operator confirms both backend category words. No evidence of ML recovery; root cause NOT VERIFIED. ML deployed SHA is still not supplied; absence of new Gunicorn boot/error lines is not absence-of-requests evidence.

Actual dashboard totals after P1: Resend7/Brevo0/combined7,limit25,remaining18; one received alert matches the login. No more login/email approved. Current source handler and validator shapes match on inspection; next approved offline task is an actual fresh-empty-owned SQLite Flask response passed to the real Node validator and fixed reason/status/field-name diagnostics. No model/validation relaxation or ML data change.

Original receipt is preserved at docs/temp/CODEX_Q1_SESSION_admin_1793870338924.json. Source/journal digests and exact samples are in docs/temp/CODEX_V2_P1_TIMED_RESULT_20261105T092607Z.json. Clinical E2E remains historical2/14.
