#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/install-host.sh <도메인 또는 http://IP> [redirect_from]" >&2
  exit 1
fi

# 개인 배포(detail-page-studio)가 있는 서버에서는 돌리지 않는다.
#
# 두 서비스가 같은 3000 포트를 쓰고, 이 스크립트는 caddy 설정과 systemd 를
# 건드린다. 이름을 다 바꿔 뒀어도 같은 호스트에 두면 서로를 밀어낸다.
if [[ -e /etc/systemd/system/detail-page-studio.service || -d /opt/detail-page-studio ]]; then
  echo "이 서버에는 detail-page-studio 가 이미 있습니다. 다른 인스턴스에서 실행하세요." >&2
  exit 1
fi

# 사이트 주소와(있으면) 리다이렉트를 보낼 주소를 받는다.
#
# 도메인이면 Caddy 가 인증서를 받아 HTTPS 로 연다. IP 면 받을 수 없다 —
# 공개 인증 기관은 IP 에 인증서를 내주지 않는다. 그때는 평문 HTTP 로 열도록
# **호출하는 쪽에서** `http://` 를 붙여 준다. 안 붙이면 Caddy 가 인증서를
# 받으려다 실패하고 사이트가 아예 안 뜬다.
#
# redirect_from 은(주면) 그 주소에서 site_address 의 HTTPS 로 308 리다이렉트
# 하는 블록을 더한다 — 운영 IP 를 운영 도메인으로 넘길 때 쓴다. 주소 모양
# 검사는 render-caddy-site.sh 가 한다.
site_address=${1:-}
redirect_from=${2:-}
if [[ -z ${site_address} ]]; then
  echo "사용법: sudo bash deploy/ec2/install-host.sh <도메인 또는 http://IP> [redirect_from]" >&2
  exit 1
fi

for command_name in node caddy; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} must be installed first." >&2
    exit 1
  fi
done

node_major=$(node --version | sed -E 's/^v([0-9]+).*/\1/')
if [[ ! ${node_major} =~ ^[0-9]+$ || ${node_major} -lt 22 ]]; then
  echo "Node.js 22 or newer is required. Found: $(node --version)" >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

site_file=/etc/caddy/sites/fixup-image-agent.caddy
site_backup=/etc/caddy/sites/fixup-image-agent.caddy.bak

# 이 주소로 시작하는 사이트 블록이 다른 *.caddy 파일에 이미 있으면 멈춘다
# (예: 운영에서 도메인을 손으로 연결하며 만든 formwith.caddy). 모르고
# 덮어쓰면 두 파일에 같은 주소가 생겨 `caddy validate` 가 실패하거나, 먼저
# 있던 사이트(IP→도메인 리다이렉트 같은)를 지우고 나서야 실패해 깨진 채로
# 남는다.
#
# **이 검사와 주소 검사(render-caddy-site.sh)는 useradd/install 등 시스템에
# 무엇이든 건드리기 전에 돈다** — 그래야 "아무것도 안 바꾸고 종료" 가 참이
# 된다(2026-09-29 독립 리뷰).
host=${site_address#http://}
host=${host#https://}
site_pattern=$(printf '%s' "${site_address}" | sed 's/\./\\./g')
host_pattern=$(printf '%s' "${host}" | sed 's/\./\\./g')

for other in /etc/caddy/sites/*.caddy; do
  [[ -e ${other} ]] || continue
  [[ ${other} == "${site_file}" ]] && continue
  if grep -Eq "^${site_pattern}[[:space:]]*\{" "${other}" || grep -Eq "^https?://${host_pattern}" "${other}"; then
    echo "${other} 에 이미 ${site_address} 로 시작하는 사이트 블록이 있습니다. docs/DEPLOY.md 「서버 설정 바꾸기」의 처음 한 번 절차를 보세요." >&2
    exit 1
  fi
done

# 사이트 파일 내용을 임시 파일에 먼저 만든다. site_address/redirect_from 이
# 잘못됐으면(render-caddy-site.sh 가 종료 2) 여기서 멈추고 시스템은 아직 안
# 건드린 채로 끝난다. 형제 스크립트라 `bash` 로 불러야 한다 — CI 가 만드는
# 꾸러미(tar)는 실행 권한을 안 지키므로(저장소가 core.filemode=false),
# 직접 실행하면 "Permission denied" 로 멈춘다(2026-09-29 독립 리뷰).
new_site=$(mktemp /tmp/fixup-image-agent-caddy-site.XXXXXX)
trap 'rm -f "${new_site}"' EXIT
bash "${script_dir}/render-caddy-site.sh" "${site_address}" "${redirect_from}" > "${new_site}"
caddy fmt --overwrite "${new_site}"

# Caddyfile 의 import 줄도 실제 사이트 파일을 쓰기 전에 갖춰 둔다 — 이 단계가
# (드물게) 실패해도 아직 사이트 파일은 안 바뀐 상태로 끝나게 한다.
touch /etc/caddy/Caddyfile
if ! grep -Fqx 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/sites/*.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy fmt --overwrite /etc/caddy/Caddyfile

if ! id fixup-agent >/dev/null 2>&1; then
  useradd --system --home-dir /opt/fixup-image-agent --shell /usr/sbin/nologin fixup-agent
fi

install -d -o root -g fixup-agent -m 0750 /opt/fixup-image-agent
install -d -o root -g fixup-agent -m 0750 /opt/fixup-image-agent/releases
install -d -o root -g fixup-agent -m 0750 /etc/fixup-image-agent
install -m 0644 "${script_dir}/fixup-image-agent.service" /etc/systemd/system/fixup-image-agent.service
install -m 0644 "${script_dir}/fixup-image-agent-worker.service" /etc/systemd/system/fixup-image-agent-worker.service
install -d -o root -g root -m 0755 /usr/local/lib/fixup-image-agent
install -o root -g root -m 0755 "${script_dir}/monitor.sh" /usr/local/lib/fixup-image-agent/monitor.sh
install -o root -g root -m 0644 "${script_dir}/fixup-image-agent-monitor.service" /etc/systemd/system/
install -o root -g root -m 0644 "${script_dir}/fixup-image-agent-monitor.timer" /etc/systemd/system/
install -m 0640 -o root -g fixup-agent "${script_dir}/app.env.example" /etc/fixup-image-agent/app.env.example

install -d -o root -g root -m 0755 /etc/caddy/sites
install -d -o caddy -g caddy -m 0750 /var/log/caddy
install -d -o root -g caddy -m 0750 /var/www/fixup-image-agent /var/www/fixup-image-agent/static

had_site_file=0
[[ -e ${site_file} ]] && had_site_file=1
[[ ${had_site_file} -eq 1 ]] && cp "${site_file}" "${site_backup}"

# mktemp 는 0600(root 전용)으로 만든다. 그냥 cp 하면 그 권한을 그대로 물려받아
# caddy 계정이 못 읽는 파일이 되어 검사가 늘 실패한다(2026-09-29 독립 리뷰,
# 새 서버에서 재현). 명시적으로 0644 root:root 로 쓴다.
install -m 0644 -o root -g root "${new_site}" "${site_file}"

# 검사를 root 로 돌리면 접근 기록 파일을 root 소유로 만들어, 정작 Caddy 가
# 못 열고 뜨지 않는다(2026-09-28 시험 서버에서 겪음). Caddy 가 도는 계정으로
# 검사한다. 실패하면 방금 바꾼 사이트 파일을 되돌린다 — 깨진 설정을 디스크에
# 남기지 않는다.
if ! runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  if [[ ${had_site_file} -eq 1 ]]; then
    cp "${site_backup}" "${site_file}"
  else
    rm -f "${site_file}"
  fi
  echo "Caddy 설정 검사에 실패해 옛 설정으로 되돌렸습니다: ${site_file}" >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable fixup-image-agent.service
systemctl enable fixup-image-agent-worker.service
systemctl enable --now fixup-image-agent-monitor.timer
systemctl reload caddy.service 2>/dev/null || systemctl restart caddy.service

echo "Host files installed for ${site_address}."
echo "Next: create /etc/fixup-image-agent/app.env, then deploy a release."
