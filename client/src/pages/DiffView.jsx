import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Typography, Tabs, Spin, Tag } from 'antd';
import { fetchDiff } from '../api';
import DiffViewer from '../components/DiffViewer';

const { Title, Text } = Typography;

const CATEGORY_LABELS = {
  route: '路由表', dns: 'DNS 配置', adapter: '网络适配器', proxy: '系统代理',
  firewall: '防火墙规则', hosts: 'Hosts 文件', arp_connection: 'ARP / 连接',
};

export default function DiffView() {
  const { id1, id2 } = useParams();
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDiff(id1, id2)
      .then(data => setDiff(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [id1, id2]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!diff) return <div style={{ padding: 24 }}>加载失败</div>;

  const categories = Object.keys(diff.grouped);
  const tabItems = categories.map(cat => ({
    key: cat,
    label: (
      <span>
        {CATEGORY_LABELS[cat] || cat}
        <Tag color="blue" style={{ marginLeft: 4 }}>{diff.grouped[cat].length}</Tag>
      </span>
    ),
    children: <DiffViewer items={diff.grouped[cat]} />,
  }));

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        快照对比: #{id1} vs #{id2}
      </Title>
      <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        共 {diff.totalChanges} 处差异
      </Text>
      {categories.length > 0 ? (
        <Tabs items={tabItems} />
      ) : (
        <Text>两个快照完全相同，无差异</Text>
      )}
    </div>
  );
}
