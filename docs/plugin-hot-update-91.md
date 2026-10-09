# 9.1 上不重启更新插件代码

日期：2026-10-10。证据：VLab 候选 `candidate-06aa65ca`，脚本 `lab/plugin-hot-update/probe-candidate.mjs`，探针插件在 `lab/plugin-hot-update/probe/`。测试用的是真实 9.1 运行目录起的私有 Gateway。

## 结论

9.1 自带的"插件重载"不会重新加载插件代码。用插件自己的写法可以绕开：外壳保持不变，实现放在按版本命名的目录里，换版本就是换目录。这样更新代码不用重启 Gateway，也不用重载插件。

| 方式 | 新代码是否生效 | 代价 |
|---|---|---|
| A. 普通插件：改文件，再改 `plugins.*` 触发 9.1 插件重载 | **否**。`register()` 重新跑了，但跑的还是旧模块 | 15.6 s；所有插件 `register()` 重跑、所有插件服务重启、所有会话 MCP 关闭；telegram/discord/slack 账号可能被停；如果有渠道要重启，会等全进程空闲，最长 300 s |
| B. 外壳插件：新版本放进 `releases/<rev>/`，改 `config.release` 触发插件重载 | **是** | 与 A 相同（14.9 s，全量插件重载） |
| C. 外壳插件：新版本放进 `releases/<rev>/`，调用插件自己的 `hotswap` 接口 | **是** | 18 ms；不重载、不重启任何服务、不碰渠道 |
| C'. 原地改同一个版本目录里的文件，再 `hotswap` | 否 | Node 按 URL 缓存 ES 模块，每个版本必须用新目录 |

## 为什么（9.1 源码）

- 插件入口用同步的 `createRequire(...)(path)` 加载，结果按绝对路径缓存在进程级插件缓存里（`plugin-module-loader-cache.ts` 的 `loadCachedTarget`）。
- Gateway 运行期间，这份缓存和插件清单快照都锁死了：`clearPluginMetadataLifecycleCaches` 在 Gateway 持有元数据时是空操作，只有重启才清空。所以热重载只是对缓存里的旧模块重跑 `register()`。
- `register()` 必须是同步的：返回 Promise 会报 "plugin register must be synchronous"。`register()` 返回后，`api` 就关闭了，之后再调用 `register*` 不会生效。
- 但 `register()` 里登记的东西都只是存了一个函数引用：工具（可以传工厂函数，每轮调用）、Gateway 方法、钩子、HTTP 路由、命令都是这样。所以一次性登记稳定的代理函数，代理再转给可替换的实现，这条路是通的。实现用 `import()` 按带版本的路径加载，能绕过上面那份缓存。

## 外壳插件的约束

- **能热换**：工具的执行逻辑、Gateway 方法的处理函数、钩子、HTTP 路由处理、命令处理、服务内部逻辑。
- **要走插件重载（B，约 15 s）**：新增或删除 Gateway 方法、钩子、命令。
- **要重启 Gateway**：新增工具名（工具名必须在插件清单 `contracts.tools` 里，而清单快照锁死）、修改工具的描述或参数结构（工具描述有缓存，运行期间不清）、修改插件清单。
- **worker 进程里的插件**：`hotswap` 只作用于 Gateway 进程。worker 要在启动时读"当前版本"指针文件，所以换版本后要执行 `vlab.workers.roll`（不重启 Gateway，旧 worker 做完手上的活再退出）。
- 旧版本模块会一直留在内存里，每次换代都多占一份。不适合高频换代，一天几次没有问题。

## 现状的瓶颈

过去两周因插件更新而必须重启 V 的，大头是**官方飞书插件**（`@openclaw/feishu`）上的我们自己的补丁：提问卡片、工作清单、首字、审批卡等。它是渠道插件，代码由 OpenClaw 从 npm 目录加载，我们改的是它的 dist 文件，没法直接套用外壳写法。要让这部分也能热更新，需要一次性补丁：在飞书插件里开一个"接缝"，把我们的定制逻辑挪到一个可热换的外部模块里。装这个补丁本身要重启一次，之后就不用了。
