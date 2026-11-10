# release/captured 的字节存放：`captured-store` 分支

2026-11-10 起，`release/captured/<name>/dist/` 不再提交到 dev。

## 为什么

`release/captured/` 记录 V 线上跑的确切字节（`docs/release-workflow-v2.md`）。到 2026-11-10 共 548 份捕获、
6.6 万个文件，签出一份是 **1.8 GB**；每开一个 worktree 就多 1.8 GB，几百个 worktree 把 Mac 磁盘占满了。

但其中只有 **约 1100 个不同的文件（65 MB）**：同一个插件目录每次发版都整份捕获一次，绝大多数字节是重复的。
git 对象库本来就只存一份，占空间的完全是每个 worktree 的签出。

## 现在放在哪

| 内容 | 位置 |
| --- | --- |
| `release/captured/<name>/manifest.json`（以及 `base/`、`capture-provenance.json` 等小文件） | dev，和以前一样走 PR |
| `release/captured/<name>/dist/**` | 同一个仓库的孤儿分支 **`captured-store`**，路径完全相同 |

`captured-store` 只追加、不改写：初始提交是 dev `1096916f` 时刻的整个 `release/captured/` 树（没有新增任何 blob），
之后每次 publish 加一个提交。旧捕获的字节也仍在 dev 的历史里（没有改写历史）。

为什么选这个而不是别的：

- **git LFS**：每个 worktree 签出时照样落一份完整文件，省不了盘；V、VLab、CI、各个 Codex 会话都要装 lfs；
  GitHub 免费额度每月 1 GB 流量。
- **GitHub Release 附件 / 对象存储（COS）**：要新的凭据和上传下载逻辑，单个 release 有 1000 个附件上限，
  而且失去 git 自带的按内容去重和完整性校验。
- **同仓库分支**：零新基础设施，权限和 dev 一样；git 自动去重（548 份捕获只占 65 MB）；
  所有 worktree 共享同一个对象库，`git fetch` 一次全部可见。

## worktree 里怎么拿到字节

```
captured-store 分支 ──(git cat-file)──▶ .git/v-captured/        共享缓存，一个 clone 一份，65 MB
                                          objects/<blob sha>       每个不同的文件存一次
                                          trees/<dist 树 sha>/      硬链接到 objects
                     ──(cp -c 克隆)──▶  release/captured/<name>/dist/   每个 worktree 的真实目录
                                        release/captured/<name>/.dist-tree  记录它来自哪棵树
```

`node scripts/captured-store.mjs link` 把这个 worktree 里每份捕获的 `dist/` 从缓存克隆出来。缓存在主仓库
`.git/v-captured/` 下，**一个 clone 的所有 worktree 共用**。worktree 里的 `dist/` 是普通目录、普通文件，
所以测试、`lab/build-*.mjs`、文档里写的 `release/captured/<name>/dist/...` 路径和用法（包括 `cpSync` 整个目录再改）都和以前一样。

克隆用的是 APFS 的写时复制（`cp -c`；Linux 上 `cp --reflink=auto`，ext4 等不支持时退化为普通复制）：
文件不占自己的数据块，改其中一个文件只影响它自己，不会改到缓存或别的 worktree。实测一个 worktree
克隆 549 份捕获约 11 秒、磁盘实际多用约 18 MB（元数据）。**注意 `du` 会把克隆按全额算（仍显示约 1.8 GB），看真实占用要用 `df`。**

什么时候会自动跑：

- `pnpm install`（`postinstall`，失败只警告不阻断安装）；
- `git checkout` / `git worktree add` 之后（`.githooks/post-checkout`，前提是 `core.hooksPath` 指向含这个 hook 的 `.githooks`）。

规则：

- 有 `.dist-tree` 标记的 `dist/` 是从 store 克隆来的，`link` 会在 store 上的树变了时重新克隆。
- **没有标记的 `dist/` 是"自己的"**（还没 publish 的新捕获，或者仍然跟踪 `dist/` 的旧分支），`link` 从不碰它。
- `link --verify`：重新校验缓存里每个对象的 git 哈希（坏了原地修复），并逐个比对已克隆的 `dist/`，被改过就重新克隆。
- 换缓存位置：`V_CAPTURED_CACHE=/path`。删掉缓存（`rm -rf .git/v-captured`）随时可以，再 link 一次就重建（约 30 秒）。

## 发版流程的变化

`promote-to-v.mjs --apply` 已经自动做完下面的第 2 步。手动捕获（热修后"保留"、补捕获）时：

1. `node scripts/capture-production-runtime.mjs ... --out release/captured/<name>`（和以前一样，得到真实的 `dist/` 和 `manifest.json`）
2. `node scripts/captured-store.mjs publish <name> [<name>.worker ...]`
   - 先按 manifest 逐个校验 sha256，再把 `release/captured/<name>/`（manifest + dist）提交到 `captured-store` 并 push
     （不签出那个分支，用临时 index；别人同时 publish 导致非快进时自动重试）；
   - 成功后在旁边写 `.dist-tree`，这份 `dist/` 从此按"来自 store"处理。
3. `git add release/captured/<name>*`——`dist` 已在 `.gitignore`，只会加上 manifest。照常提 PR、写 CHANGELOG。

`sync-vlab-from-v.mjs` 改为从 `captured-store`（必要时自动 fetch）取字节，再和 V 的线上哈希比对，其余不变。
`release-notes.mjs`、`check-source-map.mjs`、`v-release-drift.py`、`install-v-release-drift.sh` 只读 manifest，不受影响。

## CI 怎么防止忘记

`.github/workflows/vlab-static.yml` 在测试前跑：

```
git fetch origin +refs/heads/captured-store:refs/remotes/origin/captured-store
node scripts/captured-store.mjs link --no-fetch
node scripts/captured-store.mjs check --no-fetch
```

`check` 失败的两种情况：

- 分支上又跟踪了 `release/captured/*/dist/**` 的文件（比如一个在迁移前开的捕获分支合了新的 dev）；
- 某个 manifest 列出的文件在 `captured-store` 上不存在，或者 sha256 不一致（忘了 publish）。

报错信息里直接给出要跑的 `publish` 和 `git rm --cached` 命令。

## 在途分支 / 旧 worktree 怎么办

- **合入新 dev 之后**：git 会删掉 dev 不再跟踪的 `dist/` 文件，跑一次 `node scripts/captured-store.mjs link`（或 `pnpm install`）即可。
- **分支里新增了捕获（还在跟踪 `dist/`）**：合 dev 前后各一样，跑
  `node scripts/captured-store.mjs publish <name>...`，再 `git rm -r --cached release/captured/<name>/dist`，提交。
  CI 的 `check` 会提示。
- **检出迁移前的旧提交**：那些提交本身带着 `dist/`，git 会照常签出（覆盖被忽略的克隆），不需要做任何事。

## 保护

私有仓库在 GitHub Free 上没有分支保护（见 `.githooks/pre-push`）。`pre-push` 拒绝删除 `captured-store`、拒绝对它的非快进
push；每个 clone 都完整 fetch 这个分支，相当于多份备份；manifest 里的 sha256 能随时验证字节完整性（`check`）。
