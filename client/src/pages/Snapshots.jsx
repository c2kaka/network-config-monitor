import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Input, message, Typography, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, SwapOutlined } from '@ant-design/icons';
import { fetchSnapshots, createSnapshot, deleteSnapshot } from '../api';
import dayjs from 'dayjs';

const { Title } = Typography;

const CATEGORY_LABELS = {
  route: '路由', dns: 'DNS', adapter: '适配器', proxy: '代理',
  firewall: '防火墙', hosts: 'Hosts', arp_connection: 'ARP/连接',
};

export default function Snapshots() {
  const navigate = useNavigate();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState([]);

  const load = () => {
    setLoading(true);
    fetchSnapshots({ limit: 50 }).then(data => {
      setSnapshots(data);
    }).catch(err => message.error(err.message))
    .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = () => {
    createSnapshot(description).then(() => {
      message.success('快照已创建');
      setModalOpen(false);
      setDescription('');
      load();
    }).catch(err => message.error(err.message));
  };

  const handleDelete = (id) => {
    deleteSnapshot(id).then(() => {
      message.success('快照已删除');
      load();
    }).catch(err => message.error(err.message));
  };

  const handleCompare = () => {
    if (selected.length === 2) {
      navigate(`/diff/${selected[0]}/${selected[1]}`);
    }
  };

  const columns = [
    {
      title: '时间', dataIndex: 'timestamp', key: 'time',
      render: v => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    { title: '备注', dataIndex: 'description', key: 'desc' },
    ...Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
      title: label,
      key: key,
      render: (_, row) => row.itemCounts?.[key] || 0,
      width: 70,
    })),
    {
      title: '操作', key: 'actions',
      render: (_, row) => (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(row.id)}>
          删除
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>快照管理</Title>
        <Space>
          {selected.length === 2 && (
            <Button type="primary" icon={<SwapOutlined />} onClick={handleCompare}>
              对比选中快照
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建快照
          </Button>
        </Space>
      </div>

      <Table
        dataSource={snapshots}
        columns={columns}
        rowKey="id"
        loading={loading}
        rowSelection={{
          type: 'checkbox',
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys.slice(0, 2)),
        }}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="创建快照"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
      >
        <Input.TextArea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="快照备注，如 'VPN 开启前'"
          rows={3}
        />
      </Modal>
    </div>
  );
}
