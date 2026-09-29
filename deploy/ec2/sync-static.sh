#!/usr/bin/env bash
# 릴리스의 정적 파일(.next/static)을 Caddy 가 읽을 수 있는 곳에 복사하고 current 를 옮긴다.
#
# 사용: sync-static.sh <release_dir> <release_id> [static_root]
#
# 릴리스 폴더는 root:fixup-agent 0750 이라 Caddy 가 못 읽는다 — 옆에 앱 비밀값이 있어
# 넓히지 않는다. 그래서 **사본**을 둔다. 결과 경로는 <static_root>/<id>/_next/static/...
# 이라 Caddy 는 요청 경로를 그대로 붙여 찾는다(Caddyfile.template).
#
# 정적 폴더가 없는 릴리스(옛 꾸러미)는 아무것도 안 바꾸고 0 으로 끝난다. Caddy 는
# 파일이 없으면 Node 로 넘기므로 화면이 깨지지 않는다.
set -euo pipefail

release_dir=${1:?release_dir 가 필요합니다}
release_id=${2:?release_id 가 필요합니다}
static_root=${3:-/var/www/fixup-image-agent/static}

if [[ ! ${release_id} =~ ^[A-Za-z0-9._-]+$ || ${release_id} == .* ]]; then
  echo "잘못된 릴리스 id: ${release_id}" >&2
  exit 2
fi

source_dir=${release_dir}/apps/web/.next/static
if [[ ! -d ${source_dir} ]]; then
  echo "정적 파일이 없는 릴리스 — Caddy 가 Node 로 넘긴다: ${source_dir}"
  exit 0
fi

target_root=${static_root}/${release_id}
mkdir -p "${target_root}/_next/static"
cp -a "${source_dir}/." "${target_root}/_next/static/"

# root 로 돌 때만 소유를 맞춘다(시험은 일반 계정으로 돈다).
if [[ ${EUID} -eq 0 ]]; then
  chown -R root:"${STATIC_GROUP:-caddy}" "${target_root}"
fi
find "${target_root}" -type d -exec chmod 0750 {} +
find "${target_root}" -type f -exec chmod 0640 {} +

# 링크는 한 번에 바꾼다 — 바꾸는 중간에 Caddy 가 반쯤 된 링크를 보지 않게.
ln -sfn "${target_root}" "${static_root}/current.next"
mv -Tf "${static_root}/current.next" "${static_root}/current"
echo "정적 파일: ${target_root}"
