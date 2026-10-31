/* Browser regression checks for the bundled onboarding UI.
 * Run npm run build:web and npx playwright install chromium first.
 * PLAYWRIGHT_MODULE can point to an existing Playwright package, and
 * PLAYWRIGHT_EXECUTABLE_PATH can select an existing Chromium executable.
 * Optional: ONBOARDING_ARTIFACTS sets the screenshot output directory.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { deflateSync } = require('node:zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const artifacts = process.env.ONBOARDING_ARTIFACTS || path.join(os.tmpdir(), 'zimi-onboarding-checks');
fs.mkdirSync(artifacts, { recursive: true });

// Real PNG inputs exercise the browser's image decoding/upload path.
function photo(index) {
  function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const tag = Buffer.from(type);
    const size = Buffer.alloc(4);
    const crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
    return Buffer.concat([size, tag, data, crc]);
  }
  const width = 640, height = 800;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + x * 3 + 1;
      pixels[offset] = (x + index * 47) % 256;
      pixels[offset + 1] = (y + index * 31) % 256;
      pixels[offset + 2] = 90 + index * 15;
    }
  }
  return {
    name: `onboarding-test-${index}.png`,
    mimeType: 'image/png',
    buffer: Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  };
}

const fixtures = Array.from({ length: 7 }, (_, index) => photo(index));
const errors = [];
const snapshots = {};
let browser;

// India by default: the country code picker starts from the device's time zone and language.
async function openPage(native = false, viewport = { width: 390, height: 844 }, region = { locale: 'en-IN', timezoneId: 'Asia/Kolkata' }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', ...region });
  // No external fonts are required for functional or overflow checks.
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  if (native) await context.addInitScript(() => {
    window.__messages = [];
    window.ReactNativeWebView = { postMessage: json => window.__messages.push(JSON.parse(json)) };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, native ? 'assets/aurora.html' : 'dist/index.html')).href);
  await page.locator('.ob-welcome').waitFor();
  return page;
}

const action = (page, name) => page.locator(`button[onclick*="${name}("]`).first();
const step = (page, name) => page.locator(`[data-ob-step="${name}"]`).waitFor();
async function skipDeviceAccess(page) { await step(page, 'permissions'); await page.locator('#ob-permission-continue').click(); }
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(S.auth)));
const receive = (page, type, data = {}) => page.evaluate(({ type, data }) => {
  const correlated = type.startsWith('auth.') || type.startsWith('profile.');
  window.zimiReceive({ type, data: correlated ? { requestId: S.auth.requestId, ...data } : data });
}, { type, data });

async function remember(page, name) {
  snapshots[name] = await state(page);
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    screen: document.getElementById('screen').scrollWidth,
    screenWidth: document.getElementById('screen').clientWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${label}: document has horizontal overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body <= dimensions.viewport + 1, `${label}: body has horizontal overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.screen <= dimensions.screenWidth + 1, `${label}: onboarding has horizontal overflow ${JSON.stringify(dimensions)}`);
}

async function startSignup(page) {
  assert.equal(await page.locator('.ob-role-switch').count(), 0, 'Welcome starts one signup flow without a role choice');
  await page.locator('#ob-start').click();
  await step(page, 'phone');
  assert.equal((await state(page)).creatorIntent, false, 'Fresh signup always begins as a member');
}

async function enterPhone(page) {
  await page.locator('#ph').fill('9876543210');
  await action(page, 'obSendOtp').click();
}

async function enterCode(page) {
  // A pasted complete code must work with iOS/Android OTP autofill too.
  await page.locator('#o0').evaluate(input => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => '123456' } });
    input.dispatchEvent(event);
  });
}

async function configuredOtpLengths() {
  for (const length of [4, 8]) {
    const page = await openPage(true, { width: 320, height: 740 });
    await startSignup(page);
    await enterPhone(page);
    await receive(page, 'auth.otpSent', { phone: '+919876543210', expiresIn: 60, resendAfter: 60, otpLength: length });
    await step(page, 'otp');
    assert.equal(await page.locator('.ob-otp input').count(), length);
    assert.match(await page.locator('[data-ob-step="otp"]').innerText(), new RegExp(`${length}-digit code`));
    assert.equal(await page.locator('.ob-otp').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), length);
    await noOverflow(page, `${length}-digit code on a narrow phone`);
    await page.locator(`#o${length - 1}`).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), `o${length - 1}`, 'Arrow navigation must stop at the final configured digit');
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => document.activeElement.id), `o${length - 2}`);
    await page.locator('#o0').fill('0');
    await page.locator('#o1').fill('1');
    await page.evaluate(() => obVerifyOtp());
    assert.match((await state(page)).err, new RegExp(`all ${length} digits`));
    assert.equal(await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.verifyOtp').length), 0, 'Incomplete codes stay on screen');
    const code = '01234567'.slice(0, length);
    if (length === 4) {
      await page.locator('#o0').evaluate((input, value) => {
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
        input.dispatchEvent(event);
      }, code);
    } else {
      // Mobile autofill may insert the whole code into a field other than the first.
      await page.locator('#o2').fill(code);
    }
    const messages = await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.verifyOtp'));
    assert.equal(messages.length, 1, 'A complete configured-length code submits once');
    assert.equal(messages[0].data.code, code, 'Leading zeroes survive paste and autofill');
    await receive(page, 'auth.error', { message: 'Wrong code', status: 401, code: 'OTP_INVALID', action: 'auth.verifyOtp' });
    for (let index = 0; index < length; index++) assert.equal(await page.locator(`#o${index}`).inputValue(), '');
    if (length === 4) {
      for (let index = 0; index < length; index++) await page.locator(`#o${index}`).fill(code[index]);
      assert.equal(await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.verifyOtp').length), 2, 'Typing four individual digits also submits');
      await receive(page, 'auth.error', { message: 'Wrong code', status: 401, code: 'OTP_INVALID', action: 'auth.verifyOtp' });
      await page.evaluate(() => { S.auth.resendAt = Date.now() - 1; obResend(); });
      await receive(page, 'auth.otpSent', { phone: '+919876543210', otpLength: 8 });
      assert.equal(await page.locator('.ob-otp input').count(), 8, 'Resending picks up changed backend OTP settings');
    }
    await page.context().close();
  }
  console.log('PASS configured OTP lengths: four/eight fields, copy, layout, typing, paste, autofill, validation and resend');
}

async function fillBasics(page, host = false) {
  await page.locator('#pn').fill(host ? 'Creator Test' : 'Onboarding Test');
  await page.locator('#pe').fill('onboarding@example.test');
  await page.getByRole('button', { name: host ? 'Male' : 'Female', exact: true }).click();
  await page.locator('#p18').check();
  if (host) {
    // Category/language are required for creators; choose visible controls.
    await page.getByLabel('Creator category').selectOption('Music');
    await page.getByRole('button', { name: 'English', exact: true }).click();
  }
  await action(page, 'obNextProfile').click();
  // The connected app confirms the address is free before photos.
  if (await page.evaluate(() => !DEMO)) await answerEmailCheck(page, { available: true });
  await step(page, 'photos');
}

async function answerEmailCheck(page, data) {
  await page.waitForFunction(() => S.auth.emailStatus && S.auth.emailStatus.state === 'checking');
  const { email, requestId } = await page.evaluate(() => S.auth.emailStatus);
  const sent = await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.emailCheck').at(-1).data);
  assert.deepEqual(sent, { email, requestId }, 'The bridge receives exactly the address being checked');
  await receive(page, 'auth.emailChecked', { email, requestId, ...data });
}

async function nativeEmailAvailability() {
  const page = await openPage(true);
  await startSignup(page);
  await enterPhone(page);
  await receive(page, 'auth.otpSent', { phone: '+919876543210', resendAfter: 60 });
  await enterCode(page);
  await receive(page, 'auth.ok', { isNew: true, requiresOnboarding: true, user: { id: 'email-member', name: '', role: 'sender' } });
  await step(page, 'profile');
  const status = page.locator('#ob-email-status');
  const checks = () => page.evaluate(() => window.__messages.filter(message => message.type === 'auth.emailCheck').length);

  // Typing alone checks the address once typing pauses, and a taken one is flagged at once.
  await page.locator('#pn').fill('Email Test');
  await page.locator('#pe').fill('Taken@Example.test');
  await answerEmailCheck(page, { available: false });
  assert.equal(await status.innerText(), 'This email is already used by another account. Try a different one.');
  assert.equal(await page.locator('#pe').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pe', 'The flag must not move focus while typing');
  assert.equal((await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.emailCheck').at(-1).data)).email, 'taken@example.test', 'Checks use the normalized address');
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.locator('#p18').check();
  await action(page, 'obNextProfile').click();
  assert.equal((await state(page)).step, 'profile', 'A taken email cannot continue');
  assert.match((await state(page)).err, /already used by another account/);
  assert.equal(await checks(), 1, 'A known answer is not requested again');

  // Editing clears the flag; an available address is confirmed.
  await page.locator('#pe').fill('fresh@example.test');
  assert.equal(await status.innerText(), '', 'The old answer disappears as soon as the address changes');
  assert.equal(await page.locator('#pe').getAttribute('aria-invalid'), null);
  assert.equal((await state(page)).err, '', 'The taken-email error clears when the address changes');
  await answerEmailCheck(page, { available: true });
  assert.match(await status.innerText(), /Email available/);

  // A stale answer for an earlier address cannot change the current one.
  await receive(page, 'auth.emailChecked', { email: 'taken@example.test', requestId: 1, available: false });
  assert.match(await status.innerText(), /Email available/);

  // The server rejects a format the field accepted.
  await page.locator('#pe').fill('odd@example.co');
  await answerEmailCheck(page, { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid input' });
  assert.match(await status.innerText(), /Enter a valid email address/);
  await action(page, 'obNextProfile').click();
  assert.equal((await state(page)).step, 'profile');

  // Next right after typing waits for the answer instead of skipping the check.
  await page.locator('#pe').fill('quick@example.test');
  await action(page, 'obNextProfile').click();
  assert.equal((await state(page)).busy, 'auth.emailCheck');
  assert.match(await action(page, 'obNextProfile').innerText(), /Checking your email/);
  assert.equal(await action(page, 'obNextProfile').isDisabled(), true);
  await answerEmailCheck(page, { available: true });
  await step(page, 'photos');
  assert.equal((await state(page)).busy, false);

  // A failed check does not trap the person; the save still verifies the address.
  await action(page, 'obBack').click();
  await step(page, 'profile');
  await page.locator('#pe').fill('offline@example.test');
  await action(page, 'obNextProfile').click();
  await answerEmailCheck(page, { status: 0, code: 'NETWORK_ERROR', message: 'Check your connection and try again.' });
  await step(page, 'photos');

  // Someone else saved the address meanwhile: return to the email with photos kept.
  await uploadPhotos(page);
  await action(page, 'obNextPhotos').click();
  await action(page, 'obFinish').click();
  await receive(page, 'profile.error', { onboarding: true, code: 'EMAIL_IN_USE', message: 'This email is already used by another account. Try a different one.' });
  await step(page, 'profile');
  assert.match((await state(page)).err, /already used by another account/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pe', 'The email field is ready to correct');
  assert.equal(await status.innerText(), 'This email is already used by another account. Try a different one.');
  assert.equal((await state(page)).photos.length, 3, 'Photos survive the email conflict');
  assert.equal((await state(page)).busy, false);
  await page.context().close();
  console.log('PASS native email availability: live flag, normalization, stale answers, invalid format, waiting Next, failed check, save-time conflict');
}

async function uploadPhotos(page, count = 3) {
  await page.locator('#ob-photos').setInputFiles(fixtures.slice(0, count));
  await page.waitForFunction(count => (S.auth.photos || []).length === Math.min(count, 6), count);
}

async function previewFlow() {
  const page = await openPage();
  await noOverflow(page, 'welcome');
  await page.screenshot({ path: path.join(artifacts, 'welcome-390.png') });
  await page.getByRole('button', { name: 'Next community preview', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Show preview 2', exact: true }).getAttribute('aria-pressed'), 'true', 'Community preview arrows must change the selected card');
  const deck = await page.locator('.ob-card-main').boundingBox();
  await page.mouse.move(deck.x + deck.width * .8, deck.y + deck.height * .45);
  await page.mouse.down();
  await page.mouse.move(deck.x + deck.width * .2, deck.y + deck.height * .45, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.getByRole('button', { name: 'Show preview 3', exact: true }).getAttribute('aria-pressed'), 'true', 'Horizontal swipes must change the community preview');
  assert.equal(await page.locator('.ob-card-main').evaluate(element => getComputedStyle(element).animationName), 'none', 'Reduced motion must disable decorative animation');
  await page.evaluate(() => { S.wsel = 'host'; });
  await startSignup(page);
  assert.equal(await page.evaluate(() => S.role), 'sender', 'A previous welcome role selection cannot elevate a new signup');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#ob-help')), true, 'Help dialog must trap keyboard focus');
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#ob-help')), true, 'Help dialog must trap reverse keyboard focus');
  }
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Help', exact: true }).evaluate(element => element === document.activeElement), true, 'Closing help must restore focus');
  await remember(page, 'phone');
  await page.locator('#ph').fill('98a7654');
  assert.equal(await page.locator('#ph').inputValue(), '987654', 'Phone input must remove non-digits');
  await page.locator('#ph').fill('123');
  await action(page, 'obSendOtp').click();
  assert.equal((await state(page)).step, 'phone', 'Invalid phone must stay on phone entry');
  assert.ok((await state(page)).err, 'Invalid phone must explain the error');
  await enterPhone(page);
  await step(page, 'otp');
  await remember(page, 'otp');
  await enterCode(page);
  await step(page, 'profile');
  await page.locator('#pn').fill('Draft name');
  await page.locator('#pe').fill('not-an-email');
  await action(page, 'obNextProfile').click();
  assert.equal((await state(page)).step, 'profile', 'Invalid basics must stay in profile');
  assert.equal(await page.locator('#pn').inputValue(), 'Draft name', 'Validation must preserve the entered name');
  await page.locator('#pe').fill('draft@example.test');
  await action(page, 'obNextProfile').click();
  assert.match((await state(page)).err, /Female, Male or Prefer not to say/, 'Sign-up asks how the member identifies');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pg', 'The missing choice receives focus');
  await fillBasics(page);
  await remember(page, 'photos-empty');
  const next = action(page, 'obNextPhotos');
  if (await next.isEnabled()) await next.click();
  assert.equal((await state(page)).step, 'photos', 'Fewer than 3 photos cannot proceed');
  await page.locator('#ob-photos').setInputFiles({ name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid photo') });
  await page.waitForFunction(() => !S.auth.uploading && !!S.auth.err);
  assert.equal((await state(page)).photos.length, 0, 'Invalid uploads must not enter the photo collection');
  await uploadPhotos(page, 7);
  assert.equal((await state(page)).photos.length, 6, 'Uploads must cap at six photos');
  await page.locator('button[onclick*="obFeature("]').nth(1).click();
  const featured = await state(page);
  assert.ok(featured.featured === 1 || featured.feature === 1, 'Second photo can be selected as featured');
  await page.getByRole('button', { name: 'Remove featured photo', exact: true }).click();
  assert.equal((await state(page)).featured, 0, 'Removing the featured photo must select a remaining photo');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Remove featured photo', exact: true }).click();
  assert.equal((await state(page)).photos.length, 2);
  assert.equal(await action(page, 'obNextPhotos').isDisabled(), true, 'Removing photos below the minimum must disable continue');
  await page.locator('#ob-photos').setInputFiles(fixtures.slice(0, 1));
  await page.waitForFunction(() => (S.auth.photos || []).length === 3 && !S.auth.uploading);
  await page.locator('button[onclick*="obFeature("]').nth(1).click();
  await remember(page, 'photos');
  await action(page, 'obNextPhotos').click();
  await step(page, 'interests');
  const chip = action(page, 'obToggleInterest');
  await chip.click();
  assert.equal(await chip.getAttribute('aria-pressed'), 'true', 'Interest selection must be exposed to assistive technology');
  await chip.click();
  assert.equal(await chip.getAttribute('aria-pressed'), 'false', 'Interest selection must toggle off');
  await chip.focus();
  await chip.press('Space');
  await remember(page, 'interests');
  await action(page, 'obBack').click();
  await step(page, 'photos');
  assert.equal((await state(page)).photos.length, 3, 'Back navigation must retain uploaded photos');
  await action(page, 'obBack').click();
  await step(page, 'profile');
  assert.equal(await page.locator('#pn').inputValue(), 'Onboarding Test', 'Back navigation must retain name');
  assert.equal(await page.locator('#pe').inputValue(), 'onboarding@example.test', 'Back navigation must retain email');
  await remember(page, 'profile');
  await action(page, 'obNextProfile').click();
  await action(page, 'obNextPhotos').click();
  await action(page, 'obFinish').click();
  await skipDeviceAccess(page);
  await page.waitForFunction(() => S.v === 'home');
  assert.equal(await page.evaluate(() => S.loggedIn), 1, 'Signup completion must enter the signed-in app');
  console.log('PASS sender signup: validation, OTP paste, photos, featured image, interests, back navigation, completion');
  return page;
}

async function responsiveChecks(page) {
  const viewports = [
    { width: 320, height: 568 }, { width: 375, height: 667 },
    { width: 390, height: 844 }, { width: 430, height: 932 },
    { width: 768, height: 1024 }, { width: 1440, height: 900 },
    { width: 844, height: 390 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => go('welcome'));
    await noOverflow(page, `welcome ${viewport.width}x${viewport.height}`);
    if (viewport.width === 390 || viewport.width === 1440) {
      await page.screenshot({ path: path.join(artifacts, `welcome-${viewport.width}.png`) });
    }
    for (const [name, auth] of Object.entries(snapshots)) {
      await page.evaluate(auth => { S.v = 'login'; S.auth = auth; r(); }, auth);
      await noOverflow(page, `${name} ${viewport.width}x${viewport.height}`);
      if (viewport.width === 390 || viewport.width === 1440) {
        await page.screenshot({ path: path.join(artifacts, `${name}-${viewport.width}.png`) });
      }
    }
  }
  console.log(`PASS responsive layout: ${viewports.length} viewport sizes, ${Object.keys(snapshots).length + 1} screens, reduced motion`);
}

async function hostFlow() {
  const page = await openPage();
  // Creator setup is restored from account data, never selected on the welcome screen.
  await page.evaluate(() => obResumeOnboarding({ user: { id: 'resumed-creator', role: 'sender', onboardingPreference: 'creator' } }, false));
  await step(page, 'profile');
  assert.equal(await page.evaluate(() => S.role), 'sender', 'Restoring creator setup cannot grant host permissions');
  await fillBasics(page, true);
  await uploadPhotos(page);
  await action(page, 'obNextPhotos').click();
  await action(page, 'obFinish').click();
  await skipDeviceAccess(page);
  await joinHostAgency(page);
  const verification = await page.evaluate(() => S.kf);
  assert.equal(verification.name, 'Creator Test', 'Creator verification must reuse the display name');
  assert.equal(verification.email, 'onboarding@example.test', 'Creator verification must reuse the email');
  assert.equal(verification.photos.length, 3, 'Creator verification must reuse uploaded photos');
  console.log('PASS resumed creator setup: account preference, requirements and verification prefill');
}

async function joinHostAgency(page, native = false) {
  await page.waitForFunction(() => S.v === 'agency');
  const status = { agency: { id: 'agency-1', name: 'Dream Star Agency', recruitmentCode: 'BINZO7K9Q2M', status: 'ACTIVE' }, joiningCode: 'BINZO7K9Q2M8X4R', codeType: 'host-invite', canJoin: true, hostStatus: 'none', isVerifiedHost: false, eligible: true, requirements: [], nextStep: 'application' };
  const latest = type => page.evaluate(value => window.__messages.filter(message => message.type === value).at(-1).data, type);
  if (native) await receive(page, 'agency.loaded', { ...status, agency: null, nextStep: 'agency', requestId: (await latest('agency.load')).requestId });
  await page.getByLabel('Host joining code').fill('BINZO7K9Q2M8X4R');
  await page.getByRole('button', { name: 'Verify joining code', exact: true }).click();
  if (native) await receive(page, 'agency.verified', { ...status, requestId: (await latest('agency.verify')).requestId });
  await page.getByRole('button', { name: 'Join agency & continue', exact: true }).click();
  if (native) await receive(page, 'agency.joined', { ...status, requestId: (await latest('agency.join')).requestId });
  await page.getByRole('button', { name: 'Continue host application', exact: true }).click();
  await page.waitForFunction(() => S.v === 'kyc');
}

async function nativeFlow() {
  const page = await openPage(true);
  await startSignup(page);
  await enterPhone(page);
  await page.waitForFunction(() => window.__messages.some(message => message.type === 'auth.sendOtp'));
  assert.equal((await state(page)).step, 'phone', 'Native phone entry must wait for server acknowledgement');
  await receive(page, 'auth.error', { message: 'Unable to send code. Try again.' });
  assert.match((await state(page)).err, /Unable to send/);
  await enterPhone(page);
  await receive(page, 'auth.otpSent', { phone: '+919876543210', resendAfter: 30 });
  await step(page, 'otp');
  const sendsBeforeCooldown = await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.sendOtp').length);
  await page.evaluate(() => obResend());
  assert.equal(await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.sendOtp').length), sendsBeforeCooldown, 'Resend must respect its cooldown');
  await page.evaluate(() => { S.auth.resendAt = Date.now() - 1; document.getElementById('rs').innerHTML = obResendText(); });
  await action(page, 'obResend').click();
  assert.equal(await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.sendOtp').length), sendsBeforeCooldown + 1, 'Resend must work after the cooldown expires');
  await receive(page, 'auth.otpSent', { phone: '+919876543210' });
  await enterCode(page);
  const verification = await page.evaluate(() => window.__messages.filter(message => message.type === 'auth.verifyOtp'));
  assert.equal(verification.length, 1, 'OTP paste must submit exactly once');
  assert.equal(verification[0].data.code, '123456');
  assert.equal((await state(page)).step, 'otp', 'Native OTP must wait for server verification');
  await receive(page, 'auth.error', { message: 'That code was not correct. Try again.', status: 401, code: 'OTP_INVALID', action: 'auth.verifyOtp' });
  for (let index = 0; index < 6; index++) assert.equal(await page.locator(`#o${index}`).inputValue(), '', 'Failed verification must clear entered code digits');
  await enterCode(page);
  await receive(page, 'auth.ok', { isNew: true, requiresOnboarding: true, user: { id: 'native-member', name: '', role: 'sender' } });
  await step(page, 'profile');
  await fillBasics(page);
  await uploadPhotos(page);
  await action(page, 'obNextPhotos').click();
  await action(page, 'obFinish').click();
  assert.equal((await state(page)).step, 'interests', 'Saving must wait for the server');
  await receive(page, 'profile.error', { onboarding: true, message: 'Connection interrupted. Try again.' });
  assert.match((await state(page)).err, /Connection interrupted/);
  assert.equal((await state(page)).photos.length, 3, 'Save failures must preserve uploaded photos');
  await action(page, 'obFinish').click();
  await receive(page, 'profile.saved', { onboarding: true });
  await skipDeviceAccess(page);
  await page.waitForFunction(() => S.v === 'home');
  const saves = await page.evaluate(() => window.__messages.filter(message => message.type === 'profile.save'));
  assert.equal(saves.length, 2, 'Save retry must produce one additional request');
  assert.equal(saves[0].data.onboarding, true, 'Onboarding saves must request explicit completion feedback');
  assert.equal(saves[0].data.adultConfirmed, true, 'Adult confirmation must reach the validated backend profile');
  assert.equal(saves[0].data.preferredRole, 'member', 'Member preference is metadata, not a permission grant');
  assert.equal(saves[0].data.gender, 'female', 'The chosen gender is saved with the profile');
  assert.equal(await page.evaluate(() => window.__messages.some(message => message.type === 'ui.haptic')), true, 'Touch interactions must reach the native haptic bridge');
  console.log('PASS native bridge: send/verify acknowledgements, delivery error, save error/retry, completion');
}

async function nativeRateLimits() {
  const page = await openPage(true);
  await startSignup(page);
  await enterPhone(page);
  const initial = await state(page);
  await receive(page, 'auth.otpSent', { phone: '+919876543210', resendAfter: 60, requestId: initial.requestId + 100 });
  assert.equal((await state(page)).step, 'phone', 'An old send response cannot advance the current request');
  await receive(page, 'auth.error', { message: 'Stale rate-limit failure', status: 429, retryAfterSeconds: 900, requestId: initial.requestId + 100 });
  assert.equal((await state(page)).busy, 'auth.sendOtp', 'Stale failures cannot cancel an in-flight request');
  await receive(page, 'auth.otpSent', { phone: '+919876543210', resendAfter: 60, expiresIn: 300 });
  await step(page, 'otp');
  assert.ok(await page.evaluate(() => S.auth.resendAt - Date.now() > 58000), 'Use the server 60-second resend delay instead of the preview timer');
  await enterCode(page);
  const verifying = await state(page);
  await receive(page, 'auth.ok', { requestId: verifying.requestId - 1, isNew: false, requiresOnboarding: false, user: { id: 'other', role: 'host', name: 'Stale' } });
  assert.equal((await state(page)).step, 'otp', 'A stale verification cannot sign in a different account');
  await receive(page, 'auth.error', { action: 'auth.verifyOtp', status: 0, code: 'NETWORK_ERROR', message: 'Check your connection and try again.' });
  assert.equal((await state(page)).code, '123456', 'A temporary network failure must preserve the entered code');
  assert.equal((await state(page)).phone, '9876543210', 'Network failures must preserve the phone number');
  assert.equal(await page.locator('#o0').inputValue(), '1');
  await action(page, 'obVerifyOtp').click();
  await receive(page, 'auth.error', { action: 'auth.verifyOtp', status: 429, code: 'OTP_LOCKED', retryAfterSeconds: 3, message: 'Too many attempts. Please wait.' });
  assert.equal(await action(page, 'obVerifyOtp').isDisabled(), true, 'The verification button must be disabled while locked');
  // Expire the separate resend cooldown to prove the server lock still blocks resend.
  await page.evaluate(() => { S.auth.resendAt = Date.now() - 1; obRateTick(); });
  const before = await page.evaluate(() => window.__messages.filter(message => ['auth.sendOtp','auth.verifyOtp'].includes(message.type)).length);
  await page.evaluate(() => { obVerifyOtp(); obResend(); });
  assert.equal(await page.evaluate(() => window.__messages.filter(message => ['auth.sendOtp','auth.verifyOtp'].includes(message.type)).length), before, 'A server lock must suppress both API actions');
  assert.equal(await page.locator('button[onclick="obResend()"]').count(), 0, 'The resend control displays a countdown during the lock');
  await page.waitForFunction(() => !obWait('auth.verifyOtp') && !obWait('auth.sendOtp') && !document.getElementById('ob-auth-submit').disabled, undefined, { timeout: 7000 });
  assert.equal(await action(page, 'obResend').isEnabled(), true, 'Resend unlocks automatically when the server timer expires');
  assert.equal(await action(page, 'obVerifyOtp').isEnabled(), true, 'Verification unlocks without reloading the page');
  console.log('PASS native auth limits: stale response isolation, server cooldown, network input preservation, OTP lock and timed recovery');
}

async function nativeSessionRecovery() {
  const page = await openPage(true);
  await receive(page, 'session.restoring');
  await page.getByRole('status', { name: 'Restoring session', exact: true }).waitFor();
  await receive(page, 'session.error', { message: 'Check your connection and try again.' });
  assert.equal(await page.evaluate(() => S.loggedIn), 0, 'Offline restoration must not invent a signed-in screen');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__messages.at(-1).type), 'session.resume');
  await receive(page, 'session', {
    requiresOnboarding: true, verification: 'none',
    user: { id: 'resume-user', name: 'Saved Creator', role: 'sender', email: 'saved@example.test', onboardingPreference: 'creator', languages: ['English'], interests: ['Music'], category: 'Music', gender: 'male', adultConfirmed: true },
  });
  await step(page, 'profile');
  assert.equal(await page.locator('#pn').inputValue(), 'Saved Creator', 'An unfinished server profile resumes its saved name');
  assert.equal(await page.getByRole('button', { name: 'Male', exact: true }).getAttribute('aria-pressed'), 'true', 'A saved gender choice resumes');
  assert.equal(await page.locator('#pe').inputValue(), 'saved@example.test');
  assert.equal(await page.locator('#p18').isChecked(), true);
  assert.equal((await state(page)).creatorIntent, true, 'Server setup preference resumes creator onboarding');
  assert.equal(await page.evaluate(() => S.role), 'sender', 'Resuming creator setup must not grant an approved creator role');
  await receive(page, 'session.expired', { message: 'Please sign in again.' });
  await page.locator('.ob-welcome').waitFor();
  assert.equal(await page.evaluate(() => S.user), null, 'Expired sessions clear account data');
  assert.equal((await state(page)).email, undefined, 'Expired sessions clear private onboarding drafts');
  console.log('PASS native session recovery: offline retry, unfinished onboarding restore, creator preference, expiry cleanup');
}

async function nativeCreatorFlow() {
  const page = await openPage(true);
  await startSignup(page);
  await enterPhone(page);
  await receive(page, 'auth.otpSent', { phone: '+919876543210', resendAfter: 60 });
  await enterCode(page);
  await receive(page, 'auth.ok', { isNew: true, requiresOnboarding: true, verification: 'none', user: { id: 'new-creator', name: '', role: 'sender', hostStatus: 'none', onboardingPreference: 'creator' } });
  await step(page, 'profile');
  assert.equal((await state(page)).creatorIntent, true, 'A server creator preference restores the creator setup flow');
  assert.equal(await page.evaluate(() => S.role), 'sender', 'Creator setup cannot elevate server permissions');
  await fillBasics(page, true);
  await uploadPhotos(page);
  await action(page, 'obNextPhotos').click();
  await action(page, 'obFinish').click();
  const save = await state(page);
  await receive(page, 'profile.saved', { requestId: save.requestId - 1, onboarding: true });
  assert.equal((await state(page)).busy, 'profile.save', 'An older profile save cannot complete the current onboarding');
  await receive(page, 'profile.progress', { done: 2, total: 3 });
  await receive(page, 'profile.saved', { onboarding: true, account: { requiresOnboarding: false, verification: 'none', user: { id: 'new-creator', name: 'Creator Test', email: 'onboarding@example.test', role: 'sender', hostStatus: 'none', onboardingPreference: 'creator', languages: ['English'], category: 'Music' } } });
  await skipDeviceAccess(page);
  await joinHostAgency(page, true);
  assert.equal(await page.evaluate(() => S.role), 'sender');
  const request = await page.evaluate(() => window.__messages.find(message => message.type === 'profile.save'));
  assert.equal(request.data.preferredRole, 'creator');
  assert.deepEqual(request.data.langs, ['English']);
  await page.locator('#kf_bio').fill('I share acoustic music and love meeting new people.');
  await page.locator('button[onclick="submitKyc()"]').click();
  const verification = await page.evaluate(() => window.__messages.filter(message => message.type === 'verification.submit').at(-1));
  assert.ok(verification, 'Creator application must reach the native API bridge');
  assert.equal(verification.data.bio, 'I share acoustic music and love meeting new people.');
  assert.deepEqual(verification.data.languages || verification.data.langs, ['English'], 'Application must send the chosen languages');
  await receive(page, 'verification.status', { status: 'pending' });
  assert.equal(await page.evaluate(() => S.role), 'sender', 'Pending review must not grant approved creator access');
  console.log('PASS native creator: server roles, setup intent, profile correlation, valid bio/languages application, pending review');
}

async function accountRouting() {
  const preview = await openPage();
  await preview.locator('button[onclick="obStart(\'login\')"]').click();
  await enterPhone(preview);
  await enterCode(preview);
  await preview.waitForFunction(() => S.v === 'home');

  const native = await openPage(true);
  await startSignup(native);
  await enterPhone(native);
  await receive(native, 'auth.otpSent', { phone: '+919876543210' });
  await enterCode(native);
  await receive(native, 'auth.ok', { isNew: false, requiresOnboarding: false, verification: 'verified', user: { id: 'returning-creator', name: 'Returning Creator', role: 'host', hostStatus: 'approved', isVerifiedHost: true } });
  await native.waitForFunction(() => S.v === 'home');
  assert.equal(await native.evaluate(() => S.role), 'host', 'A fully approved returning creator receives the server-authorized host role');
  assert.equal(await native.evaluate(() => isApprovedHost()), true);
  await receive(native, 'session', { requiresOnboarding: false, verification: 'verified', user: { id: 'returning-creator', name: 'Returning Creator', role: 'host', hostStatus: 'approved' } });
  assert.equal(await native.evaluate(() => S.role), 'sender', 'A host role without the verified-host flag must not grant creator capability');
  assert.equal(await native.evaluate(() => isApprovedHost()), false);
  await native.evaluate(() => logout());
  await native.locator('button[onclick="obStart(\'login\')"]').click();
  await enterPhone(native);
  await receive(native, 'auth.otpSent', { phone: '+919876543210' });
  await enterCode(native);
  await receive(native, 'auth.ok', { isNew: false, requiresOnboarding: false, user: { id: 'returning-member', name: 'Returning Member', role: 'sender' } });
  await native.waitForFunction(() => S.v === 'home');
  await native.evaluate(() => logout());
  await native.locator('button[onclick="obStart(\'login\')"]').click();
  await enterPhone(native);
  await receive(native, 'auth.otpSent', { phone: '+919876543210' });
  await enterCode(native);
  await receive(native, 'auth.ok', { isNew: true, requiresOnboarding: true, user: { id: 'another-member', name: '', role: 'sender' } });
  await step(native, 'profile');
  console.log('PASS account routing: returning users bypass signup, new users start signup even from login');
}

async function internationalPhone() {
  const page = await openPage(true, undefined, { locale: 'en-GB', timezoneId: 'Europe/London' });
  const sent = type => page.evaluate(value => window.__messages.filter(message => message.type === value).at(-1)?.data, type);
  const country = () => page.locator('#ob-country').getAttribute('aria-label');
  await startSignup(page);
  assert.ok((await country()).includes('United Kingdom +44'), 'A UK phone starts with the UK calling code');
  await page.locator('#ph').fill('07911 123456');
  assert.equal(await page.locator('#ph').inputValue(), '07911123456');
  await action(page, 'obSendOtp').click();
  await page.waitForFunction(() => window.__messages.some(message => message.type === 'auth.sendOtp'));
  assert.deepEqual({ phone: (await sent('auth.sendOtp')).phone, dialCode: (await sent('auth.sendOtp')).dialCode }, { phone: '+447911123456', dialCode: '+44' }, 'The national trunk 0 is dropped');
  await receive(page, 'auth.otpSent', { phone: '+447911123456', resendAfter: 30 });
  await step(page, 'otp');
  assert.ok((await page.locator('[data-ob-step="otp"]').innerText()).includes('+44 7911123456'), 'The code screen shows the full number');
  await enterCode(page);
  await page.waitForFunction(() => window.__messages.some(message => message.type === 'auth.verifyOtp'));
  assert.equal((await sent('auth.verifyOtp')).dialCode, '+44');
  await receive(page, 'auth.error', { message: 'That code did not match.', code: 'OTP_INVALID', action: 'auth.verifyOtp' });
  await action(page, 'obBack').click();
  await step(page, 'phone');

  await page.locator('#ob-country').click();
  const dialog = page.getByRole('dialog', { name: 'Choose your country' });
  await dialog.waitFor();
  assert.match(await dialog.locator('[aria-current="true"]').innerText(), /United Kingdom/);
  await page.screenshot({ path: path.join(artifacts, 'country-picker.png') });
  const searchbox = dialog.getByRole('searchbox', { name: 'Search countries' }), list = dialog.locator('#ob-country-list');
  // Country names shown once the debounced search has run.
  const results = async query => {
    await searchbox.fill(query);
    await page.waitForFunction(() => !obCountrySearchTimer);
    return list.locator('.ob-country-option > span:nth-child(2)').allInnerTexts();
  };
  assert.ok(await list.evaluate(element => element.scrollTop) > 0, 'The list opens at the current country');
  await results('a');
  assert.equal(await list.evaluate(element => element.scrollTop), 0, 'Results start at the best match');
  const typed = await page.evaluate(() => new Promise(resolve => {
    const input = document.getElementById('ob-country-search'), options = document.getElementById('ob-country-list'), before = options.innerHTML;
    let renders = 0; new MutationObserver(records => { renders += records.length; }).observe(options, { childList: true });
    for (const value of ['g', 'ge', 'ger', 'germ']) { input.value = value; input.dispatchEvent(new Event('input')); }
    const waited = options.innerHTML === before;
    setTimeout(() => resolve({ waited, renders, names: [...options.children].map(option => option.children[1].textContent) }), 400);
  }));
  assert.deepEqual(typed, { waited: true, renders: 1, names: ['Germany'] }, 'Fast typing searches once, after the pause');
  assert.deepEqual(await results('uk'), ['United Kingdom', 'Ukraine'], 'Everyday names find the country first');
  assert.deepEqual(await results('44'), ['United Kingdom', 'Guernsey', 'Isle of Man', 'Jersey'], 'A shared calling code lists its main country first');
  const inResults = await results('in');
  assert.equal(inResults[0], 'India');
  assert.ok(!inResults.includes('Argentina'), 'Searches match the start of a word, not its middle');
  assert.match((await results('turkey')).join('|'), /^T[üu]rk[a-z]+$/, 'Former names still work');
  assert.match((await results("cote d'ivoire")).join('|'), /^C.te d.Ivoire$/, 'Accents and apostrophes do not matter');
  assert.match((await results('saint lucia')).join('|'), /^St\.? Lucia$/, 'Saint finds names written St.');
  await results('zzz');
  await dialog.getByText('No country matches that search.').waitFor();
  assert.deepEqual(await results('+971'), ['United Arab Emirates']);
  await dialog.getByRole('button', { name: /United Arab Emirates/ }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.ok((await country()).includes('United Arab Emirates +971'));
  assert.equal(await page.locator('#ph').evaluate(input => input === document.activeElement), true, 'Choosing a country returns to the number');

  await page.locator('#ph').fill('+1 415 555 0123');
  assert.equal(await page.locator('#ph').inputValue(), '4155550123', 'A pasted international number fills both parts');
  assert.ok((await country()).includes('United States +1'));
  await page.locator('#ph').fill('415');
  await action(page, 'obSendOtp').click();
  assert.match((await state(page)).err, /valid mobile number for United States/);

  await page.locator('#ob-country').click();
  await searchbox.fill('ind');
  await searchbox.press('Enter');
  assert.match(await page.evaluate(() => document.activeElement.textContent), /India/, "The keyboard's search key moves to the best match");
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  await page.locator('#ph').fill('5467985456');
  await action(page, 'obSendOtp').click();
  assert.equal((await state(page)).err, 'Enter a valid 10-digit Indian mobile number.', 'India keeps its mobile number check');
  await noOverflow(page, 'international phone entry');
  await page.screenshot({ path: path.join(artifacts, 'international-phone.png') });
  await page.context().close();
  console.log('PASS international phone: device default, picker search, pasted numbers, trunk zero, India check, verify carries the code');
}

async function enlargedTextChecks(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['phone', 'profile', 'photos', 'interests']) {
    await page.evaluate(auth => { S.v = 'login'; S.auth = auth; r(); }, snapshots[name]);
    // Stress reflow by doubling the computed size of text-bearing elements.
    // This is browser layout coverage; device OS text scaling is a separate check.
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('.ob-shell *')]
        .filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
        .map(element => [element, parseFloat(getComputedStyle(element).fontSize) * 2]);
      for (const [element, size] of sizes) element.style.setProperty('font-size', `${size}px`, 'important');
    });
    await noOverflow(page, `${name} with 200% text`);
    const clippedChoices = await page.locator('.ob-segment button').evaluateAll(buttons => buttons.filter(button => button.scrollWidth > button.clientWidth + 1).map(button => button.textContent));
    assert.deepEqual(clippedChoices, [], `${name}: enlarged gender labels remain fully readable`);
    const cta = page.locator('.ob-actions .ob-primary');
    await cta.scrollIntoViewIfNeeded();
    const bounds = await cta.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391 && bounds.y >= 0 && bounds.y < 844, `${name}: primary action remains reachable with enlarged text`);
    await page.screenshot({ path: path.join(artifacts, `${name}-200pct-text.png`) });
  }
  console.log('PASS enlarged text: primary actions remain reachable with 200% text on four signup steps');
}

(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  try {
    if (!process.env.ONBOARDING_NATIVE_ONLY) {
      const page = await previewFlow();
      await responsiveChecks(page);
      await enlargedTextChecks(page);
      await hostFlow();
    }
    await nativeFlow();
    await nativeEmailAvailability();
    await configuredOtpLengths();
    await accountRouting();
    await nativeRateLimits();
    await nativeSessionRecovery();
    await nativeCreatorFlow();
    await internationalPhone();
    assert.deepEqual(errors, [], 'Browser must not emit uncaught JavaScript errors');
    console.log(`PASS no uncaught browser errors. Screenshots: ${artifacts}`);
  } catch (error) {
    for (const [index, context] of browser.contexts().entries()) {
      const page = context.pages().at(-1);
      if (page) await page.screenshot({ path: path.join(artifacts, `failure-${index}.png`) }).catch(() => {});
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
