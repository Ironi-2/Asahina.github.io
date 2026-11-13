# 第三方依赖

写作台把以下库的浏览器构建放在 `editor/vendor/`，运行时不需要 npm 或外网。

| 库 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| marked | 18.1.2 | MIT | Markdown → HTML |
| Turndown | 7.2.4 | MIT | HTML → Markdown |
| DOMPurify | 3.4.17 | Apache-2.0 OR MPL-2.0 | 预览 HTML 清洗 |
| highlight.js | 11.12.0 | BSD-3-Clause | 代码高亮 |
| KaTeX | 0.19.1 | MIT | 数学公式渲染 |

各库原始 LICENSE 可在对应 npm 包或项目主页查看。升级时替换 `editor/vendor/` 下对应文件即可。
