import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';

import Dashboard from './pages/Dashboard';
import Snapshots from './pages/Snapshots';
import DiffView from './pages/DiffView';
import Timeline from './pages/Timeline';
import Help from './pages/Help';

const { Header, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '实时监控' },
  { key: '/snapshots', icon: <CameraOutlined />, label: '快照管理' },
  { key: '/timeline', icon: <ClockCircleOutlined />, label: '历史时间线' },
  { key: '/help', icon: <QuestionCircleOutlined />, label: '帮助' },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginRight: 40, whiteSpace: 'nowrap' }}>
          Network Config Monitor
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Header>
      <Content>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/snapshots" element={<Snapshots />} />
          <Route path="/diff/:id1/:id2" element={<DiffView />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Content>
    </Layout>
  );
}
