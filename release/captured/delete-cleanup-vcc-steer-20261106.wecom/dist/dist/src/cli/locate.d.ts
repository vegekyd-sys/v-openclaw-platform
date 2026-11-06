/**
 * wecom-cli 二进制寻址
 *
 * 为什么不依赖 PATH：
 * 1. 插件私有的 node_modules/.bin 不在 PATH 上
 * 2. 更重要的是——PATH 上可能存在用户**全局安装**的 wecom-cli，
 *    它绑定的是用户自己的 bot（默认目录 ~/.config/wecom）。
 *    误用会导致"拿 A 企业的凭据查 B 企业的数据"，是静默的数据越权。
 *    因此这里只接受"插件依赖内的二进制"或"配置显式指定的路径"。
 */
/** 按主包 package.json 的 bin 声明解析 shim，兼容字符串和对象两种形式。 */
export declare function binCandidatesFromPackageManifest(root: string): string[];
export type LocateResult = {
    ok: true;
    binPath: string;
    source: string;
} | {
    ok: false;
    tried: string[];
};
/**
 * 定位 wecom-cli 二进制。
 *
 * 优先级：
 * 1. 配置显式指定 `channels.wecom.cli.binPath`（联调期塞本地 cargo 产物用）
 * 2. 平台子包 `<prefix>-<platform>-<arch>`（跳过 bin/wecom.js 那层 node shim，
 *    每次调用少一次 node 冷启动）
 * 3. 主包 `<prefix>` 自带的 bin
 */
export declare function locateCliBinary(explicitPath?: string): LocateResult;
/** 仅用于测试：清除寻址缓存 */
export declare function resetLocateCache(): void;
