#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
mode=${1:-}
site=/etc/caddy/sites/fixup-image-agent.caddy
file=/etc/caddy/fixup-generation-maintenance.caddy
grep -Fq "import ${file}" "${site}" || { echo "Install the generation-aware Caddy site first." >&2; exit 1; }
case "${mode}" in
  on)
    cat > "${file}" <<'CADDY'
@generationMaintenance {
  method POST
  path /api/pdp/* /api/redesign/generate /api/redesign/edit-section /api/redesign/transcribe-strips /api/characters /api/characters/views /api/sns/projects/* /api/sns/layout/analyze /api/poster/projects/*
  not path /api/sns/projects/*/stop
}
respond @generationMaintenance `{"ok":false,"code":"maintenance","message":"Generation is temporarily paused."}` 503
CADDY
    # V1 status routes could submit more work. V2 status routes are read-only.
    protocol=$(node -e 'const f=require("fs");try{console.log(JSON.parse(f.readFileSync("/opt/fixup-image-agent/current/RELEASE_INFO.json","utf8")).generationProtocol||1)}catch{console.log(1)}')
    if [[ ${protocol} != 2 ]]; then
      cat >> "${file}" <<'CADDY'
@legacyGenerationStatus path /api/sns/projects/*/status /api/poster/projects/*/status /api/sns/projects/*/stop
respond @legacyGenerationStatus `{"ok":false,"code":"maintenance","message":"Generation is temporarily paused."}` 503
CADDY
    fi
    ;;
  off) : > "${file}" ;;
  *) echo "Use on or off." >&2; exit 1 ;;
esac
chmod 0644 "${file}"
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy.service
