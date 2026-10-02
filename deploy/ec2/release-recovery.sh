#!/usr/bin/env bash
# Shared by deployment and manual rollback. Caller captures both old pointers
# before arming the trap. No secrets or environment values are printed.

release_health() {
  local attempt
  for attempt in $(seq 1 20); do
    if curl --connect-timeout 2 --max-time 5 --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null; then
      curl --connect-timeout 2 --max-time 5 --fail --silent --show-error http://127.0.0.1:3000/api/health/ready >/dev/null
      return $?
    fi
    sleep 2
  done
  return 1
}

release_failed() {
  local original_status=${1:-1}
  # A failed recovery must not recursively invoke recovery or hide the first error.
  trap - ERR
  set +e
  local restored=true
  echo "Release activation failed (exit ${original_status}). Restoring previous pointers." >&2

  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    ln -sfnT "${previous_release}" "${current_link}" || restored=false
  else
    restored=false
    echo "No usable previous release is available." >&2
    if [[ ${restart_attempted} == true ]]; then systemctl stop fixup-image-agent.service; fi
    if [[ -L ${current_link} ]]; then rm -f -- "${current_link}"; fi
  fi

  if [[ -n ${previous_static} && -d ${previous_static} ]]; then
    ln -sfnT "${previous_static}" "${static_link}" || restored=false
  elif [[ -z ${previous_static} ]]; then
    # The old app served its own static files. Restore that state (only unlink a symlink).
    if [[ -L ${static_link} ]]; then rm -f -- "${static_link}" || restored=false; fi
  else
    restored=false
    echo "Previous static directory is no longer available: ${previous_static}" >&2
  fi

  if [[ -n ${previous_release} && -d ${previous_release} ]]; then
    if [[ ${restart_attempted} == true ]]; then
      systemctl restart fixup-image-agent.service || restored=false
    fi
    if [[ ${restored} == true ]] && release_health; then
      echo "Previous release restored and healthy: ${previous_release}" >&2
    else
      echo "RECOVERY FAILED: check service state and previous release ${previous_release}." >&2
    fi
  else
    echo "RECOVERY FAILED: manual intervention is required." >&2
  fi
  if [[ ${original_status} -eq 0 ]]; then original_status=1; fi
  exit "${original_status}"
}
