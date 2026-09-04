import React, { useEffect, useState } from 'react';
import { AdminStats, OrderAnalytics, Order, OrderStatus, Item } from '../types';
import { getAdminStats, getOrderAnalytics, getValidOrders, getItems } from '../services/api';
import { TrendingUp, Users, ShoppingCart, AlertCircle, DollarSign, Activity, Package, ArrowUpRight, Calendar, X, BarChart3, PackageCheck, ExternalLink, Eye, Edit } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import SpectralBackdrop from './brand/SpectralBackdrop';
import SpectralState from './brand/SpectralState';
import SystemStatus, { deriveSystemStatus } from './brand/SystemStatus';

// 状态徽章组件
const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const styles = {
    processing: 'bg-[rgba(200,162,92,0.14)] text-[var(--status-warning)]',
    pending_ship: 'bg-[var(--accent-wash)] text-[var(--accent-bright)]',
    shipped: 'bg-[rgba(32,208,202,0.1)] text-[var(--accent-soft)]',
    completed: 'bg-[rgba(85,184,156,0.14)] text-[var(--status-success)]',
    cancelled: 'bg-[rgba(145,167,167,0.1)] text-[var(--text-muted)]',
    refunding: 'bg-[rgba(198,106,82,0.14)] text-[var(--status-danger)]',
  };

  const labels = {
    processing: '处理中',
    pending_ship: '待发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
  };

  return (
    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${styles[status] || styles.cancelled}`}>
      {labels[status] || status}
    </span>
  );
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ElementType; colorClass: string; trend?: string }> = ({ title, value, icon: Icon, colorClass, trend }) => (
  <div className="ios-card p-5 flex flex-col justify-between hover:translate-y-[-1px] transition duration-300 h-full relative overflow-hidden group">
    <div className={`absolute -right-8 -top-8 w-28 h-28 ${colorClass} opacity-[0.06] rounded-full group-hover:scale-110 transition-transform duration-500 blur-2xl`}></div>
    <div className="flex justify-between items-start mb-6">
      <div className="p-3 rounded-xl bg-[var(--accent-wash)] backdrop-blur-sm">
        <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
      {trend && <span className="text-xs font-semibold text-[var(--accent-bright)] bg-[var(--accent-wash)] px-2.5 py-1 rounded-md flex items-center gap-1">
        <TrendingUp className="w-3 h-3" /> {trend}
      </span>}
    </div>
    <div className="relative z-10">
      <h3 className="text-[2rem] leading-none font-extrabold text-[var(--text-primary)] tracking-tight font-feature-settings-tnum">{value}</h3>
      <p className="text-[var(--text-secondary)] text-xs font-medium mt-2 tracking-wide">{title}</p>
    </div>
  </div>
);

type TimeRange = 'today' | 'yesterday' | '3days' | '7days' | '30days' | 'custom';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<OrderAnalytics | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [previousAnalytics, setPreviousAnalytics] = useState<OrderAnalytics | null>(null); // 用于计算趋势

  // 搜索词
  const [searchTerm, setSearchTerm] = useState('');
  // 参与统计的订单列表
  const [validOrders, setValidOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  // 商品列表
  const [items, setItems] = useState<Item[]>([]);
  const [itemNames, setItemNames] = useState<Record<string, string>>({});

  // 颜色配置
  const COLORS = ['var(--accent)', 'var(--accent-soft)', 'var(--text-muted)', 'var(--status-success)', 'var(--accent-bright)'];

  const loadAnalytics = (range: TimeRange) => {
    // 使用本地时间而不是UTC时间
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    let params: { start_date: string; end_date: string };

    switch (range) {
      case 'today':
        // 今天：从今天00:00:00到今天23:59:59
        params = {
          start_date: todayStr,
          end_date: todayStr
        };
        break;
      case 'yesterday':
        // 昨天：从昨天00:00:00到昨天23:59:59
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterday.getDate()).padStart(2, '0');
        const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;
        params = {
          start_date: yesterdayStr,
          end_date: yesterdayStr
        };
        break;
      case '3days':
        // 3天：从3天前到今天
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const tdYear = threeDaysAgo.getFullYear();
        const tdMonth = String(threeDaysAgo.getMonth() + 1).padStart(2, '0');
        const tdDay = String(threeDaysAgo.getDate()).padStart(2, '0');
        params = {
          start_date: `${tdYear}-${tdMonth}-${tdDay}`,
          end_date: todayStr
        };
        break;
      case '7days':
        // 7天：从7天前到今天
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sdYear = sevenDaysAgo.getFullYear();
        const sdMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const sdDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        params = {
          start_date: `${sdYear}-${sdMonth}-${sdDay}`,
          end_date: todayStr
        };
        break;
      case '30days':
        // 30天：从30天前到今天
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const tdYear2 = thirtyDaysAgo.getFullYear();
        const tdMonth2 = String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0');
        const tdDay2 = String(thirtyDaysAgo.getDate()).padStart(2, '0');
        params = {
          start_date: `${tdYear2}-${tdMonth2}-${tdDay2}`,
          end_date: todayStr
        };
        break;
      case 'custom':
        // 自定义范围
        if (customStartDate && customEndDate) {
          params = {
            start_date: customStartDate,
            end_date: customEndDate
          };
        } else {
          // 默认7天
          const defaultDaysAgo = new Date(now);
          defaultDaysAgo.setDate(defaultDaysAgo.getDate() - 7);
          const ddYear = defaultDaysAgo.getFullYear();
          const ddMonth = String(defaultDaysAgo.getMonth() + 1).padStart(2, '0');
          const ddDay = String(defaultDaysAgo.getDate()).padStart(2, '0');
          params = {
            start_date: `${ddYear}-${ddMonth}-${ddDay}`,
            end_date: todayStr
          };
        }
        break;
      default:
        // 默认7天
        const defaultStart = new Date(now);
        defaultStart.setDate(defaultStart.getDate() - 7);
        const dsYear = defaultStart.getFullYear();
        const dsMonth = String(defaultStart.getMonth() + 1).padStart(2, '0');
        const dsDay = String(defaultStart.getDate()).padStart(2, '0');
        params = {
          start_date: `${dsYear}-${dsMonth}-${dsDay}`,
          end_date: todayStr
        };
    }

    // 同时获取上一个周期的数据用于趋势对比
    const previousParams = getPreviousPeriodParams(range, now);
    if (previousParams) {
      getOrderAnalytics(previousParams).then(setPreviousAnalytics).catch(console.error);
    }

    getOrderAnalytics(params).then(setAnalytics).catch(console.error);
  };

  // 获取上一个时间段的参数
  const getPreviousPeriodParams = (range: TimeRange, now: Date) => {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    switch (range) {
      case 'today':
        // 今天对比昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterday.getDate()).padStart(2, '0');
        return {
          start_date: `${yYear}-${yMonth}-${yDay}`,
          end_date: `${yYear}-${yMonth}-${yDay}`
        };
      case 'yesterday':
        // 昨天对比前天
        const dayBefore = new Date(now);
        dayBefore.setDate(dayBefore.getDate() - 2);
        const dbYear = dayBefore.getFullYear();
        const dbMonth = String(dayBefore.getMonth() + 1).padStart(2, '0');
        const dbDay = String(dayBefore.getDate()).padStart(2, '0');
        return {
          start_date: `${dbYear}-${dbMonth}-${dbDay}`,
          end_date: `${dbYear}-${dbMonth}-${dbDay}`
        };
      case '7days':
        // 7天对比上一个7天
        const prev7DaysEnd = new Date(now);
        prev7DaysEnd.setDate(prev7DaysEnd.getDate() - 7);
        const prev7DaysStart = new Date(prev7DaysEnd);
        prev7DaysStart.setDate(prev7DaysStart.getDate() - 7);
        return {
          start_date: `${prev7DaysStart.getFullYear()}-${String(prev7DaysStart.getMonth() + 1).padStart(2, '0')}-${String(prev7DaysStart.getDate()).padStart(2, '0')}`,
          end_date: `${prev7DaysEnd.getFullYear()}-${String(prev7DaysEnd.getMonth() + 1).padStart(2, '0')}-${String(prev7DaysEnd.getDate()).padStart(2, '0')}`
        };
      case '30days':
        // 30天对比上一个30天
        const prev30DaysEnd = new Date(now);
        prev30DaysEnd.setDate(prev30DaysEnd.getDate() - 30);
        const prev30DaysStart = new Date(prev30DaysEnd);
        prev30DaysStart.setDate(prev30DaysStart.getDate() - 30);
        return {
          start_date: `${prev30DaysStart.getFullYear()}-${String(prev30DaysStart.getMonth() + 1).padStart(2, '0')}-${String(prev30DaysStart.getDate()).padStart(2, '0')}`,
          end_date: `${prev30DaysEnd.getFullYear()}-${String(prev30DaysEnd.getMonth() + 1).padStart(2, '0')}-${String(prev30DaysEnd.getDate()).padStart(2, '0')}`
        };
      default:
        return null;
    }
  };

  // 计算趋势百分比
  const getTrendPercent = () => {
    if (!analytics || !previousAnalytics) return null;

    const currentAmount = analytics.revenue_stats.total_amount;
    const previousAmount = previousAnalytics.revenue_stats.total_amount;

    if (previousAmount === 0) {
      return currentAmount > 0 ? '+100%' : '0%';
    }

    const percent = ((currentAmount - previousAmount) / previousAmount) * 100;
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(1)}%`;
  };

  useEffect(() => {
    getAdminStats().then(setStats).catch(console.error);
    loadAnalytics(timeRange);
    // 获取商品列表
    getItems().then(items => {
      setItems(items);
      // 建立 item_id 到 item_title 的映射
      const nameMap: Record<string, string> = {};
      items.forEach(item => {
        nameMap[item.item_id] = item.item_title || item.item_id;
      });
      setItemNames(nameMap);
    }).catch(console.error);
  }, [timeRange]);

  // 加载订单列表
  useEffect(() => {
    const { startDate, endDate } = getDatesForRange(timeRange);

    // 获取参与统计的订单列表
    setOrdersLoading(true);
    getValidOrders({ start_date: startDate, end_date: endDate })
      .then(orders => {
        setValidOrders(orders);
      })
      .catch(console.error)
      .finally(() => setOrdersLoading(false));
  }, [timeRange]);

  // 辅助函数：获取时间范围的日期
  const getDatesForRange = (range: TimeRange) => {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    let startDate = endDate;

    if (range === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      startDate = sevenDaysAgo.toISOString().split('T')[0];
    } else if (range === '30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDate = thirtyDaysAgo.toISOString().split('T')[0];
    }
    // 其他范围类似处理...

    return { startDate, endDate };
  };

  const systemStatus = deriveSystemStatus({
    loading: !stats || !analytics,
    error: false,
    accountCount: stats?.total_cookies,
  });

  if (!stats || !analytics) {
    return <SpectralState state="loading" type="chart" title="正在加载运营数据…" description="正在读取店铺统计与趋势信息" />;
  }

  const chartData = analytics.daily_stats?.map(d => ({
      name: d.date.slice(5), // MM-DD
      amount: d.amount,
      orders: d.order_count,
      avgAmount: d.order_count > 0 ? (d.amount / d.order_count).toFixed(2) : 0
  })) || [];

  // 计算图表数据（在渲染时直接计算）
  const itemStats = analytics.item_stats || [];
  const totalOrders = analytics.revenue_stats.total_orders || 0;
  const totalAmount = analytics.revenue_stats.total_amount || 0;

  // 1. 商品销量排行：按订单数量排序
  const productSalesData = itemStats.length > 0 ? itemStats
    .map(item => ({
      name: (itemNames[item.item_id] || item.item_id).length > 12
        ? (itemNames[item.item_id] || item.item_id).substring(0, 12) + '...'
        : (itemNames[item.item_id] || item.item_id),
      sales: item.order_count
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10) : [];

  // 2. 商品下单占比：每个商品的订单数占总订单数的百分比
  const sourceDataData = itemStats.length > 0 ? itemStats
    .map(item => ({
      name: (itemNames[item.item_id] || item.item_id).length > 10
        ? (itemNames[item.item_id] || item.item_id).substring(0, 10) + '...'
        : (itemNames[item.item_id] || item.item_id),
      value: item.order_count,
      percent: totalOrders > 0 ? (item.order_count / totalOrders) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((item, index) => ({
      ...item,
      color: COLORS[index % COLORS.length]
    })) : [];

  // 3. 商品金额分析：按金额排序，取前5
  const categoryDataData = itemStats.length > 0 ? itemStats
    .map(item => ({
      name: (itemNames[item.item_id] || item.item_id).length > 12
        ? (itemNames[item.item_id] || item.item_id).substring(0, 12) + '...'
        : (itemNames[item.item_id] || item.item_id),
      value: item.total_amount,
      orderCount: item.order_count,
      percentage: totalAmount > 0
        ? (item.total_amount / totalAmount) * 100
        : 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      color: COLORS[index % COLORS.length],
      percentage: item.percentage.toFixed(1)
    })) : [];

  const timeRangeOptions = [
    { key: 'today' as TimeRange, label: '今天' },
    { key: 'yesterday' as TimeRange, label: '昨天' },
    { key: '3days' as TimeRange, label: '三天内' },
    { key: '7days' as TimeRange, label: '7天内' },
    { key: '30days' as TimeRange, label: '一个月内' },
    { key: 'custom' as TimeRange, label: '自定义' },
  ];

  return (
    <div className="relative isolate space-y-7 animate-fade-in">
      <SpectralBackdrop />
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.24em] text-[var(--text-muted)] mb-2">OPERATIONS OVERVIEW</p>
          <h2 className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">运营概览</h2>
          <p className="text-[var(--text-secondary)] mt-2 text-sm">欢迎回来，以下是 seshi 店铺的实时经营数据。</p>
        </div>
        <div className="flex items-center gap-3">
          <SystemStatus status={systemStatus} accountCount={stats.total_cookies} />
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-[var(--surface-secondary)]/70 border border-[var(--border-subtle)] rounded-xl">
        {timeRangeOptions.map((option) => (
          <button
            key={option.key}
            onClick={() => setTimeRange(option.key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${
              timeRange === option.key
                ? 'bg-[var(--accent-wash)] text-[var(--accent-bright)] border border-[var(--border-active)]'
                : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {option.label}
          </button>
        ))}
        {timeRange === 'custom' && (
          <>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="ios-input px-3 py-2 rounded-lg text-sm focus:outline-none"
            />
            <span className="self-center text-[var(--text-muted)]">-</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="ios-input px-3 py-2 rounded-lg text-sm focus:outline-none"
            />
            <button
              onClick={() => loadAnalytics('custom')}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--text-primary)] text-[var(--bg-app)] hover:bg-[var(--accent-bright)] transition-colors"
            >
              应用
            </button>
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="累计营收 (CNY)"
          value={`¥${analytics.revenue_stats.total_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          colorClass="bg-[var(--accent)]"
          trend={getTrendPercent() || undefined}
        />
        <StatCard
          title="活跃账号 / 总数"
          value={`${stats.active_cookies} / ${stats.total_cookies}`}
          icon={Users}
          colorClass="bg-[var(--accent-soft)]"
        />
        <StatCard
          title="订单数"
          value={analytics.revenue_stats.total_orders.toLocaleString()}
          icon={ShoppingCart}
          colorClass="bg-[var(--accent)]"
        />
        <StatCard
          title="库存卡密余量"
          value={stats.total_cards}
          icon={Package}
          colorClass="bg-[var(--accent-soft)]"
        />
      </div>

      {/* Main Chart Section */}
      <div className="ios-card p-8 rounded-[2rem]">
        <div className="mb-10">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">营收趋势分析</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">最近7天的销售额走势</p>
        </div>
        <div className="h-[350px] w-full">
          {chartData.length === 0 || analytics.revenue_stats.total_amount === 0 ? (
            <SpectralState
              state="empty"
              type="chart"
              title="暂无趋势数据"
              description="当前时间范围内没有可展示的成交数据"
              compact
              className="h-full"
            />
          ) : chartData.length <= 2 ? (
            // 数据点少于等于2个时使用美化柱状图
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 30, right: 20, left: -20, bottom: 30 }} barCategoryGap={30}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: 'var(--text-secondary)', fontSize: 13, fontWeight: 600}}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: 'var(--text-muted)', fontSize: 12, fontWeight: 500}}
                  tickFormatter={(value) => `¥${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(7, 20, 24, 0.96)',
                    borderRadius: '9px',
                    border: '1px solid rgba(99, 232, 221, 0.15)',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)',
                    padding: '12px 16px'
                  }}
                  itemStyle={{ color: 'var(--accent-bright)', fontWeight: 600 }}
                  formatter={(value) => {
                    const num = Number(value);
                    return `营收: ¥${num.toFixed(2)}`;
                  }}
                />
                <Bar
                  dataKey="amount"
                  fill="var(--accent)"
                  radius={[8, 8, 0, 0]}
                  stroke="none"
                  strokeWidth={0}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['var(--accent)', 'var(--accent-soft)', 'var(--accent-bright)'][index % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            // 数据点多于2个时使用折线图
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.32}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: 'var(--text-muted)', fontSize: 12, fontWeight: 500}}
                  dy={15}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: 'var(--text-muted)', fontSize: 12, fontWeight: 500}}
                />
                <CartesianGrid vertical={false} stroke="rgba(145,167,167,0.08)" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{ background: 'rgba(7,20,24,0.96)', borderRadius: '9px', border: '1px solid rgba(99,232,221,0.15)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}
                  itemStyle={{ color: 'var(--accent-bright)', fontWeight: 600 }}
                  labelStyle={{ color: 'var(--text-muted)' }}
                  cursor={{ stroke: 'var(--accent-soft)', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="amount" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" activeDot={{ r: 6, fill: 'var(--surface-raised)', stroke: 'var(--accent-bright)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 商品销量排行和订单来源分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 商品销量排行 */}
        <div className="ios-card p-6">
          <h3 className="font-bold text-base text-[var(--text-primary)] mb-6">商品销量排行</h3>
          <div className="h-[280px]">
            {productSalesData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)]">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productSalesData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(145,167,167,0.08)" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(7,20,24,0.96)',
                      border: '1px solid rgba(99,232,221,0.15)',
                      borderRadius: '9px',
                      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)'
                    }}
                  />
                  <Bar dataKey="sales" fill="var(--accent-soft)" radius={[0, 7, 7, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 商品下单占比 */}
        <div className="ios-card p-6">
          <h3 className="font-bold text-base text-[var(--text-primary)] mb-6">商品下单占比</h3>
          <div className="h-[280px]">
            {sourceDataData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)]">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceDataData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {sourceDataData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 收支明细和品类营收 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 参与统计的订单列表 */}
        <div className="lg:col-span-2 ios-card p-0 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface-secondary)]">
            <h3 className="font-bold text-base text-[var(--text-primary)]">参与统计的订单</h3>
            <div className="relative">
              <input
                placeholder="搜索订单号/商品/买家..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ios-input pl-4 pr-4 py-2 rounded-lg text-sm outline-none w-48"
                type="text"
              />
            </div>
          </div>
          <div className="overflow-x-auto flex-1 max-h-[400px]">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
                <Activity className="w-6 h-6 animate-spin mr-2" />
                加载中...
              </div>
            ) : validOrders.filter((order) =>
              order.order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              order.item_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              order.buyer_id?.toLowerCase().includes(searchTerm.toLowerCase())
            ).length === 0 ? (
              <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
                暂无订单数据
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-primary)] text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider border-b border-[var(--border-subtle)]">
                    <th className="px-6 py-4">订单信息</th>
                    <th className="px-6 py-4">买家信息</th>
                    <th className="px-6 py-4">金额</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {validOrders
                    .filter((order) =>
                      order.order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      order.item_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      order.buyer_id?.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((order) => (
                      <tr key={order.order_id} className="hover:bg-[var(--surface-hover)] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[var(--surface-secondary)] overflow-hidden border border-[var(--border-subtle)] flex-shrink-0">
                              <PackageCheck className="w-full h-full text-[var(--text-muted)] p-2" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[var(--text-primary)] text-sm line-clamp-1">
                                {order.item_title || order.item_id || '未知商品'}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">{order.order_id}</div>
                              <div className="text-xs text-[var(--text-muted)] mt-0.5">数量: {order.quantity || 1}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-[var(--text-secondary)]">{order.buyer_id}</div>
                          {order.created_at && (
                            <div className="text-xs text-[var(--text-muted)] mt-1">{order.created_at}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-base font-extrabold text-[var(--text-primary)] font-feature-settings-tnum">
                          ¥{order.amount || '0.00'}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={order.status || order.order_status || 'unknown'} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a
                            href={`https://www.goofish.com/order-detail?orderId=${order.order_id}&role=seller`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex text-[var(--text-muted)] hover:text-[var(--accent-bright)] p-2 rounded-lg hover:bg-[var(--accent-wash)] transition-colors"
                            title="查看订单详情"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 商品金额分析 */}
        <div className="ios-card p-6">
          <h3 className="font-bold text-base text-[var(--text-primary)] mb-6">商品金额分析 (TOP5)</h3>
          {categoryDataData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-[var(--text-muted)]">暂无数据</div>
          ) : (
            <>
              <div className="h-[300px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDataData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryDataData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(7,20,24,0.96)',
                        border: '1px solid rgba(99,232,221,0.15)',
                        borderRadius: '9px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
                      }}
                      formatter={(value: number) => `¥${value.toLocaleString()}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-4">
                {categoryDataData.map((cat) => (
                  <div key={cat.name} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color || COLORS[categoryDataData.indexOf(cat) % COLORS.length] }}
                      ></div>
                      <span className="text-[var(--text-secondary)] font-medium">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-[var(--text-primary)]">¥{cat.value.toLocaleString()}</span>
                      <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-secondary)] px-2 py-0.5 rounded">{cat.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
