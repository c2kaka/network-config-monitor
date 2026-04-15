#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/docs/fix-network.sh"
TMP_DIR="$(mktemp -d)"
BIN_DIR="$TMP_DIR/bin"
LOG="$TMP_DIR/commands.log"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$BIN_DIR"
touch "$LOG"

write_stub() {
  local name="$1"
  shift
  local path="$BIN_DIR/$name"
  {
    printf '%s\n' '#!/usr/bin/env bash'
    printf '%s\n' 'set -euo pipefail'
    printf '%s\n' "$@"
  } > "$path"
  chmod +x "$path"
}

write_stub netstat \
  'cat <<EOF' \
  'Routing tables' \
  '' \
  'Internet:' \
  'Destination        Gateway            Flags               Netif Expire' \
  'EOF' \
  'if [ "${FIX_NETWORK_TEST_SCENARIO:-missing_default}" = "healthy_default" ]; then' \
  '  printf "%s\n" "default            172.22.205.254     UGScg                 en0"' \
  'else' \
  '  printf "%s\n" "default            fe80::%utun0       UGcIg               utun0"' \
  'fi' \
  'cat <<EOF' \
  '8/5                26.26.26.1         UGSc                utun4' \
  '64/2               26.26.26.1         UGSc                utun4' \
  '128.0/1            26.26.26.1         UGSc                utun4' \
  '26.26.26.53        26.26.26.1         UH                  utun4' \
  'EOF'

write_stub route \
  'echo "route $*" >> "$FIX_NETWORK_TEST_LOG"' \
  'case "$*" in' \
  '  "-n get default")' \
  '    exit 1' \
  '    ;;' \
  '  "-n get 114.114.114.114"|"-n get 8.8.8.8")' \
  '    cat <<EOF' \
  '   route to: 114.114.114.114' \
  'destination: 64.0.0.0' \
  '       mask: 192.0.0.0' \
  '    gateway: 26.26.26.1' \
  '  interface: utun4' \
  'EOF' \
  '    ;;' \
  'esac' \
  'exit 1'

write_stub ifconfig \
  'if [ "${1:-}" = "en0" ]; then' \
  '  cat <<EOF' \
  'en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500' \
  '        inet 172.22.205.12 netmask 0xffffff00 broadcast 172.22.205.255' \
  'EOF' \
  '  exit 0' \
  'fi' \
  'exit 1'

write_stub networksetup \
  'echo "networksetup $*" >> "$FIX_NETWORK_TEST_LOG"' \
  'case "$*" in' \
  '  "-listallhardwareports")' \
  '    cat <<EOF' \
  'Hardware Port: Wi-Fi' \
  'Device: en0' \
  'Ethernet Address: aa:bb:cc:dd:ee:ff' \
  'EOF' \
  '    ;;' \
  '  "-getinfo Wi-Fi")' \
  '    cat <<EOF' \
  'DHCP Configuration' \
  'IP address: 172.22.205.12' \
  'Subnet mask: 255.255.255.0' \
  'Router: 172.22.205.254' \
  'EOF' \
  '    ;;' \
  '  "-getdnsservers Wi-Fi")' \
  '    printf "%s\n" "26.26.26.53"' \
  '    ;;' \
  '  "-setwebproxystate Wi-Fi off"|"-setsecurewebproxystate Wi-Fi off"|"-setsocksfirewallproxystate Wi-Fi off"|"-setautoproxystate Wi-Fi off")' \
  '    ;;' \
  '  "-setdnsservers Wi-Fi empty")' \
  '    ;;' \
  '  *)' \
  '    exit 1' \
  '    ;;' \
  'esac'

write_stub sudo \
  'echo "sudo $*" >> "$FIX_NETWORK_TEST_LOG"' \
  'exit 0'

write_stub dscacheutil 'echo "dscacheutil $*" >> "$FIX_NETWORK_TEST_LOG"'
write_stub killall 'echo "killall $*" >> "$FIX_NETWORK_TEST_LOG"'
write_stub ping 'exit 0'
write_stub nslookup \
  'if [ "${FIX_NETWORK_TEST_DNS_FAIL:-0}" = "1" ]; then' \
  '  exit 1' \
  'fi' \
  'exit 0'
write_stub dig \
  'if [ "${FIX_NETWORK_TEST_DNS_FAIL:-0}" = "1" ]; then' \
  '  exit 1' \
  'fi' \
  'printf "%s\n" "1.2.3.4"'
write_stub curl 'exit 0'
write_stub scutil 'printf "%s\n" "HTTPEnable : 0" "HTTPSEnable : 0"'

OUTPUT="$(PATH="$BIN_DIR:$PATH" FIX_NETWORK_TEST_LOG="$LOG" bash "$SCRIPT" 2>&1)"

if ! grep -q 'sudo route add default 172.22.205.254' "$LOG"; then
  echo "Expected script to restore default route from networksetup Router." >&2
  echo "--- output ---" >&2
  echo "$OUTPUT" >&2
  echo "--- command log ---" >&2
  cat "$LOG" >&2
  exit 1
fi

if ! grep -q 'networksetup -setwebproxystate Wi-Fi off' "$LOG"; then
  echo "Expected script to disable stale Wi-Fi HTTP proxy after VPN disconnect." >&2
  cat "$LOG" >&2
  exit 1
fi

if ! grep -q 'sudo route delete -net 64/2' "$LOG"; then
  echo "Expected script to delete stale LetsVPN split routes on utun interfaces." >&2
  cat "$LOG" >&2
  exit 1
fi

if ! grep -q 'networksetup -setdnsservers Wi-Fi empty' "$LOG"; then
  echo "Expected script to restore Wi-Fi DNS from DHCP when VPN DNS remains configured." >&2
  cat "$LOG" >&2
  exit 1
fi

: > "$LOG"
OUTPUT="$(PATH="$BIN_DIR:$PATH" FIX_NETWORK_TEST_LOG="$LOG" FIX_NETWORK_TEST_SCENARIO=healthy_default bash "$SCRIPT" 2>&1)"

if ! grep -q 'sudo route delete -net 64/2' "$LOG"; then
  echo "Expected script to delete stale LetsVPN split routes even when default gateway is healthy." >&2
  echo "--- output ---" >&2
  echo "$OUTPUT" >&2
  echo "--- command log ---" >&2
  cat "$LOG" >&2
  exit 1
fi

if ! grep -q 'networksetup -setdnsservers Wi-Fi empty' "$LOG"; then
  echo "Expected script to restore VPN DNS even when default gateway is healthy." >&2
  echo "--- output ---" >&2
  echo "$OUTPUT" >&2
  echo "--- command log ---" >&2
  cat "$LOG" >&2
  exit 1
fi

: > "$LOG"
OUTPUT="$(PATH="$BIN_DIR:$PATH" FIX_NETWORK_TEST_LOG="$LOG" FIX_NETWORK_TEST_SCENARIO=healthy_default FIX_NETWORK_TEST_DNS_FAIL=1 bash "$SCRIPT" 2>&1)"

if ! grep -q 'networksetup -setdnsservers Wi-Fi 223.5.5.5 119.29.29.29 114.114.114.114' "$LOG"; then
  echo "Expected script to switch to public DNS when automatic DNS still cannot resolve." >&2
  echo "--- output ---" >&2
  echo "$OUTPUT" >&2
  echo "--- command log ---" >&2
  cat "$LOG" >&2
  exit 1
fi

echo "fix-network regression tests passed"
