set -e
export PATH=/opt/node-v22.23.1/bin:$PATH
mkdir -p /tmp/wsbench/plugins && cd /tmp/wsbench/plugins
printf '{"name":"wsb","private":true,"type":"module"}\n' > package.json
npm install --no-save --ignore-scripts --no-audit --no-fund --omit=peer --legacy-peer-deps \
  @openclaw/duckduckgo-plugin@2026.9.1 @openclaw/parallel-plugin@2026.9.1 @openclaw/firecrawl-plugin@2026.9.1 \
  @openclaw/tavily-plugin@2026.9.1 @openclaw/exa-plugin@2026.9.1 @openclaw/brave-plugin@2026.9.1 \
  @openclaw/perplexity-plugin@2026.9.1 @openclaw/searxng-plugin@2026.9.1 \
  @keenable/openclaw-search @chaojihao/openclaw-plugin-bocha @z-imagine/openclaw-baidu-search 2>&1 | tail -5
rm -rf node_modules/openclaw
ln -s /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core node_modules/openclaw
ls node_modules node_modules/@openclaw
du -sh node_modules
