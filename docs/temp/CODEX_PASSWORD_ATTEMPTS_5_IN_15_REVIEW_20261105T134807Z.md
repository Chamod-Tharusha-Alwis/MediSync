# Password-attempt policy: inactive review candidate

2026-11-05T13:48:07.597Z

Selected5failedpasswords/15minutes. Four failures return401; fifth and held attempts return429. The original window starts on the first failure and is neither extended nor cleared by successful logins/checks. Server-resolved model/account ID keys make generic and dedicated pharmacy entry points share an allowance; IP/login aliases do not select the key. Recheck after password match before session work. Existing IP and OTP limits stay unchanged; no migration, account flag, password or session-revocation change.

Existing Redis helpers retain production store admission and atomic first-failure TTLs. Import performs no Redis operation; missing store, bad counter or2second deadline yields fixed503, no retry and no session write. No new key/env requirement. Correctly admitted sign-ins retain existing session/token/cookie behavior.

25candidate offlinePASS/0FAIL,exit0: actual controller/crypto positives for allfive generic roles plus dedicated pharmacy; cross-entrypoint quota, rotated fixture IPs, window expiry, account/model separation, store error/timeout, malformed counters, no clear-after-success and a fifth failure during password comparison. Inert repositories/store only: no live Redis/Atlas/provider call. Actual Redis TTL/distribution/latency remainsNOTVERIFIED. A valid in-flight authentication can complete if a lock begins after its final check; existing sessions are not revoked. Deliberate account blocking by an attacker who knows an identifier remains the selected lockout tradeoff.

Exact patch check0 and detached scratch reconstruction0 with matching proposed bytes. Earlier new-file CRLF mismatch was normalized in the candidate and retested; historical patch remains preserved and is superseded. Shared source has NOT received this policy. Review docs/temp/CODEX_PASSWORD_ATTEMPTS_5_IN_15_REVIEW_20261105T134807Z.patch and docs/temp/CODEX_PASSWORD_ATTEMPTS_5_IN_15_REVIEW_20261105T134807Z.json before authorizing application/activation.
