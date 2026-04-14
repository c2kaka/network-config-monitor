export default function DiffViewer({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          {item.change_type === 'added' && (
            <div style={{ background: '#f6ffed', padding: '4px 8px', borderRadius: 3, borderLeft: '3px solid #52c41a' }}>
              <span style={{ color: '#52c41a', fontWeight: 'bold' }}>+ </span>
              <span style={{ color: '#666' }}>{item.key}</span>
              <div style={{ color: '#52c41a', marginTop: 2, paddingLeft: 16, wordBreak: 'break-all' }}>
                {item.new_value}
              </div>
            </div>
          )}
          {item.change_type === 'removed' && (
            <div style={{ background: '#fff1f0', padding: '4px 8px', borderRadius: 3, borderLeft: '3px solid #ff4d4f' }}>
              <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>- </span>
              <span style={{ color: '#666' }}>{item.key}</span>
              <div style={{ color: '#ff4d4f', marginTop: 2, paddingLeft: 16, wordBreak: 'break-all' }}>
                {item.old_value}
              </div>
            </div>
          )}
          {item.change_type === 'modified' && (
            <div style={{ background: '#fffbe6', padding: '4px 8px', borderRadius: 3, borderLeft: '3px solid #faad14' }}>
              <span style={{ color: '#faad14', fontWeight: 'bold' }}>~ </span>
              <span style={{ color: '#666' }}>{item.key}</span>
              <div style={{ marginTop: 2, paddingLeft: 16 }}>
                <div style={{ color: '#ff4d4f', background: '#fff1f0', padding: '2px 6px', borderRadius: 2, wordBreak: 'break-all' }}>
                  - {item.old_value}
                </div>
                <div style={{ color: '#52c41a', background: '#f6ffed', padding: '2px 6px', borderRadius: 2, marginTop: 2, wordBreak: 'break-all' }}>
                  + {item.new_value}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
