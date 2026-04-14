# Network Config Monitor 实施计划

## Context

用户需要一个本地 Web 工具来观测 VPN/Clash 等代理软件对 Windows 网络配置的所有改动。设计文档已完成，项目为全新绿地项目（仅有 docs 目录和设计文档）。需要实现完整的前后端：Node.js + Express + SQLite + WebSocket 后端，React + Ant Design 前端。

## 分 6 个阶段实施，每个阶段可独立验证

### Phase 0: 项目脚手架

创建文件：
- `/package.json` — npm workspaces 根，含 `concurrently` 启动脚本
- `/server/package.json` — 依赖：express, better-sqlite3, ws, cors
- `/client/` — Vite + React + Ant Design 脚手架（vite.config.js 配置 `/api` 和 `/ws` 代理到 localhost:3001）
- `/client/src/App.jsx` — 基础路由框架

验证：`npm install` 成功，server 和 client 都能启动

### Phase 1: 后端核心 — 数据库 + 采集器框架 + 路由表采集器

- `/server/services/database.js` — SQLite 初始化（3 张表 + 索引），导出 prepared statements
- `/server/collectors/base.js` — BaseCollector 基类（collect() + diff() + poll()）
- `/server/collectors/route.js` — 第一个具体采集器，执行 `route print -4`
- `/server/index.js` — Express 入口 + 测试端点

验证：启动 server，调用测试端点能看到路由表变化

### Phase 2: 完整后端 — 全部 7 个采集器 + 轮询服务 + REST API + WebSocket

6 个新采集器：
- `/server/collectors/dns.js` — `ipconfig /all` + `netsh interface ip show dns` (5s)
- `/server/collectors/adapter.js` — `ipconfig /all` + `netsh interface show interface` (5s)
- `/server/collectors/proxy.js` — 读注册表 ProxyEnable/ProxyServer/AutoConfigURL (2s)
- `/server/collectors/firewall.js` — `netsh advfirewall firewall show rule name=all` (10s)
- `/server/collectors/hosts.js` — 读 hosts 文件 (5s)
- `/server/collectors/arp-connection.js` — `arp -a` + `netstat -ano` (5s)

服务层：
- `/server/services/polling.js` — 轮询调度，检测变化 → 写 DB → WebSocket 推送
- `/server/routes/snapshots.js` — 快照 CRUD + diff 对比
- `/server/routes/changes.js` — 变更历史查询
- `/server/routes/status.js` — 监控状态
- 更新 `/server/index.js` — 集成 WebSocket + PollingService + 挂载路由

验证：WebSocket 客户端能收到实时变化推送，REST API 可查询历史和创建快照

### Phase 3: 前端基础 — Shell + Dashboard 实时监控

- `/client/src/App.jsx` — Ant Design Layout + 4 页面路由
- `/client/src/api/index.js` — REST API 封装
- `/client/src/hooks/useWebSocket.js` — WebSocket hook（自动重连）
- `/client/src/pages/Dashboard.jsx` — 实时监控页
- `/client/src/components/CategoryCard.jsx` — 7 个分类卡片
- `/client/src/components/ChangeEvent.jsx` — 变更事件行（绿=新增/红=删除/黄=修改）

验证：打开 Dashboard 能看到实时配置变化

### Phase 4: 快照管理 + 对比视图

- `/client/src/pages/Snapshots.jsx` — 创建/列表/选择两个快照对比
- `/client/src/pages/DiffView.jsx` — 快照对比页，按类别 Tabs 分组
- `/client/src/components/DiffViewer.jsx` — Git Diff 样式组件（+绿/-红）

验证：创建 VPN 开启前后的快照，对比能正确显示差异

### Phase 5: 历史时间线

- `/client/src/pages/Timeline.jsx` — 时间线页，按类别筛选，按时间范围缩放
- `/client/src/components/TimelineChart.jsx` — Ant Design Timeline 渲染变更事件

验证：运行一段时间后，时间线页能展示历史变化并支持筛选

### Phase 6: 收尾

- 错误处理：采集器 try/catch、API 错误通知、WebSocket 断连提示
- 管理员权限检查
- 生产模式：Express 直接 serve client/dist
- 静态资源路径处理

## 关键架构决策

1. **Server CommonJS / Client ESM** — better-sqlite3 原生模块兼容性
2. **execSync 同步执行** — 轮询间隔已提供异步性，同步简化错误处理
3. **Map<string, string> diff** — key 唯一标识配置项，value 为序列化详情
4. **WebSocket 广播** — 无 per-client 状态，新客户端通过 REST 获取历史
5. **SQLite WAL 模式** — 优化并发读性能

## 验证方式

1. Phase 0-1: 命令行测试 API 端点
2. Phase 2: wscat 连接 WebSocket + curl 测试 REST
3. Phase 3+: 浏览器打开 http://localhost:5173，操作 VPN/Clash 观察实时变化
4. Phase 4: 创建快照 → 开/关 VPN → 创建快照 → 对比
