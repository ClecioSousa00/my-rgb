#!/usr/bin/env bash
# Installs the udev rule that lets MyRGB open the ASUS AURA USB controller
# without root privileges.
#
#   sudo ./packaging/linux/install-udev-rule.sh
set -euo pipefail

RULE_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/udev/60-my-rgb.rules"
RULE_TARGET="/etc/udev/rules.d/60-my-rgb.rules"

if [[ ! -f "$RULE_SOURCE" ]]; then
  echo "Rule source not found: $RULE_SOURCE" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "This script needs root. Re-run with sudo." >&2
  exit 1
fi

install -m 0644 "$RULE_SOURCE" "$RULE_TARGET"
udevadm control --reload-rules
udevadm trigger --subsystem-match=hidraw

echo "Installed $RULE_TARGET"
echo "Unplug and replug the AURA controller (or reboot) for the rule to apply."
