#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2/install-host.sh <domain>" >&2
  exit 1
fi

domain=${1:-}
if [[ ! ${domain} =~ ^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$ ]]; then
  echo "A hostname such as studio.example.com is required." >&2
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

if ! id detail-page >/dev/null 2>&1; then
  useradd --system --home-dir /opt/detail-page-studio --shell /usr/sbin/nologin detail-page
fi

install -d -o root -g detail-page -m 0750 /opt/detail-page-studio
install -d -o root -g detail-page -m 0750 /opt/detail-page-studio/releases
install -d -o root -g detail-page -m 0750 /etc/detail-page-studio
install -m 0644 "${script_dir}/detail-page-studio.service" /etc/systemd/system/detail-page-studio.service
install -m 0644 "${script_dir}/fixup-image-agent-worker.service" /etc/systemd/system/fixup-image-agent-worker.service
install -m 0640 -o root -g detail-page "${script_dir}/app.env.example" /etc/detail-page-studio/app.env.example

install -d -o root -g root -m 0755 /etc/caddy/sites
install -d -o caddy -g caddy -m 0750 /var/log/caddy
sed "s/{{DOMAIN}}/${domain}/g" "${script_dir}/Caddyfile.template" > /etc/caddy/sites/detail-page-studio.caddy
caddy fmt --overwrite /etc/caddy/sites/detail-page-studio.caddy

touch /etc/caddy/Caddyfile
if ! grep -Fqx 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/sites/*.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

systemctl daemon-reload
systemctl enable detail-page-studio.service
systemctl enable fixup-image-agent-worker.service
systemctl reload caddy.service 2>/dev/null || systemctl restart caddy.service

echo "Host files installed for ${domain}."
echo "Next: create /etc/detail-page-studio/app.env, deploy a release, then point Gabia DNS to the Elastic IP."
