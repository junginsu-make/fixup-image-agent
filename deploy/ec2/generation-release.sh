#!/usr/bin/env bash
# Shared only by the generation-aware deployment and rollback scripts.
generation_ops_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
generation_pause_file=""

generation_compatible() {
  node -e 'const f=require("fs");try{const m=JSON.parse(f.readFileSync(process.argv[1],"utf8"));process.exit(m.generationProtocol===2&&Number.isInteger(m.generationSchemaVersion)&&m.generationSchemaMin===m.generationSchemaVersion&&Number.isInteger(m.generationSchemaMax)&&m.generationSchemaMax>=m.generationSchemaMin?0:1)}catch{process.exit(1)}' "$1/RELEASE_INFO.json"
}

generation_prepare() {
  local target=$1 unit state
  generation_compatible "${target}" || { echo "Release has no compatible generation executor." >&2; return 1; }
  for unit in fixup-image-agent-generation-tick.service fixup-image-agent-generation-tick.timer; do
    state=$(systemctl is-enabled "${unit}" 2>/dev/null || true)
    [[ ${state} != masked* ]] || { echo "${unit} is masked. Preserving the operator setting." >&2; return 1; }
  done
  bash "${generation_ops_dir}/generation-maintenance.sh" on
  generation_pause_file=$(mktemp /run/fixup-generation-deploy.XXXXXX)
  trap '[[ -z ${generation_pause_file:-} ]] || rm -f -- "${generation_pause_file}"' EXIT
  node "${generation_ops_dir}/configure-generation.mjs" --pause "${target}/RELEASE_INFO.json" "${generation_pause_file}"
  install -m 0644 "${generation_ops_dir}/fixup-image-agent-generation-tick.service" /etc/systemd/system/fixup-image-agent-generation-tick.service
  install -m 0644 "${generation_ops_dir}/fixup-image-agent-generation-tick.timer" /etc/systemd/system/fixup-image-agent-generation-tick.timer
  systemctl daemon-reload
  systemctl stop fixup-image-agent-generation-tick.timer
  # Allow the current bounded oneshot to finish before restarting its web runtime.
  for _ in $(seq 1 100); do
    if ! systemctl is-active --quiet fixup-image-agent-generation-tick.service; then
      node "${generation_ops_dir}/configure-generation.mjs" --drain "${target}/RELEASE_INFO.json" "${generation_pause_file}"
      return $?
    fi
    sleep 2
  done
  echo "Generation tick has not stopped. Admission remains paused." >&2
  return 1
}

generation_start_current() {
  local ready=false
  for _ in $(seq 1 20); do
    if curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null; then ready=true; break; fi
    sleep 2
  done
  [[ ${ready} == true ]] || return 1
  systemctl reset-failed fixup-image-agent-generation-tick.service 2>/dev/null || true
  systemctl start fixup-image-agent-generation-tick.service || return 1
  systemctl enable --now fixup-image-agent-generation-tick.timer || return 1
  systemd-run --quiet --wait --pipe --collect \
    --unit="fixup-generation-check-$$" \
    --property=User=fixup-agent --property=Group=fixup-agent \
    --property=EnvironmentFile=/etc/fixup-image-agent/app.env \
    --property=WorkingDirectory=/opt/fixup-image-agent/current \
    /usr/bin/node /opt/fixup-image-agent/current/ops/generation-tick.mjs --check
}

generation_finish() {
  node "${generation_ops_dir}/configure-generation.mjs" --resume /opt/fixup-image-agent/current/RELEASE_INFO.json "${generation_pause_file}" || return 1
  bash "${generation_ops_dir}/generation-maintenance.sh" off || return 1
}

generation_restore_previous() {
  local previous=$1
  if generation_compatible "${previous}"; then
    ln -sfnT "${previous}" /opt/fixup-image-agent/current
    systemctl restart fixup-image-agent.service || return 1
    generation_start_current && generation_finish
  else
    echo "Refusing to restore an incompatible V1 application. Current release and paused admission are retained; deploy a compatible V2 release." >&2
    return 1
  fi
}
