#!/usr/bin/env bash
# 회원이 지운 것을 6개월 뒤 완전히 지운다 — 하루 한 번 systemd 타이머가 부른다(fixup-image-agent-purge.timer).
#
# 지우는 일은 앱이 한다(/api/internal/purge-deleted). 이 스크립트는 서버 안에서 그 주소를 부르기만 한다.
# 비밀값은 app.env 의 CRON_SECRET(32자 이상). **명령줄에 싣지 않는다** — 명령줄은 서버의 누구나 ps 로 본다.
# curl 이 표준 입력에서 머리를 읽는다(-H @-). 값이 없거나 짧으면 부르지 않고 실패로 끝난다 — 타이머 기록
# (journalctl -u fixup-image-agent-purge)에 남는다.
set -euo pipefail

app_env=${PURGE_APP_ENV:-/etc/fixup-image-agent/app.env}
url=${PURGE_URL:-http://127.0.0.1:3000/api/internal/purge-deleted}

secret=$(sed -n 's/^CRON_SECRET=//p' "${app_env}" | tail -n 1)
secret=${secret%$'\r'}
secret=${secret#\"}
secret=${secret%\"}

if [[ ${#secret} -lt 32 ]]; then
  echo "app.env 에 CRON_SECRET(32자 이상)이 없어 자동 파기를 건너뜁니다." >&2
  exit 1
fi

# 한 번에 갈래마다 50건씩 지운다 — 오래 걸려도 10분 안에 끝난다.
printf 'x-cron-secret: %s\n' "${secret}" \
  | curl -fsS --max-time 600 -X POST -H @- "${url}"
echo
