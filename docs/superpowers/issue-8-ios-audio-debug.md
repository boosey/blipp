# Issue #8 — iOS Capacitor audio plays intro jingle then silence

Companion runbook for [GitHub issue #8](https://github.com/boosey/blipp/issues/8). Use when continuing the debug session from a different machine (e.g., switched from Windows to Mac to access Xcode + Safari Web Inspector).

## Context recap

Surfaced during the T14 manual smoke test (Check 7). On iOS Capacitor builds, tapping a feed item plays the intro jingle, then audio cuts to silence. Web playback (desktop + mobile Safari) is unaffected.

Prior debug session established:
- `webContentsDebuggingEnabled` is force-enabled in `capacitor.config.ts` (commit `8a55b9f`, **TEMPORARY — revert before release**).
- Bug repros on the iOS Simulator (not just physical iPhone), so use the Simulator for fast iteration.
- First diagnostic showed: `audio.src` IS a `blob:capacitor://...` URL, `readyState: 4` (fully loaded), `error: null`. So it's NOT a network-fetch failure.
- `cookieHasSession: false` is a red herring — `CapacitorHttp.enabled: true` puts cookies in the native iOS jar where `document.cookie` can't see them.
- The `/api/feed` probe returned an unexpected shape (`sampleId: undefined`), but the prefetcher path is clearly working since a blob is loaded.

## Top theory

The blob loaded into the audio element is undersized — either it's the intro jingle alone, or it's audio truncated mid-stream, or it's an error/HTML response served with audio MIME. The audio element happily plays whatever's in the blob and stops when it ends.

## Setup on Mac

```bash
git pull
npm run build:ios:production && npx cap sync ios
# Xcode → Run on iOS Simulator
```

After app launches: Mac Safari → Develop → [Simulator name] → Blipp WebView → Web Inspector (Console tab).

If Web Inspector doesn't show the WebView:
- In the Simulator: Settings → Apps → Safari → Advanced → Web Inspector ON
- Confirm `cat ios/App/App/capacitor.config.json | grep -i debug` shows `"webContentsDebuggingEnabled": true`

## Step 1 — sign in, tap a feed item, wait for silence, then run this in Console

```js
(async () => {
  const a = document.querySelector('audio');
  const audio = {
    src: a?.src,
    paused: a?.paused,
    ended: a?.ended,
    currentTime: a?.currentTime,
    duration: a?.duration,
    error: a?.error?.code,
  };

  let blob = null;
  if (a?.src?.startsWith('blob:')) {
    try {
      const r = await fetch(a.src);
      const b = await r.blob();
      const first8 = new Uint8Array(await b.slice(0, 8).arrayBuffer());
      blob = {
        sizeBytes: b.size,
        type: b.type,
        firstBytesHex: Array.from(first8).map(x => x.toString(16).padStart(2, '0')).join(' '),
        looksLikeID3: first8[0] === 0x49 && first8[1] === 0x44 && first8[2] === 0x33, // "ID3"
        looksLikeMpegFrame: first8[0] === 0xff && (first8[1] & 0xe0) === 0xe0,
      };
    } catch (e) { blob = { error: String(e) }; }
  }

  let feed = null;
  try {
    const r = await fetch(window.location.origin + '/api/feed', { credentials: 'include' });
    const text = await r.text();
    feed = { status: r.status, contentType: r.headers.get('content-type'), bodyPreview: text.slice(0, 300) };
  } catch (e) { feed = { error: String(e) }; }

  return { audio, blob, feed };
})();
```

## What each result means

| Observation | Diagnosis |
|---|---|
| `blob.sizeBytes < 100_000` | Truncated or error page — fetch what's-actually-there from R2 |
| `blob.type === 'text/html'` or `application/json` | Server returned an error page, not audio — check `/audio-url` and signed-URL flow on iOS |
| `blob.firstBytesHex` doesn't match ID3 / MPEG frame patterns | Not actually MP3 — same as above |
| `audio.currentTime === audio.duration` and `ended: true` | The blob is short — it played fully and stopped. Confirms truncation theory |
| `audio.currentTime < audio.duration` and `paused: true` | Playback paused mid-file — different bug, check audio session interruptions |
| `feed.status === 401` | API auth broken on iOS — cookies aren't transmitting; need to switch to JWT bearer token |
| `feed.status === 200` but body shape wrong | Probe was wrong, not a real bug |

## Step 2 — depending on result

### If blob is undersized / wrong type

The prefetcher stored garbage. Check the prefetcher's fetch path on iOS:
- `src/services/prefetcher.ts` → `downloadOne` (or whatever fetches and stores the blob)
- Trace what happens when the audio fetch is intercepted by `CapacitorHttp` native fetch
- Likely: the signed-URL fetch goes through `CapacitorHttp` and either returns wrong content or doesn't follow R2 redirects properly

### If blob is correct size + MP3 framing

The audio file IS the right thing but iOS Safari can't play it after the intro. Possible:
- Audio session interruption (silent switch, other audio app)
- Background mode not configured in `Info.plist`
- iOS WKWebView codec quirk

## Step 3 — propose a fix as a fresh PR

Once root cause is clear, propose a fix in a new branch (don't keep working directly on `main`). Update issue #8 with findings and PR link.

## Cleanup before merging anything

The temporary debug-enable commit `8a55b9f` (`chore(ios): TEMP unconditional WKWebView inspection`) MUST be reverted before any release-bound merge. Either:

```bash
git revert 8a55b9f
```

or restore `capacitor.config.ts:26-32` to the env-conditional form:

```ts
webContentsDebuggingEnabled: process.env.BLIPP_TARGET_ENV !== "production",
```

## Bootstrap prompt for a fresh Claude session on Mac

> I'm continuing debug of GitHub issue #8 (iOS Capacitor audio plays intro then silence) from a prior session that ran on Windows. The full procedure and current state is in `docs/superpowers/issue-8-ios-audio-debug.md` — read it, then walk me through Step 1.
