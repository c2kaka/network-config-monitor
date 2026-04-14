import { Tag } from 'antd';
import dayjs from 'dayjs';

const TYPE_STYLES = {
  added: { bg: '#f6ffed', border: '#b7eb8f', color: '#52c41a', label: '新增' },
  removed: { bg: '#fff1f0', border: '#ffa39e', color: '#ff4d4f', label: '删除' },
  modified: { bg: '#fffbe6', border: '#ffe58f', color: '#faad14', label: '修改' },
};

const CATEGORY_COLORS = {
  route: '#1890ff', dns: '#52c41a', adapter: '#722ed1',
  proxy: '#fa8c16', firewall: '#eb2f96', hosts: '#13c2c2', arp_connection: '#faad14',
};

export default function ChangeEvent({ change, expanded, onToggle }) {
  const style = TYPE_STYLES[change.change_type] || TYPE_STYLES.modified;
  const catColor = CATEGORY_COLORS[change.category] || '#999';

  return (
    <div
      onClick={onToggle}
      style={{
        padding: '8px 12px',
        marginBottom: 4,
        background: style.bg,
        borderLeft: `3px solid ${style.color}`,
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#999', fontSize: 12 }}>
          {dayjs(change.timestamp).format('HH:mm:ss')}
        </span>
        <Tag color={catColor} style={{ margin: 0, fontSize: 11 }}>
          {change.category}
        </Tag>
        <span style={{ color: style.color, fontWeight: 'bold' }}>
          {style.label}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {change.key}
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
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
}
