#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/deploy-release.sh <release.tar.gz> [release-id]" >&2
  exit 1
fi
exec 9>/run/fixup-image-agent-deploy.lock
flock -n 9 || { echo "Another deployment or rollback is running." >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "${script_dir}/generation-release.sh"

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
if [[ ! -s /etc/fixup-image-agent/app.env ]]; then
  echo "/etc/fixup-image-agent/app.env is missing or empty." >&2
  exit 1
fi
if tar -tzf "${archive}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Archive contains an unsafe path." >&2
  exit 1
fi

app_root=/opt/fixup-image-agent
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

install -d -o root -g fixup-agent -m 0750 "${release_root}"
tar -xzf "${archive}" -C "${release_root}"
if [[ ! -f ${release_root}/apps/web/server.js ]]; then
  echo "apps/web/server.js is missing from the release." >&2
  exit 1
fi
chown -R root:fixup-agent "${release_root}"
chmod -R o-rwx "${release_root}"
find "${release_root}" -type d -exec chmod 0750 {} +
find "${release_root}" -type f -exec chmod 0640 {} +
# Next's image optimizer writes only under its build directory's cache. Keep the
# release immutable to the service account except for that cache directory.
# The build directory is named after distDir, which is not always ".next" — a
# release built while a dev server holds ".next" carries another name.
for build_dir in "${release_root}/apps/web"/.next*; do
  [[ -d ${build_dir} ]] || continue
  install -d -o fixup-agent -g fixup-agent -m 0750 "${build_dir}/cache/images"
done

generation_prepare "${release_root}"
ln -sfnT "${release_root}" "${current_link}"
systemctl restart fixup-image-agent.service

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
    generation_restore_previous "${previous_release}" || true
  else
    systemctl stop fixup-image-agent.service
  fi
  exit 1
fi

if ! curl --fail --silent --show-error http://127.0.0.1:3000/api/health/ready >/dev/null; then
  echo "Readiness check failed. Rolling back." >&2
  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    generation_restore_previous "${previous_release}" || true
  else
    systemctl stop fixup-image-agent.service
  fi
  exit 1
fi

# 워커는 웹이 건강한 것을 본 뒤에 넘긴다.
#
# 웹이 먼저 도는 카나리아다. 나쁜 릴리스면 위에서 되돌리고 끝나므로 워커는
# 이전 코드로 계속 돈다. 그리고 심볼릭 링크만 바꾸면 이미 뜬 워커는 옛 파일을
# 붙들고 있으므로, 다시 시작하지 않으면 배포해도 옛 코드가 수집한다.
# 잠근(masked) 워커는 **건너뛴다.** 수집을 안 쓰기로 하고 일부러 잠근 서버가
# 있는데, 거기서 restart 를 걸면 배포할 때마다 빨간 실패 줄이 나온다. 무해한
# 실패가 늘 떠 있으면 나중에 진짜 실패도 「늘 뜨던 그거」로 넘어간다.
#
# `is-enabled` 는 잠겼으면 masked, 없으면 not-found 를 찍는다. 없는 것과
# 잠근 것은 다른 이야기이므로 따로 가른다.
if ! generation_start_current; then
  echo "Generation readiness failed. Restoring the previous web release with admission paused." >&2
  systemctl stop fixup-image-agent-generation-tick.timer
  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    generation_restore_previous "${previous_release}" || true
  fi
  exit 1
fi
generation_finish
worker_state="$(systemctl is-enabled fixup-image-agent-worker.service 2>/dev/null || true)"
if [[ ${worker_state} == masked* ]]; then
  echo "Worker is masked - skipping restart (수집을 쓰지 않는 서버)."
elif systemctl list-unit-files fixup-image-agent-worker.service >/dev/null 2>&1; then
  systemctl restart fixup-image-agent-worker.service || true
fi

echo "Release active: ${release_root}"
echo "Previous release retained: ${previous_release:-none}"
