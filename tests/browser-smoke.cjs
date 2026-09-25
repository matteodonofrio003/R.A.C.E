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
      const mime={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.hdr':'application/octet-stream'};
      res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
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
    page.on('console', message => {
      if(message.type()==='error' && /WebGLProgram|Shader Error/.test(message.text())) errors.push(message.text());
    });
    await page.addInitScript(() => {
      if (location.protocol === 'http:') {
        localStorage.setItem('race-lap-records-v1',JSON.stringify({
          laps:7,best:62.345,last:{time:65.432,valid:true}
        }));
        localStorage.setItem('race-camera-v1','chase');
      }
      window.sent = [];
      window.packet = {rpm:4500,speed:180,steer:0,gear:1,cockpit:true,session:40,feedback:false,alarm:false};
      window.WebSocket = class {
        constructor() {
          this.readyState=0;
          setTimeout(()=>{this.readyState=1;this.onopen?.();},10);
          this.timer=setInterval(()=>this.onmessage?.({data:JSON.stringify(window.packet)}),20);
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
    assert.equal(await page.locator('#laps').textContent(),'7');
    assert.equal(await page.locator('#best-lap').textContent(),'01:02.345');
    assert.equal(await page.locator('#last-lap').textContent(),'01:05.432');
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
    await page.locator('#calibrate-range').click();
    await page.locator('#calibrate-range').click();
    await page.evaluate(()=>{window.packet.steer=90;});
    await page.waitForTimeout(1400);
    await page.locator('#calibrate-range').click();
    await page.evaluate(()=>{window.packet.steer=-80;});
    await page.waitForTimeout(1400);
    await page.locator('#calibrate-range').click();
    assert.match(await page.locator('#calibration-status').textContent(),/Range and direction saved/);
    await page.evaluate(()=>{window.packet.steer=-4;});
    await page.waitForFunction(()=>document.getElementById('steering-values').textContent.includes('output: 5%'));
    await page.evaluate(()=>{window.packet.steer=0;});
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
    assert.equal(await page.locator('#laps').textContent(),'7');
    assert.equal(await page.locator('#best-lap').textContent(),'01:02.345');
    assert.equal(await page.locator('#last-lap').textContent(),'01:05.432');
    assert.equal(await page.locator('#average').textContent(),'0.0 km/h');
    assert.equal(await page.locator('#gear').count(),0);
    await page.evaluate(()=>{window.packet.rpm=1000;});
    await page.waitForTimeout(200);
    await page.waitForFunction(()=>document.body.dataset.environment==='hdr',null,{timeout:30000});
    await page.locator('#camera-toggle').click();
    await page.waitForFunction(()=>document.body.classList.contains('cockpit-view'));
    assert.equal(await page.locator('#camera-toggle').getAttribute('aria-pressed'),'true');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.speedometer').evaluate(element=>getComputedStyle(element).visibility),'hidden');
    await page.screenshot({path:path.join(os.tmpdir(),'race-v6-cockpit.jpg'),type:'jpeg',quality:65});
    await page.locator('#camera-toggle').click();
    await page.waitForFunction(()=>!document.body.classList.contains('cockpit-view'));
    await page.screenshot({path:path.join(os.tmpdir(),'race-v6-desktop.jpg'),type:'jpeg',quality:60});
    await page.locator('#demo').click();
    await page.keyboard.down('KeyW');
    await page.waitForFunction(()=>Number(document.getElementById('speed').textContent)>10);
    await page.keyboard.up('KeyW');
    assert.equal(await page.evaluate(()=>window.sent.at(-1).offtrack),false);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#setup-toggle').click();
    await page.screenshot({path:path.join(os.tmpdir(),'race-v6-mobile.jpg'),type:'jpeg',quality:50});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: persistent lap records, cockpit/chase cameras, reset/ACK, calibration, buzzer, HDR and responsive layout.');
    console.log('Screenshots: '+path.join(os.tmpdir(),'race-v6-{cockpit,desktop,mobile}.jpg'));
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
