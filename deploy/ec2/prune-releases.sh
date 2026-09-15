#!/usr/bin/env bash
#
# 오래된 릴리스를 지운다. **최근 N 개와 지금 돌고 있는 것만 남긴다.**
#
# 왜 필요한가 — `deploy-release.sh` 는 릴리스를 쌓기만 하고 지우지 않았다.
# 2026-09-15 운영 서버에 96 개 15G 가 쌓였고, 디스크 29G 중 2.8G 만 남았다.
# 배포 한 번이 225MB(릴리스 163M + /tmp 꾸러미 62M)를 먹으므로 열두 번이면
# 찬다. 차면 배포가 중간에 엎어지고, 그때는 서비스가 뜬 채로 손으로 치워야
# 한다.
#
# **지금 돌고 있는 릴리스는 셈에서 빼고 무조건 남긴다.** 옛 릴리스로 되돌려
# 둔 서버에서 배포하면 `current` 가 목록 아래쪽에 있다. 그걸 지우면 돌고 있는
# 서비스가 제 파일을 잃는다.
#
#   sudo bash deploy/ec2/prune-releases.sh [남길개수] [app_root]
#
# 기본값은 5 개, /opt/fixup-image-agent 다. 되돌리기(`rollback-release.sh`)가
# 갈 수 있는 범위가 남긴 개수로 줄어든다 — 개수를 줄일 때는 그걸 감수하는지
# 먼저 정한다.
set -euo pipefail

keep=${1:-5}
app_root=${2:-/opt/fixup-image-agent}

# 0 을 받으면 전부 지운다는 뜻이 된다. 그런 뜻으로 부를 일이 없다.
if [[ ! ${keep} =~ ^[0-9]+$ ]] || (( keep < 1 )); then
  echo "남길 개수는 1 이상이어야 합니다: ${keep}" >&2
  exit 1
fi

releases_root=${app_root}/releases
if [[ ! -d ${releases_root} ]]; then
  # 갓 설치한 서버다. 여기서 실패하면 배포 전체가 멎는다.
  echo "릴리스 폴더가 없습니다: ${releases_root}"
  exit 0
fi

current=""
if [[ -L ${app_root}/current ]]; then
  current=$(readlink -f "${app_root}/current" || true)
fi

# 최신순. 이름이 아니라 **시각**으로 센다 — 릴리스 id 형식이 바뀌어도 맞는다.
ordered=()
while IFS= read -r line; do
  ordered+=("${line}")
done < <(
  find "${releases_root}" -mindepth 1 -maxdepth 1 -type d -printf '%T@\t%p\n' \
    | sort -rn | cut -f2-
)

# 남길 것을 먼저 고른다 — 최근 N 개, 그리고 돌고 있는 것.
declare -A keeping=()
for dir in "${ordered[@]:0:${keep}}"; do
  keeping[${dir}]=1
done
if [[ -n ${current} && -d ${current} ]]; then
  keeping[${current}]=1
fi

removed=()
for dir in "${ordered[@]}"; do
  [[ -n ${keeping[${dir}]:-} ]] && continue
  removed+=("${dir}")
done

if (( ${#removed[@]} == 0 )); then
  echo "지울 릴리스가 없습니다 (전체 ${#ordered[@]} 개, 남길 ${keep} 개)."
  exit 0
fi

# **무엇을 지웠는지 이름을 남긴다.** 안 적으면 나중에 "왜 없지" 를 풀 길이 없다.
for dir in "${removed[@]}"; do
  echo "릴리스를 지웁니다: ${dir}"
  rm -rf -- "${dir}"
done

echo "릴리스 정리 완료: ${#removed[@]} 개를 지우고 $(( ${#ordered[@]} - ${#removed[@]} )) 개를 남겼습니다."
