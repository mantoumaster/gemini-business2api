# 2API 联调清单

> 适用范围：第二阶段收口期，重点覆盖 `dashboard / accounts / settings`，并补齐主服务联调基线。

## 1. 联调前准备

- 启动后端主服务，确认 `/health` 返回 `{"status": "ok"}`。
- 启动前端管理台，确认能正常进入登录页。
- 若使用 Docker：
  - 仅主服务：`docker compose up -d`
  - 主服务 + refresh worker：`docker compose --profile refresh up -d`
- 准备测试数据：
  - 至少 20 个真实/半真实账号用于行为验证
  - 1000+ 条假数据用于分页、筛选、批量操作压测

## 2. 登录与基础路由

| 模块 | 检查点 | 期望结果 |
| --- | --- | --- |
| 登录 | 输入正确管理密钥 | 登录成功，进入概览中心 |
| 登录 | 输入错误管理密钥 | 返回 401，前端有错误提示，不死循环跳转 |
| 登出 | 点击退出登录并确认 | 会话失效，返回登录页 |
| 鉴权 | 登录失效后访问 `/admin/*` | 后端返回 401，前端统一跳回登录页 |

## 3. Dashboard 概览中心

### 3.1 概览卡片

- 接口：`GET /admin/stats?time_range=24h`
- 重点确认：
  - `total_accounts`
  - `active_accounts`
  - `failed_accounts`
  - `rate_limited_accounts`
- 期望：卡片数值与账号池实际状态一致，不出现 `undefined / null / NaN`。

### 3.2 图表时间范围

| 图表 | 时间范围 | 期望结果 |
| --- | --- | --- |
| 每小时请求量 | `24h / 7d / 30d` | 切换后图表刷新正常 |
| 请求趋势 | `24h / 7d / 30d` | 成功 / 失败 / 限流数据同步变化 |
| 成功率 | `24h / 7d / 30d` | 百分比范围稳定在 0-100 |
| 模型占比 / 排名 | `24h / 7d / 30d` | 图例和排序一致 |
| 响应时间 | `24h / 7d / 30d` | 首响 / 总耗时曲线联动正常 |

### 3.3 自动刷新

- 停留在 Dashboard 页至少 30 秒。
- 期望：
  - 数据会自动刷新
  - 图表不会重复初始化
  - 切换页面再回来后不会出现空图或控制台报错

## 4. Accounts 账号管理

### 4.1 列表与分页

| 检查点 | 期望结果 |
| --- | --- |
| 首次加载列表 | 默认分页返回，页面不卡顿 |
| 切换每页数量 | 列表刷新正常，总页数同步更新 |
| 翻页 | 当前页、总数、总页数一致 |
| 1000+ / 3000 条假数据 | 依然可用，筛选与分页不阻塞主线程 |

### 4.2 筛选与搜索

- 检查项：
  - 关键字搜索
  - 状态筛选：`all / active / expiring_soon / expired / manual_disabled / access_restricted / rate_limited / quota_limited`
- 期望：
  - 请求参数和返回数据一致
  - 状态码与 UI badge 一一对应
  - 翻页后筛选条件不丢失

### 4.3 单账号操作

| 操作 | 期望结果 |
| --- | --- |
| 启用 | 状态更新，列表刷新，按钮状态同步 |
| 禁用 | 状态更新，原因保留，按钮状态同步 |
| 删除 | 账号移除，总数减少，分页自动回收 |

### 4.4 批量操作

- 检查项：批量启用 / 批量禁用 / 批量删除
- 期望：
  - 当前页全选、跨页全选逻辑正确
  - 批量进度条正常推进
  - 返回 `success_count` 与错误列表可被前端正确消费
  - 操作中重复点击会被锁定，避免并发脏写

### 4.5 配置导入导出

- 检查项：
  - JSON 导入
  - 文本导入
  - 配置编辑后保存
- 期望：
  - 兼容旧字段，但保存结构稳定
  - 返回 `status / message / account_count`
  - 不因额外字段导致后端 500

## 5. Settings 系统设置

### 5.1 读取

- 接口：`GET /admin/settings`
- 期望：
  - 返回完整结构，不依赖前端补空洞
  - `basic / retry / public_display / image_generation / video_generation / session / refresh_settings / quota_limits` 全部存在
  - 枚举字段值稳定：
    - `temp_mail_provider`
    - `browser_mode`
    - `image_generation.output_format`
    - `video_generation.output_format`

### 5.2 保存边界

| 检查项 | 边界 | 期望结果 |
| --- | --- | --- |
| `image_expire_hours` | `-1 ~ 720` | 超界被拦截或回退到合法值 |
| `max_account_switch_tries` | `1 ~ 20` | 保存后前后端一致 |
| 文本冷却 | `3600 ~ 86400` 秒 | `rate_limit_cooldown_seconds` 与 `text_rate_limit_cooldown_seconds` 保持同步 |
| 图片/视频冷却 | `3600 ~ 86400` 秒 | 保存后刷新立即生效 |
| `session_cache_ttl_seconds` | `0 ~ 86400` | 修改后账号管理不报错 |
| `refresh_window_hours` | `0 ~ 24` | 超界不落库 |
| `register_default_count` | `1 ~ 200` | 超界被纠正 |
| `scheduled_refresh_interval_minutes` | `0 ~ 720` | 开关与数值联动正常 |
| `verification_code_resend_count` | `0 ~ 5` | 保存成功 |
| `refresh_batch_size` | `1 ~ 50` | 保存成功 |
| `refresh_cooldown_hours` | `0 ~ 168` | 小数保留 1 位 |
| `min_account_count` | `0 ~ 1000` | 保存成功 |
| quota limits | `0 ~ 999999` | 各配额字段保存成功 |
| `session.expire_hours` | `1 ~ 168` | 保存成功 |

### 5.3 设置联动

- 期望确认：
  - `browser_mode` 与 `browser_headless` 同步
  - `temp_mail_provider` 切换时不丢配置
  - `supported_models` 去重、去空字符串
  - 空字符串字段保存后仍返回字符串，而不是 `null`

## 6. 其他管理页

| 模块 | 检查点 | 期望结果 |
| --- | --- | --- |
| 运行日志 | 列表、筛选、详情展开 | 无白屏，筛选条件生效 |
| 监控状态 | 心跳数据加载 | 状态颜色与后端一致 |
| 图片画廊 | 图片列表、预览 | 地址可访问，空数据时有兜底 |
| 文档教程 | 页面可打开 | 路由稳定，不出现 404 |

## 7. OpenAI 兼容接口

| 接口 | 检查点 | 期望结果 |
| --- | --- | --- |
| `GET /v1/models` | 模型列表 | 返回正常 |
| `POST /v1/chat/completions` | 非流式 | 正常返回 JSON |
| `POST /v1/chat/completions` | 流式 | SSE 正常结束，无中断 |
| 图片生成相关接口 | base64 / url 输出 | 与设置项一致 |

## 8. 本轮重点回归

1. Settings 页不再出现“请求失败”。
2. Dashboard 图表在没有数据时仍能稳定渲染。
3. Accounts 批量操作在大数据量下不重复提交。
4. 前后端接口字段一致：
   - settings 使用完整 payload
   - accounts 使用统一状态码和批量响应结构
   - dashboard 使用统一时间范围枚举
5. 开启或不开启 refresh worker，都不影响 2API 主服务管理台。

## 9. 完成判定

满足以下条件即可认为第二阶段收口通过：

- `settings / accounts / dashboard` 三块主流程可用
- 前后端接口字段无明显漂移
- 大数据分页与批量操作可接受
- Dashboard 图表能稳定显示真实数据
- 设置保存后刷新页面，数据仍能完整回显
