# Egern Modules Optimized

把公开的 Surge、Quantumult X、Loon 或 Egern 模块保存为可追踪的上游快照，并在保持功能、参数和响应语义的前提下，发布为 Egern 原生 YAML 模块与 Egern 原生 JavaScript。

## 目录

- `upstream/<category>/<slug>/`：未经修改的上游文件。
- `converted/<category>/<slug>/`：未经优化的 Egern YAML 转换快照。
- `modules/<category>/<slug>.yaml`：审核、优化并测试后的 Egern 模块。
- `scripts/<category>/<slug>/`：使用 `export default async function (ctx)` 的 Egern 原生脚本。
- `registry.json`：上游、快照、发布文件和状态登记。
- `benchmarks/`：大响应体性能回归预算；只用于发现明显回退，不替代 Egern 真机测量。
- `fixtures/`：脱敏行为样本规范。

转换快照不等于发布版。存在远程脚本时，导入器只保存上游和转换快照；脚本完成 Egern 原生迁移、行为测试和内存审查后，才允许把模块写入 `modules/`。

GitHub 自动化使用统一的 `optimization-queue` 队列标签；`conversion-required`、`upstream-update` 与 `upstream-fetch-failed` 仅说明任务来源。自动导入和上游同步先通过测试 PR 合入快照，再创建队列 Issue。

## 导入

```bash
npm ci
npm run import -- \
  --url 'https://example.com/module.sgmodule' \
  --category ad \
  --slug example
```

如果来源不是 Surge/Egern 格式，先用 Script Hub 转为 Surge 模块，再通过 `--converted-url` 提供转换结果；原始链接仍用 `--url` 保存，二者都会登记。

脚本全部完成 Egern 原生迁移后可发布：

```bash
npm run import -- --url URL --category ad --slug example --publish
npm run integrity:update
npm test
```

Egern 安装地址格式：

```text
egern:/modules/new?url=https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/example.yaml
```

## 已发布模块

| 模块 | 文件 |
| --- | --- |
| 12306 | `modules/ad/12306.yaml` |
| 高德地图 | `modules/ad/amap-ads.yaml` |
| 酷安 | `modules/ad/coolapk-ads.yaml` |
| 滴滴出行 | `modules/ad/didichuxing.yaml` |
| 闲鱼 | `modules/ad/goofish-ads.yaml` |
| 拼多多 | `modules/ad/pinduoduo-ads.yaml` |
| Reddit | `modules/ad/reddit-ads.yaml` |
| 微博轻享版 | `modules/ad/weibo-intl-ads.yaml` |
| 小红书 | `modules/ad/xiaohongshu-ads.yaml` |
| 去广告合集 | `modules/ad/ad-combined.yaml` |
| 网易云音乐 | `modules/music/netease.yaml` |

合集成员与 Surge 仓库一致，不含 Spotify 和网易云；网易云作为独立模块发布。不要同时启用合集与其中的单独模块。

## 优化边界

- 不改变匹配范围、参数控制、响应结构、失败语义和脚本覆盖。
- 不以字节数变少作为优化成功的依据。
- `max_size` 原值保留，不用缩小上限伪装内存优化。
- 未经真实流量确认的行为要记录为不足，不能宣称完全等效。
- 原始上游、转换快照与发布版分开保存，便于逐项审计。
- `registry.json` 同时记录上游和发布文件 SHA-256；CI 会拒绝未登记、重名或哈希过期的产物。
- 推送 `main` 后，CI 会重新下载 GitHub Raw 模块与脚本并逐字节核对。

## 来源与许可

自动化、转换工具、测试和文档使用仓库根目录的 MIT 许可。第三方模块、脚本、快照和衍生文件仍受原作者条款约束，详见 `THIRD_PARTY_NOTICES.md`。
