// Renders every scene*.html in a folder to an MP4 by stepping seek(t) frame by frame.
// Usage:  node render_scenes.js [folder] [--fps 30] [--only scene063] [--limit 3]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(args.find(a => !a.startsWith('--') && fs.existsSync(a) && fs.statSync(a).isDirectory()) || '.');
const FPS = +opt('fps', 30), ONLY = opt('only', ''), LIMIT = +opt('limit', 0);
const out = path.join(dir, 'out'); fs.mkdirSync(out, { recursive: true });

(async () => {
  const files = fs.readdirSync(dir).filter(f => /^scene.*\.html$/.test(f) && f.includes(ONLY)).sort();
  if (!files.length) { console.log('No scene*.html files found in', dir); process.exit(1); }
  const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('  page error:', e.message));
  for (const f of files) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = html.match(/Matches scene [\d-]+\.mp4/);
    const name = m ? m[0] : f.replace(/\.html$/, '.mp4');
    console.log(`\n${f}  ->  ${name}`);
    await page.goto('file://' + path.join(dir, f));
    await page.addStyleTag({ content: '#bar{display:none!important}html,body{margin:0;padding:0;background:#000}#stageWrap{display:block;width:1920px;height:1080px}#stageWrap svg{width:1920px!important;height:1080px!important;max-width:none!important;max-height:none!important}' });
    await page.evaluate(async () => { exporting = true; playing = false; await document.fonts.ready; });
    await page.waitForTimeout(1500);                       // let Google Fonts settle
    const dur = await page.evaluate(() => window.DURATION);
    let N = Math.round(dur * FPS); if (LIMIT) N = Math.min(N, Math.round(LIMIT * FPS));
    await page.evaluate(() => window.seek(0));
    await page.screenshot({ type: 'png' });                // font / filter warm-up frame
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', '-movflags', '+faststart', path.join(out, name)], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise(r => ff.on('close', r));
    for (let i = 0; i < N; i++) {
      await page.evaluate(t => window.seek(t), i / FPS);
      const buf = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 60 === 0) process.stdout.write(`  frame ${i}/${N}\r`);
    }
    ff.stdin.end(); await done;
    console.log(`  done: ${N} frames, ${(N / FPS).toFixed(2)} s -> out/${name}`);
  }
  await browser.close();
})();
// updated Mon Oct 12 14:39:58 EAT 2026
