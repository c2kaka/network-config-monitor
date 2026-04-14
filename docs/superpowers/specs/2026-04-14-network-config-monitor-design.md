# Network Config Monitor — 设计文档

## 概述

一个本地 Web 应用，用于观测 VPN/Clash 等代理软件开启或关闭时对 Windows 电脑网络配置的所有改动。支持实时监控（时间线）和快照对比两种模式。

## 技术栈

- **后端**: Node.js + Express
- **前端**: React + Ant Design
- **数据库**: SQLite (better-sqlite3)
- **实时通信**: WebSocket (ws)
- **运行权限**: 管理员

## 架构方案：轮询驱动

后端按配置周期轮询 Windows 系统命令采集网络配置，与上一次状态 diff，有变化则记录到 SQLite 并通过 WebSocket 推送到前端。

选择理由：实现简单可靠，所有配置类型统一处理，1-3 秒延迟对观测工具可接受。

## 数据采集模块

采集 7 类网络配置：

| 类别 | 采集方式 | 轮询周期 |
|------|---------|---------|
| 路由表 | `route print -4` | 3s |
| DNS 配置 | `ipconfig /all` + `netsh interface ip show dns` | 5s |
| 网络适配器 | `ipconfig /all` + `netsh interface show interface` | 5s |
| 系统代理 | 读取注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` (ProxyEnable, ProxyServer, AutoConfigURL) | 2s |
| 防火墙规则 | `netsh advfirewall firewall show rule name=all` | 10s |
| Hosts 文件 | 读取 `C:\Windows\System32\drivers\etc\hosts` | 5s |
| ARP 表 + 连接 | `arp -a` + `netstat -ano`（仅 LISTENING 和 ESTABLISHED 状态） | 5s |

Diff 机制：每次采集结果与上一次对比，只将有变化的条目（新增/删除/修改）记录到数据库。

## 数据存储设计（SQLite）

### snapshots 表

每次手动快照或检测到变化时创建。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| timestamp | TEXT | ISO 时间戳 |
| trigger_type | TEXT | `auto` 或 `manual` |
| description | TEXT | 快照备注（手动快照时填写） |

### config_items 表

存储某一时刻的完整配置快照。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| snapshot_id | INTEGER FK | 关联 snapshots 表 |
| category | TEXT | `route` / `dns` / `adapter` / `proxy` / `firewall` / `hosts` / `arp_connection` |
| key | TEXT | 配置项标识 |
| value | TEXT | 配置项值 |
| raw_output | TEXT | 原始命令输出（可选） |

### changes 表

记录配置变化，核心查询表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| timestamp | TEXT | ISO 时间戳 |
| category | TEXT | 配置类别 |
| key | TEXT | 变化的配置项标识 |
| change_type | TEXT | `added` / `removed` / `modified` |
| old_value | TEXT | 变化前的值 |
| new_value | TEXT | 变化后的值 |

## 后端架构

```
┌──────────────────────────────────────────┐
│              Express Server              │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Polling │ │  REST    │ │WebSocket │  │
│  │ Service │ │  API     │ │  Server  │  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘  │
│       │           │            │         │
│  ┌────▼───────────▼────────────▼─────┐   │
│  │         Data Layer                │   │
│  │  ┌──────────┐  ┌──────────────┐  │   │
│  │  │ Collector│  │   SQLite     │  │   │
│  │  │ Module   │  │ (better-     │  │   │
│  │  │ (7类采集)│  │  sqlite3)    │  │   │
│  │  └──────────┘  └──────────────┘  │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

### Collector Module

每个配置类别一个 Collector 类，职责：
1. 执行对应的 Windows 命令
2. 解析命令输出为结构化数据
3. 与上次采集结果 diff
4. 返回变化列表

### Polling Service

按配置周期调度各 Collector：
- 检测到变化 → 写入 changes 表 → 通过 WebSocket 推送前端
- 每次轮询结果缓存为"上一次状态"用于下次 diff

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/snapshots` | GET | 获取快照列表 |
| `/api/snapshots` | POST | 创建手动快照 |
| `/api/snapshots/:id` | DELETE | 删除快照 |
| `/api/snapshots/:id1/diff/:id2` | GET | 对比两个快照 |
| `/api/changes` | GET | 查询变化历史（支持类别/时间范围筛选） |
| `/api/changes/latest` | GET | 获取最近变化 |
| `/api/status` | GET | 当前监控状态和各类别概况 |

### WebSocket

连接时推送当前状态，之后实时推送 `change` 事件：
```json
{
  "type": "change",
  "data": {
    "timestamp": "2026-04-14T08:30:00.000Z",
    "category": "route",
    "key": "0.0.0.0/0 -> 10.0.0.1",
    "change_type": "modified",
    "old_value": "gateway: 192.168.1.1",
    "new_value": "gateway: 10.0.0.1"
  }
}
```

## 前端设计

React + Ant Design，4 个核心页面。

### 1. 实时监控 Dashboard

- 顶部状态栏：当前代理模式、最近变化计数、监控运行时长
- 7 个分类卡片：每个类别显示当前状态概要和最近变化数量
- 变化事件流：按时间倒序实时滚动显示所有配置变更（WebSocket 推送）
- 颜色编码：绿色=新增、红色=删除、黄色=修改

### 2. 快照管理

- 手动创建快照（可添加备注，如"VPN 开启前"、"Clash TUN 模式"）
- 快照列表：时间、备注、各类配置条目数
- 选择两个快照进行对比 → 跳转到对比页

### 3. 快照对比（Diff 视图）

- 左右分栏或统一 Diff 视图，展示两个快照间的差异
- 按类别分组（路由表/DNS/代理/...）
- 类似 Git Diff 样式：`-` 删除行红底，`+` 新增行绿底

### 4. 历史时间线

- 时间轴视图，展示配置变化的时间线
- 可按类别筛选
- 点击某个变化事件可展开查看详细 old/new 值
- 可缩放时间范围（最近 1h / 6h / 24h / 全部）

## 项目结构

```
vpn-study/
├── server/
│   ├── index.js                # 入口，启动 Express + WebSocket
│   ├── collectors/             # 7 个配置采集器
│   │   ├── base.js             # Collector 基类
│   │   ├── route.js            # 路由表采集
│   │   ├── dns.js              # DNS 配置采集
│   │   ├── adapter.js          # 网络适配器采集
│   │   ├── proxy.js            # 系统代理采集
│   │   ├── firewall.js         # 防火墙规则采集
│   │   ├── hosts.js            # Hosts 文件采集
│   │   └── arp-connection.js   # ARP + 连接采集
│   ├── services/
│   │   ├── polling.js          # 轮询调度服务
│   │   └── database.js         # SQLite 数据库操作
│   └── routes/
│       ├── snapshots.js        # 快照 API
│       ├── changes.js          # 变更历史 API
│       └── status.js           # 状态 API
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx   # 实时监控
│   │   │   ├── Snapshots.jsx   # 快照管理
│   │   │   ├── DiffView.jsx    # 快照对比
│   │   │   └── Timeline.jsx    # 历史时间线
│   │   ├── components/
│   │   │   ├── CategoryCard.jsx
│   │   │   ├── ChangeEvent.jsx
│   │   │   ├── DiffViewer.jsx
│   │   │   └── TimelineChart.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   └── api/
│   │       └── index.js
│   └── package.json
├── package.json
└── README.md
```
