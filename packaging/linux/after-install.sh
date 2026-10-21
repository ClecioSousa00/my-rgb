#!/usr/bin/env bash
#
# Runs as root during `dpkg -i my-rgb_*.deb`.
#
# Installs the udev rule that lets MyRGB open the ASUS AURA USB controller
# without root privileges. Without this, the app installs fine but reports
# "device not found" until the user copies the rule by hand.
set -euo pipefail

RULE_NAME="60-my-rgb.rules"
RULE_TARGET="/etc/udev/rules.d/${RULE_NAME}"

# FPM runs this with the package staging directory as the working directory,
# and electron-builder installs the app under /opt. Try both.
find_rule() {
  local candidate
  for candidate in \
    "${1:-}/resources/build/${RULE_NAME}" \
    "/opt/MyRGB/resources/build/${RULE_NAME}" \
    "./resources/build/${RULE_NAME}" \
    "./${RULE_NAME}"; do
    if [[ -n "$candidate" && -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

RULE_SOURCE="$(find_rule "$1" || true)"

if [[ -z "$RULE_SOURCE" ]]; then
  echo "my-rgb: could not find ${RULE_NAME} in the package." >&2
  echo "my-rgb: install it manually with:" >&2
  echo "my-rgb:   sudo cp ${RULE_NAME} /etc/udev/rules.d/" >&2
  exit 0
fi

install -m 0644 "$RULE_SOURCE" "$RULE_TARGET"

if command -v udevadm >/dev/null 2>&1; then
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=hidraw || true
fi

echo "my-rgb: installed ${RULE_TARGET}"
echo "my-rgb: unplug and replug the AURA controller (or reboot) for it to apply."
