# 回复建议生成评测

方案和结论见 [docs/reply-suggestions-proposal-20261028.md](../../docs/reply-suggestions-proposal-20261028.md)。这里只放复现用的脚本；**样本、生成结果和评审结果都含真实对话，不进仓库**。

## 文件

| 文件 | 在哪跑 | 作用 |
|---|---|---|
| `extract.py` | V，`sudo -u openclaw` | 只读打开 makaron 的 agent 库，按 session_id 取最近 400 条 transcript 事件，拼成回合 |
| `build.py` | 本机 | 从导出结果挑「用户发言 → V 有正文回复」的回合，生成 `samples_all.json` |
| `prompts.py` | V | `NAIVE`（对照组）、`DESIGNED`（推荐）、`DESIGNED_V2`（先列 done，实测没帮助） |
| `gen.py` | V | 按方案调模型，读 V 的 `openclaw.json` / `.env` 里的 provider，进程内用密钥，不打印 |
| `filt.py` / `gate.py` | 本机 | 建议过滤；「任务还在跑」等文字规则 |
| `judge.py` → `judge_run.py` → `score.py` | 本机 → V → 本机 | 匿名打乱后生成评审 prompt；在 V 上用 Grok 4.7 / GPT‑5.6 评审；汇总 |
| `send_cards.py` | V，root | 以 V 机器人身份往指定测试群发样例卡（`ocf1` / `k:"quick"` 按钮） |

## 步骤

```sh
# 1. 导出（V 上只读，配 ionice/nice）
scp extract.py v:/tmp/rs-extract.py
ssh v "sudo -u openclaw ionice -c3 nice -n19 python3 /tmp/rs-extract.py '<{session_id: meta} JSON>'" > raw.json
python3 build.py "$PWD"            # → samples_all.json，再人工标注 expect=show/skip 得到 samples.json

# 2. 生成（V 上）
python3 gen.py samples.json A0_naive_flash,A1_sep_flash,A2_sep_flash_think,B_main_full 6 > gen_out.json

# 3. 评审
python3 judge.py A0_naive_flash,A1_sep_flash,A2_sep_flash_think,B_main_full judge_in.json
python3 judge_run.py judge_in.json xai grok-4.7 > judge_grok.json        # V 上
python3 score.py judge_grok.json A0_naive_flash,A1_sep_flash,A2_sep_flash_think,B_main_full
```

V 的 `/tmp` 下有别人的同名文件，上传时用带前缀的唯一文件名再 `sudo install` 到自己的目录。
