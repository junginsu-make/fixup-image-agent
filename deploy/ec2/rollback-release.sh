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

release_root=/opt/detail-page-studio/releases/${release_id}
if [[ ! -f ${release_root}/apps/web/server.js ]]; then
  echo "Valid release not found: ${release_root}" >&2
  exit 1
fi

current_link=/opt/detail-page-studio/current
previous_release=""
if [[ -L ${current_link} ]]; then
  previous_release=$(readlink -f "${current_link}")
fi

ln -sfnT "${release_root}" /opt/detail-page-studio/current
systemctl restart detail-page-studio.service

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
    ln -sfnT "${previous_release}" "${current_link}"
    systemctl restart detail-page-studio.service
  else
    systemctl stop detail-page-studio.service
  fi
  exit 1
fi

echo "Rolled back to ${release_id}."
