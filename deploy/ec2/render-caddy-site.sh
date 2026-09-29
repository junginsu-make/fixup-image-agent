#!/usr/bin/env bash
set -euo pipefail

# Caddy 사이트 파일 내용을 표준출력으로 낸다. install-host.sh 가 이 출력을
# /etc/caddy/sites/fixup-image-agent.caddy 에 쓴다. 여기서 표준출력만 내는 건
# 시험하기 위해서다 — 실제 파일을 건드리는 부작용 없이 결과만 확인할 수 있다.
#
# 사용법: render-caddy-site.sh <site_address> [redirect_from]
#   site_address   Caddyfile.template 의 {{SITE}} 자리에 들어갈 주소.
#                  도메인(formwith.fix-up.kr) 또는 http://IP(인증서 없이 평문,
#                  호출하는 쪽이 http:// 를 붙여 준다)
#   redirect_from  주면 그 주소에서 site_address 의 HTTPS 로 308 리다이렉트하는
#                  블록을 앞에 더한다(운영 IP → 운영 도메인 넘기기 같은 용도).
#                  site_address 가 http:// 로 시작하면(= HTTPS 가 아니면) 거절한다
#                  — 리다이렉트는 도메인 HTTPS 로 보낼 때만 뜻이 있다.

usage() {
  echo "사용법: render-caddy-site.sh <site_address> [redirect_from]" >&2
}

site_address=${1:-}
redirect_from=${2:-}

if [[ -z ${site_address} ]]; then
  usage
  exit 2
fi

# 설정 파일에 끼어드는 것을 막는다(공백·중괄호·세미콜론 등). 도메인/IP 모양만
# 받는다 — 포트를 붙이는 것까지는 허용한다.
bare_re='^[A-Za-z0-9.-]+(:[0-9]+)?$'
scheme_re='^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'

if [[ ! ${site_address} =~ ${bare_re} && ! ${site_address} =~ ${scheme_re} ]]; then
  echo "잘못된 주소: ${site_address}" >&2
  exit 2
fi

if [[ -n ${redirect_from} ]]; then
  if [[ ! ${redirect_from} =~ ${scheme_re} ]]; then
    echo "잘못된 주소: ${redirect_from}" >&2
    exit 2
  fi
  if [[ ${site_address} == http://* ]]; then
    echo "잘못된 조합: site_address 가 HTTPS 가 아니면(http://…) redirect_from 을 쓸 수 없습니다." >&2
    exit 2
  fi
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [[ -n ${redirect_from} ]]; then
  # site_address 를 이미 `https://` 를 붙여 줬어도(예: https://formwith.fix-up.kr)
  # 리다이렉트 대상은 한 번만 붙는다 — 안 그러면 `redir https://https://…` 가 된다.
  redirect_target=${site_address#https://}
  printf '%s {\n\tredir https://%s{uri} 308\n}\n\n' "${redirect_from}" "${redirect_target}"
fi

sed "s|{{SITE}}|${site_address}|g" "${script_dir}/Caddyfile.template"
