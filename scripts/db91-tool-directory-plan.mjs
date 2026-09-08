import assert from 'node:assert/strict';
export function toolDirectoryConfig(source){
  const cfg=JSON.parse(source);assert(cfg&&typeof cfg==='object'&&!Array.isArray(cfg));
  cfg.tools={...cfg.tools,toolSearch:{...(typeof cfg.tools?.toolSearch==='object'?cfg.tools.toolSearch:{}),enabled:true,mode:'directory'}};
  return JSON.stringify(cfg,null,2)+'\n';
}
