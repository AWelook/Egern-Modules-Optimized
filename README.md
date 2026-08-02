# Egern Modules Optimized

[![Validate repository](https://github.com/AWelook/Egern-Modules-Optimized/actions/workflows/ci.yml/badge.svg)](https://github.com/AWelook/Egern-Modules-Optimized/actions/workflows/ci.yml)

将公开的 Surge、Quantumult X、Loon 或 Egern 模块保存为可审计的上游快照，在保持原功能、参数控制、匹配范围和响应语义的前提下，发布为 Egern 原生 YAML 模块与 Egern 原生 JavaScript。

仓库只在 `main` 发布经过审核和测试的成品，不使用 stable/beta 双轨。转换快照不等于可安装的优化版。

## 安装

打开下表中的 Raw 地址并复制链接，在 Egern 的模块页面选择通过 URL 添加。也可以使用 Egern URL Scheme：

```text
egern:/modules/new?url=<Raw 模块地址>
```

例如，安装去广告合集：

```text
egern:/modules/new?url=https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/ad-combined.yaml
```

| 模块 | 安装文件 | 说明 |
| --- | --- | --- |
| 去广告合集 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/ad-combined.yaml) | 包含下方九个去广告单独模块 |
| 12306 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/12306.yaml) | 单独版 |
| 高德地图 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/amap-ads.yaml) | 单独版 |
| 酷安 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/coolapk-ads.yaml) | 单独版 |
| 滴滴出行 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/didichuxing.yaml) | 单独版 |
| 闲鱼 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/goofish-ads.yaml) | 单独版 |
| 拼多多 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/pinduoduo-ads.yaml) | 单独版 |
| Reddit | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/reddit-ads.yaml) | 单独版 |
| 微博轻享版 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/weibo-intl-ads.yaml) | 单独版 |
| 小红书 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/ad/xiaohongshu-ads.yaml) | 单独版 |
| 网易云音乐 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/modules/music/netease.yaml) | 独立音乐模块，不在去广告合集中 |

不要同时启用去广告合集与其中的单独模块，否则相同请求可能被重复匹配。合集不包含 Spotify 和网易云音乐。

### 原生格式转换（兼容脚本）

| 模块 | 安装文件 | 说明 |
| --- | --- | --- |
| Apple WLOC 定位修改 | [Raw](https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/converted/tools/wloc/unoptimized.yaml) | Egern YAML；两个 JS 保持原作者兼容版本 |

WLOC 只转换模块格式，不改动或重新托管 JavaScript。模块使用 Egern 官方 `_compat.$argument` 兼容环境保留经度、纬度、精度和日志级别参数。由于脚本不是 `ctx` 原生实现，该模块保存在 `converted/`，不计入上方的全原生发布模块。

## 项目保证

- 发布模块使用 Egern YAML；发布脚本使用 `export default async function (ctx)` 原生接口。
- 保留原模块的匹配范围、参数控制、响应结构、失败语义、脚本覆盖和 `max_size`。
- 不以代码更短或文件更小作为优化成功的依据，不删除无法证明冗余的处理路径。
- 原始上游、未经优化的转换快照和发布版分开保存，便于对比与回滚。
- `registry.json` 登记上游和发布文件的 SHA-256；CI 拒绝哈希过期、文件重名或未登记产物。
- 每次推送 `main` 后，CI 会重新下载全部 GitHub Raw 模块与脚本并逐字节核对。
- 合集由单独模块生成并检查重复规则、脚本冲突和成员一致性。

这些检查可以证明已覆盖的输入行为一致，但不能代替所有 App 版本和真实 Egern 流量验证。未经真机确认的结论会作为限制记录，不宣称绝对等效。

## 自动更新流程

GitHub Actions 每 48 小时检查一次 `registry.json` 中登记的所有原始模块、脚本和依赖：

1. 分别抓取上游并计算哈希，一个来源失败不会阻断其他项目。
2. 上游发生变化时，先通过受保护的 PR 保存新快照并运行测试。
3. PR 合并后创建带 `optimization-queue` 标签的 Issue，等待逐项分析和优化。
4. 保持功能与参数、更新测试和合集，全部检查通过后才更新发布文件。
5. 在 Issue 记录改动、测试、性能依据和剩余不足，然后关闭任务。

`upstream-update`、`conversion-required` 和 `upstream-fetch-failed` 是任务原因标签。具体处理规则见 [AGENTS.md](AGENTS.md)。

## 已知限制

- 性能基准运行在 Node.js，用于发现明显回退；数据不等同于 Egern Network Extension 的真实峰值内存。
- `kelee.one` 当前会拒绝部分 GitHub 托管运行器出口。拼多多原始 LPX 因此保留[开放跟踪 Issue](https://github.com/AWelook/Egern-Modules-Optimized/issues/5)，不会用哈希不同的第三方镜像冒充原作者上游。
- 上游接口或 App 数据结构改变后，旧发布版可能需要等待新的真实响应样本才能确认效果。

## 仓库结构

- `upstream/<category>/<slug>/`：未经修改的上游文件。
- `converted/<category>/<slug>/`：未经优化的 Egern YAML 转换快照。
- `modules/<category>/<slug>.yaml`：审核、优化并测试后的 Egern 模块。
- `scripts/<category>/<slug>/`：Egern 原生发布脚本。
- `registry.json`：上游、快照、发布文件、哈希和状态登记。
- `benchmarks/`：大响应体性能回归预算。
- `fixtures/`：脱敏行为样本与规范。
- `test/`：转换、脚本行为、参数和合集回归测试。
- `tools/`：导入、转换、构建、同步、校验和基准工具。

## 维护与导入

本地维护使用 Node.js 24 和 npm。导入 Surge 或 Egern 来源：

```bash
npm ci
npm run import -- \
  --url 'https://example.com/module.sgmodule' \
  --category ad \
  --slug example
```

如果来源不是 Surge/Egern 格式，先用 Script Hub 转为 Surge 模块，再通过 `--converted-url` 提供转换结果。原始链接仍通过 `--url` 保存，两份来源都会登记：

```bash
npm run import -- \
  --url 'https://example.com/original.conf' \
  --converted-url 'https://example.com/script-hub.sgmodule' \
  --category ad \
  --slug example
```

远程脚本全部迁移为 Egern 原生接口、补齐行为测试并完成审查后，才能发布：

```bash
npm run import -- --url URL --category ad --slug example --publish
npm run integrity:update
npm test
```

常用校验命令：

```bash
npm test                 # 构建、行为测试、性能预算、合集、哈希和登记校验
npm run verify:raw       # 下载 main 上的发布文件并逐字节核对
npm audit --audit-level=high
```

## 来源与许可

仓库自行编写的自动化、转换工具、测试和文档使用根目录的 MIT 许可。第三方模块、脚本、上游快照和衍生发布文件仍受原作者条款约束，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
