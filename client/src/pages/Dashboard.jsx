import { useState, useEffect, useRef } from 'react';
import { Row, Col, Typography, Alert, Tabs } from 'antd';
import { fetchLatestChanges } from '../api';
import useWebSocket from '../hooks/useWebSocket';
import CategoryCard from '../components/CategoryCard';
import ChangeEvent from '../components/ChangeEvent';

const { Title, Text } = Typography;

const CATEGORIES = ['route', 'dns', 'adapter', 'proxy', 'firewall', 'hosts', 'arp_connection'];

const CATEGORY_LABELS = {
  route: '路由表',
  dns: 'DNS',
  adapter: '适配器',
  proxy: '代理',
  firewall: '防火墙',
  hosts: 'Hosts',
  arp_connection: 'ARP/连接',
};

export default function Dashboard() {
  const { connected, lastChange, status } = useWebSocket(
    `ws://${window.location.hostname}:3001/ws`
  );
  const [changes, setChanges] = useState([]);
  const [categoryChanges, setCategoryChanges] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState('');
  const changesEndRef = useRef(null);

  // Load initial data
  useEffect(() => {
    fetchLatestChanges(50).then(data => {
      setChanges(data.reverse());
      const grouped = {};
      for (const c of data) {
        if (!grouped[c.category]) grouped[c.category] = [];
        grouped[c.category].push(c);
      }
      setCategoryChanges(grouped);
    }).catch(() => {});
  }, []);

  // Handle real-time changes
  useEffect(() => {
    if (lastChange) {
      setChanges(prev => [...prev, lastChange]);
      setCategoryChanges(prev => ({
        ...prev,
        [lastChange.category]: [lastChange, ...(prev[lastChange.category] || [])].slice(0, 10),
      }));
      setTimeout(() => {
        changesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [lastChange]);

  const uptime = status?.startTime
    ? Math.floor((Date.now() - new Date(status.startTime).getTime()) / 1000)
    : 0;
  const uptimeStr = uptime > 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : uptime > 60
    ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
    : `${uptime}s`;

  const filtered = changes.slice(-100)
    .filter(c => !activeTab || c.category === activeTab);

  const tabItems = [
    {
      key: '',
      label: (
        <span>全部 <span style={{ color: '#999', fontSize: 12 }}>{changes.length}</span></span>
      ),
    },
    ...CATEGORIES.map(cat => ({
      key: cat,
      label: (
        <span>
          {CATEGORY_LABELS[cat]}{' '}
          <span style={{ color: '#999', fontSize: 12 }}>
            {(status?.changeCounts?.[cat]) || 0}
          </span>
        </span>
      ),
    })),
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Status Bar */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Title level={3} style={{ margin: 0 }}>实时监控</Title>
        {!connected && <Alert message="WebSocket 已断开" type="warning" showIcon style={{ padding: '2px 8px' }} />}
        {connected && <Alert message="已连接" type="success" showIcon style={{ padding: '2px 8px' }} />}
        <Text type="secondary">运行时长: {uptimeStr}</Text>
        <Text type="secondary">
          总变化数: {Object.values(status?.changeCounts || {}).reduce((a, b) => a + b, 0)}
        </Text>
      </div>

      {/* Category Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {CATEGORIES.map(cat => (
          <Col key={cat} xs={24} sm={12} md={8} lg={6} xl={3}>
            <CategoryCard
              category={cat}
              changeCount={(status?.changeCounts?.[cat]) || 0}
              latestChanges={(categoryChanges[cat] || []).slice(0, 3)}
            />
          </Col>
        ))}
      </Row>

      {/* Change Event Stream with Tabs */}
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="small"
          style={{ marginBottom: 8 }}
        />
        <div style={{ maxHeight: 440, overflowY: 'auto' }}>
          {filtered.map((change, i) => (
            <ChangeEvent
              key={`${change.timestamp}-${change.key}-${i}`}
              change={change}
              expanded={expandedId === `${change.timestamp}-${change.key}`}
              onToggle={() => setExpandedId(prev =>
                prev === `${change.timestamp}-${change.key}` ? null : `${change.timestamp}-${change.key}`
              )}
            />
          ))}
          {filtered.length === 0 && <Text type="secondary">等待变化...</Text>}
          <div ref={changesEndRef} />
        </div>
      </div>
    </div>
  );
}
