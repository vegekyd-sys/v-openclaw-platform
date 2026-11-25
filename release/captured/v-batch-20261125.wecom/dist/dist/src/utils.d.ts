/**
 * 企业微信公共工具函数
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ResolvedAgentAccount } from "./types/account.js";
import type { WecomAgentConfig, WecomNetworkConfig, WecomMediaConfig, WecomDynamicAgentsConfig } from "./types/config.js";
/**
 * 企业微信群组配置
 */
export interface WeComGroupConfig {
    /** 群组内发送者白名单（仅列表中的成员消息会被处理） */
    allowFrom?: Array<string | number>;
}
/**
 * 企业微信配置类型
 */
export interface WeComConfig {
    enabled?: boolean;
    websocketUrl?: string;
    botId?: string;
    secret?: string;
    name?: string;
    allowFrom?: Array<string | number>;
    dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
    /** 群组访问策略："open" = 允许所有群组（默认），"allowlist" = 仅允许 groupAllowFrom 中的群组，"disabled" = 禁用群组消息 */
    groupPolicy?: "open" | "allowlist" | "disabled";
    /** 群组白名单（仅 groupPolicy="allowlist" 时生效） */
    groupAllowFrom?: Array<string | number>;
    /** 每个群组的详细配置（如群组内发送者白名单） */
    groups?: Record<string, WeComGroupConfig>;
    /** 是否发送"思考中"消息，默认为 true */
    sendThinkingMessage?: boolean;
    /** 额外允许访问的本地媒体路径白名单（支持 ~ 表示 home 目录），如 ["~/Downloads", "~/Documents"] */
    mediaLocalRoots?: string[];
    /** Agent 模式配置（自建应用） */
    agent?: WecomAgentConfig;
    /** 网络配置 */
    network?: WecomNetworkConfig;
    /** 媒体处理配置 */
    media?: WecomMediaConfig;
    /** 动态 Agent 配置 */
    dynamicAgents?: WecomDynamicAgentsConfig;
    /** wecom-cli tool 配置 */
    cli?: WecomCliConfig;
    /** 连接模式：webhook | websocket（默认 websocket） */
    connectionMode?: "webhook" | "websocket";
    /** Webhook 验证 token */
    token?: string;
    /** AES 加密密钥（43 字符 Base64） */
    encodingAESKey?: string;
    /** 接收方 ID */
    receiveId?: string;
    /** enter_chat 欢迎消息 */
    welcomeText?: string;
    /** 流式占位符提示内容 */
    streamPlaceholderContent?: string;
}
/**
 * wecom-cli tool 配置
 */
export interface WecomCliConfig {
    /**
     * 显式指定 wecom-cli 二进制路径。
     * 不配置时按 `@tencent/wecom-cli-<platform>` → `@wecom/cli-<platform>` 顺序自动寻址。
     * 联调期可指向本地 cargo 构建产物。
     */
    binPath?: string;
    /**
     * 透传给 wecom-cli 的环境变量（仅接受下列三个键）。
     *
     * 用于把cli 指向测试环境。注意这三个变量在 cli 侧受 `custom-endpoint`
     * 编译特性门控（默认关闭），未启用该特性的正式包上不生效。
     *
     * ⚠️ WECOM_CLI_AUTH_ENDPOINT 必须与插件换取凭据所用端点保持一致，
     * 否则登录态与业务调用会分属不同环境。
     */
    env?: {
        WECOM_CLI_BASE_URL?: string;
        WECOM_CLI_AUTH_ENDPOINT?: string;
        WECOM_CLI_ADDITIONAL_HEADERS?: string;
    };
}
/**
 * 单个企业微信账号的配置类型（用于 accounts 字段下的每个账号）。
 * 与 WeComConfig 字段完全一致，账号级字段会覆盖顶层同名字段。
 */
export type WeComAccountConfig = Partial<WeComConfig>;
export declare const DefaultWsUrl = "wss://openws.work.weixin.qq.com";
export interface ResolvedWeComAccount {
    accountId: string;
    name: string;
    enabled: boolean;
    websocketUrl: string;
    botId: string;
    secret: string;
    /** 是否发送"思考中"消息，默认为 true */
    sendThinkingMessage: boolean;
    config: WeComConfig;
    /** Agent 模式能力（自建应用） */
    agent?: ResolvedAgentAccount;
    /** Webhook 模式配置 */
    token?: string;
    encodingAESKey?: string;
    receiveId?: string;
}
/**
 * 解析企业微信账户配置
 */
export declare function resolveWeComAccount(cfg: OpenClawConfig): ResolvedWeComAccount;
/**
 * 设置企业微信账户配置
 */
export declare function setWeComAccount(cfg: OpenClawConfig, account: Partial<WeComConfig>): OpenClawConfig;
/**
 * 解析出口代理 URL（对齐原版 resolveWecomEgressProxyUrl）
 *
 * 优先级：
 * 1. config.channels.wecom.network.egressProxyUrl
 * 2. 环境变量：OPENCLAW_WECOM_EGRESS_PROXY_URL → WECOM_EGRESS_PROXY_URL → HTTPS_PROXY → ALL_PROXY → HTTP_PROXY
 */
export declare function resolveWecomEgressProxyUrl(cfg: OpenClawConfig): string | undefined;
