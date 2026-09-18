# qmdmb

B站直播间粉丝团亲密度任务面板。在直播间顶栏嵌入一个「任务」入口，展开后可查看该主播粉丝团的亲密度进度与今日任务情况。

## 安装

需要先安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。

点击下方表格中的链接即可安装：

| Github                                                                                     |
| ------------------------------------------------------------------------------------------ |
| [安装](https://raw.githubusercontent.com/bingwaa/qmdmb/main/qmdmb.user.js)                  |

安装后由 Tampermonkey 依据脚本头部的 `@updateURL` 自动检查更新，版本号以 `@version` 是否增大为准。

若点击后没有弹出安装页，在扩展的「实用工具 → 从 URL 安装」中粘贴：

```
https://raw.githubusercontent.com/bingwaa/qmdmb/main/qmdmb.user.js
```

## 功能

- 顶栏入口，外观与 B站原生关注按钮一致；未开播的直播间挂在「未开播」标签之后
- 亲密度与今日亲密度进度条
- 每日任务逐项进度与完成状态
- 亲密之旅进度、旅程礼物解锁与剩余时限
- 今日亲密度增长明细：各任务项、已送礼物（名称与数量）、投币数
- 舰长 / 提督 / 总督的 1.5 倍亲密度加成换算
- 礼物明细按房间与日期保存在本地，刷新后保留

## 说明

- 脚本以 `document-start` 注入，用于接管直播间的弹幕 WebSocket 以统计礼物。更新脚本后需完全刷新页面（Ctrl+F5）才会生效
- 礼物亲密度按「数量 × 金瓜子单价 ÷ 100」折算
- 「粉丝团灯牌」当天首条只给任务奖励，第二条起每次按 1 点计入明细

## License

[MIT](LICENSE)
