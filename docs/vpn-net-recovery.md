# VPN 网络恢复指南

## 问题描述

### 复现步骤

1. 同时开启 LetsVPN 和公司 VPN，内网和外网都能访问
2. 关闭 LetsVPN 和公司 VPN 后，内外网都不能访问，这时公司 VPN 也无法连接
3. 只有开启 LetsVPN 后才能连接公司 VPN
4. 看起来 LetsVPN 开启是恢复所有网络的前提

## 问题分析

### 根本原因

- LetsVPN 连接时替换了系统默认网关为自己的虚拟网关
- 断开时没有把原始网关（你的路由器 IP，如 `192.168.x.1` 或 `172.22.x.254`）写回去
- 有时还会留下 `utun*` VPN 虚拟网卡的 default 路由，旧脚本看到 `default` 就误判“网关正常”
- 更隐蔽的情况是 default 已经恢复正常，但 LetsVPN 留下了更具体的分片路由，例如 `8/5`、`64/2`、`128.0/1` 指向 `26.26.26.1`/`utun*`；这些路由优先级高于 default，所以外网流量仍然走坏掉的 VPN 隧道
- LetsVPN 也可能留下 HTTP/HTTPS/SOCKS/自动代理配置，导致路由修好后 HTTP 仍然不可用
- LetsVPN 还可能把 Wi-Fi DNS 留成 `26.26.26.53`，导致 DNS 解析失败
- 公司 VPN 也找不到默认网关，所以连不上
- 开启 LetsVPN 后它重新创建了默认路由，网络恢复

### 本次已验证的真实现场

最新一次断开 LetsVPN 后，脚本快照显示：

```text
route to: 114.114.114.114
destination: default
gateway: 172.22.205.254
interface: en0
```

这说明默认网关和真实出站接口都已经正常，流量没有继续走 `utun*`。同时快照里：

```text
VPN 残留 IPv4 路由:
```

为空，说明 LetsVPN 的分片路由残留也已经清干净。

真正的问题是：**断开 LetsVPN 后，系统自动 DNS 仍然不可用**。脚本恢复为自动 DNS 后仍无法解析，于是临时切换到公共 DNS：

```text
223.5.5.5
119.29.29.29
114.114.114.114
```

切换后 DNS 解析和 HTTP 访问恢复：

```text
✓ DNS 解析正常
✓ HTTP 访问正常
```

因此，本次问题更准确的根因是：**LetsVPN 断开后没有把 macOS 的 DNS 恢复到可解析状态**。路由清理是必要保护，但最终修复网络的是 DNS 兜底。

### 验证方法

**正常上网时，查看默认网关：**

```bash
netstat -rn | grep default
```

输出示例：
```
default            172.22.205.254     UGScg                 en0
default                                 fe80::%utun0                            UGcIg               utun0
default                                 fe80::%utun1                            UGcIg               utun1
default                                 fe80::%utun2                            UGcIg               utun2
default                                 fe80::%utun3                            UGcIg               utun3
```

**断开 VPN 后，再执行一次对比：**

```bash
netstat -rn | grep default
```

**预期现象：** 关闭 VPN 后 default 路由行消失或指向了一个不存在的网关。

如果看到类似下面的行，也应该当成异常，因为它指向 VPN 虚拟网卡，不是 Wi-Fi/以太网网关：

```text
default            fe80::%utun0       UGcIg               utun0
```

如果默认网关看起来正常，但仍然无法上网，继续检查真实出站路由：

```bash
route -n get 114.114.114.114
route -n get 8.8.8.8
```

如果输出里有 `interface: utun*`，或者路由表里有下面这种 LetsVPN 残留路由，也需要清理：

```text
8/5                26.26.26.1         UGSc                utun4
64/2               26.26.26.1         UGSc                utun4
128.0/1            26.26.26.1         UGSc                utun4
```

同时检查 DNS 是否仍指向 LetsVPN：

```bash
networksetup -getdnsservers Wi-Fi
# 如果输出 26.26.26.53，说明 DNS 仍然残留
```

如果 DNS 看起来已经是自动获取，但仍然解析失败，可以临时切换到公共 DNS：

```bash
networksetup -setdnsservers Wi-Fi 223.5.5.5 119.29.29.29 114.114.114.114
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

验证网络恢复时，优先看 DNS 和 HTTP：

```bash
nslookup baidu.com
curl -I http://baidu.com
```

`ping 114.114.114.114` 只能作为参考。很多网络会屏蔽 ICMP，出现 ping 失败但 HTTP 正常的情况，这时不能把它判定为网络未恢复。

## 修复方案

### 手动恢复步骤

1. **关闭两个 VPN**，确保网络断开状态下执行

2. **找到你的路由器 IP**：

   ```bash
   route -n get default 2>/dev/null || echo "没有默认路由"
   ```

   如果默认路由已经丢了，优先从 macOS 网络服务里读取 DHCP Router：

   ```bash
   networksetup -listallhardwareports
   networksetup -getinfo Wi-Fi
   ```

3. **手动恢复默认网关**：

   ```bash
   sudo route delete default 2>/dev/null || true
   sudo route add default 192.168.x.x   # 替换为 networksetup 输出的 Router
   ```

4. **关闭残留代理并刷新 DNS**：

   ```bash
   networksetup -setdnsservers Wi-Fi empty
   networksetup -setwebproxystate Wi-Fi off
   networksetup -setsecurewebproxystate Wi-Fi off
   networksetup -setsocksfirewallproxystate Wi-Fi off
   networksetup -setautoproxystate Wi-Fi off
   sudo dscacheutil -flushcache
   sudo killall -HUP mDNSResponder
   ```

## 长期解决方案

### 1. 调整 VPN 连接顺序

- 连接时：先连公司 VPN，再连 LetsVPN
- 断开时：先断 LetsVPN，再断公司 VPN

### 2. 关闭 LetsVPN 的 Kill Switch

在 LetsVPN 设置里关闭 Kill Switch，减少它对路由表的激进接管。

### 3. 使用自动恢复脚本

断开 VPN 后执行仓库里的恢复脚本：

**使用方法：**

```bash
chmod +x docs/fix-network.sh
docs/fix-network.sh
```

脚本会主动执行 `sudo -v` 获取管理员权限；如果没有输入密码，macOS 路由表无法被修改，残留 `utun*` 路由不会被删除。

脚本会做这些事：

- 只把物理网卡上的 IPv4 default 路由当成健康路由，忽略 `utun*`/`tun*`/`ppp*` 等 VPN 虚拟网卡
- 优先从 `networksetup -getinfo <服务名>` 或 DHCP 读取真实 Router，不再默认猜 `x.x.x.1`
- 删除异常 default 路由后重新添加真实默认网关
- 清理 LetsVPN 残留在 `utun*` 上的 IPv4 分片路由
- 关闭 LetsVPN 可能残留的 HTTP/HTTPS/SOCKS/自动代理
- 如果 DNS 仍指向 LetsVPN，恢复为自动获取 DNS
- 如果自动 DNS 仍然解析失败，临时切换到公共 DNS：`223.5.5.5`、`119.29.29.29`、`114.114.114.114`
- 如果最终测试仍失败，打印当时的出站路由、DNS 和 VPN 残留路由快照，避免重新开启 VPN 后现场被覆盖
- 刷新 DNS 缓存并执行网关、DNS、外网、HTTP 连通性测试

### 成功判断标准

脚本里会测试 ping，但最终判断网络是否恢复，应该以这些信号为主：

- `route -n get 114.114.114.114` 的接口是 `en0`，不是 `utun*`
- `networksetup -getdnsservers Wi-Fi` 不再是 LetsVPN 的 `26.26.26.53`，或者已切到公共 DNS
- `nslookup baidu.com` 成功
- `curl -I http://baidu.com` 成功

如果只有 `ping 114.114.114.114` 失败，但 DNS 和 HTTP 都成功，网络可以视为已恢复。ping 失败更可能是 ICMP 被路由器、公司网络、校园网或目标 DNS 服务屏蔽。

## 总结

核心就是：LetsVPN 断开后不能只看有没有 `default`，还要确认公共 IP 的真实出站路由没有走 `utun*`，并清掉残留代理、VPN DNS 和 DNS 缓存。本次最终验证表明，路由已经恢复正常，主要故障点是自动 DNS 不可用；切换到公共 DNS 后 DNS 和 HTTP 恢复，说明网络已恢复，ping 失败不应单独作为失败判据。
