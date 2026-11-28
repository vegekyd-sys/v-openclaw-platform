import re
PROGRESS=re.compile(r'(正在(跟踪|跑|执行|处理|生成|检查|排队)|已(触发|提交|派发|开始)|稍后(汇报|回报|同步)|跑完(再|后)|完成后(我)?(再|会)|我(会|去|先|继续|马上|这就|现在)[^。\n]{0,24}(查|看|跑|检查|处理|跟踪|确认|修|改|核对|跟进))')
def text_gate(reply):
    r=(reply or '').strip()
    if not r or r=='NO_REPLY': return 'empty'
    if r.startswith('{') and '"schema"' in r[:40]: return 'card-json'
    if len(r)<12: return 'too-short'
    head=r[:160]
    if PROGRESS.search(head) and len(r)<600: return 'in-progress'
    return None
