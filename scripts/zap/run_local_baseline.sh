#!/usr/bin/env bash
# Local ZAP baseline (passive) scans of the stack started by scripts/zap/local_scan_stack.cjs. Usage: run_local_baseline.sh <before|after>
set -u
stage="${1:?before or after}"
out="docs/evidence/viva/zap/$stage"
mkdir -p "$out"
cp scripts/zap/api_hook.py "$out/api_hook.py"
wrk="$(pwd -W 2>/dev/null || pwd)/$out"
scan() { # name, target, extra args
  local name="$1" target="$2"; shift 2
  {
    date '+START %F %T %z'
    echo "COMMAND: docker run --rm -v \"\$PWD/$out:/zap/wrk\" -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t $target -r zap_$name.html -J zap_$name.json -w zap_$name.md $*"
    MSYS_NO_PATHCONV=1 docker run --rm -v "$wrk:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t "$target" -r "zap_$name.html" -J "zap_$name.json" -w "zap_$name.md" "$@" 2>&1
    echo "EXIT=$? (zap-baseline: 0 pass, 1 fail, 2 warnings, 3 error)"
    date '+END %F %T %z'
  } | tee "$out/zap_${name}_console.txt"
}
scan client http://host.docker.internal:3300
scan api http://host.docker.internal:5300 --hook=/zap/wrk/api_hook.py
scan ml http://host.docker.internal:5399/health
rm -f "$out/api_hook.py"
