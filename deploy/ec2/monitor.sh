#!/usr/bin/env bash
# 서버 감시 — 1분마다 systemd 타이머가 부른다(fixup-image-agent-monitor.timer).
#
# 보는 것: 준비 상태(/api/health/ready, 5초 안에), 자동 재시작 횟수,
# 메모리(cgroup memory.events 의 high/max/oom_kill 증가), 커널 OOM, Caddy.
# 이상하면 app.env 의 SMTP 계정으로 ALERT_EMAIL 에 메일을 보낸다 — 추가 과금 없음.
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

trim() { # 앞뒤 공백 제거
  local s=$1
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s}"
}

has_non_ascii() { # C 로케일 기준 출력 가능한 ASCII(0x20~0x7E) 밖 바이트가 있으면 참
  local s=$1
  local LC_ALL=C
  [[ ${s} == *[![:print:]]* ]]
}

curl_escape() { # curl 설정 문법(-K -)에 맞게 " 와 \ 를 이스케이프
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "${s}"
}

read_env() {
  local raw
  raw=$(grep -E "^$1=" "${app_env}" 2>/dev/null | tail -1 | cut -d= -f2-)
  raw=$(trim "${raw}")
  # app.env 값이 따옴표로 감싸져 있다(SMTP_PORT="465" 등, systemd 가
  # EnvironmentFile 을 앱에 넘길 때와 같은 규칙) — 바깥 따옴표 한 쌍만 벗긴다.
  if [[ ${#raw} -ge 2 ]]; then
    if [[ ${raw:0:1} == '"' && ${raw: -1} == '"' ]]; then
      raw=${raw:1:-1}
    elif [[ ${raw:0:1} == "'" && ${raw: -1} == "'" ]]; then
      raw=${raw:1:-1}
    fi
  fi
  printf '%s' "${raw}"
}
# 기본값이 숫자면 스스로 거른다 — 저장된 값이 깨져 있으면(디스크 꽉 참·중간에
# 끊긴 쓰기 등, 또는 08 처럼 선행 0 이 붙어 산술에서 8진수로 오해되는 값)
# 기본값으로 대신한다. 안 그러면 이 값을 그대로 산술에 넣는 호출부(sent.<key>,
# down.count, oom.since 등)가 `set -u` 아래서 죽거나(08 은 `$(( ))` 안에서
# "value too great for base" 로 죽는다) 감시 스크립트가 감시 자신 때문에 멎는다.
state() {
  local raw default
  default=${2:-0}
  raw=$(cat "${state_dir}/$1" 2>/dev/null)
  if [[ -z ${raw} ]]; then
    echo "${default}"
  elif [[ ${default} =~ ^(0|[1-9][0-9]*)$ && ! ${raw} =~ ^(0|[1-9][0-9]*)$ ]]; then
    echo "${default}"
  else
    echo "${raw}"
  fi
}
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
  local msg smtp_from smtp_user smtp_pass smtp_host smtp_port smtp_secure
  local from_header envelope_from display_name display_b64 from_b64 scheme subject_b64 date_line
  msg=$(mktemp)
  smtp_from=$(read_env SMTP_FROM)
  smtp_user=$(read_env SMTP_USER)
  smtp_pass=$(read_env SMTP_PASS)
  smtp_host=$(read_env SMTP_HOST)
  smtp_port=$(read_env SMTP_PORT)
  smtp_port=${smtp_port:-465} # 앱과 같다: Number(process.env.SMTP_PORT || 465)
  smtp_secure=$(read_env SMTP_SECURE)

  # from = SMTP_FROM || SMTP_USER — 앱과 같다. 봉투 주소는 "이름 <addr>" 꼴이면
  # addr 만 뽑는다. 표시 이름에 ASCII 밖 글자(한글 등)가 있으면 RFC 2047 로
  # 감싼다 — 안 그러면 메일함에서 발신자 이름이 깨진다.
  if [[ -n ${smtp_from} ]]; then
    if [[ ${smtp_from} =~ ^(.*)\<([^\>]+)\>[[:space:]]*$ ]]; then
      display_name=$(trim "${BASH_REMATCH[1]}")
      envelope_from=${BASH_REMATCH[2]}
      if has_non_ascii "${display_name}"; then
        display_b64=$(printf '%s' "${display_name}" | base64 | tr -d '\n')
        from_header="=?UTF-8?B?${display_b64}?= <${envelope_from}>"
      else
        from_header="${display_name} <${envelope_from}>"
      fi
    else
      envelope_from=${smtp_from}
      if has_non_ascii "${smtp_from}"; then
        from_b64=$(printf '%s' "${smtp_from}" | base64 | tr -d '\n')
        from_header="=?UTF-8?B?${from_b64}?="
      else
        from_header=${smtp_from}
      fi
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
  # SMTP 비밀번호를 명령줄 인자로 넘기지 않는다 — 같은 서버의 다른 계정이 ps
  # 로 볼 수 있다. curl 설정(-K -)을 표준입력으로 넘긴다.
  if printf 'user = "%s:%s"\n' "$(curl_escape "${smtp_user}")" "$(curl_escape "${smtp_pass}")" \
      | curl --config - --silent --show-error --max-time 20 \
        --url "${scheme}://${smtp_host}:${smtp_port}" \
        --ssl-reqd --mail-from "${envelope_from}" --mail-rcpt "${alert_to}" --upload-file "${msg}"; then
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

# 3) 메모리 — MemoryHigh 의 90% 규칙은 페이지 캐시가 섞여 정상 부하에서도
# 헛경보를 냈다(예: 상세페이지 10명 동시 생성 2646MiB > MemoryHigh 90%인
# 2520MiB). 대신 서비스 cgroup 의 memory.events 에서 high(느려지기
# 시작)·max(상한 도달)·oom_kill(서비스 안에서 죽임) 카운터를 읽어, 지난
# 차례보다 늘었을 때만 알린다. 첫 실행은 기준값만 저장한다(오탐 없음).
current=$(systemctl show "${unit}" -p MemoryCurrent --value 2>/dev/null || echo 0)
high=$(systemctl show "${unit}" -p MemoryHigh --value 2>/dev/null || echo infinity)
if [[ ${current} =~ ^[0-9]+$ ]]; then
  current_mb=$(( current / 1048576 ))
else
  current_mb=0
fi
if [[ ${high} =~ ^[0-9]+$ ]]; then
  high_mb=$(( high / 1048576 ))
else
  high_mb=0
fi

memory_events=${MONITOR_MEMORY_EVENTS:-}
if [[ -z ${memory_events} ]]; then
  control_group=$(systemctl show "${unit}" -p ControlGroup --value 2>/dev/null || echo "")
  if [[ -n ${control_group} ]]; then
    memory_events="/sys/fs/cgroup${control_group}/memory.events"
  fi
fi

if [[ -n ${memory_events} ]]; then
  for counter in high max oom_kill; do
    value=$(awk -v k="${counter}" '$1==k{print $2}' "${memory_events}" 2>/dev/null)
    [[ ${value} =~ ^[0-9]+$ ]] || continue
    previous=$(state "memevents.${counter}" "${value}")
    if [[ ${previous} =~ ^[0-9]+$ ]] && (( value > previous )); then
      # 쉬는 시간 키를 카운터별로 나눈다(memory-high/memory-max/memory-oom_kill).
      # 세 카운터가 같은 "memory" 키를 썼다면 high 알림이 쉬는 시간을 시작시켜,
      # 같은 한 시간 안에 훨씬 급한 oom_kill 이 늘어도 send() 의 쿨다운에 걸려
      # 버려진다.
      send "memory-${counter}" "메모리 사건 ${counter} 이 늘었습니다(${previous} → ${value}). 현재 ${current_mb}MB / 상한 ${high_mb}MB."
    fi
    save "memevents.${counter}" "${value}"
  done
fi

# 4) 커널 OOM — 지난 차례 이후.
since=$(state oom.since $(( now - 120 )))
if journalctl -k --since "@${since}" --no-pager 2>/dev/null | grep -qiE "out of memory|oom-kill"; then
  send oom "커널이 메모리 부족으로 프로세스를 죽였습니다: journalctl -k"
fi
save oom.since "${now}"

# 5) Caddy — 리버스 프록시가 죽으면 앱이 살아 있어도 아무도 못 들어온다.
if systemctl is-active --quiet caddy; then
  if [[ $(state caddy.alerted 0) == 1 ]]; then
    send caddy-recovered "Caddy 가 다시 응답합니다."
    save caddy.alerted 0
  fi
else
  send caddy "Caddy(리버스 프록시)가 active 상태가 아닙니다: systemctl status caddy"
  save caddy.alerted 1
fi

exit 0
