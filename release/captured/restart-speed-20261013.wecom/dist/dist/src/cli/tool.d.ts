/**
 * wecom-cli — 把 @wecom/cli 包装成 openclaw tool
 *
 * 为什么包装成 tool 而不是让 agent 用 exec 直接跑：
 * 1. 企微会话常见的 `messaging` profile 里没有 exec 工具
 * 2. **更关键**：exec 无法可靠注入 per-bot 的 WECOM_CLI_CONFIG_DIR。
 *    模型漏带一次 env 就会落到默认目录，拿 A 企业的凭据调 B 企业的接口——
 *    这是数据越权，不是功能降级。tool 让配置目录完全由服务端决定。
 * 3. 插件私有 node_modules/.bin 不在 PATH，PATH 上反而可能是用户全局装的 cli
 */
import * as path from "node:path";
export interface CreateWeComCliToolOptions {
    /** 当前会话对应的账号 ID（来自 ctx.agentAccountId） */
    accountId?: string;
}
export declare function prepareCliArguments(params: unknown): unknown;
export declare function createWeComCliTool(options?: CreateWeComCliToolOptions): {
    name: string;
    label: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            args: {
                type: "array";
                items: {
                    type: "string";
                };
                description: string;
            };
        };
        required: string[];
        additionalProperties: boolean;
    };
    prepareArguments: typeof prepareCliArguments;
    execute(_toolCallId: string, params: unknown): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: unknown;
    }>;
};
/** 仅用于测试 */
export declare function resetCliToolState(): void;
export { path as _path };
