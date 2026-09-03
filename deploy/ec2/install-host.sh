#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/install-host.sh <도메인 또는 IP>" >&2
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

# 도메인 또는 IP 를 받는다.
#
# 도메인이면 Caddy 가 인증서를 받아 HTTPS 로 연다. IP 면 받을 수 없다 —
# 공개 인증 기관은 IP 에 인증서를 내주지 않는다. 그때는 평문 HTTP 로 연다.
# 그러라고 `http://` 를 붙여 준다. 안 붙이면 Caddy 가 인증서를 받으려다
# 실패하고 사이트가 아예 안 뜬다.
site=${1:-}
if [[ ${site} =~ ^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$ ]]; then
  site_address=${site}
elif [[ ${site} =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  site_address="http://${site}"
  echo "IP 로 엽니다: ${site_address} — 인증서 없이 평문 HTTP 입니다." >&2
else
  echo "도메인(studio.example.com) 또는 IP(54.180.68.212) 가 필요합니다." >&2
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

if ! id fixup-agent >/dev/null 2>&1; then
  useradd --system --home-dir /opt/fixup-image-agent --shell /usr/sbin/nologin fixup-agent
fi

install -d -o root -g fixup-agent -m 0750 /opt/fixup-image-agent
install -d -o root -g fixup-agent -m 0750 /opt/fixup-image-agent/releases
install -d -o root -g fixup-agent -m 0750 /etc/fixup-image-agent
install -m 0644 "${script_dir}/fixup-image-agent.service" /etc/systemd/system/fixup-image-agent.service
install -m 0644 "${script_dir}/fixup-image-agent-worker.service" /etc/systemd/system/fixup-image-agent-worker.service
install -m 0640 -o root -g fixup-agent "${script_dir}/app.env.example" /etc/fixup-image-agent/app.env.example

install -d -o root -g root -m 0755 /etc/caddy/sites
install -d -o caddy -g caddy -m 0750 /var/log/caddy
sed "s|{{SITE}}|${site_address}|g" "${script_dir}/Caddyfile.template" > /etc/caddy/sites/fixup-image-agent.caddy
caddy fmt --overwrite /etc/caddy/sites/fixup-image-agent.caddy

touch /etc/caddy/Caddyfile
if ! grep -Fqx 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/sites/*.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

systemctl daemon-reload
systemctl enable fixup-image-agent.service
systemctl enable fixup-image-agent-worker.service
systemctl reload caddy.service 2>/dev/null || systemctl restart caddy.service

echo "Host files installed for ${site_address}."
echo "Next: create /etc/fixup-image-agent/app.env, then deploy a release."
