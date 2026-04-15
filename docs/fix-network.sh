#!/usr/bin/env bash
# VPN 网络恢复脚本
# 当 LetsVPN 断开后留下坏路由、代理或 DNS 缓存时，尽量恢复物理网卡网络。

set -euo pipefail

TEST_DOMAIN="${FIX_NETWORK_TEST_DOMAIN:-baidu.com}"
TEST_IP="${FIX_NETWORK_TEST_IP:-114.114.114.114}"
PUBLIC_DNS_SERVERS=(${FIX_NETWORK_PUBLIC_DNS_SERVERS:-223.5.5.5 119.29.29.29 114.114.114.114})

info() { printf '%s\n' "$*"; }
ok() { printf '✓ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*" >&2; }
err() { printf '✗ %s\n' "$*" >&2; }

ensure_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        return 0
    fi

    info "需要管理员权限来清理系统路由和刷新 DNS，请输入本机密码。"
    if sudo -v; then
        ok "管理员权限已确认"
    else
        err "未获得管理员权限，无法修复系统路由"
        exit 1
    fi
}

is_ipv4() {
    local ip="${1:-}"
    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1

    local IFS=.
    local part
    for part in $ip; do
        [[ "$part" =~ ^[0-9]+$ ]] || return 1
        (( part >= 0 && part <= 255 )) || return 1
    done
}

is_vpn_interface() {
    case "${1:-}" in
        utun*|tun*|tap*|ppp*|ipsec*|wg*) return 0 ;;
        *) return 1 ;;
    esac
}

get_default_route() {
    local output
    output="$(netstat -rn -f inet 2>/dev/null || netstat -rn 2>/dev/null || true)"
    printf '%s\n' "$output" | awk '$1 == "default" { print $2, $NF; exit }'
}

interface_has_ipv4() {
    local iface="$1"
    ifconfig "$iface" 2>/dev/null | awk '/^[[:space:]]*inet / { found=1 } END { exit found ? 0 : 1 }'
}

get_interface_ipv4() {
    local iface="$1"
    ifconfig "$iface" 2>/dev/null | awk '/^[[:space:]]*inet / { print $2; exit }'
}

get_service_for_interface() {
    local iface="$1"
    networksetup -listallhardwareports 2>/dev/null | awk -v target="$iface" '
        /^Hardware Port: / {
            service = substr($0, index($0, ": ") + 2)
        }
        /^Device: / && $2 == target {
            print service
            exit
        }
    '
}

get_first_network_service() {
    networksetup -listallhardwareports 2>/dev/null | awk '
        /^Hardware Port: / {
            service = substr($0, index($0, ": ") + 2)
        }
        /^Device: / && $2 ~ /^en[0-9]+$/ {
            print service
            exit
        }
    '
}

get_active_interface() {
    local default_route iface

    default_route="$(get_default_route)"
    iface="$(printf '%s\n' "$default_route" | awk '{ print $2 }')"
    if [ -n "$iface" ] && ! is_vpn_interface "$iface" && interface_has_ipv4 "$iface"; then
        printf '%s\n' "$iface"
        return 0
    fi

    iface="$(route -n get default 2>/dev/null | awk '/interface: / { print $2; exit }' || true)"
    if [ -n "$iface" ] && ! is_vpn_interface "$iface" && interface_has_ipv4 "$iface"; then
        printf '%s\n' "$iface"
        return 0
    fi

    while IFS= read -r iface; do
        if [ -n "$iface" ] && interface_has_ipv4 "$iface"; then
            printf '%s\n' "$iface"
            return 0
        fi
    done < <(networksetup -listallhardwareports 2>/dev/null | awk '/^Device: en[0-9]+$/ { print $2 }')

    for iface in en0 en1; do
        if interface_has_ipv4 "$iface"; then
            printf '%s\n' "$iface"
            return 0
        fi
    done

    return 1
}

get_router_from_networksetup() {
    local service="$1"
    [ -n "$service" ] || return 1

    networksetup -getinfo "$service" 2>/dev/null | awk -F': ' '
        /^Router: / && $2 != "" && $2 != "none" {
            print $2
            exit
        }
    '
}

get_router_from_dhcp() {
    local iface="$1"
    [ -n "$iface" ] || return 1
    command -v ipconfig >/dev/null 2>&1 || return 1
    ipconfig getoption "$iface" router 2>/dev/null | awk 'NF { print $1; exit }'
}

infer_router_from_interface_ip() {
    local iface="$1"
    local ip

    ip="$(get_interface_ipv4 "$iface")"
    [ -n "$ip" ] || return 1

    printf '%s\n' "$ip" | awk -F. 'NF == 4 { printf "%s.%s.%s.1\n", $1, $2, $3 }'
}

get_router_for_interface() {
    local iface="$1"
    local service="$2"
    local router

    router="$(get_router_from_networksetup "$service")"
    if is_ipv4 "$router"; then
        printf '%s\n' "$router"
        return 0
    fi

    router="$(get_router_from_dhcp "$iface")"
    if is_ipv4 "$router"; then
        printf '%s\n' "$router"
        return 0
    fi

    router="$(infer_router_from_interface_ip "$iface")"
    if is_ipv4 "$router"; then
        warn "无法从 DHCP 读取 Router，退回使用 ${router} 猜测网关"
        printf '%s\n' "$router"
        return 0
    fi

    return 1
}

get_route_interface() {
    local ip="$1"
    route -n get "$ip" 2>/dev/null | awk '/interface: / { print $2; exit }'
}

get_system_dns_servers() {
    scutil --dns 2>/dev/null | awk '/nameserver\\[[0-9]+\\] : / { print $3 }'
}

get_stale_vpn_routes() {
    netstat -rn -f inet 2>/dev/null | awk '
        $1 == "default" { next }
        $NF ~ /^(utun|tun|tap|ppp|ipsec|wg)[0-9]*$/ {
            print $1, $3
        }
    '
}

normalize_route_destination() {
    local destination="$1"

    if [[ "$destination" =~ ^([0-9]+)/([0-9]+)$ ]]; then
        printf '%s.0.0.0/%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    elif [[ "$destination" =~ ^([0-9]+)\.([0-9]+)/([0-9]+)$ ]]; then
        printf '%s.%s.0.0/%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
    elif [[ "$destination" =~ ^([0-9]+)$ ]]; then
        printf '%s.0.0.0/8\n' "$destination"
    else
        printf '%s\n' "$destination"
    fi
}

try_delete_route() {
    sudo route "$@" >/dev/null 2>&1
}

delete_route_destination() {
    local destination="$1"
    local flags="$2"
    local normalized
    local deleted=1

    [ -n "$destination" ] || return 0

    normalized="$(normalize_route_destination "$destination")"

    if [[ "$flags" == *H* ]] && is_ipv4 "$destination"; then
        if try_delete_route delete -host "$destination"; then
            deleted=0
        elif try_delete_route delete "$destination"; then
            deleted=0
        fi
    else
        if try_delete_route delete -net "$destination"; then
            deleted=0
        elif try_delete_route delete -net "$normalized"; then
            deleted=0
        elif try_delete_route delete "$normalized"; then
            deleted=0
        fi
    fi

    if [ "$deleted" -eq 0 ]; then
        ok "已删除残留路由: $destination"
    else
        warn "删除残留路由失败: $destination"
    fi

    return 0
}

delete_stale_vpn_routes() {
    local stale_routes="$1"
    local destination flags

    [ -n "$stale_routes" ] || return 0

    info "发现 LetsVPN 残留 IPv4 路由，准备清理"
    while read -r destination flags; do
        [ -n "$destination" ] || continue
        delete_route_destination "$destination" "$flags"
    done <<< "$stale_routes"
}

repair_stale_vpn_routes() {
    local public_iface stale_routes after_iface

    public_iface="$(get_route_interface "$TEST_IP" || true)"
    stale_routes="$(get_stale_vpn_routes || true)"

    if [ -n "$public_iface" ] && is_vpn_interface "$public_iface"; then
        info "外网测试地址 ${TEST_IP} 仍然走 ${public_iface}，说明 LetsVPN 路由没有清干净"
        delete_stale_vpn_routes "$stale_routes"
    elif [ -n "$stale_routes" ]; then
        delete_stale_vpn_routes "$stale_routes"
    fi

    after_iface="$(get_route_interface "$TEST_IP" || true)"
    if [ -n "$after_iface" ] && is_vpn_interface "$after_iface"; then
        warn "清理后 ${TEST_IP} 仍然走 ${after_iface}；如果 LetsVPN 确认已关闭，需要再次运行或手动删除对应路由"
    elif [ -n "$after_iface" ]; then
        ok "外网测试地址现在走 $after_iface"
    fi
}

default_route_is_healthy() {
    local route_line="$1"
    local gateway iface

    gateway="$(printf '%s\n' "$route_line" | awk '{ print $1 }')"
    iface="$(printf '%s\n' "$route_line" | awk '{ print $2 }')"

    [ -n "$gateway" ] || return 1
    [ -n "$iface" ] || return 1
    is_ipv4 "$gateway" || return 1
    ! is_vpn_interface "$iface" || return 1
    interface_has_ipv4 "$iface" || return 1
}

delete_stale_default_route() {
    local route_line="$1"
    local gateway iface
    local next_route

    gateway="$(printf '%s\n' "$route_line" | awk '{ print $1 }')"
    iface="$(printf '%s\n' "$route_line" | awk '{ print $2 }')"

    if [ -n "$gateway" ]; then
        warn "发现异常默认路由: ${gateway}${iface:+ ($iface)}，准备删除后重建"
        for _ in 1 2 3; do
            sudo route delete default >/dev/null 2>&1 || break
            next_route="$(get_default_route)"
            [ -n "$(printf '%s\n' "$next_route" | awk '{ print $1 }')" ] || break
            default_route_is_healthy "$next_route" && break
        done
    fi

    return 0
}

restore_default_route() {
    local router="$1"

    info "正在添加默认网关..."
    if sudo route add default "$router"; then
        ok "默认网关已恢复: $router"
    elif sudo route change default "$router"; then
        ok "默认网关已切换为: $router"
    else
        err "添加默认网关失败: $router"
        return 1
    fi
}

disable_stale_proxies() {
    local service="$1"
    [ -n "$service" ] || return 0

    info "正在关闭 $service 上可能残留的系统代理..."

    if networksetup -setwebproxystate "$service" off 2>/dev/null; then
        ok "HTTP 代理已关闭"
    fi
    if networksetup -setsecurewebproxystate "$service" off 2>/dev/null; then
        ok "HTTPS 代理已关闭"
    fi
    if networksetup -setsocksfirewallproxystate "$service" off 2>/dev/null; then
        ok "SOCKS 代理已关闭"
    fi
    if networksetup -setautoproxystate "$service" off 2>/dev/null; then
        ok "自动代理配置已关闭"
    fi
}

dns_server_is_vpn_leftover() {
    local dns_server="$1"
    local dns_iface

    is_ipv4 "$dns_server" || return 1

    case "$dns_server" in
        26.26.*) return 0 ;;
    esac

    dns_iface="$(get_route_interface "$dns_server" || true)"
    [ -n "$dns_iface" ] && is_vpn_interface "$dns_iface"
}

restore_dns_if_vpn_leftover() {
    local service="$1"
    local dns_servers system_dns_servers dns_server
    local should_restore=0

    [ -n "$service" ] || return 0

    dns_servers="$(networksetup -getdnsservers "$service" 2>/dev/null || true)"
    system_dns_servers="$(get_system_dns_servers || true)"

    while IFS= read -r dns_server; do
        dns_server="$(printf '%s\n' "$dns_server" | awk '{ print $1 }')"
        if dns_server_is_vpn_leftover "$dns_server"; then
            should_restore=1
            break
        fi
    done <<< "$dns_servers"

    if [ "$should_restore" -eq 0 ]; then
        while IFS= read -r dns_server; do
            dns_server="$(printf '%s\n' "$dns_server" | awk '{ print $1 }')"
            if dns_server_is_vpn_leftover "$dns_server"; then
                should_restore=1
                break
            fi
        done <<< "$system_dns_servers"
    fi

    if [ "$should_restore" -eq 1 ]; then
        info "${service} 的 DNS 仍指向 VPN DNS，准备恢复为自动获取"
        if networksetup -setdnsservers "$service" empty 2>/dev/null; then
            ok "$service DNS 已恢复为自动获取"
        else
            err "$service DNS 恢复失败"
            return 1
        fi

        dns_servers="$(networksetup -getdnsservers "$service" 2>/dev/null || true)"
        if printf '%s\n' "$dns_servers" | grep -q '26\.26\.'; then
            warn "$service DNS 仍显示 VPN DNS: $(printf '%s' "$dns_servers")"
        fi
    fi
}

dns_lookup_works() {
    nslookup "$TEST_DOMAIN" >/dev/null 2>&1 || dig "$TEST_DOMAIN" +short >/dev/null 2>&1
}

repair_dns_resolution() {
    local service="$1"
    [ -n "$service" ] || return 0

    restore_dns_if_vpn_leftover "$service"
    flush_dns

    if dns_lookup_works; then
        ok "DNS 解析正常"
        return 0
    fi

    warn "自动 DNS 仍无法解析，临时切换 $service 到公共 DNS: ${PUBLIC_DNS_SERVERS[*]}"
    if networksetup -setdnsservers "$service" "${PUBLIC_DNS_SERVERS[@]}" 2>/dev/null; then
        ok "$service DNS 已切换到公共 DNS"
        flush_dns
    else
        err "$service DNS 切换失败"
    fi
}

flush_dns() {
    info "正在刷新 DNS 缓存..."

    if sudo dscacheutil -flushcache 2>/dev/null; then
        ok "DNS 缓存已刷新 (dscacheutil)"
    fi

    if sudo killall -HUP mDNSResponder 2>/dev/null; then
        ok "mDNSResponder 已重启"
    fi
}

print_recovery_snapshot() {
    local service="$1"

    info "=== 当前网络快照 ==="
    info "出站路由 ($TEST_IP):"
    route -n get "$TEST_IP" 2>/dev/null || true
    info ""

    if [ -n "$service" ]; then
        info "$service DNS:"
        networksetup -getdnsservers "$service" 2>/dev/null || true
        info ""
    fi

    info "系统 DNS:"
    get_system_dns_servers | sed 's/^/  /' || true
    info ""

    info "VPN 残留 IPv4 路由:"
    get_stale_vpn_routes | sed 's/^/  /' || true
    info "=== 快照结束 ==="
}

print_current_default_route() {
    local route_line gateway iface

    route_line="$(get_default_route)"
    gateway="$(printf '%s\n' "$route_line" | awk '{ print $1 }')"
    iface="$(printf '%s\n' "$route_line" | awk '{ print $2 }')"

    if [ -n "$gateway" ]; then
        printf 'default via %s%s\n' "$gateway" "${iface:+ dev $iface}"
    else
        printf '没有默认路由\n'
    fi
}

run_connectivity_tests() {
    local gateway_ip
    local failed=0

    info "=== 网络连通性测试 ==="
    info ""

    gateway_ip="$(get_default_route | awk '{ print $1 }')"
    if is_ipv4 "$gateway_ip"; then
        info "测试网关 ($gateway_ip) 连通性..."
        if ping -c 3 -W 2 "$gateway_ip" >/dev/null 2>&1; then
            ok "网关可访问"
        else
            warn "网关未响应 ping；有些路由器会屏蔽 ICMP，可以继续看外网测试"
        fi
        info ""
    fi

    info "测试 DNS 解析 ($TEST_DOMAIN)..."
    if dns_lookup_works; then
        ok "DNS 解析正常"
    else
        err "DNS 解析失败"
        failed=1
    fi
    info ""

    info "测试外网连通性 (ping $TEST_IP)..."
    if ping -c 3 -W 3 "$TEST_IP" >/dev/null 2>&1; then
        ok "可以访问外网 (IP 层正常)"
    else
        err "无法访问外网 (IP 层不通)"
        failed=1
    fi
    info ""

    info "测试 HTTP 访问 (curl $TEST_DOMAIN)..."
    if curl -s --max-time 5 -I "http://$TEST_DOMAIN" >/dev/null 2>&1; then
        ok "HTTP 访问正常"
    else
        err "HTTP 访问失败"
        failed=1
    fi

    return "$failed"
}

main() {
    local route_line gateway iface service router

    info "=== VPN 网络恢复脚本 ==="
    info ""

    ensure_sudo
    info ""

    route_line="$(get_default_route)"
    gateway="$(printf '%s\n' "$route_line" | awk '{ print $1 }')"
    iface="$(printf '%s\n' "$route_line" | awk '{ print $2 }')"

    if default_route_is_healthy "$route_line"; then
        ok "默认网关正常: $gateway ($iface)"
        service="$(get_service_for_interface "$iface")"
        if [ -z "$service" ]; then
            service="$(get_first_network_service || true)"
        fi
    else
        if [ -n "$gateway" ]; then
            warn "默认网关异常: ${gateway}${iface:+ ($iface)}"
        else
            warn "默认网关丢失"
        fi
        info ""

        iface="$(get_active_interface || true)"
        if [ -z "$iface" ]; then
            err "无法找到带 IPv4 地址的物理网络接口"
            exit 1
        fi

        service="$(get_service_for_interface "$iface")"
        if [ -z "$service" ]; then
            service="$(get_first_network_service || true)"
        fi

        info "检测到网络接口: $iface"
        if [ -n "$service" ]; then
            info "对应网络服务: $service"
        fi
        info "接口 IP 地址: $(get_interface_ipv4 "$iface")"

        router="$(get_router_for_interface "$iface" "$service" || true)"
        if [ -z "$router" ]; then
            err "无法确定路由器 IP，请先确认 Wi-Fi/以太网已拿到 DHCP 地址"
            exit 1
        fi

        info "将使用路由器 IP: $router"
        info ""

        delete_stale_default_route "$route_line"
        restore_default_route "$router"
    fi

    info ""
    repair_stale_vpn_routes

    info ""
    disable_stale_proxies "${service:-}"

    info ""
    repair_dns_resolution "${service:-}"

    info ""
    info "=== 网络恢复完成 ==="
    info ""

    info "当前默认网关:"
    print_current_default_route
    info ""

    if ! run_connectivity_tests; then
        info ""
        print_recovery_snapshot "${service:-}"
    fi

    info ""
    info "=== 测试完成 ==="
}

main "$@"
