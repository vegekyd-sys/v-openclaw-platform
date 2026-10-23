export interface ToolPolicyConfig {
    profile?: string;
    alsoAllow?: string[];
}
/**
 * 仅在旧白名单确实导致 `wecom-cli` 不可见时提示迁移。
 *
 * 不做配置卫生检查：profile=full、已放行具体 tool、已放行插件 ID 时，
 * 旧条目只是无害残留，不应制造启动噪音。
 */
export declare function shouldWarnLegacyToolAllow(tools: ToolPolicyConfig | undefined): boolean;
export declare const LEGACY_TOOL_WARNING: string;
