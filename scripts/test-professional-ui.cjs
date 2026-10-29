/* Visual contracts for the restrained primary-screen design, using the real
   generated preview bundle. No account, upload or payment service is contacted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { ROUND, STRAIGHT } = require('./flat-corners.cjs');
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'artifacts', 'professional');
const navigate = (page, view) => page.evaluate(view => go(view), view);

async function style(page, selector) {
  return page.locator(selector).first().evaluate(el => {
    const c = getComputedStyle(el);
    return { fontSize:c.fontSize, weight:c.fontWeight, color:c.color, paddingLeft:c.paddingLeft,
      border:c.borderWidth, borderTop:c.borderTopWidth, borderBottom:c.borderBottomWidth,
      backgroundImage:c.backgroundImage, height:el.getBoundingClientRect().height };
  });
}
async function backControl(page,label) {
  const controls=await page.locator('.zb-back').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length).map(el=>{
    const c=getComputedStyle(el),box=el.getBoundingClientRect(),icon=el.querySelector('svg')?.getBoundingClientRect();
    return {width:box.width,height:box.height,radius:c.borderRadius,borders:[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth],style:c.borderStyle,color:c.borderTopColor,iconCentered:!!icon&&Math.abs(icon.x+icon.width/2-box.x-box.width/2)<1&&Math.abs(icon.y+icon.height/2-box.y-box.height/2)<1};
  }));
  assert.equal(controls.length,1,`${label}: one shared Back control`);
  const control=controls[0];
  assert.equal(control.width,44,`${label}: 44px Back target width`);
  assert.equal(control.height,44,`${label}: 44px Back target height`);
  assert.equal(control.radius,'999px',`${label}: Back is a circle`);
  assert.deepEqual(control.borders,['1px','1px','1px','1px'],`${label}: complete 1px border`);
  assert.equal(control.style,'solid',`${label}: visible solid border`);
  assert.ok(!['transparent','rgba(0, 0, 0, 0)'].includes(control.color),`${label}: border is not transparent`);
  assert.equal(control.iconCentered,true,`${label}: arrow is centered inside the circle`);
}
async function audit(page, label) {
  const result = await page.evaluate(({round,straight}) => {
    const app = document.querySelector('.app'), nav = document.getElementById('nav');
    const box = nav.getBoundingClientRect(), appBox = app.getBoundingClientRect();
    const active = nav.querySelector('[aria-current="page"]'), before = getComputedStyle(active, '::before');
    const painted = before.display !== 'none' && before.content !== 'none' && Number(before.opacity) > .1 && !['transparent','rgba(0, 0, 0, 0)'].includes(before.backgroundColor);
    return {
      overflow:document.documentElement.scrollWidth > innerWidth + 1,
      canvas:getComputedStyle(app).backgroundColor, height:box.height, bottom:box.bottom, appBottom:appBox.bottom,
      activeColor:getComputedStyle(active).color, ink:getComputedStyle(document.body).color,
      filledActiveBubble:painted && parseFloat(before.height) > 4,
      wrong:[...document.querySelectorAll('body *')].filter(el => el.getClientRects().length).flatMap(el => {
        const c = getComputedStyle(el), name = el.id || el.className || el.tagName;
        const radiusOK=c.borderRadius==='10px'||c.borderRadius==='999px'&&el.matches(round)||c.borderRadius==='0px'&&el.matches(straight);
        return [!radiusOK && `${name}: radius ${c.borderRadius}`, c.boxShadow !== 'none' && `${name}: box shadow`, c.textShadow !== 'none' && `${name}: text shadow`, c.filter.includes('drop-shadow') && `${name}: filter shadow`].filter(Boolean);
      })
    };
  }, {round:ROUND,straight:STRAIGHT});
  assert.equal(result.overflow, false, `${label}: fits the viewport`);
  assert.equal(result.canvas, 'rgb(255, 255, 255)', `${label}: pure white canvas`);
  assert.deepEqual(result.wrong, [], `${label}: flat styling with 10px corners except the round Back, call, avatar and switch controls`);
  assert.ok(Math.abs(result.height - 58) < .6, `${label}: compact shared tab height`);
  assert.ok(Math.abs(result.bottom - result.appBottom) < .6, `${label}: no gap below tabs`);
  assert.equal(result.filledActiveBubble, false, `${label}: no decorative filled tab bubble`);
  assert.equal(result.activeColor, result.ink, `${label}: restrained dark active tab label`);
}

(async () => {
  const browser = await chromium.launch({ headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, reducedMotion:'reduce' });
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(pathToFileURL(path.join(root, 'dist', 'index.html')).href + '?role=sender');
    fs.mkdirSync(shots, { recursive:true });
    for (const width of [320,390,768]) {
      await page.setViewportSize({ width, height:844 });
      for (const view of ['home','chats','profile','settings']) {
        await navigate(page, view);
        await audit(page, `${view} ${width}px`);
        if (view === 'home') {
          const heading = await style(page, '.zh-section-title h2');
          assert.equal(heading.fontSize, '18px', 'Home uses a clear section hierarchy');
          assert.equal(heading.weight, '600', 'Home headings use restrained semibold type');
          if (width < 760) assert.equal((await style(page, '.zh-dashboard')).paddingLeft, '20px', 'Mobile content uses a consistent gutter');
        } else if (view === 'chats') {
          const heading = await style(page, '.zc-heading h1');
          assert.equal(heading.fontSize, '24px', 'Chats has a readable page heading');
          assert.equal(heading.weight, '600', 'Page headings use restrained semibold type');
          assert.equal((await style(page, '.zc-name')).fontSize, '15px', 'Conversation names use the shared body hierarchy');
        } else if (view === 'profile') {
          await backControl(page,`Own profile ${width}px`);
          const cover = await style(page, '.zu-cover');
          assert.ok(Math.abs(cover.height - (width < 760 ? 192 : 220)) < .6, 'Profile cover does not dominate the first screen');
          assert.equal(await page.locator('.zu-cover.has-photo').count(), 0, 'This fixture covers a profile without a cover image');
          assert.equal((await style(page, '.zu-cover-art')).backgroundImage, 'none', 'Missing covers use a simple neutral surface');
          const shadeVisible = await page.locator('.zu-cover-shade').evaluateAll(nodes => nodes.some(node => { const c = getComputedStyle(node); return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0; }));
          assert.equal(shadeVisible, false, 'A missing cover has no decorative gradient overlay');
          assert.equal(await page.locator('.zu-eyebrow').evaluateAll(nodes => nodes.some(node => node.getClientRects().length)), false, 'Profile has no decorative all-caps eyebrow');
          const stats = await style(page, '.zu-stats');
          assert.equal(stats.border, '0px', 'Profile statistics remain a simple unboxed row');
          assert.equal((await style(page, '.zu-bio')).fontSize, '14px', 'Profile biography stays readable');
          assert.equal(await page.getByRole('button', { name:'Edit profile', exact:true }).isVisible(), true);
          assert.equal(await page.getByRole('button', { name:'Upload photos', exact:true }).isVisible(), true);
        } else {
          await backControl(page,`Settings ${width}px`);
          assert.equal(await page.locator('#zp-search,.zp-filters').count(), 0, 'Settings remains a simple list');
          const account = await style(page, '.zp-simple-row');
          assert.equal(account.fontSize, '16px', 'Settings rows use balanced body sizing');
          assert.equal(account.border, '0px', 'Settings rows stay unboxed');
          assert.equal((await style(page, '.zp-simple-icon svg')).color, 'rgb(24, 24, 27)', 'Settings uses monochrome outline icons');
        }
        if (width === 390) await page.screenshot({ path:path.join(shots, `after-${view}.png`) });
      }
    }
    for(const view of ['coins','all-creators']) {
      await navigate(page,view);
      await backControl(page,view);
    }
    await page.evaluate(()=>go('host','aanya'));
    await backControl(page,'Public profile');
    assert.deepEqual(errors, [], 'No browser errors during the visual review');
    console.log('PASS professional UI: restrained typography, plain settings/icons, compact neutral profile, readable content, white/no-shadow/10px styling with round Back and call controls and gap-free 58px tabs at 320/390/768px');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
