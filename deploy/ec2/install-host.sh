#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/install-host.sh <HTTPS 도메인>" >&2
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

# 상용화 설계의 canonical 도메인과 HTTPS를 사용한다.
# IP 인증서 지원 여부를 추측해 HTTP로 자동 후퇴하지 않는다.
site=${1:-}
if [[ ${site} =~ ^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$ ]]; then
  site_address=${site}
else
  echo "상용 설치에는 검증할 HTTPS 도메인(studio.example.com)이 필요합니다." >&2
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

for unit in fixup-image-agent-generation-tick.service fixup-image-agent-generation-tick.timer; do
  unit_state=$(systemctl is-enabled "${unit}" 2>/dev/null || true)
  [[ ${unit_state} != masked* ]] || { echo "${unit} is masked; preserving the operator setting." >&2; exit 1; }
done

if ! id fixup-agent >/dev/null 2>&1; then
  useradd --system --home-dir /opt/fixup-image-agent --shell /usr/sbin/nologin fixup-agent
fi

install -d -o root -g fixup-agent -m 0750 /opt/fixup-image-agent
install -d -o root -g fixup-agent -m 0750 /opt/fixup-image-agent/releases
install -d -o root -g fixup-agent -m 0750 /etc/fixup-image-agent
install -m 0644 "${script_dir}/fixup-image-agent.service" /etc/systemd/system/fixup-image-agent.service
worker_state="$(systemctl is-enabled fixup-image-agent-worker.service 2>/dev/null || true)"
if [[ ${worker_state} != masked* ]]; then
  install -m 0644 "${script_dir}/fixup-image-agent-worker.service" /etc/systemd/system/fixup-image-agent-worker.service
fi
install -m 0644 "${script_dir}/fixup-image-agent-generation-tick.service" /etc/systemd/system/fixup-image-agent-generation-tick.service
install -m 0644 "${script_dir}/fixup-image-agent-generation-tick.timer" /etc/systemd/system/fixup-image-agent-generation-tick.timer
install -m 0640 -o root -g fixup-agent "${script_dir}/app.env.example" /etc/fixup-image-agent/app.env.example

install -d -o root -g root -m 0755 /etc/caddy/sites
install -d -o caddy -g caddy -m 0750 /var/log/caddy
touch /etc/caddy/fixup-generation-maintenance.caddy
chmod 0644 /etc/caddy/fixup-generation-maintenance.caddy
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
if [[ ${worker_state} != masked* ]]; then systemctl enable fixup-image-agent-worker.service; fi
systemctl enable fixup-image-agent-generation-tick.timer
systemctl reload caddy.service 2>/dev/null || systemctl restart caddy.service

echo "Host files installed for ${site_address}."
echo "Next: create /etc/fixup-image-agent/app.env, then deploy a release."
