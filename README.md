# 西班牙分租房管理系统 V1

中文界面的分租房管理系统，第一版优先完成：

- 登录页
- 首页分租管理仪表盘
- 房源管理
- 房间管理
- 租客管理
- 收租管理
- 手机端适配
- 浅色 / 深色模式

当前代码已预留 Supabase 接入点，演示阶段的 CRUD 数据会先保存到浏览器 localStorage。

## 首页 UI 原型

### PC

```text
左侧菜单 + 顶部栏 + 主内容区

主内容区：
本月总收入 / 本月总支出 / 本月净利润 / 本年累计利润
应收未收金额 / 入住率 / 空置房间数 / 欠费人数

房间状态列表 + 欠费名单
即将到期合同 + 房东合同到期提醒
待办事项
```

### 手机

```text
顶部标题
核心数字卡片
欠费名单
房间状态
合同提醒
待办事项
底部导航：首页 / 房间 / 租客 / 收租 / 更多
```

## 本地运行

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

## Supabase 环境变量

复制 `.env.example` 为 `.env.local`：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

后续接入真实数据库时，把 localStorage 数据层替换为 Supabase 查询即可。

## iPhone 添加到主屏幕

项目已加入 PWA 配置：

- 应用名称：分租管理
- 主屏幕图标：`public/icons/apple-touch-icon.png`
- Web App Manifest：`public/manifest.webmanifest`
- Service Worker：`public/sw.js`

iPhone 使用方式：

1. 用 Safari 打开系统网址。
2. 点击底部分享按钮。
3. 选择“添加到主屏幕”。
4. 名称会显示为“分租管理”。
