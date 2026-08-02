# Performance regression budgets

这些预算只用于发现明显的代码回退，不代表 Egern Network Extension 的真实峰值。

- 小红书：处理 20,000 条约 1.7 MB 的首页卡片。
- 网易云：处理 5,000 条批量评论并完成 AES 响应编码。
- 指标记录单次预热后执行时间，以及执行前后 Node.js `heapUsed` 的增量。
- 真机结论仍必须使用 Egern 的真实流量和系统内存数据确认。

运行：

```bash
npm run benchmark:check
```
