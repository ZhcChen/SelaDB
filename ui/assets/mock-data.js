/**
 * SelaDB 设计源假数据
 * ---------------------------------------------------------------
 * 纯静态 mock 数据,供 HTML/CSS/JS 设计源渲染对象树、数据网格、
 * 文档树与键值列表。数据全部为演示用,与任何真实数据库无关。
 *
 * 约定:
 * - 引擎元数据见 ENGINES;连接与原生层级树见 CONNECTIONS。
 * - 树节点的 dataKey 指向 TABLE_DATA / DOCUMENTS / KEYS 中的键。
 * - 图标只给字符串 key,由渲染层映射为图形,不使用 emoji。
 */

/** 六种引擎的元数据 */
export const ENGINES = {
  postgresql: { id: 'postgresql', label: 'PostgreSQL', color: '#336791', defaultPort: 5432, group: '关系型', driver: 'PostgreSQL' },
  mysql: { id: 'mysql', label: 'MySQL / MariaDB', color: '#00758f', defaultPort: 3306, group: '关系型', driver: 'MySQL' },
  sqlite: { id: 'sqlite', label: 'SQLite', color: '#3b7ea1', defaultPort: 0, group: '关系型', driver: 'SQLite' },
  sqlserver: { id: 'sqlserver', label: 'SQL Server', color: '#cc2927', defaultPort: 1433, group: '关系型', driver: 'SQL Server' },
  mongodb: { id: 'mongodb', label: 'MongoDB', color: '#13aa52', defaultPort: 27017, group: 'NoSQL', driver: 'MongoDB' },
  redis: { id: 'redis', label: 'Redis', color: '#d82c20', defaultPort: 6379, group: 'NoSQL', driver: 'Redis' },
};

/**
 * 已打开的连接及其原生对象层级树。
 *
 * 各引擎保留自己的层级,不跨引擎压平:
 * - PostgreSQL:连接 → database → schema → 表/视图/函数/序列
 * - MySQL:     连接 → database → 表/视图/存储过程/事件
 * - MongoDB:   连接 → database → 集合/索引
 * - Redis:     连接 → 编号库 → 按类型分组 → 键
 */
export const CONNECTIONS = [
  {
    id: 'pg-local',
    engine: 'postgresql',
    label: 'PostgreSQL — 本地',
    subtitle: '127.0.0.1:5432',
    status: 'connected',
    latencyMs: 8,
    charset: 'UTF-8',
    transaction: 'auto',
    tree: {
      id: 'pg-local',
      label: 'PostgreSQL — 本地',
      kind: 'connection',
      icon: 'postgresql',
      actions: ['打开连接', '断开连接', '编辑连接', '复制连接信息'],
      children: [
        {
          id: 'pg-local/postgres',
          label: 'postgres',
          kind: 'database',
          icon: 'database',
          actions: ['刷新', '新建表', '新建视图', '删除数据库'],
          children: [
            {
              id: 'pg-local/postgres/public',
              label: 'public',
              kind: 'schema',
              icon: 'schema',
              actions: ['刷新', '新建表', '新建视图', '新建函数'],
              children: [
                { id: 'pg-local/postgres/public/users', label: 'users', kind: 'table', icon: 'table', count: 1284, dataKey: 'pg-local/postgres/public/users', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
                { id: 'pg-local/postgres/public/orders', label: 'orders', kind: 'table', icon: 'table', count: 5321, dataKey: 'pg-local/postgres/public/orders', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
                { id: 'pg-local/postgres/public/user_sessions', label: 'user_sessions', kind: 'table', icon: 'table', count: 8942, dataKey: 'pg-local/postgres/public/user_sessions', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
                { id: 'pg-local/postgres/public/v_active_users', label: 'v_active_users', kind: 'view', icon: 'view', count: 1103, dataKey: 'pg-local/postgres/public/v_active_users', actions: ['打开数据', '查看定义', '生成 DDL', '复制名称'] },
              ],
            },
            {
              id: 'pg-local/postgres/analytics',
              label: 'analytics',
              kind: 'schema',
              icon: 'schema',
              actions: ['刷新', '新建表', '新建视图', '新建函数'],
              children: [
                { id: 'pg-local/postgres/analytics/daily_revenue', label: 'daily_revenue', kind: 'view', icon: 'view', count: 365, dataKey: 'pg-local/postgres/analytics/daily_revenue', actions: ['打开数据', '查看定义', '生成 DDL', '复制名称'] },
              ],
            },
            {
              id: 'pg-local/postgres/group/tables',
              label: '表',
              kind: 'group',
              icon: 'group',
              count: 246,
              actions: ['刷新计数', '新建表', '批量导出'],
              children: [
                { id: 'pg-local/postgres/group/tables/audit_log', label: 'audit_log', kind: 'table', icon: 'table', count: 24806, dataKey: 'pg-local/postgres/group/tables/audit_log', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
                { id: 'pg-local/postgres/group/tables/products', label: 'products', kind: 'table', icon: 'table', count: 486, dataKey: 'pg-local/postgres/group/tables/products', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
                { id: 'pg-local/postgres/group/tables/payments', label: 'payments', kind: 'table', icon: 'table', count: 5321, dataKey: 'pg-local/postgres/group/tables/payments', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
              ],
            },
            {
              id: 'pg-local/postgres/group/views',
              label: '视图',
              kind: 'group',
              icon: 'group',
              count: 37,
              actions: ['刷新计数', '新建视图', '批量导出'],
              children: [
                { id: 'pg-local/postgres/group/views/v_user_order_stats', label: 'v_user_order_stats', kind: 'view', icon: 'view', count: 1284, dataKey: 'pg-local/postgres/group/views/v_user_order_stats', actions: ['打开数据', '查看定义', '生成 DDL', '复制名称'] },
                { id: 'pg-local/postgres/group/views/v_low_stock_products', label: 'v_low_stock_products', kind: 'view', icon: 'view', count: 37, dataKey: 'pg-local/postgres/group/views/v_low_stock_products', actions: ['打开数据', '查看定义', '生成 DDL', '复制名称'] },
              ],
            },
            {
              id: 'pg-local/postgres/group/functions',
              label: '函数',
              kind: 'group',
              icon: 'group',
              count: 118,
              actions: ['刷新计数', '新建函数', '批量导出'],
              children: [
                { id: 'pg-local/postgres/group/functions/fn_calc_user_total', label: 'fn_calc_user_total', kind: 'function', icon: 'function', actions: ['查看定义', '复制名称', '删除函数'] },
                { id: 'pg-local/postgres/group/functions/fn_normalize_email', label: 'fn_normalize_email', kind: 'function', icon: 'function', actions: ['查看定义', '复制名称', '删除函数'] },
                { id: 'pg-local/postgres/group/functions/fn_parse_tags', label: 'fn_parse_tags', kind: 'function', icon: 'function', actions: ['查看定义', '复制名称', '删除函数'] },
              ],
            },
            {
              id: 'pg-local/postgres/group/sequences',
              label: '序列',
              kind: 'group',
              icon: 'group',
              count: 9,
              actions: ['刷新计数', '新建序列', '批量导出'],
              children: [
                { id: 'pg-local/postgres/group/sequences/seq_users_id', label: 'seq_users_id', kind: 'sequence', icon: 'sequence', actions: ['查看定义', '复制名称', '重新设置'] },
                { id: 'pg-local/postgres/group/sequences/seq_orders_id', label: 'seq_orders_id', kind: 'sequence', icon: 'sequence', actions: ['查看定义', '复制名称', '重新设置'] },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'mysql-local',
    engine: 'mysql',
    label: 'MySQL — 本地',
    subtitle: '127.0.0.1:3306',
    status: 'connected',
    latencyMs: 12,
    charset: 'UTF-8',
    transaction: 'auto',
    tree: {
      id: 'mysql-local',
      label: 'MySQL — 本地',
      kind: 'connection',
      icon: 'mysql',
      actions: ['打开连接', '断开连接', '编辑连接', '复制连接信息'],
      children: [
        {
          id: 'mysql-local/shop',
          label: 'shop',
          kind: 'database',
          icon: 'database',
          actions: ['刷新', '新建表', '新建视图', '删除数据库'],
          children: [
            { id: 'mysql-local/shop/users', label: 'users', kind: 'table', icon: 'table', count: 1284, dataKey: 'mysql-local/shop/users', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
            { id: 'mysql-local/shop/orders', label: 'orders', kind: 'table', icon: 'table', count: 5321, dataKey: 'mysql-local/shop/orders', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
            { id: 'mysql-local/shop/order_items', label: 'order_items', kind: 'table', icon: 'table', count: 18647, dataKey: 'mysql-local/shop/order_items', actions: ['打开数据', '查看结构', '生成 DDL', '复制名称', '删除表'] },
            { id: 'mysql-local/shop/v_recent_orders', label: 'v_recent_orders', kind: 'view', icon: 'view', count: 500, dataKey: 'mysql-local/shop/v_recent_orders', actions: ['打开数据', '查看定义', '生成 DDL', '复制名称'] },
            {
              id: 'mysql-local/shop/group/procedures-events',
              label: '存储过程 / 事件',
              kind: 'group',
              icon: 'group',
              count: 8,
              actions: ['刷新计数', '新建存储过程', '新建事件', '执行全部'],
              children: [
                { id: 'mysql-local/shop/group/procedures-events/sp_refresh_order_total', label: 'sp_refresh_order_total', kind: 'procedure', icon: 'procedure', actions: ['查看定义', '复制名称', '执行过程', '删除过程'] },
                { id: 'mysql-local/shop/group/procedures-events/sp_monthly_sales_report', label: 'sp_monthly_sales_report', kind: 'procedure', icon: 'procedure', actions: ['查看定义', '复制名称', '执行过程', '删除过程'] },
                { id: 'mysql-local/shop/group/procedures-events/sp_sync_inventory', label: 'sp_sync_inventory', kind: 'procedure', icon: 'procedure', actions: ['查看定义', '复制名称', '执行过程', '删除过程'] },
                { id: 'mysql-local/shop/group/procedures-events/ev_cleanup_sessions', label: 'ev_cleanup_sessions', kind: 'event', icon: 'event', actions: ['查看定义', '复制名称', '启用事件', '删除事件'] },
                { id: 'mysql-local/shop/group/procedures-events/ev_sync_inventory', label: 'ev_sync_inventory', kind: 'event', icon: 'event', actions: ['查看定义', '复制名称', '启用事件', '删除事件'] },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'mongo-local',
    engine: 'mongodb',
    label: 'MongoDB — 本地',
    subtitle: '127.0.0.1:27017',
    status: 'connected',
    latencyMs: 24,
    charset: 'UTF-8',
    transaction: 'auto',
    tree: {
      id: 'mongo-local',
      label: 'MongoDB — 本地',
      kind: 'connection',
      icon: 'mongodb',
      actions: ['打开连接', '断开连接', '编辑连接', '复制连接信息'],
      children: [
        {
          id: 'mongo-local/shop',
          label: 'shop',
          kind: 'database',
          icon: 'database',
          actions: ['刷新', '新建集合', '新建视图', '删除数据库'],
          children: [
            { id: 'mongo-local/shop/users', label: 'users', kind: 'collection', icon: 'collection', count: 1284, dataKey: 'mongo-local/shop/users', actions: ['打开文档', '查看索引', '导出 JSON', '复制名称', '删除集合'] },
            { id: 'mongo-local/shop/orders', label: 'orders', kind: 'collection', icon: 'collection', count: 5321, dataKey: 'mongo-local/shop/orders', actions: ['打开文档', '查看索引', '导出 JSON', '复制名称', '删除集合'] },
            { id: 'mongo-local/shop/products', label: 'products', kind: 'collection', icon: 'collection', count: 486, dataKey: 'mongo-local/shop/products', actions: ['打开文档', '查看索引', '导出 JSON', '复制名称', '删除集合'] },
            {
              id: 'mongo-local/shop/group/indexes',
              label: '索引',
              kind: 'group',
              icon: 'group',
              count: 12,
              actions: ['刷新计数', '新建索引', '批量导出'],
              children: [
                { id: 'mongo-local/shop/group/indexes/users_email_1', label: 'email_1', kind: 'index', icon: 'index', actions: ['查看定义', '复制名称', '删除索引'] },
                { id: 'mongo-local/shop/group/indexes/users_phone_1', label: 'phone_1', kind: 'index', icon: 'index', actions: ['查看定义', '复制名称', '删除索引'] },
                { id: 'mongo-local/shop/group/indexes/users_createdAt_-1', label: 'createdAt_-1', kind: 'index', icon: 'index', actions: ['查看定义', '复制名称', '删除索引'] },
                { id: 'mongo-local/shop/group/indexes/orders_orderNo_1', label: 'orderNo_1', kind: 'index', icon: 'index', actions: ['查看定义', '复制名称', '删除索引'] },
                { id: 'mongo-local/shop/group/indexes/orders_userId_1_createdAt_-1', label: 'userId_1_createdAt_-1', kind: 'index', icon: 'index', actions: ['查看定义', '复制名称', '删除索引'] },
                { id: 'mongo-local/shop/group/indexes/products_sku_1', label: 'sku_1', kind: 'index', icon: 'index', actions: ['查看定义', '复制名称', '删除索引'] },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'redis-local',
    engine: 'redis',
    label: 'Redis — 本地',
    subtitle: '127.0.0.1:6379',
    status: 'connected',
    latencyMs: 3,
    charset: 'UTF-8',
    transaction: 'auto',
    tree: {
      id: 'redis-local',
      label: 'Redis — 本地',
      kind: 'connection',
      icon: 'redis',
      actions: ['打开连接', '断开连接', '编辑连接', '复制连接信息'],
      children: [
        {
          id: 'redis-local/db0',
          label: 'db0',
          kind: 'database',
          icon: 'database',
          count: 8412,
          dataKey: 'redis-local/db0',
          actions: ['刷新', '新建键', '切换编号库'],
          children: [
            { id: 'redis-local/db0/group/string', label: 'String', kind: 'group', icon: 'group', count: 6201, actions: ['刷新计数', '新建键', '查看键列表'] },
            { id: 'redis-local/db0/group/hash', label: 'Hash', kind: 'group', icon: 'group', count: 890, actions: ['刷新计数', '新建键', '查看键列表'] },
            { id: 'redis-local/db0/group/list', label: 'List', kind: 'group', icon: 'group', count: 134, actions: ['刷新计数', '新建键', '查看键列表'] },
            { id: 'redis-local/db0/group/set', label: 'Set', kind: 'group', icon: 'group', count: 77, actions: ['刷新计数', '新建键', '查看键列表'] },
            { id: 'redis-local/db0/group/zset', label: 'ZSet', kind: 'group', icon: 'group', count: 1110, actions: ['刷新计数', '新建键', '查看键列表'] },
          ],
        },
      ],
    },
  },
];

/** 关系型引擎的表数据,键为树节点的 dataKey */
export const TABLE_DATA = {
  'pg-local/postgres/public/users': {
    columns: [
      { key: 'id', name: 'id', type: 'integer', pk: true, nullable: false },
      { key: 'uuid', name: 'uuid', type: 'uuid' },
      { key: 'email', name: 'email', type: 'varchar(255)' },
      { key: 'name', name: 'name', type: 'varchar(64)' },
      { key: 'status', name: 'status', type: 'varchar(16)' },
      { key: 'balance', name: 'balance', type: 'numeric(12,2)' },
      { key: 'is_active', name: 'is_active', type: 'boolean' },
      { key: 'bio', name: 'bio', type: 'text' },
      { key: 'tags', name: 'tags', type: 'jsonb' },
      { key: 'avatar', name: 'avatar', type: 'bytea' },
      { key: 'created_at', name: 'created_at', type: 'timestamptz' },
      { key: 'deleted_at', name: 'deleted_at', type: 'timestamptz', nullable: true },
    ],
    rows: [
      { id: 1001, uuid: '3f1c9e20-8a4b-4d77-9c11-0e5a6b7c8d90', email: 'wei@example.com', name: '伟', status: 'active', balance: 1280.5, is_active: true, bio: '后端工程师,主要使用 Rust 与 PostgreSQL。', tags: ['vip', 'beta'], avatar: '0x89504e470d0a1a0a0000000d49484452', created_at: '2025-03-28 09:12:44', deleted_at: null },
      { id: 1002, uuid: 'a7d3b115-2c48-4e91-b0f6-77ac91de3302', email: 'na@example.com', name: '娜', status: 'active', balance: 640, is_active: true, bio: null, tags: ['vip'], avatar: null, created_at: '2025-05-11 14:03:19', deleted_at: null },
      { id: 1003, uuid: 'c2f5e8d3-9a71-4b0e-8c33-1d6b47f9a214', email: 'zhiqiang@example.com', name: '志强', status: 'inactive', balance: 12.75, is_active: false, bio: '账号已冻结,等待人工审核。', tags: [], avatar: '0x1f8b0800000000000003', created_at: '2025-02-09 08:41:02', deleted_at: '2025-06-18 10:22:31' },
      { id: 1004, uuid: 'e9b1d4a2-77c6-4f53-9a08-3b6c58de7410', email: 'xiaowen@example.com', name: '晓雯', status: 'active', balance: 5210.9, is_active: true, bio: '数据分析师,负责增长看板。', tags: ['beta'], avatar: '0xffd8ffe000104a464946', created_at: '2025-01-19 22:07:55', deleted_at: null },
      { id: 1005, uuid: 'f4a9c3e7-5b28-4d91-8e37-6a9b02cd5518', email: 'jianguo@example.com', name: '建国', status: 'pending', balance: 0, is_active: true, bio: '注册后待实名认证。', tags: null, avatar: null, created_at: '2025-07-30 16:55:03', deleted_at: null },
      { id: 1006, uuid: 'b7e2f1a4-6c93-4b58-a0d2-8f14e7c30b6d', email: 'xiaomei@example.com', name: '小美', status: 'active', balance: 349.9, is_active: true, bio: null, tags: ['newsletter'], avatar: '0x474946383961', created_at: '2025-04-22 11:30:12', deleted_at: null },
      { id: 1007, uuid: 'c8a4e7d1-3f26-4b90-95c8-2d7a6e4b3f10', email: 'wenbo@example.com', name: '文博', status: 'active', balance: 7980.25, is_active: true, bio: '前端工程师,负责设计系统。', tags: ['vip', 'beta', 'design'], avatar: '0x89504e470d0a1a0a0000000d49484452', created_at: '2025-08-14 09:18:47', deleted_at: null },
      { id: 1008, uuid: 'd5f3a8c2-6e14-4b87-a3f9-1c8b5d7e4a26', email: 'jingyi@example.com', name: '静怡', status: 'banned', balance: 0, is_active: false, bio: null, tags: [], avatar: null, created_at: '2025-06-03 13:44:59', deleted_at: '2025-06-20 09:00:00' },
      { id: 1009, uuid: 'e2b6c9d4-8a35-4f61-8d27-4e6c9b0a5f38', email: 'tiancheng@example.com', name: '天成', status: 'active', balance: 1560, is_active: true, bio: '运维工程师,负责 CI/CD。', tags: ['beta'], avatar: null, created_at: '2025-09-01 07:22:10', deleted_at: null },
      { id: 1010, uuid: 'f7c1d4a8-2b63-4e95-9a17-3d8b6f0c4e21', email: 'yuxin@example.com', name: '雨欣', status: 'active', balance: 2750.75, is_active: true, bio: '产品经理,负责支付链路。', tags: ['vip'], avatar: '0x89504e470d0a1a0a0000000d49484452', created_at: '2024-12-25 20:14:36', deleted_at: null },
      { id: 1011, uuid: 'a3d9e5f1-7c28-4b46-8e05-9f1a2b3c4d57', email: 'haoran@example.com', name: '浩然', status: 'inactive', balance: 88.2, is_active: false, bio: null, tags: null, avatar: null, created_at: '2025-10-08 18:36:04', deleted_at: null },
      { id: 1012, uuid: 'b8f2a6c3-4d17-4e93-b568-7a0c9e2d3f45', email: 'mengqi@example.com', name: '梦琪', status: 'active', balance: 4320, is_active: true, bio: '设计师,负责品牌视觉。', tags: ['design'], avatar: '0xffd8ffe000104a464946', created_at: '2025-05-27 10:08:29', deleted_at: null },
      { id: 1013, uuid: 'c1a4e7b8-9f52-4d30-b761-3e9a8c5d2b19', email: 'junhui@example.com', name: '俊辉', status: 'active', balance: 96.6, is_active: true, bio: null, tags: ['beta'], avatar: null, created_at: '2025-11-12 12:49:17', deleted_at: null },
      { id: 1014, uuid: 'd7b3c9e5-2a84-4f16-9c53-5b8e0a6d4f72', email: 'zihan@example.com', name: '紫涵', status: 'pending', balance: 0, is_active: true, bio: '新同事,正在熟悉业务。', tags: null, avatar: null, created_at: '2025-12-03 09:00:00', deleted_at: null },
    ],
    total: 1284,
  },
  'pg-local/postgres/public/orders': {
    columns: [
      { key: 'id', name: 'id', type: 'bigint', pk: true, nullable: false },
      { key: 'order_no', name: 'order_no', type: 'varchar(32)' },
      { key: 'user_id', name: 'user_id', type: 'integer' },
      { key: 'status', name: 'status', type: 'varchar(16)' },
      { key: 'total_amount', name: 'total_amount', type: 'numeric(12,2)' },
      { key: 'discount_amount', name: 'discount_amount', type: 'numeric(12,2)' },
      { key: 'currency', name: 'currency', type: 'char(3)' },
      { key: 'item_count', name: 'item_count', type: 'integer' },
      { key: 'is_paid', name: 'is_paid', type: 'boolean' },
      { key: 'remark', name: 'remark', type: 'text' },
      { key: 'payload', name: 'payload', type: 'jsonb' },
      { key: 'created_at', name: 'created_at', type: 'timestamptz' },
      { key: 'paid_at', name: 'paid_at', type: 'timestamptz', nullable: true },
    ],
    rows: [
      { id: 90001, order_no: 'SO-2025-000123', user_id: 1001, status: 'paid', total_amount: 1280.5, discount_amount: 120, currency: 'CNY', item_count: 3, is_paid: true, remark: '工作日送货', payload: { channel: 'web', coupon: 'SPRING2025', address_id: 41 }, created_at: '2025-03-28 09:20:11', paid_at: '2025-03-28 09:21:03' },
      { id: 90002, order_no: 'SO-2025-000124', user_id: 1002, status: 'shipped', total_amount: 640, discount_amount: 0, currency: 'CNY', item_count: 1, is_paid: true, remark: null, payload: { channel: 'ios', coupon: null, address_id: 42 }, created_at: '2025-03-28 10:02:47', paid_at: '2025-03-28 10:03:22' },
      { id: 90003, order_no: 'SO-2025-000125', user_id: 1007, status: 'pending', total_amount: 7980.25, discount_amount: 500, currency: 'CNY', item_count: 6, is_paid: false, remark: '发票抬头:杭州某某科技有限公司', payload: { channel: 'web', coupon: 'VIP500', address_id: 43 }, created_at: '2025-03-28 11:15:09', paid_at: null },
      { id: 90004, order_no: 'SO-2025-000126', user_id: 1004, status: 'paid', total_amount: 5210.9, discount_amount: 250, currency: 'CNY', item_count: 4, is_paid: true, remark: null, payload: { channel: 'android', coupon: 'NEW50', address_id: 44 }, created_at: '2025-03-28 13:41:52', paid_at: '2025-03-28 13:42:30' },
      { id: 90005, order_no: 'SO-2025-000127', user_id: 1010, status: 'cancelled', total_amount: 2750.75, discount_amount: 0, currency: 'CNY', item_count: 2, is_paid: false, remark: '客户临时取消', payload: { channel: 'web', coupon: null, address_id: 45 }, created_at: '2025-03-28 14:58:36', paid_at: null },
      { id: 90006, order_no: 'SO-2025-000128', user_id: 1006, status: 'refunded', total_amount: 349.9, discount_amount: 0, currency: 'CNY', item_count: 1, is_paid: true, remark: '七天无理由退货', payload: { channel: 'web', coupon: null, address_id: 46, refund_reason: 'size_mismatch' }, created_at: '2025-03-28 16:23:18', paid_at: '2025-03-28 16:24:02' },
      { id: 90007, order_no: 'SO-2025-000129', user_id: 1013, status: 'pending', total_amount: 96.6, discount_amount: 3.4, currency: 'CNY', item_count: 1, is_paid: false, remark: null, payload: { channel: 'mini_program', coupon: 'TEST3', address_id: 47 }, created_at: '2025-03-28 17:05:44', paid_at: null },
      { id: 90008, order_no: 'SO-2025-000130', user_id: 1009, status: 'paid', total_amount: 1560, discount_amount: 80, currency: 'CNY', item_count: 5, is_paid: true, remark: '批量采购,需要增值税专票', payload: { channel: 'web', coupon: 'BULK80', address_id: 48 }, created_at: '2025-03-29 08:31:20', paid_at: '2025-03-29 08:31:58' },
      { id: 90009, order_no: 'SO-2025-000131', user_id: 1005, status: 'pending', total_amount: 59.9, discount_amount: 0, currency: 'CNY', item_count: 1, is_paid: false, remark: null, payload: { channel: 'web', coupon: null, address_id: 49 }, created_at: '2025-03-29 09:47:03', paid_at: null },
      { id: 90010, order_no: 'SO-2025-000132', user_id: 1008, status: 'refunded', total_amount: 218, discount_amount: 0, currency: 'CNY', item_count: 2, is_paid: true, remark: '退款已原路返回', payload: { channel: 'ios', coupon: null, address_id: 50, refund_reason: 'duplicate' }, created_at: '2025-03-29 11:12:39', paid_at: '2025-03-29 11:13:15' },
      { id: 90011, order_no: 'SO-2025-000133', user_id: 1001, status: 'shipped', total_amount: 4320, discount_amount: 300, currency: 'CNY', item_count: 4, is_paid: true, remark: null, payload: { channel: 'web', coupon: 'VIP300', address_id: 51 }, created_at: '2025-03-29 14:26:07', paid_at: '2025-03-29 14:27:01' },
      { id: 90012, order_no: 'SO-2025-000134', user_id: 1012, status: 'paid', total_amount: 875.4, discount_amount: 24.6, currency: 'CNY', item_count: 3, is_paid: true, remark: '包邮', payload: { channel: 'web', coupon: 'SHIPFREE', address_id: 52 }, created_at: '2025-03-29 16:58:51', paid_at: '2025-03-29 16:59:30' },
      { id: 90013, order_no: 'SO-2025-000135', user_id: 1011, status: 'cancelled', total_amount: 88.2, discount_amount: 0, currency: 'CNY', item_count: 1, is_paid: false, remark: null, payload: { channel: 'android', coupon: null, address_id: 53 }, created_at: '2025-03-30 08:09:12', paid_at: null },
      { id: 90014, order_no: 'SO-2025-000136', user_id: 1002, status: 'paid', total_amount: 1280.5, discount_amount: 0, currency: 'CNY', item_count: 3, is_paid: true, remark: '加急发货', payload: { channel: 'web', coupon: null, address_id: 54 }, created_at: '2025-03-30 10:44:26', paid_at: '2025-03-30 10:45:02' },
      { id: 90015, order_no: 'SO-2025-000137', user_id: 1004, status: 'pending', total_amount: 199.9, discount_amount: 0, currency: 'CNY', item_count: 1, is_paid: false, remark: null, payload: { channel: 'web', coupon: null, address_id: 55 }, created_at: '2025-03-30 12:19:48', paid_at: null },
    ],
    total: 5321,
  },
  'pg-local/postgres/public/user_sessions': {
    columns: [
      { key: 'id', name: 'id', type: 'uuid', pk: true, nullable: false },
      { key: 'user_id', name: 'user_id', type: 'integer' },
      { key: 'token', name: 'token', type: 'varchar(128)' },
      { key: 'ip_address', name: 'ip_address', type: 'inet' },
      { key: 'user_agent', name: 'user_agent', type: 'varchar(256)' },
      { key: 'device', name: 'device', type: 'varchar(32)' },
      { key: 'is_active', name: 'is_active', type: 'boolean' },
      { key: 'expires_at', name: 'expires_at', type: 'timestamptz' },
      { key: 'created_at', name: 'created_at', type: 'timestamptz' },
      { key: 'last_seen_at', name: 'last_seen_at', type: 'timestamptz', nullable: true },
      { key: 'login_note', name: 'login_note', type: 'varchar(128)', nullable: true },
    ],
    rows: [
      { id: '7c9e1a52-3b84-4d61-9f20-5a6e7c8b9d01', user_id: 1001, token: '8f2a1c9d4e7b2a6c0d3f5b8e1a4c7d90', ip_address: '10.0.0.7', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0.0.0 Safari/537.36', device: 'macOS', is_active: true, expires_at: '2025-04-28 09:12:44', created_at: '2025-03-28 09:12:44', last_seen_at: '2025-03-28 18:40:12', login_note: '异地登录提醒' },
      { id: '1d4f7b83-5c96-4a28-8e31-0b7c9d2e5f42', user_id: 1002, token: 'b3e6c9a20d5f1b8c4e7a0d3f6b9c2e51', ip_address: '10.0.0.12', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2) Safari/604.1', device: 'iOS', is_active: true, expires_at: '2025-04-11 14:03:19', created_at: '2025-03-11 14:03:19', last_seen_at: '2025-03-28 20:15:03', login_note: null },
      { id: '5e2a9c04-8b71-4f36-a9d5-2c8e6f1a3b95', user_id: 1004, token: 'c7a1e4f9b2d6c0a3e7f1b5d8a2c6e930', ip_address: '192.168.1.24', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68', device: 'Windows', is_active: true, expires_at: '2025-04-19 22:07:55', created_at: '2025-03-19 22:07:55', last_seen_at: '2025-03-27 09:31:47', login_note: '新设备登录' },
      { id: '9b8d6f31-2a47-4c85-93e6-5d0a7c4b8e26', user_id: 1007, token: 'f4b9c2d7a0e3f6b1d8c5a2e7b0d4f963', ip_address: '10.0.0.31', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0.0.0 Safari/537.36', device: 'macOS', is_active: true, expires_at: '2025-04-14 09:18:47', created_at: '2025-03-14 09:18:47', last_seen_at: '2025-03-28 22:05:19', login_note: null },
      { id: '3a6c8e29-5d41-4b07-8f92-6c1e4a7d9b58', user_id: 1010, token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', ip_address: '172.16.3.88', user_agent: 'Mozilla/5.0 (Linux; Android 15) Chrome/131.0.0.0 Mobile Safari/537.36', device: 'Android', is_active: true, expires_at: '2025-04-25 20:14:36', created_at: '2025-03-25 20:14:36', last_seen_at: '2025-03-28 17:22:41', login_note: null },
      { id: '6c4e2a70-9b83-4d15-8a67-3e0b9c5d2f71', user_id: 1003, token: 'd9e8f7a6b5c4d3e2f1a0b9c8d7e6f504', ip_address: '203.0.113.44', user_agent: 'curl/8.6.0', device: 'Unknown', is_active: false, expires_at: '2025-03-26 08:41:02', created_at: '2025-03-26 08:41:02', last_seen_at: null, login_note: '异地登录提醒' },
      { id: 'f2b7d483-1a95-4c06-93b7-5d8e0a6c4f29', user_id: 1012, token: '1a2b3c4d5e6f708192a3b4c5d6e7f809', ip_address: '10.0.0.55', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/131.0.0.0', device: 'macOS', is_active: true, expires_at: '2025-04-27 10:08:29', created_at: '2025-03-27 10:08:29', last_seen_at: '2025-03-28 11:59:08', login_note: null },
      { id: '0e5c9a26-7f34-4b81-8d20-3c6e1f9b4a87', user_id: 1006, token: '0f1e2d3c4b5a69788796a5b4c3d2e1f0', ip_address: '198.51.100.19', user_agent: 'Mozilla/5.0 (iPad; CPU OS 18_2) Safari/604.1', device: 'iPadOS', is_active: true, expires_at: '2025-04-22 11:30:12', created_at: '2025-03-22 11:30:12', last_seen_at: '2025-03-28 08:16:33', login_note: '新设备登录' },
      { id: '8b3d6f91-4a27-4e58-9c10-7d2b5f8e0c36', user_id: 1008, token: '2b3c4d5e6f708192a3b4c5d6e7f8091a', ip_address: '10.0.0.63', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36', device: 'Windows', is_active: false, expires_at: '2025-03-21 13:44:59', created_at: '2025-03-21 13:44:59', last_seen_at: '2025-03-21 18:02:55', login_note: null },
      { id: '4d9e1c73-6b28-4f05-8a91-2e7c0d5f3b18', user_id: 1009, token: '3c4d5e6f708192a3b4c5d6e7f8091a2b', ip_address: '172.16.8.14', user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36', device: 'Linux', is_active: true, expires_at: '2025-04-30 07:22:10', created_at: '2025-03-30 07:22:10', last_seen_at: '2025-03-30 09:10:44', login_note: null },
      { id: '7a1f5d92-3c68-4b14-9e07-5f2a8b6d1c45', user_id: 1013, token: '4d5e6f708192a3b4c5d6e7f8091a2b3c', ip_address: '10.0.0.71', user_agent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130.0.0.0 Mobile Safari/537.36', device: 'Android', is_active: true, expires_at: '2025-04-12 12:49:17', created_at: '2025-03-12 12:49:17', last_seen_at: '2025-03-28 12:33:20', login_note: '验证码登录' },
      { id: '2b8e4a06-9d15-4c73-b6f8-0a3d9e7c5b24', user_id: 1014, token: '5e6f708192a3b4c5d6e7f8091a2b3c4d', ip_address: '127.0.0.1', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0.0.0 Safari/537.36', device: 'macOS', is_active: true, expires_at: '2025-04-02 09:00:00', created_at: '2025-03-02 09:00:00', last_seen_at: '2025-03-28 07:45:02', login_note: null },
    ],
    total: 8942,
  },
  'pg-local/postgres/public/v_active_users': {
    columns: [
      { key: 'user_id', name: 'user_id', type: 'integer' },
      { key: 'full_name', name: 'full_name', type: 'varchar(64)' },
      { key: 'email', name: 'email', type: 'varchar(255)' },
      { key: 'tier', name: 'tier', type: 'varchar(16)' },
      { key: 'order_count', name: 'order_count', type: 'integer' },
      { key: 'lifetime_value', name: 'lifetime_value', type: 'numeric(12,2)' },
      { key: 'is_active', name: 'is_active', type: 'boolean' },
      { key: 'registered_at', name: 'registered_at', type: 'timestamptz' },
      { key: 'last_login_at', name: 'last_login_at', type: 'timestamptz', nullable: true },
    ],
    rows: [
      { user_id: 1001, full_name: '伟', email: 'wei@example.com', tier: 'gold', order_count: 12, lifetime_value: 12840.75, is_active: true, registered_at: '2025-03-28 09:12:44', last_login_at: '2025-03-28 09:12:44' },
      { user_id: 1002, full_name: '娜', email: 'na@example.com', tier: 'silver', order_count: 6, lifetime_value: 4290.5, is_active: true, registered_at: '2025-05-11 14:03:19', last_login_at: null },
      { user_id: 1004, full_name: '晓雯', email: 'xiaowen@example.com', tier: 'gold', order_count: 21, lifetime_value: 31860.2, is_active: true, registered_at: '2025-01-19 22:07:55', last_login_at: '2025-03-27 21:03:55' },
      { user_id: 1006, full_name: '小美', email: 'xiaomei@example.com', tier: 'bronze', order_count: 2, lifetime_value: 699.8, is_active: true, registered_at: '2025-04-22 11:30:12', last_login_at: null },
      { user_id: 1007, full_name: '文博', email: 'wenbo@example.com', tier: 'gold', order_count: 34, lifetime_value: 52780.4, is_active: true, registered_at: '2025-08-14 09:18:47', last_login_at: '2025-03-28 22:10:07' },
      { user_id: 1009, full_name: '天成', email: 'tiancheng@example.com', tier: 'silver', order_count: 9, lifetime_value: 6740, is_active: true, registered_at: '2025-09-01 07:22:10', last_login_at: null },
      { user_id: 1010, full_name: '雨欣', email: 'yuxin@example.com', tier: 'gold', order_count: 17, lifetime_value: 24180.9, is_active: true, registered_at: '2024-12-25 20:14:36', last_login_at: '2025-03-25 07:44:19' },
      { user_id: 1012, full_name: '梦琪', email: 'mengqi@example.com', tier: 'silver', order_count: 8, lifetime_value: 8930.25, is_active: true, registered_at: '2025-05-27 10:08:29', last_login_at: null },
      { user_id: 1013, full_name: '俊辉', email: 'junhui@example.com', tier: 'bronze', order_count: 1, lifetime_value: 96.6, is_active: true, registered_at: '2025-11-12 12:49:17', last_login_at: null },
      { user_id: 1005, full_name: '建国', email: 'jianguo@example.com', tier: 'bronze', order_count: 0, lifetime_value: 0, is_active: true, registered_at: '2025-07-30 16:55:03', last_login_at: null },
      { user_id: 1011, full_name: '浩然', email: 'haoran@example.com', tier: 'bronze', order_count: 1, lifetime_value: 88.2, is_active: false, registered_at: '2025-10-08 18:36:04', last_login_at: null },
      { user_id: 1014, full_name: '紫涵', email: 'zihan@example.com', tier: 'bronze', order_count: 0, lifetime_value: 0, is_active: true, registered_at: '2025-12-03 09:00:00', last_login_at: null },
    ],
    total: 1103,
  },
  'pg-local/postgres/analytics/daily_revenue': {
    columns: [
      { key: 'stat_date', name: 'stat_date', type: 'date' },
      { key: 'channel', name: 'channel', type: 'varchar(32)' },
      { key: 'region', name: 'region', type: 'varchar(32)' },
      { key: 'order_count', name: 'order_count', type: 'integer' },
      { key: 'refund_count', name: 'refund_count', type: 'integer' },
      { key: 'gross_revenue', name: 'gross_revenue', type: 'numeric(14,2)' },
      { key: 'net_revenue', name: 'net_revenue', type: 'numeric(14,2)' },
      { key: 'avg_order_value', name: 'avg_order_value', type: 'numeric(12,2)' },
      { key: 'conversion_rate', name: 'conversion_rate', type: 'numeric(5,4)' },
      { key: 'generated_at', name: 'generated_at', type: 'timestamptz' },
      { key: 'campaign', name: 'campaign', type: 'varchar(64)', nullable: true },
    ],
    rows: [
      { stat_date: '2025-03-18', channel: 'web', region: '华东', order_count: 412, refund_count: 11, gross_revenue: 386420.55, net_revenue: 372180.2, avg_order_value: 938.01, conversion_rate: 0.0384, generated_at: '2025-03-19 00:05:12', campaign: '春季大促' },
      { stat_date: '2025-03-19', channel: 'web', region: '华东', order_count: 468, refund_count: 14, gross_revenue: 441230.8, net_revenue: 428940.35, avg_order_value: 943.23, conversion_rate: 0.0412, generated_at: '2025-03-20 00:05:09', campaign: null },
      { stat_date: '2025-03-20', channel: 'ios', region: '华东', order_count: 331, refund_count: 7, gross_revenue: 298640.15, net_revenue: 291220.4, avg_order_value: 902.24, conversion_rate: 0.0298, generated_at: '2025-03-21 00:05:15', campaign: '春季大促' },
      { stat_date: '2025-03-21', channel: 'ios', region: '华南', order_count: 287, refund_count: 9, gross_revenue: 251870.4, net_revenue: 243950.6, avg_order_value: 877.6, conversion_rate: 0.0267, generated_at: '2025-03-22 00:05:11', campaign: null },
      { stat_date: '2025-03-22', channel: 'android', region: '华北', order_count: 256, refund_count: 5, gross_revenue: 219430.9, net_revenue: 214770.25, avg_order_value: 857.15, conversion_rate: 0.0241, generated_at: '2025-03-23 00:05:08', campaign: null },
      { stat_date: '2025-03-23', channel: 'android', region: '华北', order_count: 198, refund_count: 4, gross_revenue: 165280.35, net_revenue: 161940.1, avg_order_value: 834.75, conversion_rate: 0.0213, generated_at: '2025-03-24 00:05:14', campaign: '618 预热' },
      { stat_date: '2025-03-24', channel: 'web', region: '西南', order_count: 502, refund_count: 16, gross_revenue: 472910.2, net_revenue: 458760.85, avg_order_value: 942.05, conversion_rate: 0.0447, generated_at: '2025-03-25 00:05:10', campaign: null },
      { stat_date: '2025-03-25', channel: 'web', region: '西南', order_count: 543, refund_count: 12, gross_revenue: 512380.75, net_revenue: 499310.4, avg_order_value: 943.43, conversion_rate: 0.0469, generated_at: '2025-03-26 00:05:07', campaign: '春季大促' },
      { stat_date: '2025-03-26', channel: 'mini_program', region: '华东', order_count: 617, refund_count: 19, gross_revenue: 583740.6, net_revenue: 566120.3, avg_order_value: 946.09, conversion_rate: 0.0523, generated_at: '2025-03-27 00:05:16', campaign: '会员日' },
      { stat_date: '2025-03-27', channel: 'mini_program', region: '华南', order_count: 584, refund_count: 21, gross_revenue: 549260.15, net_revenue: 531870.5, avg_order_value: 940.51, conversion_rate: 0.0498, generated_at: '2025-03-28 00:05:12', campaign: null },
      { stat_date: '2025-03-28', channel: 'web', region: '华东', order_count: 674, refund_count: 18, gross_revenue: 638520.4, net_revenue: 618940.75, avg_order_value: 947.36, conversion_rate: 0.0556, generated_at: '2025-03-29 00:05:09', campaign: null },
      { stat_date: '2025-03-29', channel: 'web', region: '华东', order_count: 721, refund_count: 23, gross_revenue: 689430.85, net_revenue: 667280.1, avg_order_value: 956.35, conversion_rate: 0.0587, generated_at: '2025-03-30 00:05:13', campaign: '春季大促' },
    ],
    total: 365,
  },
  'pg-local/postgres/group/tables/audit_log': {
    columns: [
      { key: 'id', name: 'id', type: 'bigserial', pk: true, nullable: false },
      { key: 'actor_name', name: 'actor_name', type: 'varchar(64)' },
      { key: 'action', name: 'action', type: 'varchar(32)' },
      { key: 'entity_type', name: 'entity_type', type: 'varchar(32)' },
      { key: 'entity_id', name: 'entity_id', type: 'varchar(64)' },
      { key: 'detail', name: 'detail', type: 'jsonb' },
      { key: 'ip_address', name: 'ip_address', type: 'inet' },
      { key: 'is_success', name: 'is_success', type: 'boolean' },
      { key: 'created_at', name: 'created_at', type: 'timestamptz' },
      { key: 'request_id', name: 'request_id', type: 'uuid', nullable: true },
    ],
    rows: [
      { id: 802311, actor_name: '伟', action: 'UPDATE', entity_type: 'users', entity_id: '1001', detail: { changed: ['balance'], before: 1180.5, after: 1280.5 }, ip_address: '10.0.0.7', is_success: true, created_at: '2025-03-28 09:13:02', request_id: '3a5f1c92-7d84-4b16-9e03-8c2a4f6b1d57' },
      { id: 802312, actor_name: '娜', action: 'INSERT', entity_type: 'orders', entity_id: '90001', detail: { channel: 'web', amount: 1280.5 }, ip_address: '10.0.0.12', is_success: true, created_at: '2025-03-28 09:20:14', request_id: null },
      { id: 802313, actor_name: 'system', action: 'LOGIN_FAILED', entity_type: 'session', entity_id: '7c9e1a52', detail: { reason: 'bad_password', attempts: 3 }, ip_address: '203.0.113.44', is_success: false, created_at: '2025-03-28 09:31:48', request_id: '9b2e7d41-5c63-4f08-a721-4e9d1b3c6a82' },
      { id: 802314, actor_name: '文博', action: 'CREATE', entity_type: 'view', entity_id: 'v_low_stock_products', detail: { definition: 'select sku, title, stock from products where stock < safety_stock' }, ip_address: '10.0.0.31', is_success: true, created_at: '2025-03-28 10:05:22', request_id: null },
      { id: 802315, actor_name: '晓雯', action: 'EXPORT', entity_type: 'report', entity_id: 'daily_revenue_20250328', detail: { format: 'csv', rows: 365 }, ip_address: '192.168.1.24', is_success: true, created_at: '2025-03-28 10:47:03', request_id: 'c8d4a2f6-1b95-4e37-90f5-3a7c6d2e9b14' },
      { id: 802316, actor_name: '雨欣', action: 'GRANT', entity_type: 'role', entity_id: 'analyst', detail: { to_user: 1004, privilege: 'SELECT' }, ip_address: '172.16.3.88', is_success: true, created_at: '2025-03-28 11:12:57', request_id: null },
      { id: 802317, actor_name: 'system', action: 'VACUUM', entity_type: 'table', entity_id: 'orders', detail: { pages_removed: 1284 }, ip_address: '127.0.0.1', is_success: true, created_at: '2025-03-28 11:30:11', request_id: 'e1f3b5d7-9a28-4c46-b130-6d8e4f2a7c03' },
      { id: 802318, actor_name: '小美', action: 'UPDATE', entity_type: 'users', entity_id: '1006', detail: { changed: ['phone'], before: null, after: '138****2211' }, ip_address: '198.51.100.19', is_success: true, created_at: '2025-03-28 11:52:36', request_id: 'f4a6c8e0-2b19-4d57-83e4-7c9b1d3f5a86' },
      { id: 802319, actor_name: '志强', action: 'DELETE', entity_type: 'sessions', entity_id: '6c4e2a70', detail: { purged: 1 }, ip_address: '10.0.0.44', is_success: false, created_at: '2025-03-28 12:19:05', request_id: null },
      { id: 802320, actor_name: '静怡', action: 'BAN', entity_type: 'user', entity_id: '1008', detail: { reason: 'abuse', duration_hours: 72 }, ip_address: '10.0.0.63', is_success: true, created_at: '2025-03-28 13:45:28', request_id: 'b7d9f1a3-4c26-4e80-9f52-1a3b5d7f9c20' },
      { id: 802321, actor_name: '梦琪', action: 'UPLOAD', entity_type: 'attachment', entity_id: 'att_88421', detail: { bytes: 20480, mime: 'image/png' }, ip_address: '10.0.0.55', is_success: true, created_at: '2025-03-28 14:08:49', request_id: 'd2e4f6a8-6b39-4c15-82d7-5e7a9b1c3f41' },
      { id: 802322, actor_name: 'system', action: 'BACKUP', entity_type: 'database', entity_id: 'postgres', detail: { size_mb: 512, target: 's3://seladb-backups/pg-20250328.dump' }, ip_address: '127.0.0.1', is_success: true, created_at: '2025-03-28 15:30:00', request_id: null },
    ],
    total: 24806,
  },
  'pg-local/postgres/group/tables/products': {
    columns: [
      { key: 'id', name: 'id', type: 'integer', pk: true, nullable: false },
      { key: 'sku', name: 'sku', type: 'varchar(64)' },
      { key: 'title', name: 'title', type: 'varchar(160)' },
      { key: 'category', name: 'category', type: 'varchar(64)' },
      { key: 'price', name: 'price', type: 'numeric(12,2)' },
      { key: 'stock', name: 'stock', type: 'integer' },
      { key: 'on_sale', name: 'on_sale', type: 'boolean' },
      { key: 'description', name: 'description', type: 'text' },
      { key: 'attributes', name: 'attributes', type: 'jsonb' },
      { key: 'thumbnail', name: 'thumbnail', type: 'bytea' },
      { key: 'created_at', name: 'created_at', type: 'timestamptz' },
    ],
    rows: [
      { id: 2001, sku: 'KB-1042-BLK', title: '机械键盘 87 键 黑色', category: '外设', price: 499, stock: 128, on_sale: true, description: 'Cherry 轴体,热插拔,支持 87 键紧凑布局。', attributes: { layout: '87', switch: 'cherry', weight_g: 980 }, thumbnail: '0x89504e470d0a1a0a', created_at: '2025-01-08 10:12:03' },
      { id: 2002, sku: 'KB-1043-WHT', title: '机械键盘 87 键 白色', category: '外设', price: 499, stock: 64, on_sale: true, description: null, attributes: { layout: '87', switch: 'cherry', weight_g: 985 }, thumbnail: null, created_at: '2025-01-08 10:12:41' },
      { id: 2003, sku: 'MS-2211-WH', title: '无线人体工学鼠标', category: '外设', price: 269, stock: 342, on_sale: true, description: '静音微动,2700DPI,USB-C 充电。', attributes: { dpi: 2700, battery_hours: 90, color: 'white' }, thumbnail: '0x474946383961', created_at: '2025-01-19 14:33:27' },
      { id: 2004, sku: 'MN-3301-27', title: '27 英寸 4K 显示器', category: '显示设备', price: 2899, stock: 17, on_sale: true, description: 'IPS 面板,99% sRGB,支持 Type-C 65W 反向供电。', attributes: { size_inch: 27, resolution: '3840x2160', refresh_hz: 60 }, thumbnail: '0xffd8ffe000104a46', created_at: '2025-02-03 09:08:12' },
      { id: 2005, sku: 'MN-2408-24', title: '24 英寸 1080P 显示器', category: '显示设备', price: 899, stock: 5, on_sale: false, description: '库存不足,补货中。', attributes: { size_inch: 24, resolution: '1920x1080', refresh_hz: 75 }, thumbnail: null, created_at: '2025-02-03 09:09:02' },
      { id: 2006, sku: 'DSK-7701-WD', title: '实木升降桌', category: '办公家具', price: 2180, stock: 23, on_sale: true, description: '双电机升降,记忆高度,承重 80kg。', attributes: { width_mm: 1400, material: '橡木', motor: 'dual' }, thumbnail: '0x89504e470d0a1a0a', created_at: '2025-02-21 16:44:55' },
      { id: 2007, sku: 'CHR-5502-GR', title: '人体工学办公椅', category: '办公家具', price: 1580, stock: 41, on_sale: true, description: '网布靠背,4D 扶手,腰托可调。', attributes: { color: 'gray', armrest: '4D', mesh: true }, thumbnail: '0x474946383961', created_at: '2025-03-01 11:19:33' },
      { id: 2008, sku: 'HD-9090-4K', title: '4K 摄像头', category: '外设', price: 749, stock: 0, on_sale: false, description: null, attributes: { resolution: '3840x2160', fps: 30, microphone: 'dual' }, thumbnail: null, created_at: '2025-03-02 08:55:19' },
      { id: 2009, sku: 'HUB-7710-8P', title: '八口 USB 3.2 集线器', category: '外设', price: 329, stock: 96, on_sale: true, description: '带独立供电,支持 10Gbps。', attributes: { ports: 8, power: 'external', speed_gbps: 10 }, thumbnail: '0x89504e470d0a1a0a', created_at: '2025-03-05 13:27:48' },
      { id: 2010, sku: 'SSD-1T-NVME', title: '1TB NVMe 固态硬盘', category: '存储', price: 649, stock: 213, on_sale: true, description: 'PCIe 4.0 x4,顺序读取 7000MB/s。', attributes: { capacity_gb: 1024, interface: 'pcie4', read_mbps: 7000 }, thumbnail: null, created_at: '2025-03-07 10:02:11' },
      { id: 2011, sku: 'RAM-32G-DDR5', title: '32GB DDR5 内存条', category: '存储', price: 899, stock: 58, on_sale: true, description: '6000MT/s,CL30。', attributes: { capacity_gb: 32, type: 'ddr5', speed_mt: 6000 }, thumbnail: null, created_at: '2025-03-07 10:03:44' },
      { id: 2012, sku: 'LAP-1560-M1', title: '15.6 英寸笔记本支架', category: '办公家具', price: 159, stock: 187, on_sale: true, description: '铝合金,可折叠,六档高度。', attributes: { material: 'aluminium', folds: 6, height_mm: 160 }, thumbnail: '0xffd8ffe000104a46', created_at: '2025-03-11 15:18:26' },
    ],
    total: 486,
  },
  'pg-local/postgres/group/tables/payments': {
    columns: [
      { key: 'id', name: 'id', type: 'uuid', pk: true, nullable: false },
      { key: 'order_id', name: 'order_id', type: 'integer' },
      { key: 'user_id', name: 'user_id', type: 'integer' },
      { key: 'method', name: 'method', type: 'varchar(24)' },
      { key: 'amount', name: 'amount', type: 'numeric(12,2)' },
      { key: 'fee', name: 'fee', type: 'numeric(12,2)' },
      { key: 'currency', name: 'currency', type: 'char(3)' },
      { key: 'status', name: 'status', type: 'varchar(16)' },
      { key: 'is_refunded', name: 'is_refunded', type: 'boolean' },
      { key: 'paid_at', name: 'paid_at', type: 'timestamptz', nullable: true },
      { key: 'created_at', name: 'created_at', type: 'timestamptz' },
      { key: 'remark', name: 'remark', type: 'text', nullable: true },
    ],
    rows: [
      { id: 'b1f4e8d2-7a36-4c59-9e08-3d5c7b1a2f64', order_id: 90001, user_id: 1001, method: 'alipay', amount: 1160.5, fee: 34.82, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-28 09:21:03', created_at: '2025-03-28 09:20:30', remark: '用户已确认收货' },
      { id: 'c7a2d913-4e58-4b60-8f27-1a6e9c3d5b08', order_id: 90002, user_id: 1002, method: 'wechat_pay', amount: 640, fee: 19.2, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-28 10:03:22', created_at: '2025-03-28 10:02:58', remark: null },
      { id: 'd9e3b705-1c84-4f26-a3b9-7e0d2f4c8a51', order_id: 90003, user_id: 1007, method: 'alipay', amount: 7480.25, fee: 224.41, currency: 'CNY', status: 'pending', is_refunded: false, paid_at: null, created_at: '2025-03-28 11:15:22', remark: null },
      { id: 'e5c8a4f2-3b97-4d51-8e06-9f1a2b3c4d57', order_id: 90004, user_id: 1004, method: 'unionpay', amount: 4960.9, fee: 148.83, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-28 13:42:30', created_at: '2025-03-28 13:41:59', remark: '批量支付' },
      { id: 'f2d7e9a3-6c48-4b05-92f7-4a8b1c3d5e62', order_id: 90006, user_id: 1006, method: 'wechat_pay', amount: 349.9, fee: 10.5, currency: 'CNY', status: 'refunded', is_refunded: true, paid_at: '2025-03-28 16:24:02', created_at: '2025-03-28 16:23:29', remark: null },
      { id: 'a8f1c3d5-7e29-4b64-8d03-5c6b7a8f9e04', order_id: 90007, user_id: 1013, method: 'balance', amount: 93.2, fee: 0, currency: 'CNY', status: 'pending', is_refunded: false, paid_at: null, created_at: '2025-03-28 17:05:55', remark: '七天无理由退款' },
      { id: 'b6d4e8f0-2a95-4c37-b615-8e9f0a1b2c33', order_id: 90008, user_id: 1009, method: 'alipay', amount: 1480, fee: 44.4, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-29 08:31:58', created_at: '2025-03-29 08:31:31', remark: null },
      { id: 'c3e7f9a1-5d86-4b02-9c48-7a0b1c2d3e44', order_id: 90010, user_id: 1008, method: 'unionpay', amount: 218, fee: 6.54, currency: 'CNY', status: 'refunded', is_refunded: true, paid_at: '2025-03-29 11:13:15', created_at: '2025-03-29 11:12:51', remark: null },
      { id: 'd9b4c6e8-1f27-4a83-95c6-4d7e8f9a0b12', order_id: 90011, user_id: 1001, method: 'wechat_pay', amount: 4020, fee: 120.6, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-29 14:27:01', created_at: '2025-03-29 14:26:19', remark: '客户要求开专票' },
      { id: 'e2a5d7f9-3b68-4d14-8e75-9f0a1b2c3d45', order_id: 90012, user_id: 1012, method: 'alipay', amount: 850.8, fee: 25.52, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-29 16:59:30', created_at: '2025-03-29 16:58:57', remark: null },
      { id: 'f4c8a0b2-6d39-4e07-9a58-0b1c2d3e4f56', order_id: 90013, user_id: 1011, method: 'balance', amount: 88.2, fee: 0, currency: 'CNY', status: 'failed', is_refunded: false, paid_at: null, created_at: '2025-03-30 08:09:24', remark: '系统自动对账' },
      { id: 'a1b3d5f7-9e24-4c60-b187-3d5e6f7a8b90', order_id: 90014, user_id: 1002, method: 'alipay', amount: 1280.5, fee: 38.42, currency: 'CNY', status: 'succeeded', is_refunded: false, paid_at: '2025-03-30 10:45:02', created_at: '2025-03-30 10:44:38', remark: null },
    ],
    total: 5321,
  },
  'pg-local/postgres/group/views/v_user_order_stats': {
    columns: [
      { key: 'user_id', name: 'user_id', type: 'integer' },
      { key: 'full_name', name: 'full_name', type: 'varchar(64)' },
      { key: 'order_count', name: 'order_count', type: 'integer' },
      { key: 'total_spent', name: 'total_spent', type: 'numeric(14,2)' },
      { key: 'avg_order_amount', name: 'avg_order_amount', type: 'numeric(12,2)' },
      { key: 'last_order_at', name: 'last_order_at', type: 'timestamptz' },
      { key: 'is_vip', name: 'is_vip', type: 'boolean' },
      { key: 'city', name: 'city', type: 'varchar(32)' },
    ],
    rows: [
      { user_id: 1001, full_name: '伟', order_count: 12, total_spent: 12840.75, avg_order_amount: 1070.06, last_order_at: '2025-03-30 10:45:02', is_vip: true, city: '杭州' },
      { user_id: 1002, full_name: '娜', order_count: 6, total_spent: 4290.5, avg_order_amount: 715.08, last_order_at: '2025-03-30 10:44:26', is_vip: false, city: '上海' },
      { user_id: 1004, full_name: '晓雯', order_count: 21, total_spent: 31860.2, avg_order_amount: 1517.15, last_order_at: '2025-03-30 12:19:48', is_vip: true, city: '深圳' },
      { user_id: 1006, full_name: '小美', order_count: 2, total_spent: 699.8, avg_order_amount: 349.9, last_order_at: '2025-03-28 16:23:18', is_vip: false, city: '成都' },
      { user_id: 1007, full_name: '文博', order_count: 34, total_spent: 52780.4, avg_order_amount: 1552.36, last_order_at: '2025-03-29 14:27:01', is_vip: true, city: '杭州' },
      { user_id: 1009, full_name: '天成', order_count: 9, total_spent: 6740, avg_order_amount: 748.89, last_order_at: '2025-03-29 08:31:58', is_vip: false, city: '北京' },
      { user_id: 1010, full_name: '雨欣', order_count: 17, total_spent: 24180.9, avg_order_amount: 1422.4, last_order_at: '2025-03-29 16:59:30', is_vip: true, city: '上海' },
      { user_id: 1012, full_name: '梦琪', order_count: 8, total_spent: 8930.25, avg_order_amount: 1116.28, last_order_at: '2025-03-29 14:26:07', is_vip: false, city: '广州' },
      { user_id: 1013, full_name: '俊辉', order_count: 1, total_spent: 96.6, avg_order_amount: 96.6, last_order_at: '2025-03-28 17:05:44', is_vip: false, city: '南京' },
      { user_id: 1005, full_name: '建国', order_count: 0, total_spent: 0, avg_order_amount: 0, last_order_at: null, is_vip: false, city: '武汉' },
      { user_id: 1011, full_name: '浩然', order_count: 1, total_spent: 88.2, avg_order_amount: 88.2, last_order_at: '2025-03-30 08:09:12', is_vip: false, city: '西安' },
      { user_id: 1014, full_name: '紫涵', order_count: 0, total_spent: 0, avg_order_amount: 0, last_order_at: null, is_vip: false, city: '杭州' },
    ],
    total: 1284,
  },
  'pg-local/postgres/group/views/v_low_stock_products': {
    columns: [
      { key: 'sku', name: 'sku', type: 'varchar(64)' },
      { key: 'title', name: 'title', type: 'varchar(160)' },
      { key: 'category', name: 'category', type: 'varchar(64)' },
      { key: 'stock', name: 'stock', type: 'integer' },
      { key: 'safety_stock', name: 'safety_stock', type: 'integer' },
      { key: 'shortage', name: 'shortage', type: 'integer' },
      { key: 'unit_price', name: 'unit_price', type: 'numeric(12,2)' },
      { key: 'is_active', name: 'is_active', type: 'boolean' },
      { key: 'warehouse', name: 'warehouse', type: 'varchar(64)', nullable: true },
    ],
    rows: [
      { sku: 'MS-2211-WH', title: '无线人体工学鼠标', category: '外设', stock: 342, safety_stock: 100, shortage: 0, unit_price: 269, is_active: true, warehouse: '华东仓' },
      { sku: 'MN-3301-27', title: '27 英寸 4K 显示器', category: '显示设备', stock: 17, safety_stock: 20, shortage: 3, unit_price: 2899, is_active: true, warehouse: null },
      { sku: 'MN-2408-24', title: '24 英寸 1080P 显示器', category: '显示设备', stock: 5, safety_stock: 30, shortage: 25, unit_price: 899, is_active: false, warehouse: '华东仓' },
      { sku: 'HD-9090-4K', title: '4K 摄像头', category: '外设', stock: 0, safety_stock: 50, shortage: 50, unit_price: 749, is_active: false, warehouse: null },
      { sku: 'KB-1043-WHT', title: '机械键盘 87 键 白色', category: '外设', stock: 64, safety_stock: 80, shortage: 16, unit_price: 499, is_active: true, warehouse: '华北仓' },
      { sku: 'DSK-7701-WD', title: '实木升降桌', category: '办公家具', stock: 23, safety_stock: 25, shortage: 2, unit_price: 2180, is_active: true, warehouse: '华东仓' },
      { sku: 'CHR-5502-GR', title: '人体工学办公椅', category: '办公家具', stock: 41, safety_stock: 40, shortage: 0, unit_price: 1580, is_active: true, warehouse: null },
      { sku: 'HUB-7710-8P', title: '八口 USB 3.2 集线器', category: '外设', stock: 96, safety_stock: 60, shortage: 0, unit_price: 329, is_active: true, warehouse: '华东仓' },
      { sku: 'SSD-1T-NVME', title: '1TB NVMe 固态硬盘', category: '存储', stock: 213, safety_stock: 80, shortage: 0, unit_price: 649, is_active: true, warehouse: '华南仓' },
      { sku: 'RAM-32G-DDR5', title: '32GB DDR5 内存条', category: '存储', stock: 58, safety_stock: 60, shortage: 2, unit_price: 899, is_active: true, warehouse: null },
      { sku: 'LAP-1560-M1', title: '15.6 英寸笔记本支架', category: '办公家具', stock: 187, safety_stock: 100, shortage: 0, unit_price: 159, is_active: true, warehouse: '华东仓' },
      { sku: 'KB-1042-BLK', title: '机械键盘 87 键 黑色', category: '外设', stock: 128, safety_stock: 100, shortage: 0, unit_price: 499, is_active: true, warehouse: null },
    ],
    total: 37,
  },
  'mysql-local/shop/users': {
    columns: [
      { key: 'id', name: 'id', type: 'bigint', pk: true, nullable: false },
      { key: 'username', name: 'username', type: 'varchar(64)' },
      { key: 'email', name: 'email', type: 'varchar(255)' },
      { key: 'display_name', name: 'display_name', type: 'varchar(64)' },
      { key: 'phone', name: 'phone', type: 'varchar(20)', nullable: true },
      { key: 'status', name: 'status', type: 'enum' },
      { key: 'balance', name: 'balance', type: 'decimal(12,2)' },
      { key: 'credit_score', name: 'credit_score', type: 'smallint' },
      { key: 'is_verified', name: 'is_verified', type: 'tinyint(1)' },
      { key: 'avatar', name: 'avatar', type: 'blob', nullable: true },
      { key: 'preferences', name: 'preferences', type: 'json', nullable: true },
      { key: 'created_at', name: 'created_at', type: 'datetime' },
      { key: 'updated_at', name: 'updated_at', type: 'datetime' },
    ],
    rows: [
      { id: 1001, username: 'wei', email: 'wei@example.com', display_name: '伟', phone: '13800001111', status: 'active', balance: 1280.5, credit_score: 720, is_verified: 1, avatar: '0x89504e470d0a1a0a0000000d49484452', preferences: { theme: 'dark', lang: 'zh-CN', notify: true }, created_at: '2025-03-28 09:12:44', updated_at: '2025-03-28 09:12:44' },
      { id: 1002, username: 'na', email: 'na@example.com', display_name: '娜', phone: null, status: 'active', balance: 640, credit_score: 685, is_verified: 1, avatar: null, preferences: { theme: 'light', lang: 'zh-CN', notify: false }, created_at: '2025-05-11 14:03:19', updated_at: '2025-06-02 19:41:07' },
      { id: 1003, username: 'zhiqiang', email: 'zhiqiang@example.com', display_name: '志强', phone: '13900002222', status: 'inactive', balance: 12.75, credit_score: 540, is_verified: 0, avatar: '0x1f8b0800000000000003', preferences: null, created_at: '2025-02-09 08:41:02', updated_at: '2025-06-18 10:22:31' },
      { id: 1004, username: 'xiaowen', email: 'xiaowen@example.com', display_name: '晓雯', phone: '13700003333', status: 'active', balance: 5210.9, credit_score: 758, is_verified: 1, avatar: '0xffd8ffe000104a464946', preferences: { theme: 'light', lang: 'zh-CN', notify: true, beta: true }, created_at: '2025-01-19 22:07:55', updated_at: '2025-03-28 08:15:20' },
      { id: 1005, username: 'jianguo', email: 'jianguo@example.com', display_name: '建国', phone: null, status: 'inactive', balance: 0, credit_score: 501, is_verified: 0, avatar: null, preferences: { theme: 'system', lang: 'zh-CN' }, created_at: '2025-07-30 16:55:03', updated_at: '2025-08-11 09:26:48' },
      { id: 1006, username: 'xiaomei', email: 'xiaomei@example.com', display_name: '小美', phone: '13600004444', status: 'active', balance: 349.9, credit_score: 703, is_verified: 1, avatar: '0x474946383961', preferences: null, created_at: '2025-04-22 11:30:12', updated_at: '2025-04-22 11:30:12' },
      { id: 1007, username: 'wenbo', email: 'wenbo@example.com', display_name: '文博', phone: '13500005555', status: 'active', balance: 7980.25, credit_score: 812, is_verified: 1, avatar: '0x89504e470d0a1a0a0000000d49484452', preferences: { theme: 'dark', lang: 'zh-CN', notify: true, newsletter: true }, created_at: '2025-08-14 09:18:47', updated_at: '2025-08-14 09:18:47' },
      { id: 1008, username: 'jingyi', email: 'jingyi@example.com', display_name: '静怡', phone: null, status: 'banned', balance: 0, credit_score: 430, is_verified: 0, avatar: null, preferences: null, created_at: '2025-06-03 13:44:59', updated_at: '2025-06-20 09:00:00' },
      { id: 1009, username: 'tiancheng', email: 'tiancheng@example.com', display_name: '天成', phone: '13400006666', status: 'active', balance: 1560, credit_score: 741, is_verified: 1, avatar: null, preferences: { theme: 'light', lang: 'zh-CN', notify: false }, created_at: '2025-09-01 07:22:10', updated_at: '2025-09-14 12:07:33' },
      { id: 1010, username: 'yuxin', email: 'yuxin@example.com', display_name: '雨欣', phone: '13300007777', status: 'active', balance: 2750.75, credit_score: 769, is_verified: 1, avatar: '0x89504e470d0a1a0a0000000d49484452', preferences: { theme: 'dark', lang: 'zh-CN', notify: true }, created_at: '2024-12-25 20:14:36', updated_at: '2025-01-09 17:52:04' },
      { id: 1011, username: 'haoran', email: 'haoran@example.com', display_name: '浩然', phone: null, status: 'inactive', balance: 88.2, credit_score: 598, is_verified: 0, avatar: null, preferences: { theme: 'light', lang: 'zh-CN' }, created_at: '2025-10-08 18:36:04', updated_at: '2025-10-22 08:44:19' },
      { id: 1012, username: 'mengqi', email: 'mengqi@example.com', display_name: '梦琪', phone: '13200008888', status: 'active', balance: 4320, credit_score: 795, is_verified: 1, avatar: '0xffd8ffe000104a464946', preferences: { theme: 'system', lang: 'zh-CN', notify: true, designer: true }, created_at: '2025-05-27 10:08:29', updated_at: '2025-05-27 10:08:29' },
      { id: 1013, username: 'junhui', email: 'junhui@example.com', display_name: '俊辉', phone: null, status: 'active', balance: 96.6, credit_score: 655, is_verified: 1, avatar: null, preferences: null, created_at: '2025-11-12 12:49:17', updated_at: '2025-11-12 12:49:17' },
      { id: 1014, username: 'zihan', email: 'zihan@example.com', display_name: '紫涵', phone: '13100009999', status: 'inactive', balance: 0, credit_score: 512, is_verified: 0, avatar: null, preferences: { theme: 'light', lang: 'zh-CN', notify: false }, created_at: '2025-12-03 09:00:00', updated_at: '2025-12-10 15:33:41' },
    ],
    total: 1284,
  },
  'mysql-local/shop/orders': {
    columns: [
      { key: 'id', name: 'id', type: 'bigint', pk: true, nullable: false },
      { key: 'order_sn', name: 'order_sn', type: 'varchar(40)' },
      { key: 'user_id', name: 'user_id', type: 'bigint' },
      { key: 'order_status', name: 'order_status', type: 'varchar(24)' },
      { key: 'pay_channel', name: 'pay_channel', type: 'varchar(24)' },
      { key: 'total_amount', name: 'total_amount', type: 'decimal(12,2)' },
      { key: 'freight_fee', name: 'freight_fee', type: 'decimal(12,2)' },
      { key: 'paid_amount', name: 'paid_amount', type: 'decimal(12,2)', nullable: true },
      { key: 'item_count', name: 'item_count', type: 'int' },
      { key: 'is_paid', name: 'is_paid', type: 'tinyint(1)' },
      { key: 'shipping_address', name: 'shipping_address', type: 'json' },
      { key: 'remark', name: 'remark', type: 'varchar(255)', nullable: true },
      { key: 'created_at', name: 'created_at', type: 'datetime' },
      { key: 'paid_at', name: 'paid_at', type: 'datetime', nullable: true },
    ],
    rows: [
      { id: 90001, order_sn: 'SO20250328000123', user_id: 1001, order_status: 'paid', pay_channel: 'alipay', total_amount: 1280.5, freight_fee: 0, paid_amount: 1160.5, item_count: 3, is_paid: 1, shipping_address: { receiver: '伟', phone: '13800001111', city: '杭州', detail: '西湖区文三路 100 号' }, remark: '工作日送货', created_at: '2025-03-28 09:20:11', paid_at: '2025-03-28 09:21:03' },
      { id: 90002, order_sn: 'SO20250328000124', user_id: 1002, order_status: 'shipped', pay_channel: 'wechat_pay', total_amount: 640, freight_fee: 0, paid_amount: 640, item_count: 1, is_paid: 1, shipping_address: { receiver: '娜', phone: null, city: '上海', detail: '浦东新区世纪大道 1 号' }, remark: null, created_at: '2025-03-28 10:02:47', paid_at: '2025-03-28 10:03:22' },
      { id: 90003, order_sn: 'SO20250328000125', user_id: 1007, order_status: 'pending', pay_channel: 'alipay', total_amount: 7980.25, freight_fee: 0, paid_amount: null, item_count: 6, is_paid: 0, shipping_address: { receiver: '文博', phone: '13500005555', city: '杭州', detail: '余杭区文一西路 969 号' }, remark: '发票抬头:杭州某某科技有限公司', created_at: '2025-03-28 11:15:09', paid_at: null },
      { id: 90004, order_sn: 'SO20250328000126', user_id: 1004, order_status: 'paid', pay_channel: 'unionpay', total_amount: 5210.9, freight_fee: 0, paid_amount: 4960.9, item_count: 4, is_paid: 1, shipping_address: { receiver: '晓雯', phone: '13700003333', city: '深圳', detail: '南山区科苑南路 8 号' }, remark: null, created_at: '2025-03-28 13:41:52', paid_at: '2025-03-28 13:42:30' },
      { id: 90005, order_sn: 'SO20250328000127', user_id: 1010, order_status: 'cancelled', pay_channel: 'wechat_pay', total_amount: 2750.75, freight_fee: 12, paid_amount: null, item_count: 2, is_paid: 0, shipping_address: { receiver: '雨欣', phone: '13300007777', city: '上海', detail: '徐汇区漕溪北路 88 号' }, remark: '客户临时取消', created_at: '2025-03-28 14:58:36', paid_at: null },
      { id: 90006, order_sn: 'SO20250328000128', user_id: 1006, order_status: 'refunded', pay_channel: 'alipay', total_amount: 349.9, freight_fee: 0, paid_amount: 349.9, item_count: 1, is_paid: 1, shipping_address: { receiver: '小美', phone: '13600004444', city: '成都', detail: '武侯区天府三街 5 号' }, remark: '七天无理由退货', created_at: '2025-03-28 16:23:18', paid_at: '2025-03-28 16:24:02' },
      { id: 90007, order_sn: 'SO20250328000129', user_id: 1013, order_status: 'pending', pay_channel: 'balance', total_amount: 96.6, freight_fee: 8, paid_amount: null, item_count: 1, is_paid: 0, shipping_address: { receiver: '俊辉', phone: null, city: '南京', detail: '建邺区江东中路 300 号' }, remark: null, created_at: '2025-03-28 17:05:44', paid_at: null },
      { id: 90008, order_sn: 'SO20250329000130', user_id: 1009, order_status: 'paid', pay_channel: 'alipay', total_amount: 1560, freight_fee: 0, paid_amount: 1480, item_count: 5, is_paid: 1, shipping_address: { receiver: '天成', phone: '13400006666', city: '北京', detail: '海淀区中关村大街 27 号' }, remark: '批量采购,需要增值税专票', created_at: '2025-03-29 08:31:20', paid_at: '2025-03-29 08:31:58' },
      { id: 90009, order_sn: 'SO20250329000131', user_id: 1005, order_status: 'pending', pay_channel: 'wechat_pay', total_amount: 59.9, freight_fee: 10, paid_amount: null, item_count: 1, is_paid: 0, shipping_address: { receiver: '建国', phone: null, city: '武汉', detail: '洪山区珞喻路 100 号' }, remark: null, created_at: '2025-03-29 09:47:03', paid_at: null },
      { id: 90010, order_sn: 'SO20250329000132', user_id: 1008, order_status: 'refunded', pay_channel: 'unionpay', total_amount: 218, freight_fee: 0, paid_amount: 218, item_count: 2, is_paid: 1, shipping_address: { receiver: '静怡', phone: null, city: '北京', detail: '朝阳区建国路 118 号' }, remark: '退款已原路返回', created_at: '2025-03-29 11:12:39', paid_at: '2025-03-29 11:13:15' },
      { id: 90011, order_sn: 'SO20250329000133', user_id: 1001, order_status: 'shipped', pay_channel: 'alipay', total_amount: 4320, freight_fee: 0, paid_amount: 4020, item_count: 4, is_paid: 1, shipping_address: { receiver: '伟', phone: '13800001111', city: '杭州', detail: '西湖区文三路 100 号' }, remark: null, created_at: '2025-03-29 14:26:07', paid_at: '2025-03-29 14:27:01' },
      { id: 90012, order_sn: 'SO20250329000134', user_id: 1012, order_status: 'paid', pay_channel: 'wechat_pay', total_amount: 875.4, freight_fee: 0, paid_amount: 850.8, item_count: 3, is_paid: 1, shipping_address: { receiver: '梦琪', phone: '13200008888', city: '广州', detail: '天河区天河路 228 号' }, remark: '包邮', created_at: '2025-03-29 16:58:51', paid_at: '2025-03-29 16:59:30' },
      { id: 90013, order_sn: 'SO20250330000135', user_id: 1011, order_status: 'cancelled', pay_channel: 'balance', total_amount: 88.2, freight_fee: 10, paid_amount: null, item_count: 1, is_paid: 0, shipping_address: { receiver: '浩然', phone: null, city: '西安', detail: '雁塔区高新四路 12 号' }, remark: null, created_at: '2025-03-30 08:09:12', paid_at: null },
      { id: 90014, order_sn: 'SO20250330000136', user_id: 1002, order_status: 'paid', pay_channel: 'alipay', total_amount: 1280.5, freight_fee: 0, paid_amount: 1280.5, item_count: 3, is_paid: 1, shipping_address: { receiver: '娜', phone: null, city: '上海', detail: '浦东新区世纪大道 1 号' }, remark: '加急发货', created_at: '2025-03-30 10:44:26', paid_at: '2025-03-30 10:45:02' },
      { id: 90015, order_sn: 'SO20250330000137', user_id: 1004, order_status: 'pending', pay_channel: 'wechat_pay', total_amount: 199.9, freight_fee: 8, paid_amount: null, item_count: 1, is_paid: 0, shipping_address: { receiver: '晓雯', phone: '13700003333', city: '深圳', detail: '南山区科苑南路 8 号' }, remark: null, created_at: '2025-03-30 12:19:48', paid_at: null },
    ],
    total: 5321,
  },
  'mysql-local/shop/order_items': {
    columns: [
      { key: 'id', name: 'id', type: 'bigint', pk: true, nullable: false },
      { key: 'order_id', name: 'order_id', type: 'bigint' },
      { key: 'product_id', name: 'product_id', type: 'bigint' },
      { key: 'product_name', name: 'product_name', type: 'varchar(128)' },
      { key: 'sku_code', name: 'sku_code', type: 'varchar(64)' },
      { key: 'quantity', name: 'quantity', type: 'int' },
      { key: 'unit_price', name: 'unit_price', type: 'decimal(12,2)' },
      { key: 'discount', name: 'discount', type: 'decimal(12,2)' },
      { key: 'line_total', name: 'line_total', type: 'decimal(12,2)' },
      { key: 'is_gift', name: 'is_gift', type: 'tinyint(1)' },
      { key: 'created_at', name: 'created_at', type: 'datetime' },
      { key: 'gift_note', name: 'gift_note', type: 'varchar(128)', nullable: true },
    ],
    rows: [
      { id: 700001, order_id: 90001, product_id: 2001, product_name: '机械键盘 87 键 黑色', sku_code: 'KB-1042-BLK', quantity: 1, unit_price: 499, discount: 0, line_total: 499, is_gift: 0, created_at: '2025-03-28 09:20:12', gift_note: '满赠活动赠送' },
      { id: 700002, order_id: 90001, product_id: 2003, product_name: '无线人体工学鼠标', sku_code: 'MS-2211-WH', quantity: 1, unit_price: 269, discount: 30, line_total: 239, is_gift: 0, created_at: '2025-03-28 09:20:13', gift_note: null },
      { id: 700003, order_id: 90001, product_id: 2012, product_name: '15.6 英寸笔记本支架', sku_code: 'LAP-1560-M1', quantity: 1, unit_price: 159, discount: 0, line_total: 159, is_gift: 1, created_at: '2025-03-28 09:20:14', gift_note: '满赠活动赠送' },
      { id: 700004, order_id: 90002, product_id: 2003, product_name: '无线人体工学鼠标', sku_code: 'MS-2211-WH', quantity: 1, unit_price: 269, discount: 0, line_total: 269, is_gift: 0, created_at: '2025-03-28 10:02:48', gift_note: null },
      { id: 700005, order_id: 90003, product_id: 2004, product_name: '27 英寸 4K 显示器', sku_code: 'MN-3301-27', quantity: 1, unit_price: 2899, discount: 300, line_total: 2599, is_gift: 0, created_at: '2025-03-28 11:15:10', gift_note: null },
      { id: 700006, order_id: 90003, product_id: 2010, product_name: '1TB NVMe 固态硬盘', sku_code: 'SSD-1T-NVME', quantity: 2, unit_price: 649, discount: 100, line_total: 1198, is_gift: 0, created_at: '2025-03-28 11:15:11', gift_note: null },
      { id: 700007, order_id: 90003, product_id: 2011, product_name: '32GB DDR5 内存条', sku_code: 'RAM-32G-DDR5', quantity: 2, unit_price: 899, discount: 0, line_total: 1798, is_gift: 0, created_at: '2025-03-28 11:15:12', gift_note: null },
      { id: 700008, order_id: 90004, product_id: 2006, product_name: '实木升降桌', sku_code: 'DSK-7701-WD', quantity: 1, unit_price: 2180, discount: 250, line_total: 1930, is_gift: 0, created_at: '2025-03-28 13:41:53', gift_note: null },
      { id: 700009, order_id: 90004, product_id: 2007, product_name: '人体工学办公椅', sku_code: 'CHR-5502-GR', quantity: 1, unit_price: 1580, discount: 0, line_total: 1580, is_gift: 0, created_at: '2025-03-28 13:41:54', gift_note: null },
      { id: 700010, order_id: 90005, product_id: 2012, product_name: '15.6 英寸笔记本支架', sku_code: 'LAP-1560-M1', quantity: 2, unit_price: 159, discount: 0, line_total: 318, is_gift: 0, created_at: '2025-03-28 14:58:37', gift_note: null },
      { id: 700011, order_id: 90006, product_id: 2003, product_name: '无线人体工学鼠标', sku_code: 'MS-2211-WH', quantity: 1, unit_price: 269, discount: 0, line_total: 269, is_gift: 0, created_at: '2025-03-28 16:23:19', gift_note: null },
      { id: 700012, order_id: 90008, product_id: 2009, product_name: '八口 USB 3.2 集线器', sku_code: 'HUB-7710-8P', quantity: 3, unit_price: 329, discount: 80, line_total: 907, is_gift: 0, created_at: '2025-03-29 08:31:21', gift_note: null },
      { id: 700013, order_id: 90008, product_id: 2005, product_name: '24 英寸 1080P 显示器', sku_code: 'MN-2408-24', quantity: 1, unit_price: 899, discount: 0, line_total: 899, is_gift: 0, created_at: '2025-03-29 08:31:22', gift_note: null },
    ],
    total: 18647,
  },
  'mysql-local/shop/v_recent_orders': {
    columns: [
      { key: 'order_sn', name: 'order_sn', type: 'varchar(40)' },
      { key: 'customer_name', name: 'customer_name', type: 'varchar(64)' },
      { key: 'order_status', name: 'order_status', type: 'varchar(24)' },
      { key: 'total_amount', name: 'total_amount', type: 'decimal(12,2)' },
      { key: 'item_count', name: 'item_count', type: 'int' },
      { key: 'pay_channel', name: 'pay_channel', type: 'varchar(24)' },
      { key: 'is_paid', name: 'is_paid', type: 'tinyint(1)' },
      { key: 'placed_at', name: 'placed_at', type: 'datetime' },
      { key: 'city', name: 'city', type: 'varchar(32)' },
      { key: 'remark', name: 'remark', type: 'varchar(255)', nullable: true },
    ],
    rows: [
      { order_sn: 'SO20250330000137', customer_name: '晓雯', order_status: 'pending', total_amount: 199.9, item_count: 1, pay_channel: 'wechat_pay', is_paid: 0, placed_at: '2025-03-30 12:19:48', city: '深圳', remark: '加急发货' },
      { order_sn: 'SO20250330000136', customer_name: '娜', order_status: 'paid', total_amount: 1280.5, item_count: 3, pay_channel: 'alipay', is_paid: 1, placed_at: '2025-03-30 10:44:26', city: '上海', remark: null },
      { order_sn: 'SO20250330000135', customer_name: '浩然', order_status: 'cancelled', total_amount: 88.2, item_count: 1, pay_channel: 'balance', is_paid: 0, placed_at: '2025-03-30 08:09:12', city: '西安', remark: '客户临时取消' },
      { order_sn: 'SO20250329000134', customer_name: '梦琪', order_status: 'paid', total_amount: 875.4, item_count: 3, pay_channel: 'wechat_pay', is_paid: 1, placed_at: '2025-03-29 16:58:51', city: '广州', remark: null },
      { order_sn: 'SO20250329000133', customer_name: '伟', order_status: 'shipped', total_amount: 4320, item_count: 4, pay_channel: 'alipay', is_paid: 1, placed_at: '2025-03-29 14:26:07', city: '杭州', remark: null },
      { order_sn: 'SO20250329000132', customer_name: '静怡', order_status: 'refunded', total_amount: 218, item_count: 2, pay_channel: 'unionpay', is_paid: 1, placed_at: '2025-03-29 11:12:39', city: '北京', remark: '退款已原路返回' },
      { order_sn: 'SO20250329000131', customer_name: '建国', order_status: 'pending', total_amount: 59.9, item_count: 1, pay_channel: 'wechat_pay', is_paid: 0, placed_at: '2025-03-29 09:47:03', city: '武汉', remark: null },
      { order_sn: 'SO20250329000130', customer_name: '天成', order_status: 'paid', total_amount: 1560, item_count: 5, pay_channel: 'alipay', is_paid: 1, placed_at: '2025-03-29 08:31:20', city: '北京', remark: null },
      { order_sn: 'SO20250328000129', customer_name: '俊辉', order_status: 'pending', total_amount: 96.6, item_count: 1, pay_channel: 'balance', is_paid: 0, placed_at: '2025-03-28 17:05:44', city: '南京', remark: null },
      { order_sn: 'SO20250328000128', customer_name: '小美', order_status: 'refunded', total_amount: 349.9, item_count: 1, pay_channel: 'alipay', is_paid: 1, placed_at: '2025-03-28 16:23:18', city: '成都', remark: '批量采购' },
      { order_sn: 'SO20250328000127', customer_name: '雨欣', order_status: 'cancelled', total_amount: 2750.75, item_count: 2, pay_channel: 'wechat_pay', is_paid: 0, placed_at: '2025-03-28 14:58:36', city: '上海', remark: null },
      { order_sn: 'SO20250328000126', customer_name: '晓雯', order_status: 'paid', total_amount: 5210.9, item_count: 4, pay_channel: 'unionpay', is_paid: 1, placed_at: '2025-03-28 13:41:52', city: '深圳', remark: '会员积分抵扣' },
    ],
    total: 500,
  },
};

/** MongoDB 的文档数据,键为树节点的 dataKey */
export const DOCUMENTS = {
  'mongo-local/shop/users': [
    {
      _id: '665f1a2b3c4d5e6f7a8b9c0d',
      name: '伟',
      email: 'wei@example.com',
      active: true,
      profile: { age: 31, city: '杭州', tier: 'gold', address: { city: '杭州', zip: '310000' } },
      tags: ['vip', 'beta'],
      score: 92.5,
      bio: '后端工程师,偏好 Rust 与 MongoDB。',
      createdAt: '2024-11-03 10:22:08',
      lastLoginAt: '2025-03-28 09:12:44',
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c0e',
      name: '娜',
      email: 'na@example.com',
      active: true,
      profile: { age: 26, city: '上海', tier: 'silver' },
      tags: ['vip'],
      score: 78.2,
      createdAt: '2024-12-18 19:04:33',
      lastLoginAt: null,
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c0f',
      name: '志强',
      email: 'zhiqiang@example.com',
      active: false,
      profile: { age: 38, city: '武汉', tier: 'bronze', address: { city: '武汉', zip: '430000' } },
      tags: [],
      score: 41,
      bio: '账号已冻结,等待人工审核。',
      createdAt: '2024-08-06 08:15:00',
      lastLoginAt: '2025-01-22 16:40:12',
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c10',
      name: '晓雯',
      email: 'xiaowen@example.com',
      active: true,
      profile: { age: 29, city: '深圳', tier: 'gold', address: { city: '深圳', zip: '518000' } },
      tags: ['beta', 'data'],
      score: 88.75,
      bio: '数据分析师,负责增长看板。',
      createdAt: '2025-01-02 14:51:27',
      lastLoginAt: '2025-03-27 21:03:55',
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c11',
      name: '文博',
      email: 'wenbo@example.com',
      active: true,
      profile: { age: 33, city: '杭州', tier: 'gold' },
      tags: ['vip', 'beta', 'design'],
      score: 95.4,
      createdAt: '2025-02-14 09:30:41',
      lastLoginAt: '2025-03-28 22:10:07',
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c12',
      name: '雨欣',
      email: 'yuxin@example.com',
      active: true,
      profile: { age: 27, city: '上海', tier: 'silver', address: { city: '上海', zip: '200000' } },
      tags: ['vip'],
      score: 73.9,
      bio: null,
      createdAt: '2024-09-19 11:26:58',
      lastLoginAt: '2025-03-25 07:44:19',
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c13',
      name: '梦琪',
      email: 'mengqi@example.com',
      active: true,
      profile: { age: 30, city: '广州', tier: 'silver' },
      tags: ['design'],
      score: 81.6,
      createdAt: '2025-03-05 17:08:02',
      lastLoginAt: '2025-03-28 12:55:36',
    },
    {
      _id: '665f1a2b3c4d5e6f7a8b9c14',
      name: '静怡',
      email: 'jingyi@example.com',
      active: false,
      profile: { age: 24, city: '北京', tier: 'bronze', address: { city: '北京', zip: '100000' } },
      tags: [],
      score: 22.8,
      bio: '账号已被封禁。',
      createdAt: '2024-06-30 13:52:11',
      lastLoginAt: null,
    },
  ],
  'mongo-local/shop/orders': [
    {
      _id: '665f2b3c4d5e6f7a8b9c0d1a',
      orderNo: 'SO-2025-000123',
      user: { id: 1001, name: '伟' },
      items: [
        { sku: 'KB-1042-BLK', name: '机械键盘 87 键 黑色', qty: 1, price: 499 },
        { sku: 'MS-2211-WH', name: '无线人体工学鼠标', qty: 1, price: 239 },
      ],
      total: 738,
      currency: 'CNY',
      status: 'paid',
      shipping: { contact: '伟', address: { city: '杭州', detail: '西湖区文三路 100 号' }, express: '顺丰' },
      createdAt: '2025-03-28 09:20:11',
      paidAt: '2025-03-28 09:21:03',
    },
    {
      _id: '665f2b3c4d5e6f7a8b9c0d1b',
      orderNo: 'SO-2025-000124',
      user: { id: 1002, name: '娜' },
      items: [{ sku: 'MS-2211-WH', name: '无线人体工学鼠标', qty: 1, price: 269 }],
      total: 269,
      currency: 'CNY',
      status: 'shipped',
      shipping: { contact: '娜', address: { city: '上海', detail: '浦东新区世纪大道 1 号' }, express: '京东' },
      createdAt: '2025-03-28 10:02:47',
      paidAt: '2025-03-28 10:03:22',
    },
    {
      _id: '665f2b3c4d5e6f7a8b9c0d1c',
      orderNo: 'SO-2025-000125',
      user: { id: 1007, name: '文博' },
      items: [
        { sku: 'MN-3301-27', name: '27 英寸 4K 显示器', qty: 1, price: 2599 },
        { sku: 'SSD-1T-NVME', name: '1TB NVMe 固态硬盘', qty: 2, price: 599 },
      ],
      total: 3797,
      currency: 'CNY',
      status: 'pending',
      shipping: { contact: '文博', address: { city: '杭州', detail: '余杭区文一西路 969 号' }, express: null },
      createdAt: '2025-03-28 11:15:09',
    },
    {
      _id: '665f2b3c4d5e6f7a8b9c0d1d',
      orderNo: 'SO-2025-000126',
      user: { id: 1004, name: '晓雯' },
      items: [
        { sku: 'DSK-7701-WD', name: '实木升降桌', qty: 1, price: 1930 },
        { sku: 'CHR-5502-GR', name: '人体工学办公椅', qty: 1, price: 1580 },
      ],
      total: 3510,
      currency: 'CNY',
      status: 'paid',
      shipping: { contact: '晓雯', address: { city: '深圳', detail: '南山区科苑南路 8 号' }, express: '顺丰' },
      createdAt: '2025-03-28 13:41:52',
      paidAt: '2025-03-28 13:42:30',
    },
    {
      _id: '665f2b3c4d5e6f7a8b9c0d1e',
      orderNo: 'SO-2025-000127',
      user: { id: 1010, name: '雨欣' },
      items: [{ sku: 'LAP-1560-M1', name: '15.6 英寸笔记本支架', qty: 2, price: 159 }],
      total: 318,
      currency: 'CNY',
      status: 'cancelled',
      shipping: { contact: '雨欣', address: { city: '上海', detail: '徐汇区漕溪北路 88 号' }, express: null },
      createdAt: '2025-03-28 14:58:36',
      paidAt: null,
    },
    {
      _id: '665f2b3c4d5e6f7a8b9c0d1f',
      orderNo: 'SO-2025-000128',
      user: { id: 1006, name: '小美' },
      items: [{ sku: 'HD-9090-4K', name: '4K 摄像头', qty: 1, price: 749 }],
      total: 749,
      currency: 'CNY',
      status: 'refunded',
      shipping: { contact: '小美', address: { city: '成都', detail: '武侯区天府三街 5 号' }, express: '中通' },
      createdAt: '2025-03-28 16:23:18',
      paidAt: '2025-03-28 16:24:02',
    },
    {
      _id: '665f2b3c4d5e6f7a8b9c0d20',
      orderNo: 'SO-2025-000128',
      user: { id: 1013, name: '俊辉' },
      items: [
        { sku: 'HUB-7710-8P', name: '八口 USB 3.2 集线器', qty: 3, price: 309 },
        { sku: 'RAM-32G-DDR5', name: '32GB DDR5 内存条', qty: 1, price: 899 },
      ],
      total: 1826,
      currency: 'CNY',
      status: 'pending',
      shipping: { contact: '俊辉', address: { city: '南京', detail: '建邺区江东中路 300 号' }, express: null },
      createdAt: '2025-03-28 17:05:44',
      paidAt: null,
    },
  ],
  'mongo-local/shop/products': [
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea0',
      sku: 'KB-1042-BLK',
      title: '机械键盘 87 键 黑色',
      category: '外设',
      price: 499,
      stock: 128,
      active: true,
      specs: { layout: '87', switch: 'cherry', material: 'abs', weight_g: 980 },
      tags: ['keyboard', 'hot-swap'],
      rating: 4.6,
      updatedAt: '2025-03-28 09:12:44',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea1',
      sku: 'MS-2211-WH',
      title: '无线人体工学鼠标',
      category: '外设',
      price: 269,
      stock: 342,
      active: true,
      specs: { dpi: 2700, battery_hours: 90, material: 'abs', color: 'white' },
      tags: ['mouse', 'wireless'],
      rating: 4.4,
      updatedAt: '2025-03-27 15:08:22',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea2',
      sku: 'MN-3301-27',
      title: '27 英寸 4K 显示器',
      category: '显示设备',
      price: 2899,
      stock: 17,
      active: true,
      specs: { size_inch: 27, resolution: '3840x2160', refresh_hz: 60, panel: 'ips' },
      tags: ['monitor', '4k'],
      rating: 4.8,
      updatedAt: '2025-03-20 11:26:03',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea3',
      sku: 'HD-9090-4K',
      title: '4K 摄像头',
      category: '外设',
      price: 749,
      stock: 0,
      active: false,
      specs: { resolution: '3840x2160', fps: 30, material: 'abs' },
      tags: null,
      updatedAt: '2025-03-25 08:41:37',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea4',
      sku: 'DSK-7701-WD',
      title: '实木升降桌',
      category: '办公家具',
      price: 2180,
      stock: 23,
      active: true,
      specs: { width_mm: 1400, material: 'oak', motor: 'dual', load_kg: 80 },
      tags: ['desk', 'standing'],
      rating: 4.7,
      updatedAt: '2025-03-18 19:52:41',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea5',
      sku: 'CHR-5502-GR',
      title: '人体工学办公椅',
      category: '办公家具',
      price: 1580,
      stock: 41,
      active: true,
      specs: { material: 'mesh', armrest: '4d', color: 'gray', lumbar: true },
      tags: ['chair', 'ergonomic'],
      rating: 4.5,
      updatedAt: '2025-03-12 14:07:58',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea6',
      sku: 'SSD-1T-NVME',
      title: '1TB NVMe 固态硬盘',
      category: '存储',
      price: 649,
      stock: 213,
      active: true,
      specs: { capacity_gb: 1024, interface: 'pcie4', read_mbps: 7000, form: 'm2' },
      tags: ['ssd', 'nvme'],
      rating: 4.9,
      updatedAt: '2025-03-08 10:33:12',
    },
    {
      _id: '665f3c4d5e6f7a8b9c0d1ea7',
      sku: 'LAP-1560-M1',
      title: '15.6 英寸笔记本支架',
      category: '办公家具',
      price: 159,
      stock: 187,
      active: true,
      specs: { material: 'aluminium', folds: 6, height_mm: 160 },
      tags: ['stand'],
      rating: 4.1,
      updatedAt: '2025-03-02 09:15:26',
    },
  ],
};

/** Redis 的键列表,键为树节点的 dataKey */
export const KEYS = {
  'redis-local/db0': [
    { key: 'cache:user:1001', type: 'string', ttl: 300, size: 128, value: '{"name":"伟","tier":"gold"}' },
    { key: 'cache:order:SO-2025-000123', type: 'string', ttl: 600, size: 512, value: '{"status":"paid","amount":1160.5,"currency":"CNY"}' },
    { key: 'config:app:locale', type: 'string', ttl: -1, size: 24, value: 'zh-CN' },
    { key: 'ratelimit:login:10.0.0.7', type: 'string', ttl: 60, size: 18, value: '17' },
    { key: 'cache:stat:daily:2025-03-28', type: 'string', ttl: 3600, size: 2048, value: '{"orders":674,"gmv":638520.4,"refunds":18}' },
    { key: 'lock:invoice:20250328', type: 'string', ttl: 30, size: 36, value: 'node-a:8f2a1c9d' },
    { key: 'config:feature:flags', type: 'string', ttl: -1, size: 96, value: 'new_checkout=true;dark_mode=true;beta=false' },
    { key: 'session:8f2a1c', type: 'hash', ttl: 3600, size: 512, fields: { userId: '1001', ip: '10.0.0.7', ua: 'Chrome/131' } },
    { key: 'user:profile:1001', type: 'hash', ttl: -1, size: 896, fields: { name: '伟', email: 'wei@example.com', tier: 'gold', city: '杭州' } },
    { key: 'cart:9c3a', type: 'hash', ttl: 7200, size: 1240, fields: { 'KB-1042-BLK': '2', 'MS-2211-WH': '1', 'HUB-7710-8P': '3' } },
    { key: 'metrics:api:2025-03-28', type: 'hash', ttl: 86400, size: 320, fields: { requests: '128440', errors: '37', p95_ms: '214', p99_ms: '806' } },
    { key: 'config:env', type: 'hash', ttl: -1, size: 156, fields: { env: 'production', region: 'cn-hangzhou', version: '2025.3.28' } },
    { key: 'queue:emails', type: 'list', ttl: -1, size: 42, values: ['a@example.com', 'b@example.com'] },
    { key: 'queue:webhooks', type: 'list', ttl: -1, size: 128, values: ['https://api.example.com/hook/1', 'https://api.example.com/hook/2', 'https://api.example.com/hook/3'] },
    { key: 'recent:search:1001', type: 'list', ttl: 1800, size: 96, values: ['rust+postgres', 'redis+ttl', 'gpui+treeview'] },
    { key: 'stack:traces:8f2a1c', type: 'list', ttl: 300, size: 2048, values: ['fn main()', 'db.query()', 'render.table()'] },
    { key: 'tags:user:1001', type: 'set', ttl: -1, size: 64, values: ['vip', 'beta', 'shanghai'] },
    { key: 'admins:active', type: 'set', ttl: -1, size: 24, values: ['wei@example.com', 'na@example.com'] },
    { key: 'blocked:ips', type: 'set', ttl: 3600, size: 32, values: ['203.0.113.7', '198.51.100.22'] },
    { key: 'leaderboard:weekly', type: 'zset', ttl: -1, size: 640, entries: [{ member: 'user:1001', score: 1280.5 }, { member: 'user:1007', score: 5120.25 }, { member: 'user:1004', score: 4310 }] },
    { key: 'queue:priority', type: 'zset', ttl: -1, size: 256, entries: [{ member: 'job:8842', score: 1 }, { member: 'job:8843', score: 2 }, { member: 'job:8844', score: 3 }] },
    { key: 'delay:tasks', type: 'zset', ttl: 600, size: 384, entries: [{ member: 'retry:mail:1', score: 1712345678 }, { member: 'retry:mail:2', score: 1712345778 }] },
    { key: 'range:score:1001', type: 'zset', ttl: -1, size: 96, entries: [{ member: '2025-03-26', score: 1 }, { member: '2025-03-27', score: 2 }, { member: '2025-03-28', score: 3 }] },
  ],
};

/** 界面文案与引擎分组信息 */
export const UI_COPY = {
  appName: 'SelaDB',
  // 对象类型的显示名与图标 key
  objectKinds: {
    connection: { label: '连接', icon: 'connection' },
    database: { label: '数据库', icon: 'database' },
    schema: { label: '模式', icon: 'schema' },
    group: { label: '分组', icon: 'group' },
    table: { label: '表', icon: 'table' },
    view: { label: '视图', icon: 'view' },
    collection: { label: '集合', icon: 'collection' },
    function: { label: '函数', icon: 'function' },
    procedure: { label: '存储过程', icon: 'procedure' },
    sequence: { label: '序列', icon: 'sequence' },
    index: { label: '索引', icon: 'index' },
    trigger: { label: '触发器', icon: 'trigger' },
    event: { label: '事件', icon: 'event' },
  },
  // 引擎的分组标题
  groupLabels: {
    tables: '表',
    views: '视图',
    functions: '函数',
    procedures: '存储过程',
    sequences: '序列',
    collections: '集合',
    indexes: '索引',
    events: '事件',
  },
};

/* =============================================================================
 * 表结构
 *
 * 列定义从 TABLE_DATA 派生 —— 同一份列不能在两处维护,否则改一处另一处就
 * 对不上。索引、约束、外键按各引擎的习惯补齐:PostgreSQL 用 schema 限定名、
 * btree 索引方法和独立的外键 ALTER 语句;MySQL 用反引号、KEY 索引和
 * ENGINE=InnoDB 的建表尾巴。
 * ========================================================================== */

/** 列名 → 中文注释。只覆盖常见的,覆盖不到就不写注释。 */
const COLUMN_COMMENTS = {
  id: "主键",
  uuid: "唯一标识",
  user_id: "所属用户",
  order_id: "所属订单",
  product_id: "所属商品",
  order_no: "订单编号",
  order_sn: "订单编号",
  order_status: "订单状态",
  status: "状态",
  email: "邮箱地址",
  username: "登录名",
  name: "名称",
  full_name: "姓名",
  display_name: "显示名",
  title: "标题",
  sku: "库存编码",
  sku_code: "库存编码",
  phone: "手机号",
  token: "会话令牌",
  currency: "币种",
  balance: "账户余额",
  total_amount: "订单总额",
  total_spent: "累计消费",
  price: "单价",
  unit_price: "单价",
  amount: "金额",
  fee: "手续费",
  quantity: "数量",
  stock: "库存量",
  item_count: "条目数",
  order_count: "订单数",
  is_active: "是否启用",
  is_paid: "是否已支付",
  is_vip: "是否 VIP",
  is_verified: "是否已认证",
  is_success: "是否成功",
  is_refunded: "是否已退款",
  on_sale: "是否在售",
  is_gift: "是否赠品",
  created_at: "创建时间",
  updated_at: "更新时间",
  deleted_at: "删除时间",
  paid_at: "支付时间",
  expires_at: "过期时间",
  last_seen_at: "最后活跃时间",
  last_login_at: "最后登录时间",
  registered_at: "注册时间",
  generated_at: "生成时间",
  remark: "备注",
  bio: "个人简介",
  tags: "标签",
  payload: "业务载荷",
  detail: "明细",
  attributes: "扩展属性",
  preferences: "偏好设置",
  shipping_address: "收货地址",
  ip_address: "来源 IP",
  user_agent: "客户端标识",
  device: "设备类型",
  avatar: "头像",
  thumbnail: "缩略图",
  locale: "语言地区",
};

/** 状态列的取值范围,用来生成 CHECK 约束。 */
const STATUS_VALUES = {
  status: ["active", "inactive", "banned", "pending"],
  order_status: ["created", "paid", "shipped", "completed", "cancelled", "refunded"],
  pay_channel: ["alipay", "wechat", "card", "balance"],
  method: ["alipay", "wechat", "card", "bank"],
  tier: ["bronze", "silver", "gold", "platinum"],
  device: ["ios", "android", "web", "desktop"],
};

/** `_id` 后缀列 → 被引用的表。 */
const FK_TARGETS = {
  user_id: "users",
  order_id: "orders",
  product_id: "products",
};

/** 天然键列:这类列上会建唯一索引。 */
const UNIQUE_KEY_COLUMNS = new Set([
  "email", "username", "order_no", "order_sn", "sku", "sku_code", "token", "uuid", "request_id",
]);

/** 时间列:这类列上会建普通索引。 */
const INDEXED_TIME_COLUMNS = new Set([
  "created_at", "updated_at", "paid_at", "last_seen_at", "last_login_at",
]);

/** 推导列的默认值。 */
function deriveDefault(column, engine) {
  const key = column.key;
  if (column.pk) {
    if (engine === "mysql") return null; // 自增在 DDL 里用 AUTO_INCREMENT 表达
    if (/serial/i.test(column.type)) return `nextval('${key}_seq'::regclass)`;
    return null;
  }
  if (key === "created_at" || key === "updated_at") {
    return engine === "mysql" ? "CURRENT_TIMESTAMP" : "now()";
  }
  if (key === "status") return "'active'";
  if (key === "order_status") return "'created'";
  if (key === "currency") return "'CNY'";
  const boolTrue = engine === "mysql" ? 1 : true;
  const boolFalse = engine === "mysql" ? 0 : false;
  if (key === "is_active" || key === "is_paid" || key === "on_sale" || key === "is_vip") return boolTrue;
  if (key === "is_verified" || key === "is_gift") return boolFalse;
  if (key === "balance" || key === "price" || key === "unit_price" || key === "total_amount") return "0.00";
  if (key === "stock" || key === "quantity" || key === "item_count") return 0;
  return null;
}

/** 推导一份表结构。 */
function buildStructure(dataKey, data, engine) {
  const isView = /\/views?\//.test(dataKey) || /_v_|^v_/.test(dataKey.split("/").pop());

  const columns = data.columns.map((column, index) => ({
    name: column.name ?? column.key,
    type: column.type,
    nullable: column.pk ? false : column.nullable ?? true,
    default: deriveDefault(column, engine),
    pk: Boolean(column.pk),
    position: index + 1,
    comment: COLUMN_COMMENTS[column.key] ?? null,
  }));

  const tableName = dataKey.split("/").pop();
  const indexes = [];
  const constraints = [];
  const foreignKeys = [];

  if (!isView) {
    // 主键索引
    const pkColumn = columns.find((column) => column.pk);
    if (pkColumn) {
      indexes.push({
        name: `${tableName}_pkey`,
        columns: [pkColumn.name],
        unique: true,
        primary: true,
        method: engine === "mysql" ? null : "btree",
      });
    }

    for (const column of columns) {
      if (column.pk) continue;

      if (UNIQUE_KEY_COLUMNS.has(column.name)) {
        indexes.push({
          name: `${tableName}_${column.name}_key`,
          columns: [column.name],
          unique: true,
          primary: false,
          method: engine === "mysql" ? null : "btree",
        });
        continue;
      }

      if (FK_TARGETS[column.name]) {
        indexes.push({
          name: `${tableName}_${column.name}_idx`,
          columns: [column.name],
          unique: false,
          primary: false,
          method: engine === "mysql" ? null : "btree",
        });
        foreignKeys.push({
          name: `${tableName}_${column.name}_fkey`,
          columns: [column.name],
          refTable: FK_TARGETS[column.name],
          refColumns: ["id"],
          onUpdate: "NO ACTION",
          onDelete: column.name === "user_id" ? "CASCADE" : "NO ACTION",
        });
        continue;
      }

      if (INDEXED_TIME_COLUMNS.has(column.name)) {
        indexes.push({
          name: `${tableName}_${column.name}_idx`,
          columns: [column.name],
          unique: false,
          primary: false,
          method: engine === "mysql" ? null : "btree",
        });
      }
    }

    for (const column of columns) {
      const values = STATUS_VALUES[column.name];
      if (!values) continue;
      constraints.push({
        name: `${tableName}_${column.name}_check`,
        type: "CHECK",
        column: column.name,
        values,
      });
    }
  }

  return { qualifiedName: qualifiedNameOf(dataKey, engine), isView, columns, indexes, constraints, foreignKeys };
}

/** 表的限定名:PostgreSQL 带 schema,MySQL 带库名。 */
function qualifiedNameOf(dataKey, engine) {
  const parts = dataKey.split("/");
  const table = parts[parts.length - 1];
  if (engine === "postgresql") return `public.${table}`;
  if (engine === "mysql") return `${parts[1]}.${table}`;
  return table;
}

/** 引擎 id:从 dataKey 的连接前缀推断。 */
function engineOf(dataKey) {
  const connectionId = dataKey.split("/")[0];
  const connection = CONNECTIONS.find((item) => item.id === connectionId);
  return connection?.engine ?? "postgresql";
}

export const TABLE_STRUCTURE = Object.fromEntries(
  Object.entries(TABLE_DATA).map(([dataKey, data]) => [
    dataKey,
    buildStructure(dataKey, data, engineOf(dataKey)),
  ]),
);

/**
 * 生成 DDL。
 *
 * 目标是「看起来就是那个引擎导出来的」:PostgreSQL 用 schema 限定名、
 * 独立的外键 ALTER 语句;MySQL 用反引号、KEY 索引、ENGINE 尾巴。
 */
export function generateDdl(dataKey) {
  const structure = TABLE_STRUCTURE[dataKey];
  if (!structure) return "";
  const engine = engineOf(dataKey);
  return engine === "mysql" ? mysqlDdl(structure) : postgresDdl(structure);
}

function postgresDdl(structure) {
  const { qualifiedName, isView, columns, indexes, constraints, foreignKeys } = structure;
  const table = qualifiedName.split(".").pop();

  if (isView) {
    return [
      `CREATE VIEW ${qualifiedName} AS`,
      `SELECT ${columns.map((c) => c.name).join(",")}`,
      `  FROM public.${table};`,
    ].join("\n");
  }

  const lines = [];
  lines.push(`CREATE TABLE ${qualifiedName} (`);
  const body = [];

  for (const column of columns) {
    const parts = [`    ${column.name} ${column.type}`];
    if (!column.nullable) parts.push("NOT NULL");
    if (column.default !== null && column.default !== undefined) parts.push(`DEFAULT ${column.default}`);
    // PG 10 以后的自增主键写法,比 serial 更接近现在的实践
    if (column.pk && column.default === null && /^(small|big)?int/.test(column.type)) {
      parts.push("GENERATED BY DEFAULT AS IDENTITY");
    }
    body.push(parts.join(" "));
  }

  for (const index of indexes.filter((item) => item.primary)) {
    body.push(`    CONSTRAINT ${index.name} PRIMARY KEY (${index.columns.join(", ")})`);
  }
  for (const index of indexes.filter((item) => item.unique && !item.primary)) {
    body.push(`    CONSTRAINT ${index.name} UNIQUE (${index.columns.join(", ")})`);
  }
  for (const constraint of constraints) {
    body.push(
      `    CONSTRAINT ${constraint.name} CHECK (${constraint.column} = ANY (ARRAY[${constraint.values.map((v) => `'${v}'`).join(",")}]))`,
    );
  }

  lines.push(body.join(",\n"));
  lines.push(");");

  for (const index of indexes.filter((item) => !item.primary && !item.unique)) {
    lines.push("");
    lines.push(
      `CREATE INDEX ${index.name} ON ${qualifiedName} USING ${index.method} (${index.columns.join(", ")});`,
    );
  }

  for (const fk of foreignKeys) {
    lines.push("");
    lines.push(`ALTER TABLE ${qualifiedName}`);
    lines.push(
      `    ADD CONSTRAINT ${fk.name} FOREIGN KEY (${fk.columns.join(", ")}) REFERENCES public.${fk.refTable}(${fk.refColumns.join(", ")}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete};`,
    );
  }

  return lines.join("\n");
}

function mysqlDdl(structure) {
  const { qualifiedName, isView, columns, indexes, constraints } = structure;
  const [database, table] = qualifiedName.split(".");

  if (isView) {
    return [
      `CREATE VIEW \`${database}\`.\`${table}\` AS`,
      `SELECT ${columns.map((c) => `\`${c.name}\``).join(",")}`,
      `  FROM \`${database}\`.\`${table}\`;`,
    ].join("\n");
  }

  const body = [];
  for (const column of columns) {
    const parts = [`  \`${column.name}\` ${column.type}`];
    if (column.pk && /bigint|int/i.test(column.type)) parts.push("NOT NULL AUTO_INCREMENT");
    else if (!column.nullable) parts.push("NOT NULL");
    if (column.default !== null && column.default !== undefined) parts.push(`DEFAULT ${column.default}`);
    body.push(parts.join(" "));
  }

  for (const index of indexes.filter((item) => item.primary)) {
    body.push(`  PRIMARY KEY (${index.columns.map((c) => `\`${c}\``).join(", ")})`);
  }
  for (const index of indexes.filter((item) => item.unique && !item.primary)) {
    body.push(`  UNIQUE KEY \`${index.name}\` (${index.columns.map((c) => `\`${c}\``).join(", ")})`);
  }
  for (const index of indexes.filter((item) => !item.primary && !item.unique)) {
    body.push(`  KEY \`${index.name}\` (${index.columns.map((c) => `\`${c}\``).join(", ")})`);
  }
  for (const constraint of constraints) {
    body.push(
      `  CONSTRAINT \`${constraint.name}\` CHECK (\`${constraint.column}\` IN (${constraint.values.map((v) => `'${v}'`).join(",")}))`,
    );
  }

  return [
    `CREATE TABLE \`${database}\`.\`${table}\` (`,
    body.join(",\n"),
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;",
  ].join("\n");
}
