import { useState, useEffect } from 'react';
import { Typography, Select, Radio, Timeline as AntTimeline, Spin, Tag } from 'antd';
import { fetchChanges } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'route', label: '路由表' },
  { value: 'dns', label: 'DNS' },
  { value: 'adapter', label: '适配器' },
  { value: 'proxy', label: '代理' },
  { value: 'firewall', label: '防火墙' },
  { value: 'hosts', label: 'Hosts' },
  { value: 'arp_connection', label: 'ARP/连接' },
];

const TIME_RANGES = [
  { label: '最近 1 小时', hours: 1 },
  { label: '最近 6 小时', hours: 6 },
  { label: '最近 24 小时', hours: 24 },
  { label: '全部', hours: null },
];

const TYPE_COLORS = {
  added: 'green',
  removed: 'red',
  modified: 'gold',
};

const TYPE_LABELS = {
  added: '新增', removed: '删除', modified: '修改',
};

export default function Timeline() {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  const [timeRange, setTimeRange] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => {
    setLoading(true);
    const params = { limit: 500 };
    if (category) params.category = category;
    if (timeRange) {
      const from = new Date(Date.now() - timeRange * 3600000).toISOString();
      params.from = from;
    }
    fetchChanges(params)
      .then(data => setChanges(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [category, timeRange]);

  // Group by timestamp proximity (same minute)
  const grouped = [];
  let lastMinute = null;
  for (const change of changes) {
    const minute = dayjs(change.timestamp).format('YYYY-MM-DD HH:mm');
    if (minute !== lastMinute) {
      grouped.push({ minute, changes: [change] });
      lastMinute = minute;
    } else {
      grouped[grouped.length - 1].changes.push(change);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>历史时间线</Title>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Select
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
            style={{ width: 120 }}
          />
          <Radio.Group
            value={timeRange}
            onChange={e => setTimeRange(e.target.value)}
            optionType="button"
          >
            {TIME_RANGES.map(r => (
              <Radio.Button key={r.hours ?? 'all'} value={r.hours}>{r.label}</Radio.Button>
            ))}
          </Radio.Group>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : grouped.length === 0 ? (
        <Text type="secondary">暂无变化记录</Text>
      ) : (
        <AntTimeline
          items={grouped.map(group => ({
            color: 'blue',
            children: (
              <div key={group.minute}>
                <Text strong style={{ fontSize: 13 }}>{group.minute}</Text>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  {group.changes.length} 项变化
                </Text>
                <div style={{ marginTop: 4 }}>
                  {group.changes.map((change, i) => {
                    const id = `${change.timestamp}-${change.key}-${i}`;
                    const isExpanded = expandedId === id;
                    return (
                      <div
                        key={id}
                        onClick={() => setExpandedId(isExpanded ? null : id)}
                        style={{
                          padding: '4px 8px',
                          marginBottom: 2,
                          background: isExpanded ? '#fafafa' : 'transparent',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        <Tag color={TYPE_COLORS[change.change_type]} style={{ fontSize: 11 }}>
                          {TYPE_LABELS[change.change_type]}
                        </Tag>
                        <Tag style={{ fontSize: 11 }}>{change.category}</Tag>
                        <span style={{ wordBreak: 'break-all' }}>{change.key}</span>
                        {isExpanded && (
                          <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>
                            {change.old_value && (
                              <div style={{ color: '#ff4d4f', background: '#fff1f0', padding: '2px 6px', borderRadius: 3 }}>
                                - {change.old_value}
                              </div>
                            )}
                            {change.new_value && (
                              <div style={{ color: '#52c41a', background: '#f6ffed', padding: '2px 6px', borderRadius: 3, marginTop: 2 }}>
                                + {change.new_value}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
}
