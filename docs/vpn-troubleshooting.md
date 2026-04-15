# VPN 冲突排查指南

## 问题现象

断开 LetsVPN 后，所有网络中断，包括 localhost 服务都无法访问。或者开启 LetsVPN 后无法访问 google.com。

## 原因分析

### 1. 断开 VPN 后网络全部中断

LetsVPN 在连接时会设置系统 HTTP 代理指向 `127.0.0.1:8001`（VPN 本地代理进程）。断开 VPN 后，如果代理设置没有被正确清理，所有 HTTP 请求仍会尝试走一个已经不存在的代理，导致网络完全不可用。

**修复方法：**

```bash
networksetup -setwebproxystate Wi-Fi off
networksetup -setsecurewebproxystate Wi-Fi off
```

验证代理是否已关闭：

```bash
scutil --proxy | grep -E "HTTPEnable|HTTPSEnable"
# 应输出：
# HTTPEnable : 0
# HTTPSEnable : 0
```

### 2. 公司 VPN 与 LetsVPN 同时开启导致冲突

当两个 VPN 同时连接时，会出现路由和 DNS 的冲突：

| | 公司 VPN | LetsVPN |
|---|---|---|
| 网关 | 内网网关（如 `172.16.238.254`） | VPN 网关（如 `26.26.26.1`） |
| 控制范围 | DNS 解析（指向内网 DNS 服务器） | 路由表（覆盖几乎所有 IP 段） |
| 路由范围 | 特定内网网段 + 少量外网 IP | 全网段全覆盖 |

**冲突点：** LetsVPN 接管了流量路由，但 DNS 仍被公司 VPN 控制。公司内网 DNS 对外部域名（如 `google.com`）返回被污染的 IP 地址，流量虽然走了 LetsVPN 隧道，但连接到了错误的目的地址。

**诊断步骤：**

```bash
# 1. 检查 DNS 解析是否被污染
nslookup www.google.com
# 如果返回的 IP 不是 Google 的 IP 段，说明 DNS 被污染

# 2. 用公共 DNS 验证
nslookup www.google.com 8.8.8.8
# 对比两次解析结果是否一致

# 3. 查看当前系统 DNS 配置
scutil --dns

# 4. 查看路由表
netstat -rn
```

**解决方案：**

按需使用，避免两个 VPN 同时开启：
- 需要访问外网（Google 等）时：断开公司 VPN，仅连接 LetsVPN
- 需要访问公司内网时：断开 LetsVPN，仅连接公司 VPN

如果确实需要同时使用，可以手动指定 DNS：

```bash
# 临时将 DNS 改为公共 DNS
networksetup -setdnsservers Wi-Fi 8.8.8.8 8.8.4.4

# 恢复自动获取 DNS
networksetup -setdnsservers Wi-Fi empty
```

## 快速排查命令汇总

| 命令 | 用途 |
|---|---|
| `scutil --proxy` | 查看系统代理设置 |
| `scutil --dns` | 查看 DNS 配置 |
| `netstat -rn` | 查看路由表 |
| `nslookup <domain>` | 检查 DNS 解析 |
| `networksetup -setwebproxystate Wi-Fi off` | 关闭 HTTP 代理 |
| `networksetup -setdnsservers Wi-Fi 8.8.8.8` | 设置公共 DNS |
| `curl -v https://www.google.com` | 测试外网连通性 |
