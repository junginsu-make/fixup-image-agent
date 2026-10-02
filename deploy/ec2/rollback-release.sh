#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/rollback-release.sh <release-id>" >&2
  exit 1
fi

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
static_link=/var/www/fixup-image-agent/static/current
previous_static=""
if [[ -L ${static_link} ]]; then previous_static=$(readlink -f "${static_link}"); fi
ops_dir=$(dirname "$0")
source "${ops_dir}/release-recovery.sh"

# BEGIN RELEASE SWITCH
restart_attempted=false
trap 'release_failed $?' ERR
bash "$(dirname "$0")/sync-static.sh" "${release_root}" "${release_id}"

ln -sfnT "${release_root}" "${current_link}"
restart_attempted=true
systemctl restart fixup-image-agent.service

if ! release_health; then release_failed 1; fi
trap - ERR
# END RELEASE SWITCH

# 웹이 옛 릴리스로 건강하게 돌아온 뒤에 워커도 같은 릴리스로 넘긴다.
# 다시 시작하지 않으면 웹만 되돌아가고 수집은 되돌린 코드로 계속 돈다.
if systemctl list-unit-files fixup-image-agent-worker.service >/dev/null 2>&1; then
  systemctl restart fixup-image-agent-worker.service || true
fi

echo "Rolled back to ${release_id}."
