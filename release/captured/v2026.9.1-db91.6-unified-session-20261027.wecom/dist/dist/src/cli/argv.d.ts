/**
 * argv 解析与安全校验
 *
 * tool 入参刻意对齐 cli 命令行本身（`args` = `wecom-cli ` 之后的全部内容），
 * 这样 skills 里的命令表、参数说明、返回字段表都不需要改写。
 *
 * 但"对齐命令行"不等于"走shell"——spawn 一律 `shell: false`，
 * 这里只做极简词法切分：认单引号 / 双引号 / 反斜杠，遇到任何 shell
 * 元字符直接拒绝（出现元字符说明模型在拼 shell，而不是在传参数）。
 */
export declare class CliArgvError extends Error {
}
/**
 * 极简 POSIX-ish 词法切分。
 *
 * 支持：
 *   'single quoted'      → 内部原样，不做任何转义
 *   "double quoted"      → 支持 \" \\ 转义
 *   bare\ token          → 反斜杠转义空格
 * 不支持（且拒绝）：裸的管道、重定向、命令组合。
 *
 * shell 组合符的检查是**引号感知**的：只有引号外的裸字符才会被拒绝。
 * 这样 `--json '{"a":1}'` 和 `--json {"a":1}` 都能通过，
 * 而 `... | jq .` 里裸的管道符会被拦住。
 */
export declare function tokenize(input: string): string[];
/**
 * 安全校验。
 *
 * 关键点：`WECOM_CLI_CONFIG_DIR` 由服务端按当前会话的 bot 注入，
 * 模型既看不到也改不了。这里额外拦住模型试图自行覆盖配置目录/端点的行为——
 * 一旦被覆盖，就可能拿 A 企业的凭据调 B 企业的接口。
 */
export declare function assertSafeArgv(argv: string[]): void;
/** 归一化 tool 入参为 argv 数组，并完成安全校验 */
export declare function normalizeArgs(args: unknown): string[];
