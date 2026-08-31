#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/deploy-release.sh <release.tar.gz> [release-id]" >&2
  exit 1
fi

archive=${1:-}
release_id=${2:-$(date -u +%Y%m%dT%H%M%SZ)}
if [[ -z ${archive} || ! -f ${archive} ]]; then
  echo "Release archive not found: ${archive}" >&2
  exit 1
fi
if [[ ! ${release_id} =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "release-id may contain only letters, numbers, dot, underscore, and dash." >&2
  exit 1
fi
if [[ ! -s /etc/detail-page-studio/app.env ]]; then
  echo "/etc/detail-page-studio/app.env is missing or empty." >&2
  exit 1
fi
if tar -tzf "${archive}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Archive contains an unsafe path." >&2
  exit 1
fi

app_root=/opt/detail-page-studio
release_root=${app_root}/releases/${release_id}
current_link=${app_root}/current
if [[ -e ${release_root} ]]; then
  echo "Release already exists: ${release_root}" >&2
  exit 1
fi

previous_release=""
if [[ -L ${current_link} ]]; then
  previous_release=$(readlink -f "${current_link}")
fi

install -d -o root -g detail-page -m 0750 "${release_root}"
tar -xzf "${archive}" -C "${release_root}"
if [[ ! -f ${release_root}/apps/web/server.js ]]; then
  echo "apps/web/server.js is missing from the release." >&2
  exit 1
fi
chown -R root:detail-page "${release_root}"
chmod -R o-rwx "${release_root}"
find "${release_root}" -type d -exec chmod 0750 {} +
find "${release_root}" -type f -exec chmod 0640 {} +
# Next's image optimizer writes only under .next/cache. Keep the release
# immutable to the service account except for that cache directory.
install -d -o detail-page -g detail-page -m 0750 \
  "${release_root}/apps/web/.next/cache/images"

ln -sfnT "${release_root}" "${current_link}"
systemctl restart detail-page-studio.service

healthy=false
for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ ${healthy} != true ]]; then
  echo "Liveness check failed. Rolling back." >&2
  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    ln -sfnT "${previous_release}" "${current_link}"
    systemctl restart detail-page-studio.service
  else
    systemctl stop detail-page-studio.service
  fi
  exit 1
fi

if ! curl --fail --silent --show-error http://127.0.0.1:3000/api/health/ready >/dev/null; then
  echo "Readiness check failed. Rolling back." >&2
  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    ln -sfnT "${previous_release}" "${current_link}"
    systemctl restart detail-page-studio.service
  else
    systemctl stop detail-page-studio.service
  fi
  exit 1
fi

echo "Release active: ${release_root}"
echo "Previous release retained: ${previous_release:-none}"
