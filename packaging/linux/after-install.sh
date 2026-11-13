#!/usr/bin/env bash
#
# Runs as root during `dpkg -i my-rgb_*.deb`.
#
# A custom `afterInstall` replaces electron-builder's default template, so the
# parts of that template the app depends on have to be repeated here:
#
#  1. the `/usr/bin/my-rgb` symlink (so the app can be started from a terminal);
#  2. the `chrome-sandbox` mode. Electron aborts at startup when the helper is
#     not setuid and the kernel does not allow unprivileged user namespaces -
#     the default on Debian and Ubuntu. The file ships as 0755, so the mode has
#     to be fixed here, as root;
#  3. the AppArmor profile, needed on Ubuntu 24+ where AppArmor also restricts
#     unprivileged user namespaces.
#
# On top of that, install the udev rule that lets MyRGB open the ASUS AURA USB
# controller without root privileges. Without it, the app installs fine but
# reports "device not found" until the user copies the rule by hand.
#
# `set -e` is deliberately absent: a failed post-install step must not leave
# dpkg thinking the package is broken. The default electron-builder template
# works the same way.

set -uo pipefail

# --- /usr/bin symlink ------------------------------------------------------

if type update-alternatives >/dev/null 2>&1; then
  # Remove a previous link that does not use update-alternatives.
  if [ -L '/usr/bin/${executable}' ] && [ -e '/usr/bin/${executable}' ] && [ "$(readlink '/usr/bin/${executable}')" != '/etc/alternatives/${executable}' ]; then
    rm -f '/usr/bin/${executable}'
  fi
  update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
  ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# --- chrome-sandbox --------------------------------------------------------
#
# Always use the setuid helper. electron-builder's default template tries to
# detect user namespaces and leaves the file at 0755 when `unshare` works, but
# that test can pass in the post-install shell while Electron is still blocked
# by AppArmor (Ubuntu 24+ sets kernel.apparmor_restrict_unprivileged_userns=1).
# The result is the startup error "The SUID sandbox helper binary was found,
# but is not configured correctly". The setuid helper is root-owned and is the
# reliable path on both kinds of system; the AppArmor profile below is still
# installed for the namespace-based sandbox.

chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

# --- desktop databases -----------------------------------------------------

if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi

# --- AppArmor profile (Ubuntu 24+) -----------------------------------------

if apparmor_status --enabled >/dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" >/dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET" || true
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && command -v apparmor_parser >/dev/null 2>&1; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET" || true
    fi
  else
    echo "my-rgb: skipping AppArmor profile (not supported on this system)."
  fi
fi

# --- udev rule -------------------------------------------------------------

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

RULE_SOURCE="$(find_rule "${1:-}" || true)"

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
