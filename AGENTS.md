# AGENTS.md

本仓库发布 Egern 原生模块。处理任何项目之前，先读取本文件。

## 上游优化队列

1. 查找带 `optimization-queue` 标签的开放 Issue，按创建时间从旧到新一次处理一个。`upstream-update`、`conversion-required` 和 `upstream-fetch-failed` 是原因标签，不是独立队列。
2. 拉取最新 `main`，读取 `registry.json`，确认原始来源、非 Surge 转换来源、上游脚本、转换快照和发布文件。
3. 拉取新上游，但不得覆盖旧版本之前就开始分析；用 Git 历史比较旧上游、新上游与当前发布版。
4. 来源不是 Egern 或 Surge 模块时，先用 Script Hub 转为 Surge，再生成并保存未经优化的 Egern 转换快照。
5. 修改前在 Issue 说明发现的问题和准备优化的内容。
6. 模块必须输出 Egern YAML；发布脚本必须使用 Egern 原生 `export default async function (ctx)` 接口。兼容脚本只能留在 `upstream/`，不能冒充原生发布版。
7. 保持原功能、参数控制、响应语义、失败语义及全部脚本覆盖；不得为了缩短代码而删除无法证明冗余的路径；不得通过缩小 `max_size` 获取表面优化。
8. 更新模块、脚本、转换快照、测试及登记信息。新增参数时使用 `compat_arguments` 或 `env_schema`，不得写死用户配置。若项目属于 `tools/build-combined-module.mjs` 的 `COMBINED_SOURCES`，必须运行 `npm run build:combined` 并同步提交合集。
9. 运行 `npm test`，确认合集是单独模块的最新无冲突派生版本，并检查模块内所有远程脚本链接。测试通过后才能提交和推送 `main`。
10. 验证 Raw 模块和脚本可访问，在 Issue 记录变更、测试、性能依据及剩余不足，然后关闭 Issue。
11. 若效果无法确认、测试失败或需要真实 Egern 流量，保持 Issue 开放并写明原因。

没有待优化 Issue 时，报告“当前没有待优化任务”，不修改文件、不创建提交。
