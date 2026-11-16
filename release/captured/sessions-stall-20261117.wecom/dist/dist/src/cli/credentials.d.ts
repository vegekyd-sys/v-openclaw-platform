/**
 * 登录态同步（ensureSynced）
 *
 * 职责：确保当前会话的 bot 在自己的配置目录里有可用登录态，返回该目录。
 *
 * **授权动作整体委托 cli**：spawn `wecom-cli auth init --bot-id <ID> --secret <SECRET>`
 * （cli >= 0.1.9-build.149，stderr 非 TTY 时走直连授权分支）。
 * 插件不再复刻凭据协议——签名算法、AES-GCM格式、`.encryption_key`、原子写
 * 全部由 cli 负责。那些代码曾是整套方案最脆的部分：cli 改一处格式，
 * 插件就静默解密失败，且表现为"未授权"，完全不指向真实原因。
 *
 * 本文件只保留 cli 里不存在的 **openclaw 侧策略**：
 *   1. 目录隔离：每个 (botId, secret) 组合一个目录 → 多 bot 隔离 + secret 轮换即时生效
 *   2. 短路：`auth init` 无幂等，每次调用都会打一次鉴权接口（45009 频率限制）
 *   3. 并发去重 + 全局串行
 *   4. 重签冷却熔断
 */
export declare class CliAuthError extends Error {
    readonly errcode?: number | undefined;
    constructor(message: string, errcode?: number | undefined);
}
export type CliEnvOverrides = Partial<Record<"WECOM_CLI_BASE_URL" | "WECOM_CLI_AUTH_ENDPOINT" | "WECOM_CLI_ADDITIONAL_HEADERS", string>>;
/**
 * 配置目录 = `<state>/wecom-cli/<safeBotId>-<sha8(botId:secret)>`。
 *
 * 为什么把 secret 指纹编进目录名，而不是另外维护一份 meta 文件：
 * 删掉自实现的crypto 后插件不再解密 `credentials.enc`，也就永远读不到里面的
 * secret，"磁盘上这份凭据是不是用当前配置签出来的"这个问题就无法回答。
 * 把指纹放进目录名后，secret 一变目录就变 → 天然没有凭据 → 自动重新授权，
 * 且走的是普通路径（不碰 force 熔断），所以**改配置立即生效**。
 *
 * 分隔符 `:` 是必需的：否则 `ab`+`c` 与 `a`+`bc` 会得到同一指纹。
 *
 * 已知取舍：`safeBotId` 的字符归一化可能碰撞（`a.b` 与 `a_b` 同名），
 * 清理兄弟目录时可能误删另一个 bot 的目录。代价仅是"那个 bot 下次调用
 * 重新授权一次"，不是数据丢失、更不是串号，因此接受。
 */
export declare function cliConfigDirFor(botId: string, secret: string): string;
/**
 * 确保指定 bot 的登录态已就绪，返回其配置目录。
 *
 * @param force 强制重新授权（业务命令报凭据类错误时的兜底），受冷却熔断约束。
 *              注意 cli 没有 `--force` 参数，也不需要：`auth init` 本身无幂等，
 *              每次调用都会重新签发，所以"force"只是跳过插件自己的短路。
 */
export declare function ensureSynced(params: {
    binPath: string;
    botId: string;
    secret: string;
    env?: CliEnvOverrides;
    force?: boolean;
}): Promise<string>;
/** 仅用于测试 */
export declare function resetCredentialState(): void;
