#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/rollback-release.sh <release-id>" >&2
  exit 1
fi
exec 9>/run/fixup-image-agent-deploy.lock
flock -n 9 || { echo "Another deployment or rollback is running." >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "${script_dir}/generation-release.sh"

release_id=${1:-}
if [[ ! ${release_id} =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "A valid release-id is required." >&2
  exit 1
fi

release_root=/opt/fixup-image-agent/releases/${release_id}
if [[ ! -f ${release_root}/apps/web/server.js ]]; then
  echo "Valid release not found: ${release_root}" >&2
  exit 1
fi

current_link=/opt/fixup-image-agent/current
previous_release=""
if [[ -L ${current_link} ]]; then
  previous_release=$(readlink -f "${current_link}")
fi

generation_prepare "${release_root}"
ln -sfnT "${release_root}" /opt/fixup-image-agent/current
systemctl restart fixup-image-agent.service

healthy=false
for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ ${healthy} != true ]] \
  || ! curl --fail --silent --show-error http://127.0.0.1:3000/api/health/ready >/dev/null; then
  echo "Rollback target did not become ready. Restoring the previous release." >&2
  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    generation_restore_previous "${previous_release}" || true
  else
    systemctl stop fixup-image-agent.service
  fi
  exit 1
fi

if ! generation_start_current; then
  echo "Rollback generation executor is not ready. Restoring the previous release." >&2
  systemctl stop fixup-image-agent-generation-tick.timer
  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    generation_restore_previous "${previous_release}" || true
  fi
  exit 1
fi
generation_finish
# 웹이 옛 릴리스로 건강하게 돌아온 뒤에 워커도 같은 릴리스로 넘긴다.
# 다시 시작하지 않으면 웹만 되돌아가고 수집은 되돌린 코드로 계속 돈다.
worker_state="$(systemctl is-enabled fixup-image-agent-worker.service 2>/dev/null || true)"
if [[ ${worker_state} == masked* ]]; then
  echo "Worker is masked - preserving the operator setting."
elif systemctl list-unit-files fixup-image-agent-worker.service >/dev/null 2>&1; then
  systemctl restart fixup-image-agent-worker.service || true
fi

echo "Rolled back to ${release_id}."
