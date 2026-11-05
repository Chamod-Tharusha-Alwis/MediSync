# Integrated five-failure password lockout: source review gate

2026-11-05T14:20:44.862Z

INTEGRATED_OFFLINE_CANDIDATE_READY_FOR_OPERATOR_SOURCE_REVIEW_NOT_ACTIVE. Exact scope9files:3runtimefiles and6test/config companions. The shared application has not received this policy. Existing main source is fdbd40f, with3,211offlinePASS and bothCIgreen.

Four bad passwords return401; fifth and held attempts429. Hold lasts until15minutes from first failure; successful logins/checks never erase or extend that window. Server-resolved account/model identity keys share a budget across personal/organization aliases and generic/dedicated pharmacy login. The existing per-IP limits and OTP counters are preserved. Check before password comparison and again before session work. Store errors/malformed counters/2second deadline return fixed503without automatic retry. No collection/index/key/environment migration, account-flag change or revocation of existing sessions. No Redis operation on module import.

Candidate evidence:25guard/controller casesPASSunder network/env/child-process fence;214focusedPASS; exact-byte fullbackend2,498PASS/0FAIL/0SKIP,exit0,sourceFrozen/15pins; lifecycle40PASS/0FAIL,exit0. One private local preservation proof is excluded, as inCI; no baseline records, credentials or .envfiles copied. Successful actual-crypto session paths are exercised for allfive generic roles and the dedicated pharmacy route using inert repositories.

The detached clone was overlaid with original source bytes; its raw-byte differences are exactly the9reviewedpaths. Exact gitapplycheck0 and detachedreconstruction0. ActualRedis TTL/distribution/latencyremainNOTVERIFIED; counter adaptersareinert. Originalclient/MLcodeandall15pinsmatch; theircompletedbaselinechecks/buildarenotpresentedasnewcandidateexecutions. No live login,provider,AtlasorRedisoperation.

Review docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch. Portable committed envelope docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z_PATCH_DOCUMENT.json contains the exact diff as JSON data; itssha256matches the localpatch. Localpatchretains required unifieddiffcontextspacesandisnotstagedasnestedtext. Source/resultbindingsarein docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.json. This package supersedes the earlier three-runtime-file-only review by adding companiontestintegration. Earlier artifactsremainpreserved.

Activation approval is separate: apply these9paths, rerun the full original-workspaceofflinegate, then commit/push through the normal cycle only if green. That push would activate account lockouts through automatic deployment. No live login/email,Redisqualificationorclinicaltestispartofthatapproval. An already-in-flight authentication can complete if a lock arises after its finalcheck; no global session revocation is claimed.
