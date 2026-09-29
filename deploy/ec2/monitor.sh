#!/usr/bin/env bash
# 서버 감시 — 1분마다 systemd 타이머가 부른다(fixup-image-agent-monitor.timer).
#
# 보는 것: 준비 상태(/api/health/ready, 5초 안에), 자동 재시작 횟수, 메모리(MemoryHigh 의 90%),
# 커널 OOM. 이상하면 app.env 의 SMTP 계정으로 ALERT_EMAIL 에 메일을 보낸다 — 추가 과금 없음.
# 같은 사건은 한 시간에 한 번. 보내기에 실패하면 쉬는 시간을 시작하지 않고 다음 차례에 다시.
#
# SMTP 해석은 앱이 메일을 보내는 곳(apps/web/lib/email/approval.ts)과 맞춘다:
#   secure = SMTP_SECURE === "true" || port === 465
#   from   = SMTP_FROM || SMTP_USER
set -uo pipefail

state_dir=${MONITOR_STATE_DIR:-/var/lib/fixup-image-agent-monitor}
app_env=${MONITOR_APP_ENV:-/etc/fixup-image-agent/app.env}
health_url=${MONITOR_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}
unit=${MONITOR_UNIT:-fixup-image-agent.service}
dry_run=${MONITOR_DRY_RUN:-0}
cooldown=3600
now=$(date +%s)
mkdir -p "${state_dir}"

read_env() { grep -E "^$1=" "${app_env}" 2>/dev/null | tail -1 | cut -d= -f2-; }
state() { cat "${state_dir}/$1" 2>/dev/null || echo "${2:-0}"; }
save() { printf '%s' "$2" > "${state_dir}/$1"; }

alert_to=$(read_env ALERT_EMAIL)
host_name=$(hostname 2>/dev/null || echo server)

send() { # $1 사건 이름, $2 본문
  local key=$1 body=$2 last
  last=$(state "sent.${key}" 0)
  (( now - last < cooldown )) && return 0
  [[ -z ${alert_to} ]] && return 0
  if [[ ${dry_run} == 1 ]]; then
    echo "MAIL [${key}] ${body}"
    save "sent.${key}" "${now}"
    return 0
  fi
  local msg smtp_from smtp_user smtp_port smtp_secure from_header envelope_from scheme subject_b64 date_line
  msg=$(mktemp)
  smtp_from=$(read_env SMTP_FROM)
  smtp_user=$(read_env SMTP_USER)
  smtp_port=$(read_env SMTP_PORT)
  smtp_secure=$(read_env SMTP_SECURE)

  # from = SMTP_FROM || SMTP_USER — 앱과 같다. 봉투 주소는 "이름 <addr>" 꼴이면
  # addr 만 뽑는다. 없으면 값 그대로.
  if [[ -n ${smtp_from} ]]; then
    from_header=${smtp_from}
    if [[ ${smtp_from} =~ \<([^\>]+)\> ]]; then
      envelope_from=${BASH_REMATCH[1]}
    else
      envelope_from=${smtp_from}
    fi
  else
    from_header=${smtp_user}
    envelope_from=${smtp_user}
  fi

  # secure = SMTP_SECURE === "true" || port === 465 — 앱과 같다.
  if [[ ${smtp_secure} == true || ${smtp_port} == 465 ]]; then
    scheme=smtps
  else
    scheme=smtp
  fi

  # 제목은 RFC 2047(UTF-8, Base64)로 감싼다 — 안 그러면 한글이 메일함에서 깨진다.
  subject_b64=$(printf '[FormWith 서버] %s' "${key}" | base64 | tr -d '\n')
  date_line=$(LC_ALL=C date -R)
  {
    printf 'From: %s\r\n' "${from_header}"
    printf 'To: %s\r\n' "${alert_to}"
    printf 'Subject: =?UTF-8?B?%s?=\r\n' "${subject_b64}"
    printf 'MIME-Version: 1.0\r\n'
    printf 'Content-Type: text/plain; charset=UTF-8\r\n'
    printf 'Content-Transfer-Encoding: 8bit\r\n'
    printf 'Date: %s\r\n' "${date_line}"
    printf '\r\n'
    printf '%s\r\n서버: %s\r\n' "${body}" "${host_name}"
  } > "${msg}"
  if curl --silent --show-error --max-time 20 --url "${scheme}://$(read_env SMTP_HOST):$(read_env SMTP_PORT)" \
      --ssl-reqd --user "$(read_env SMTP_USER):$(read_env SMTP_PASS)" \
      --mail-from "${envelope_from}" --mail-rcpt "${alert_to}" --upload-file "${msg}"; then
    save "sent.${key}" "${now}"
  else
    echo "감시 메일을 보내지 못했습니다: ${key}" >&2
  fi
  rm -f "${msg}"
}

# 1) 준비 상태 — 한 번 실패는 배포 재시작일 수 있어 두 번 연속일 때만.
if curl --silent --fail --max-time 5 --output /dev/null "${health_url}"; then
  if [[ $(state down.alerted 0) == 1 ]]; then
    send recovered "서비스가 다시 응답합니다."
    save down.alerted 0
  fi
  save down.count 0
else
  count=$(( $(state down.count 0) + 1 ))
  save down.count "${count}"
  if (( count >= 2 )); then
    send down "준비 상태(${health_url})가 ${count}분째 응답하지 않습니다."
    save down.alerted 1
  fi
fi

# 2) 자동 재시작 — systemctl restart(배포)는 NRestarts 를 올리지 않는다.
restarts=$(systemctl show "${unit}" -p NRestarts --value 2>/dev/null || echo 0)
previous=$(state restarts "${restarts}")
if [[ ${restarts} =~ ^[0-9]+$ && ${previous} =~ ^[0-9]+$ ]] && (( restarts > previous )); then
  send restart "서비스가 스스로 다시 떴습니다(${previous} → ${restarts}). 메모리 초과일 수 있습니다: journalctl -u ${unit}"
fi
save restarts "${restarts}"

# 3) 메모리 — MemoryHigh 의 90%.
current=$(systemctl show "${unit}" -p MemoryCurrent --value 2>/dev/null || echo 0)
high=$(systemctl show "${unit}" -p MemoryHigh --value 2>/dev/null || echo infinity)
if [[ ${current} =~ ^[0-9]+$ && ${high} =~ ^[0-9]+$ ]] && (( current * 10 >= high * 9 )); then
  send memory "메모리 $(( current / 1048576 ))MB — 상한 $(( high / 1048576 ))MB 의 90% 를 넘었습니다."
fi

# 4) 커널 OOM — 지난 차례 이후.
since=$(state oom.since $(( now - 120 )))
if journalctl -k --since "@${since}" --no-pager 2>/dev/null | grep -qiE "out of memory|oom-kill"; then
  send oom "커널이 메모리 부족으로 프로세스를 죽였습니다: journalctl -k"
fi
save oom.since "${now}"
exit 0
