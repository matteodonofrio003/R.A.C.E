/* Run with Playwright installed and RACE_BROWSER pointing to Chromium if needed. */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'text/javascript');
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.RACE_BROWSER || undefined, headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({viewport: {width:1100,height:720}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.sent = [];
      window.packet = {rpm:4500,speed:180,steer:0,gear:4,cockpit:true,session:40,feedback:false,alarm:false};
      window.WebSocket = class {
        constructor() {
          this.readyState=0;
          setTimeout(()=>{this.readyState=1;this.onopen?.();},10);
          this.timer=setInterval(()=>this.onmessage?.({data:JSON.stringify(window.packet)}),100);
        }
        send(raw) { window.sent.push(JSON.parse(raw)); }
        close() { clearInterval(this.timer);this.readyState=3;this.onclose?.(); }
      };
      const Context=window.AudioContext;
      window.AudioContext=class extends Context {
        constructor(...args) {super(...args);window.testAudioContext=this;}
      };
    });
    await page.goto('http://127.0.0.1:'+server.address().port, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('status').textContent==='RESET PENDING',null,{timeout:60000});
    assert.equal(await page.locator('#speed').textContent(),'0');
    await page.waitForFunction(()=>window.sent.some(p=>p.session===41));
    await page.locator('#setup-toggle').click();
    await page.waitForFunction(()=>document.getElementById('diagnostic').textContent.includes('Return UART missing'));
    assert.match(await page.locator('#diagnostic').textContent(),/Return UART missing/);
    assert.equal(await page.locator('#buzzer-test').isDisabled(),true);
    // A cached stopped frame does not acknowledge the new session.
    await page.evaluate(()=>{window.packet.speed=0;});
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#status').textContent(),'RESET PENDING');
    await page.evaluate(()=>{window.packet.session=41;window.packet.feedback=true;});
    await page.waitForFunction(()=>document.getElementById('status').textContent==='ECU LIVE');
    await page.waitForTimeout(2000);
    await page.locator('#calibrate').click();
    assert.match(await page.locator('#calibration-status').textContent(),/Center saved/);
    await page.evaluate(()=>{window.sent=[];});
    await page.locator('#buzzer-test').click();
    await page.waitForFunction(()=>window.sent.some(p=>p.offtrack));
    await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(()=>window.sent.at(-1).offtrack),false);
    await page.locator('#setup-close').click();
    await page.locator('#audio-toggle').click();
    assert.equal(await page.locator('#audio-toggle').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>window.testAudioContext.state),'running');
    await page.evaluate(()=>{window.packet.speed=100;});
    await page.waitForFunction(()=>Number(document.getElementById('speed').textContent)>80);
    await page.locator('#restart').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent==='RESET PENDING');
    assert.equal(await page.locator('#speed').textContent(),'0');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#speed').textContent(),'0');
    await page.waitForFunction(()=>window.sent.some(p=>p.session===42));
    await page.evaluate(()=>{window.packet.session=42;window.packet.speed=0;});
    await page.waitForFunction(()=>document.getElementById('status').textContent==='ECU LIVE');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#laps').textContent(),'0');
    assert.equal(await page.locator('#average').textContent(),'0.0 km/h');
    await page.evaluate(()=>{window.packet.rpm=1000;});
    await page.waitForTimeout(200);
    await page.screenshot({path:path.join(os.tmpdir(),'race-v3-desktop.jpg'),type:'jpeg',quality:55});
    await page.locator('#demo').click();
    await page.keyboard.down('KeyW');
    await page.waitForFunction(()=>Number(document.getElementById('speed').textContent)>10);
    await page.keyboard.up('KeyW');
    assert.equal(await page.evaluate(()=>window.sent.at(-1).offtrack),false);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#setup-toggle').click();
    await page.screenshot({path:path.join(os.tmpdir(),'race-v3-mobile.jpg'),type:'jpeg',quality:50});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: reset/ACK, stale frames, calibration, buzzer pulse, audio, demo, responsive layout.');
    console.log('Screenshots: '+path.join(os.tmpdir(),'race-v3-{desktop,mobile}.jpg'));
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
