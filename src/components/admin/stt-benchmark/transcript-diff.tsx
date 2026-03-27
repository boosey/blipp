export type DiffOp =
  | { type: "equal"; word: string }
  | { type: "insert"; word: string }
  | { type: "delete"; word: string }
  | { type: "replace"; refWord: string; hypWord: string };

const MAX_DIFF_WORDS = 8000;

export function computeWordDiff(refText: string, hypText: string): DiffOp[] | null {
  const ref = refText.split(/\s+/).filter(Boolean);
  const hyp = hypText.split(/\s+/).filter(Boolean);

  if (ref.length > MAX_DIFF_WORDS || hyp.length > MAX_DIFF_WORDS) return null;

  const n = ref.length;
  const m = hyp.length;

  const dp = new Uint32Array((n + 1) * (m + 1));
  const dir = new Uint8Array((n + 1) * (m + 1));
  const idx = (i: number, j: number) => i * (m + 1) + j;

  for (let j = 1; j <= m; j++) { dp[idx(0, j)] = j; dir[idx(0, j)] = 2; }
  for (let i = 1; i <= n; i++) { dp[idx(i, 0)] = i; dir[idx(i, 0)] = 1; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const k = idx(i, j);
      if (ref[i - 1] === hyp[j - 1]) {
        dp[k] = dp[idx(i - 1, j - 1)];
        dir[k] = 0;
      } else {
        const sub = dp[idx(i - 1, j - 1)];
        const del = dp[idx(i - 1, j)];
        const ins = dp[idx(i, j - 1)];
        if (sub <= del && sub <= ins) {
          dp[k] = 1 + sub; dir[k] = 0;
        } else if (del <= ins) {
          dp[k] = 1 + del; dir[k] = 1;
        } else {
          dp[k] = 1 + ins; dir[k] = 2;
        }
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const d = dir[idx(i, j)];
    if (d === 0 && i > 0 && j > 0) {
      if (ref[i - 1] === hyp[j - 1]) {
        ops.push({ type: "equal", word: hyp[j - 1] });
      } else {
        ops.push({ type: "replace", refWord: ref[i - 1], hypWord: hyp[j - 1] });
      }
      i--; j--;
    } else if (d === 1 && i > 0) {
      ops.push({ type: "delete", word: ref[i - 1] });
      i--;
    } else {
      ops.push({ type: "insert", word: hyp[j - 1] });
      j--;
    }
  }
  ops.reverse();
  return ops;
}

export function WordDiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-[#0A1628] rounded p-3 max-h-80 overflow-auto font-sans">
      {ops.map((op, i) => {
        switch (op.type) {
          case "equal":
            return <span key={i}>{op.word} </span>;
          case "insert":
            return (
              <span key={i} className="bg-[#10B981]/20 text-[#6EE7B7] rounded-sm px-0.5">
                {op.word}
              </span>
            );
          case "delete":
            return (
              <span key={i} className="bg-[#EF4444]/20 text-[#FCA5A5] line-through rounded-sm px-0.5">
                {op.word}
              </span>
            );
          case "replace":
            return (
              <span key={i}>
                <span className="bg-[#EF4444]/20 text-[#FCA5A5] line-through rounded-sm px-0.5">
                  {op.refWord}
                </span>
                <span className="bg-[#F59E0B]/20 text-[#FCD34D] rounded-sm px-0.5">
                  {op.hypWord}
                </span>
              </span>
            );
        }
        return null;
      })}{" "}
    </div>
  );
}
