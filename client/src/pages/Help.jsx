import { Typography, Table, Card } from 'antd';

const { Title, Paragraph, Text } = Typography;

export default function Help() {
  const commandColumns = [
    { title: '命令', dataIndex: 'cmd', key: 'cmd', render: c => <Text code>{c}</Text> },
    { title: '用途', dataIndex: 'desc', key: 'desc' },
  ];

  const commands = [
    { key: '1', cmd: 'scutil --proxy', desc: '查看系统代理设置' },
    { key: '2', cmd: 'scutil --dns', desc: '查看 DNS 配置' },
    { key: '3', cmd: 'netstat -rn', desc: '查看路由表' },
    { key: '4', cmd: 'nslookup <domain>', desc: '检查 DNS 解析' },
    { key: '5', cmd: 'networksetup -setwebproxystate Wi-Fi off', desc: '关闭 HTTP 代理' },
    { key: '6', cmd: 'networksetup -setsecurewebproxystate Wi-Fi off', desc: '关闭 HTTPS 代理' },
    { key: '7', cmd: 'networksetup -setdnsservers Wi-Fi 8.8.8.8', desc: '设置公共 DNS' },
    { key: '8', cmd: 'networksetup -setdnsservers Wi-Fi empty', desc: '恢复 DNS 为自动获取' },
    { key: '9', cmd: 'curl -v https://www.google.com', desc: '测试外网连通性' },
  ];

  const conflictColumns = [
    { title: '', dataIndex: 'label', key: 'label', width: 120 },
    { title: '公司 VPN', dataIndex: 'corp', key: 'corp' },
    { title: 'LetsVPN', dataIndex: 'lets', key: 'lets' },
  ];

  const conflictData = [
    { key: '1', label: '网关', corp: '内网网关（如 172.16.238.254）', lets: 'VPN 网关（如 26.26.26.1）' },
    { key: '2', label: '控制范围', corp: 'DNS 解析（指向内网 DNS 服务器）', lets: '路由表（覆盖几乎所有 IP 段）' },
    { key: '3', label: '路由范围', corp: '特定内网网段 + 少量外网 IP', lets: '全网段全覆盖' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <Title level={3}>VPN 冲突排查指南</Title>

      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>问题一：断开 VPN 后网络全部中断</Title>
        <Paragraph>
          LetsVPN 在连接时会设置系统 HTTP 代理指向本地代理进程。断开 VPN 后，如果代理设置没有被正确清理，
          所有 HTTP 请求仍会尝试走一个已经不存在的代理，导致网络完全不可用（包括 localhost）。
        </Paragraph>
        <Title level={5}>修复方法</Title>
        <Paragraph>
          <Text code>networksetup -setwebproxystate Wi-Fi off</Text><br />
          <Text code>networksetup -setsecurewebproxystate Wi-Fi off</Text>
        </Paragraph>
        <Paragraph type="secondary">
          验证：<Text code>scutil --proxy | grep -E "HTTPEnable|HTTPSEnable"</Text>
          应输出 HTTPEnable : 0 和 HTTPSEnable : 0
        </Paragraph>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>问题二：公司 VPN 与 LetsVPN 同时开启导致冲突</Title>
        <Paragraph>
          两个 VPN 同时连接时，会出现路由和 DNS 的冲突：
        </Paragraph>
        <Table
          columns={conflictColumns}
          dataSource={conflictData}
          pagination={false}
          size="small"
          bordered
          style={{ marginBottom: 16 }}
        />
        <Title level={5}>冲突原因</Title>
        <Paragraph>
          LetsVPN 接管了流量路由，但 DNS 仍被公司 VPN 控制。公司内网 DNS 对外部域名（如 google.com）
          返回被污染的 IP 地址，流量虽然走了 LetsVPN 隧道，但连接到了错误的目的地址。
        </Paragraph>
        <Title level={5}>解决方案</Title>
        <Paragraph>
          <strong>按需使用，避免两个 VPN 同时开启：</strong>
          <ul>
            <li>需要访问外网（Google 等）时：断开公司 VPN，仅连接 LetsVPN</li>
            <li>需要访问公司内网时：断开 LetsVPN，仅连接公司 VPN</li>
          </ul>
        </Paragraph>
        <Paragraph>
          如果确实需要同时使用，可以临时将 DNS 改为公共 DNS：<br />
          <Text code>networksetup -setdnsservers Wi-Fi 8.8.8.8 8.8.4.4</Text>
        </Paragraph>
      </Card>

      <Card>
        <Title level={4}>快速排查命令</Title>
        <Table
          columns={commandColumns}
          dataSource={commands}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
