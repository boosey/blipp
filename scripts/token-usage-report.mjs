#!/usr/bin/env node
/**
 * Token Usage Report — HTML Generator
 *
 * Fetches Anthropic usage data and generates a self-contained HTML report
 * with inline SVG charts. No external dependencies required.
 *
 * Usage:
 *   node scripts/token-usage-report.mjs [--date YYYY-MM-DD] [--output path.html]
 *
 * Env: ANTHROPIC_ADMIN_API_KEY
 */

const API_BASE = "https://api.anthropic.com/v1/organizations/usage_report/messages";
const API_VERSION = "2023-06-01";

// Published pricing per 1M tokens
const PRICING = {
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-opus-4-0": { input: 15, output: 75 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-sonnet-4-0": { input: 3, output: 15 },
  "claude-sonnet-4-6-20250627": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  // Older models
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
  "claude-3-sonnet-20240229": { input: 3, output: 15 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
};

function getPricing(model) {
  if (PRICING[model]) return PRICING[model];
  const m = model.toLowerCase();
  if (m.includes("opus")) return { input: 15, output: 75 };
  if (m.includes("sonnet")) return { input: 3, output: 15 };
  if (m.includes("haiku")) return { input: 0.8, output: 4 };
  return { input: 3, output: 15 }; // default to sonnet pricing
}

function getModelFamily(model) {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "Opus";
  if (m.includes("haiku")) return "Haiku";
  return "Sonnet";
}

async function fetchUsage(apiKey, startingAt, endingAt, bucketWidth = "1h") {
  const params = new URLSearchParams({
    starting_at: startingAt,
    ending_at: endingAt,
    bucket_width: bucketWidth,
    group_by: "model",
  });
  const resp = await fetch(`${API_BASE}?${params}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${text}`);
  }
  return resp.json();
}

function calculateShadowCost(inputTokens, outputTokens, model) {
  const p = getPricing(model);
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function formatCurrency(n) {
  return "$" + n.toFixed(2);
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

// SVG chart helpers
function svgBarChart(data, { width = 700, height = 250, title = "", yLabel = "", color = "#6366f1" } = {}) {
  const margin = { top: 30, right: 20, bottom: 50, left: 70 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const maxVal = Math.max(...data.map((d) => d.value), 0.01);
  const barW = Math.max(2, (w / data.length) * 0.8);
  const gap = (w / data.length) * 0.2;

  let bars = "";
  data.forEach((d, i) => {
    const x = margin.left + i * (barW + gap);
    const barH = (d.value / maxVal) * h;
    const y = margin.top + h - barH;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2">
      <title>${d.label}: ${typeof d.value === "number" && d.value < 100 ? formatCurrency(d.value) : formatTokens(d.value)}</title>
    </rect>`;
    if (data.length <= 24) {
      bars += `<text x="${x + barW / 2}" y="${margin.top + h + 16}" text-anchor="middle" font-size="10" fill="#94a3b8">${d.label}</text>`;
    }
  });

  // Y-axis ticks
  let yAxis = "";
  for (let i = 0; i <= 4; i++) {
    const val = (maxVal / 4) * i;
    const y = margin.top + h - (val / maxVal) * h;
    yAxis += `<line x1="${margin.left - 5}" y1="${y}" x2="${margin.left + w}" y2="${y}" stroke="#334155" stroke-width="0.5" stroke-dasharray="4"/>`;
    yAxis += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${val < 100 ? formatCurrency(val) : formatTokens(val)}</text>`;
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#e2e8f0">${title}</text>
    ${yAxis}
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + h}" stroke="#475569" stroke-width="1"/>
    <line x1="${margin.left}" y1="${margin.top + h}" x2="${margin.left + w}" y2="${margin.top + h}" stroke="#475569" stroke-width="1"/>
    ${bars}
    <text x="${margin.left - 40}" y="${margin.top + h / 2}" text-anchor="middle" font-size="11" fill="#94a3b8" transform="rotate(-90, ${margin.left - 40}, ${margin.top + h / 2})">${yLabel}</text>
  </svg>`;
}

function svgLineChart(data, { width = 700, height = 250, title = "", yLabel = "", lines = [] } = {}) {
  const margin = { top: 30, right: 120, bottom: 50, left: 70 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const allVals = lines.flatMap((l) => data.map((d) => d[l.key] || 0));
  const maxVal = Math.max(...allVals, 0.01);

  let paths = "";
  let legends = "";
  lines.forEach((line, li) => {
    const points = data.map((d, i) => {
      const x = margin.left + (i / Math.max(data.length - 1, 1)) * w;
      const y = margin.top + h - ((d[line.key] || 0) / maxVal) * h;
      return `${x},${y}`;
    });
    paths += `<polyline points="${points.join(" ")}" fill="none" stroke="${line.color}" stroke-width="2.5"/>`;
    data.forEach((d, i) => {
      const x = margin.left + (i / Math.max(data.length - 1, 1)) * w;
      const y = margin.top + h - ((d[line.key] || 0) / maxVal) * h;
      paths += `<circle cx="${x}" cy="${y}" r="4" fill="${line.color}"><title>${d.label}: ${formatCurrency(d[line.key] || 0)}</title></circle>`;
    });
    legends += `<rect x="${margin.left + w + 10}" y="${margin.top + li * 20}" width="12" height="12" fill="${line.color}" rx="2"/>`;
    legends += `<text x="${margin.left + w + 26}" y="${margin.top + li * 20 + 10}" font-size="11" fill="#cbd5e1">${line.label}</text>`;
  });

  // X-axis labels
  let xLabels = "";
  data.forEach((d, i) => {
    const x = margin.left + (i / Math.max(data.length - 1, 1)) * w;
    xLabels += `<text x="${x}" y="${margin.top + h + 18}" text-anchor="middle" font-size="10" fill="#94a3b8">${d.label}</text>`;
  });

  // Y-axis ticks
  let yAxis = "";
  for (let i = 0; i <= 4; i++) {
    const val = (maxVal / 4) * i;
    const y = margin.top + h - (val / maxVal) * h;
    yAxis += `<line x1="${margin.left - 5}" y1="${y}" x2="${margin.left + w}" y2="${y}" stroke="#334155" stroke-width="0.5" stroke-dasharray="4"/>`;
    yAxis += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${formatCurrency(val)}</text>`;
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#e2e8f0">${title}</text>
    ${yAxis}
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + h}" stroke="#475569" stroke-width="1"/>
    <line x1="${margin.left}" y1="${margin.top + h}" x2="${margin.left + w}" y2="${margin.top + h}" stroke="#475569" stroke-width="1"/>
    ${paths}${xLabels}${legends}
  </svg>`;
}

function svgDonutChart(slices, { width = 350, height = 300, title = "" } = {}) {
  const cx = width / 2;
  const cy = 130;
  const r = 90;
  const ir = 55;
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return `<svg width="${width}" height="${height}"><text x="${cx}" y="${cy}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;

  let startAngle = -Math.PI / 2;
  let arcs = "";
  let legend = "";
  slices.forEach((s, i) => {
    const pct = s.value / total;
    const endAngle = startAngle + pct * Math.PI * 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + ir * Math.cos(endAngle);
    const iy1 = cy + ir * Math.sin(endAngle);
    const ix2 = cx + ir * Math.cos(startAngle);
    const iy2 = cy + ir * Math.sin(startAngle);
    arcs += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z" fill="${s.color}">
      <title>${s.label}: ${formatCurrency(s.value)} (${(pct * 100).toFixed(1)}%)</title>
    </path>`;
    const ly = 240 + i * 22;
    legend += `<rect x="${cx - 80}" y="${ly}" width="14" height="14" fill="${s.color}" rx="2"/>`;
    legend += `<text x="${cx - 60}" y="${ly + 11}" font-size="12" fill="#cbd5e1">${s.label}: ${formatCurrency(s.value)} (${(pct * 100).toFixed(0)}%)</text>`;
    startAngle = endAngle;
  });

  const adjustedHeight = 250 + slices.length * 22;
  return `<svg width="${width}" height="${adjustedHeight}" xmlns="http://www.w3.org/2000/svg">
    <text x="${cx}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#e2e8f0">${title}</text>
    ${arcs}
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="#e2e8f0">${formatCurrency(total)}</text>
    ${legend}
  </svg>`;
}

function generateHTML(reportDate, hourlyData, weeklyData, modelBreakdown, summary) {
  const dateStr = reportDate.toISOString().split("T")[0];

  // Hourly bar chart
  const hourlyChart = svgBarChart(hourlyData, {
    title: `Hourly Shadow Cost — ${dateStr}`,
    yLabel: "Shadow Cost",
    color: "#818cf8",
  });

  // 7-day trend
  const trendChart = svgLineChart(weeklyData, {
    title: "7-Day Trend",
    yLabel: "Cost",
    lines: [
      { key: "shadowCost", label: "Shadow Cost", color: "#f472b6" },
      { key: "subscriptionCost", label: "Subscription", color: "#34d399" },
    ],
  });

  // Model donut
  const colors = { Opus: "#a78bfa", Sonnet: "#60a5fa", Haiku: "#34d399" };
  const donutSlices = modelBreakdown.map((m) => ({
    label: m.family,
    value: m.shadowCost,
    color: colors[m.family] || "#94a3b8",
  }));
  const donutChart = svgDonutChart(donutSlices, { title: "Model Mix (Shadow Cost)" });

  // Subscription overlay bar chart
  const overlayChart = svgBarChart(
    weeklyData.map((d) => ({ label: d.label, value: d.shadowCost })),
    { title: "Daily Shadow Cost (7-Day)", yLabel: "Cost", color: "#f472b6", width: 350, height: 250 }
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Token Usage Report — ${dateStr}</title>
<style>
  :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; --accent: #818cf8; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; padding: 24px; max-width: 1100px; margin: 0 auto; line-height: 1.6; }
  h1 { font-size: 1.75rem; margin-bottom: 4px; }
  h2 { font-size: 1.2rem; color: var(--accent); margin: 24px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  h3 { font-size: 1rem; color: var(--muted); margin: 16px 0 8px; }
  .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .card svg { width: 100%; height: auto; }
  .kpi-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; flex: 1; min-width: 160px; }
  .kpi-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
  .kpi-value.green { color: #34d399; }
  .kpi-value.pink { color: #f472b6; }
  .kpi-value.purple { color: #a78bfa; }
  .kpi-value.blue { color: #60a5fa; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
  th { color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
  .trend-up { color: #f87171; }
  .trend-down { color: #34d399; }
  .insights li { margin: 6px 0; padding-left: 0; }
  .insights ul { list-style: none; padding: 0; }
  .insights li::before { content: "→ "; color: var(--accent); }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
</style>
</head>
<body>
  <h1>Token Usage Report</h1>
  <div class="subtitle">${dateStr} • Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-label">Daily Shadow Cost</div>
      <div class="kpi-value pink">${formatCurrency(summary.dailyShadowCost)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Subscription Cost</div>
      <div class="kpi-value blue">${formatCurrency(summary.dailySubscriptionCost)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Savings</div>
      <div class="kpi-value green">${formatCurrency(summary.savings)} (${summary.savingsPct.toFixed(0)}%)</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Tokens</div>
      <div class="kpi-value purple">${formatTokens(summary.totalTokens)}</div>
    </div>
  </div>

  <h2>Hourly Usage</h2>
  <div class="card">${hourlyChart}</div>

  <h2>Charts</h2>
  <div class="grid">
    <div class="card">${donutChart}</div>
    <div class="card">${overlayChart}</div>
  </div>

  <h2>7-Day Trend</h2>
  <div class="card">${trendChart}</div>

  <h2>Model Breakdown</h2>
  <div class="card">
    <table>
      <thead><tr><th>Model</th><th>Input Tokens</th><th>Output Tokens</th><th>Shadow Cost</th><th>% of Total</th></tr></thead>
      <tbody>
        ${modelBreakdown
          .sort((a, b) => b.shadowCost - a.shadowCost)
          .map(
            (m) => `<tr>
            <td>${m.model}</td>
            <td>${formatTokens(m.inputTokens)}</td>
            <td>${formatTokens(m.outputTokens)}</td>
            <td>${formatCurrency(m.shadowCost)}</td>
            <td>${((m.shadowCost / Math.max(summary.dailyShadowCost, 0.01)) * 100).toFixed(1)}%</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>

  <h2>Subscription Value</h2>
  <div class="card">
    <table>
      <thead><tr><th>Metric</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Daily subscription cost (amortized)</td><td>${formatCurrency(summary.dailySubscriptionCost)}</td></tr>
        <tr><td>Daily shadow cost (API pricing)</td><td>${formatCurrency(summary.dailyShadowCost)}</td></tr>
        <tr><td>Daily savings</td><td class="${summary.savings > 0 ? "trend-down" : "trend-up"}">${formatCurrency(summary.savings)}</td></tr>
        <tr><td>Savings rate</td><td class="${summary.savingsPct > 0 ? "trend-down" : "trend-up"}">${summary.savingsPct.toFixed(1)}%</td></tr>
        <tr><td>7-day avg shadow cost</td><td>${formatCurrency(summary.weeklyAvgShadowCost)}</td></tr>
        <tr><td>Projected monthly shadow cost</td><td>${formatCurrency(summary.projectedMonthlyCost)}</td></tr>
        <tr><td>Projected monthly savings</td><td class="trend-down">${formatCurrency(summary.projectedMonthlySavings)}</td></tr>
      </tbody>
    </table>
  </div>

  <h2>Trend Analysis</h2>
  <div class="card">
    <table>
      <thead><tr><th>Metric</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Day-over-day change</td><td class="${summary.dodChange >= 0 ? "trend-up" : "trend-down"}">${summary.dodChange >= 0 ? "+" : ""}${summary.dodChange.toFixed(1)}%</td></tr>
        <tr><td>7-day rolling average</td><td>${formatCurrency(summary.weeklyAvgShadowCost)}</td></tr>
        <tr><td>vs 7-day average</td><td class="${summary.vsAvg >= 0 ? "trend-up" : "trend-down"}">${summary.vsAvg >= 0 ? "+" : ""}${summary.vsAvg.toFixed(1)}%</td></tr>
        ${summary.spikeFlag ? `<tr><td>⚠ Spike detected</td><td class="trend-up">Usage >25% above 7-day avg</td></tr>` : ""}
      </tbody>
    </table>
  </div>

  <h2>Actionable Insights</h2>
  <div class="card insights">
    <ul>
      ${summary.insights.map((i) => `<li>${i}</li>`).join("")}
    </ul>
  </div>

  <footer>Generated by Blipp Token Usage Report • Data from Anthropic Usage API • Shadow costs at published API pricing</footer>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_ADMIN_API_KEY not set");
    process.exit(1);
  }

  let dateArg = null;
  let outputPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) dateArg = args[++i];
    if (args[i] === "--output" && args[i + 1]) outputPath = args[++i];
  }

  const reportDate = dateArg ? new Date(dateArg + "T00:00:00Z") : new Date();
  const dayEnd = new Date(reportDate);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const dayStart = new Date(reportDate);
  dayStart.setUTCHours(0, 0, 0, 0);

  // Cap at current time if report date is today
  const now = new Date();
  const effectiveEnd = dayEnd > now ? now : dayEnd;

  console.log(`Fetching 24h usage for ${reportDate.toISOString().split("T")[0]}...`);

  // Fetch today's hourly data
  const todayData = await fetchUsage(apiKey, dayStart.toISOString(), effectiveEnd.toISOString(), "1h");

  // Fetch 7-day data
  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  console.log(`Fetching 7-day data from ${weekStart.toISOString().split("T")[0]}...`);
  const weekData = await fetchUsage(apiKey, weekStart.toISOString(), effectiveEnd.toISOString(), "1d");

  // Process hourly data
  const hourlyMap = new Map();
  for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);

  const modelMap = new Map();
  let totalInput = 0, totalOutput = 0, totalShadow = 0;

  for (const bucket of todayData.data || []) {
    const hour = new Date(bucket.bucket_start_time).getUTCHours();
    const model = bucket.model || "unknown";
    const inp = bucket.input_tokens || 0;
    const out = bucket.output_tokens || 0;
    const cacheRead = bucket.input_cached_tokens || bucket.cache_read_input_tokens || 0;
    const cacheCreate = bucket.cache_creation_input_tokens || 0;
    const cost = calculateShadowCost(inp + cacheRead + cacheCreate, out, model);

    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + cost);
    totalInput += inp + cacheRead + cacheCreate;
    totalOutput += out;
    totalShadow += cost;

    const family = getModelFamily(model);
    const existing = modelMap.get(model) || { model, family, inputTokens: 0, outputTokens: 0, shadowCost: 0 };
    existing.inputTokens += inp + cacheRead + cacheCreate;
    existing.outputTokens += out;
    existing.shadowCost += cost;
    modelMap.set(model, existing);
  }

  const hourlyData = Array.from(hourlyMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([h, cost]) => ({ label: `${h}:00`, value: cost }));

  const modelBreakdown = Array.from(modelMap.values());

  // Process weekly data
  const dailyMap = new Map();
  for (const bucket of weekData.data || []) {
    const day = bucket.bucket_start_time?.split("T")[0] || "unknown";
    const model = bucket.model || "unknown";
    const inp = bucket.input_tokens || 0;
    const out = bucket.output_tokens || 0;
    const cacheRead = bucket.input_cached_tokens || bucket.cache_read_input_tokens || 0;
    const cacheCreate = bucket.cache_creation_input_tokens || 0;
    const cost = calculateShadowCost(inp + cacheRead + cacheCreate, out, model);
    dailyMap.set(day, (dailyMap.get(day) || 0) + cost);
  }

  // Subscription: assume $200/month for Max plan (adjust as needed)
  const monthlySubscription = 200;
  const dailySubscription = monthlySubscription / 30;

  const weeklyData = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, cost]) => ({
      label: day.slice(5), // MM-DD
      shadowCost: cost,
      subscriptionCost: dailySubscription,
    }));

  const weeklyAvg = weeklyData.length > 0 ? weeklyData.reduce((s, d) => s + d.shadowCost, 0) / weeklyData.length : 0;
  const prevDay = weeklyData.length >= 2 ? weeklyData[weeklyData.length - 2].shadowCost : totalShadow;
  const dodChange = prevDay > 0 ? ((totalShadow - prevDay) / prevDay) * 100 : 0;
  const vsAvg = weeklyAvg > 0 ? ((totalShadow - weeklyAvg) / weeklyAvg) * 100 : 0;

  // Insights
  const insights = [];
  const topModel = modelBreakdown.sort((a, b) => b.shadowCost - a.shadowCost)[0];
  if (topModel) insights.push(`Highest cost model: ${topModel.model} at ${formatCurrency(topModel.shadowCost)} (${((topModel.shadowCost / Math.max(totalShadow, 0.01)) * 100).toFixed(0)}% of total)`);
  if (totalShadow > dailySubscription) insights.push(`Shadow cost exceeds subscription — good subscription value (${formatCurrency(totalShadow - dailySubscription)} saved today)`);
  else insights.push(`Low usage day — shadow cost below subscription amortization`);
  if (vsAvg > 25) insights.push(`⚠ Spike: ${vsAvg.toFixed(0)}% above 7-day average`);
  if (vsAvg < -25) insights.push(`Usage significantly below average — ${Math.abs(vsAvg).toFixed(0)}% lower than 7-day avg`);
  const opusTokens = modelBreakdown.filter((m) => m.family === "Opus").reduce((s, m) => s + m.inputTokens + m.outputTokens, 0);
  const allTokens = totalInput + totalOutput;
  if (allTokens > 0 && opusTokens / allTokens > 0.5) insights.push(`Opus usage is ${((opusTokens / allTokens) * 100).toFixed(0)}% of tokens — consider Sonnet for routine tasks`);

  const summary = {
    dailyShadowCost: totalShadow,
    dailySubscriptionCost: dailySubscription,
    savings: totalShadow - dailySubscription,
    savingsPct: dailySubscription > 0 ? ((totalShadow - dailySubscription) / totalShadow) * 100 : 0,
    totalTokens: totalInput + totalOutput,
    weeklyAvgShadowCost: weeklyAvg,
    projectedMonthlyCost: weeklyAvg * 30,
    projectedMonthlySavings: weeklyAvg * 30 - monthlySubscription,
    dodChange,
    vsAvg,
    spikeFlag: vsAvg > 25,
    insights,
  };

  const html = generateHTML(reportDate, hourlyData, weeklyData, modelBreakdown, summary);

  if (!outputPath) {
    outputPath = `token-usage-report-${reportDate.toISOString().split("T")[0]}.html`;
  }

  const { writeFileSync } = await import("fs");
  writeFileSync(outputPath, html);
  console.log(`Report saved to: ${outputPath}`);
  console.log(`Shadow cost: ${formatCurrency(totalShadow)} | Tokens: ${formatTokens(totalInput + totalOutput)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
