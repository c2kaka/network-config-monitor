import { useState } from 'react';
import { Card, Tag, Badge, Button, Drawer, Typography, Segmented, Space } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import GUIDE from '../data/categoryGuide';

const { Text, Paragraph } = Typography;

const CATEGORY_META = {
  route: { label: '路由表', color: '#1890ff' },
  dns: { label: 'DNS 配置', color: '#52c41a' },
  adapter: { label: '网络适配器', color: '#722ed1' },
  proxy: { label: '系统代理', color: '#fa8c16' },
  firewall: { label: '防火墙规则', color: '#eb2f96' },
  hosts: { label: 'Hosts 文件', color: '#13c2c2' },
  arp_connection: { label: 'ARP / 连接', color: '#faad14' },
};

function CommandBlock({ items, title }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Text strong style={{ fontSize: 13 }}>{title}</Text>
      {items.map((item, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <code style={{
            display: 'block',
            background: '#f5f5f5',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'Consolas, Monaco, monospace',
            wordBreak: 'break-all',
          }}>
            {item.cmd}
          </code>
          <Text type="secondary" style={{ fontSize: 11, paddingLeft: 4 }}>{item.desc}</Text>
        </div>
      ))}
    </div>
  );
}

function CategoryGuideDrawer({ category, open, onClose }) {
  const guide = GUIDE[category];
  if (!guide) return null;

  const [platform, setPlatform] = useState('win32');
  const info = guide[platform];

  return (
    <Drawer
      title={`${guide.label} — 配置指南`}
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {guide.description}
      </Paragraph>

      <Segmented
        value={platform}
        onChange={setPlatform}
        options={[
          { label: 'Windows', value: 'win32' },
          { label: 'macOS', value: 'darwin' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f0f5ff', borderRadius: 6 }}>
        <Text strong style={{ fontSize: 12 }}>配置来源: </Text>
        <Text code style={{ fontSize: 12 }}>{info.source}</Text>
      </div>

      <CommandBlock items={info.view} title="查看配置" />
      <CommandBlock items={info.edit} title="修改配置" />

      {info.tips && (
        <div style={{ padding: '8px 12px', background: '#fffbe6', borderRadius: 6, borderLeft: '3px solid #faad14' }}>
          <Text strong style={{ fontSize: 12 }}>提示: </Text>
          <Text style={{ fontSize: 12 }}>{info.tips}</Text>
        </div>
      )}
    </Drawer>
  );
}

export default function CategoryCard({ category, changeCount, latestChanges = [] }) {
  const meta = CATEGORY_META[category] || { label: category, color: '#999' };
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <Badge count={changeCount} offset={[-8, 8]}>
        <Card size="small" style={{ minHeight: 120 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Tag color={meta.color}>{meta.label}</Tag>
            <Button
              type="text"
              size="small"
              icon={<QuestionCircleOutlined />}
              onClick={(e) => { e.stopPropagation(); setGuideOpen(true); }}
              style={{ color: '#999', fontSize: 14 }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {latestChanges.slice(0, 3).map((c, i) => (
              <div key={i} style={{
                padding: '2px 4px',
                borderRadius: 4,
                marginBottom: 2,
                background: c.change_type === 'added' ? '#f6ffed'
                  : c.change_type === 'removed' ? '#fff1f0' : '#fffbe6',
              }}>
                <span style={{ color: c.change_type === 'added' ? '#52c41a'
                  : c.change_type === 'removed' ? '#ff4d4f' : '#faad14' }}>
                  {c.change_type === 'added' ? '+' : c.change_type === 'removed' ? '-' : '~'}
                </span>
                {' '}
                <span style={{ wordBreak: 'break-all' }}>
                  {c.key.length > 50 ? c.key.substring(0, 50) + '...' : c.key}
                </span>
              </div>
            ))}
            {latestChanges.length === 0 && <span>暂无变化</span>}
          </div>
        </Card>
      </Badge>

      <CategoryGuideDrawer
        category={category}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
}
