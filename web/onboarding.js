/* Onboarding stays a classic script: the rendered controls call these globals.
   Only the preview accepts a simulated OTP; native actions wait for the bridge. */
/* Indian women photographed from behind or in silhouette, for the welcome screen and the design
   preview; onboarding-media/SOURCES.txt lists each photo. None of them is a real user. */
const OB_MEDIA = ["__OB_MEDIA_1__", "__OB_MEDIA_2__", "__OB_MEDIA_3__", "__OB_MEDIA_4__", "__OB_MEDIA_5__", "__OB_MEDIA_6__"];
/* Licensed stock photos of models from web/model-photos/ (its README covers the licence). The first
   three lead the welcome screen; all six stand in for the design preview's sample hosts. Until
   they are added, both use the photography above. */
const MODEL_PHOTOS = ["__MODEL_PHOTO_1__", "__MODEL_PHOTO_2__", "__MODEL_PHOTO_3__", "__MODEL_PHOTO_4__", "__MODEL_PHOTO_5__", "__MODEL_PHOTO_6__"];
const OB_MODELS = MODEL_PHOTOS.slice(0, 3).every(Boolean);
const PREVIEW_HOSTS = MODEL_PHOTOS.map((src, i) => src || OB_MEDIA[i]);
// Stock licences ask for this line wherever model photos stand in for real people.
const MODEL_NOTE = MODEL_PHOTOS.some(Boolean) ? " &middot; photos posed by models" : "";
const OB_HEART = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.6s-7.4-4.4-9.3-8.9C1.3 8.5 3.3 5 6.8 5c2.1 0 3.6 1.1 4.5 2.5C12.2 6.1 13.7 5 15.8 5c3.5 0 5.5 3.5 4.1 6.7-1.9 4.5-7.9 8.9-7.9 8.9z"/></svg>';
const OB_INTERESTS = [
  ["🎵", "Music"], ["💃", "Dance"], ["💬", "Conversations"], ["🎬", "Movies"],
  ["✈️", "Travel"], ["🎤", "Singing"], ["🎮", "Gaming"], ["😂", "Comedy"],
  ["✨", "Astrology"], ["💪", "Fitness"], ["🤝", "New friends"], ["🏏", "Cricket"],
  ["👗", "Style"], ["🍳", "Cooking"], ["📚", "Books"], ["🌿", "Wellness"]
];
let obRenderKey = "", obRequestTimer, obDialogTrigger, obSwipe, obSequence = 0, obRateTimer, obCountryList = [], obCountrySearchTimer = 0;
let obEmailTimer = 0, obEmailSequence = 0, obEmailWaiting = null, obEmailGateTimer = 0;
const OB_EMAIL_TAKEN = "This email is already used by another account. Try a different one.";
const OB_EMAIL_INVALID = "Add a valid email address.";
const obLimits = {};
const obIsCreator = () => !!S.auth.creatorIntent || isHost();
const obMatches = data => data.requestId === undefined || data.requestId === S.auth.requestId;
const obDuration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
function obWait(kind) {
  return Math.max(0, Math.ceil((Math.max(obLimits[kind + ":*"] || 0, obLimits[kind + ":" + obE164()] || 0) - Date.now()) / 1000));
}
function obRateTick() {
  if (S.v !== "login") { clearInterval(obRateTimer); return; }
  const kind = S.auth.step === "phone" ? "auth.sendOtp" : "auth.verifyOtp", left = obWait(kind);
  const button = document.getElementById("ob-auth-submit");
  if (button && !S.auth.busy) {
    button.disabled = left > 0;
    button.innerHTML = left ? `Try again in ${obDuration(left)}` : esc(button.dataset.idleLabel) + obArrow();
  }
  const resend = document.getElementById("rs"); if (resend) resend.innerHTML = obResendText();
}
function obTrackRate() { clearInterval(obRateTimer); obRateTick(); if (S.v === "login") obRateTimer = setInterval(obRateTick, 1000); }
function obAuthError(data) {
  if (S.v !== "login" || !obMatches(data)) return;
  const action = data.action || S.auth.busy || "auth.verifyOtp";
  const seconds = Math.max(0, Math.min(86400, Number(data.retryAfterSeconds) || 0));
  if (seconds) {
    const key = String(data.code || "").startsWith("OTP_") ? obE164() : "*";
    const until = Date.now() + seconds * 1000;
    obLimits[action + ":" + key] = until;
    if (data.code === "OTP_LOCKED") { obLimits["auth.sendOtp:" + key] = until; obLimits["auth.verifyOtp:" + key] = until; }
  }
  clearTimeout(obRequestTimer); S.auth.busy = false;
  if (action === "auth.verifyOtp" && ["OTP_INVALID", "OTP_EXPIRED", "OTP_LOCKED"].includes(data.code)) S.auth.code = "";
  S.auth.err = data.message || "We couldn’t complete that request. Please try again.";
  r(); obTrackRate(); obHaptic("error");
}
function obPhotoUrl(value) { return typeof value === "string" && (/^https:\/\/[^\s"'<>]+$/.test(value) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) ? value : ""; }
function obApplyAccount(account, keepDraft = false) {
  const u = account.user || {}, editing = keepDraft && S.v === 'editprofile' && S.user?.id === u.id;
  if(S.user?.id!==u.id){window.ZimiAgency?.reset();window.ZimiChats?.reset()}
  S.user = u;
  window.ZimiThemes?.account(u.id);
  if (u.role === "host" || u.role === "sender") S.role = u.role;
  me.n = u.name || ""; me.c = u.city || ""; me.country = u.country || ""; me.about = u.about || ""; me.gender = u.gender || "";
  if (!editing) obResetProfileDraft();
  S.creatorSetup = u.onboardingPreference === "creator" || ["pending", "rejected", "suspended"].includes(u.hostStatus);
  if (account.balance != null) S.bal = account.balance;
  if (account.earned != null) A().earn = account.earned;
  if (account.verification) A().kyc = account.verification;
  window.ZimiHostAccess?.apply(account);
}
function obResetProfileDraft() {
  S.editName = me.n; S.editCity = me.c; S.editCountry = me.country || ''; S.editAbout = me.about; S.editGender = me.gender || '';
  if (!DEMO) { S.avatarData = obPhotoUrl(S.user?.avatarUrl || ''); S.coverData = obPhotoUrl(S.user?.coverUrl || ''); }
  S.mediaDirty = {}; S.mediaPreparing = false; S.mediaError = '';
}
function obResumeOnboarding(account, desiredCreator) {
  const u = account.user || {};
  S.auth = { step: "profile", mode: "signup", verified: true, creatorIntent: !!desiredCreator || u.onboardingPreference === "creator", name: u.name || "", email: u.email || "", langs: u.languages || [], interests: u.interests || [], photos: (u.photos || []).map(p => obPhotoUrl(p.url)).filter(Boolean), featured: 0, adult: !!u.adultConfirmed, cat: u.category || "", gender: u.gender || "" };
  S.loggedIn = 0; go("login");
}
function obResetSession(message = "") {
  window.ZimiAgency?.reset();
  window.ZimiHostAccess?.reset();
  if(window.ZimiHome)homeReset();
  window.ZimiThemes?.reset();
  clearInterval(obRateTimer); clearInterval(S.otpT); clearTimeout(obRequestTimer);
  S.loggedIn = 0; S.online = 0; S.sessionState = ""; S.sessionError = ""; S.notice = message; S.creatorSetup = false; S.user = null;
  S.auth = { step: "phone" }; S.avatarData = ""; S.coverData = ""; S.kf = {}; S.postData = []; S.interests = []; S.msgs = null; S.rmsgs = [];
  S.caller = null; S.callId = null; S.u = null; S.h = null; S.sum = null; S.pdone = 0; S.pamt = ""; S.giftedTo = {};
  S.mediaDirty = {}; S.mediaPreparing = false; S.mediaError = ""; S.profileRequestId = null; S.profileProgress = ""; S.postDraftData = ""; S.postCaption = ""; S.postPublishing = false; S.postRequestId = null; S.postError = "";
  const notice = document.getElementById("app-notice"); if (notice) notice.remove();
  S.dataError = ""; S.realtimeError = ""; S.kycBusy = false; S.kerr = ""; S.profileSaving = false; S.following = {}; S.blocked = []; S.bal = 0; me.n = ""; me.about = ""; me.c = ""; me.gender = ""; S.editGender = "";
  S.editName = ""; S.editAbout = ""; S.editCity = ""; S.editCountry = ""; me.country = ""; S.acct.sender.earn = 0; S.acct.host.earn = 0;
  S.acct.sender.kyc = "none"; S.acct.host.kyc = "none";
  if (!DEMO) { H.length = 0; EXTRA.length = 0; CH.length = 0; TXNS.length = 0; CALLS.length = 0; Object.keys(PEOPLE).forEach(key => delete PEOPLE[key]); S.missed = { sender: [], host: [] }; }
  S.role = "sender"; go("welcome");
}
function obRestoreScreen() {
  const busy = S.sessionState === "restoring";
  const skeleton = `<div class="ob-session-skeleton" role="status" aria-label="Restoring session" aria-busy="true"><div aria-hidden="true"><div class="ob-session-stories">${Array.from({ length: 5 }, () => '<span></span>').join('')}</div><div class="ob-session-card"><span class="ob-session-line"></span><span class="ob-session-line short"></span><span class="ob-session-action"></span></div></div></div>`;
  return `<section class="ob-shell ob-recovery"><div class="ob-main"><span class="ob-eyebrow">BINZOLIVE</span><h1 class="ob-heading" tabindex="-1">${busy ? "Picking up where you left off." : "Let’s reconnect."}</h1><p class="ob-description">${busy ? "Checking your saved session…" : esc(S.sessionError || "Check your connection and try again.")}</p><div class="ob-actions">${busy ? skeleton : '<button class="ob-primary" onclick="Native.send(\'session.resume\')">Try again</button><button class="ob-secondary" onclick="logout()">Use another account</button>'}</div></div></section>`;
}
const obArrow = () => '<svg class="zi-icon" data-icon="arrow" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function obHaptic(kind = "selection") { Native.send("ui.haptic", { kind }); }
// Sign-up screens use the active theme too; this only marks them for full-bleed backgrounds.
function obSyncTheme() { document.documentElement.classList.toggle("ob-active", S.v === "welcome" || S.v === "login"); }
function obAfterRender() {
  obTrackRate();
  if (S.v !== "login" && S.v !== "welcome") { obRenderKey = ""; return; }
  const key = S.v + ":" + (S.auth.step || "");
  if (key !== obRenderKey) {
    obRenderKey = key;
    document.dispatchEvent(new Event("aurora:navigate"));
    const main = document.querySelector(".ob-main, .ob-welcome-grid");
    if (main) main.classList.add(S.auth.backward ? "ob-back" : "ob-enter");
    S.auth.backward = false;
    if (S.v === "login" && S.auth.step !== "otp") {
      const heading = document.querySelector(".ob-heading");
      if (heading) heading.focus({ preventScroll: true });
    }
  }
}
function obStart(mode = "signup") {
  if (S.sessionState) return;
  clearInterval(S.otpT); clearTimeout(obRequestTimer);
  const role = S.wsel || "sender";
  if (mode === "signup" && S.auth.verified && (S.auth.creatorIntent ? "host" : "sender") === role) return go("login");
  S.role = role;
  S.notice = "";
  S.auth = { step: "phone", mode, creatorIntent: role === "host", phone: "", code: "", langs: [], interests: [], photos: [], featured: 0 };
  go("login");
}
function obSelectRole(role, button) {
  S.wsel = role;
  document.querySelectorAll(".ob-role-switch button").forEach(b => {
    const selected = b === button; b.classList.toggle("selected", selected); b.setAttribute("aria-pressed", String(selected));
  });
  const cta = document.getElementById("ob-start");
  if (cta) cta.innerHTML = (role === "host" ? "Start creating" : "Find your people") + obArrow();
}
function obDeckMarkup() {
  const index = S.obDeck || 0, enter = S.obDeckEnter ? ` ob-enter-${S.obDeckEnter}` : "";
  const media = OB_MODELS ? MODEL_PHOTOS : OB_MEDIA;
  const cards = [
    ["A shared interest.", "A conversation waiting to happen", "MUSIC · CONVERSATION", "A bride in a red lehenga, seen from behind"],
    ["Good energy, on call.", "Meet someone on your wavelength", "CHAI · GOOD COMPANY", "A woman in a sari by a lake, seen from behind"],
    ["Your kind of people.", "Make a little room for connection", "STYLE · EVERYDAY STORIES", "A woman in a bright sari on a tree-lined road"],
  ];
  const [title, copy, tags, photo] = cards[index], alt = OB_MODELS ? "Portrait of a model" : photo;
  return `<div class="ob-card ob-card-back ob-card-left"><img src="${media[(index + 1) % 3]}" alt="" draggable="false"></div>
    <div class="ob-card ob-card-back ob-card-right"><img src="${media[(index + 2) % 3]}" alt="" draggable="false"></div>
    <div class="ob-card ob-card-main${enter}"><img src="${media[index]}" alt="${alt}" draggable="false">
      <div class="ob-card-top"><span class="ob-live-tag"><i></i> YOUR NEXT HELLO</span><span class="ob-card-heart" aria-hidden="true">${I("heart", 18)}</span></div>
      <div class="ob-card-bottom"><small>${tags}</small><b>${title}</b><p>${copy}</p></div></div>
    <span class="ob-floating ob-namaste" aria-hidden="true" lang="hi">नमस्ते</span>
    <span class="ob-hearts" aria-hidden="true">${OB_HEART.repeat(3)}</span>
    <span class="ob-floating ob-spark" aria-hidden="true">${I("vid", 22)}</span>
    <div class="ob-deck-controls"><button class="ob-icon" aria-label="Previous community preview" onclick="obDeck(-1)">${I("back", 17)}</button>
      <div class="ob-dots" aria-label="Preview ${index + 1} of 3">${cards.map((_, i) => `<button class="${i === index ? "selected" : ""}" aria-label="Show preview ${i + 1}" aria-pressed="${i === index}" onclick="obDeck(${i},true)"><span></span></button>`).join("")}</div>
      <button class="ob-icon" aria-label="Next community preview" onclick="obDeck(1)">${obArrow()}</button></div>`;
}
function obDeck(value, absolute) {
  const focused = document.activeElement && document.activeElement.getAttribute("aria-label");
  const from = S.obDeck || 0;
  S.obDeck = absolute ? value : (from + value + 3) % 3;
  // The new card slides in from the side it was swiped or stepped towards.
  S.obDeckEnter = S.obDeck === from ? "" : (absolute ? value > from : value > 0) ? "next" : "prev";
  const deck = document.querySelector(".ob-showcase");
  if (deck) {
    deck.innerHTML = obDeckMarkup();
    if (focused) { const next = Array.from(deck.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === focused); if (next) next.focus({ preventScroll: true }); }
  }
  S.obDeckEnter = "";
}
function obWelcome() {
  if (S.sessionState) return obRestoreScreen();
  const host = S.wsel === "host";
  return `<section class="ob-shell ob-welcome" aria-label="Welcome to BinzoLive">
    ${S.notice ? `<p class="ob-session-notice" role="status">${esc(S.notice)}</p>` : ""}
    <header class="ob-welcome-top"><div class="ob-brand"><img class="ob-logo" src="${BRAND_LOGO}" alt="BinzoLive" width="96" height="38" decoding="async"></div><button class="ob-top-login" onclick="obStart('login')">Log in</button></header>
    <div class="ob-welcome-grid">
      <div class="ob-intro">
        <h1 class="ob-hero-heading">A little hello.<br><em>A real connection.</em></h1>
        <p class="ob-description">Meet creators who get your vibe.<br>One call can make your day.</p></div>
      <div class="ob-showcase" aria-label="Community previews">${obDeckMarkup()}</div>
      <div class="ob-welcome-actions"><div class="ob-role-switch" aria-label="Choose your account type">
        <button class="${host ? "" : "selected"}" aria-pressed="${!host}" onclick="obSelectRole('sender',this)">${I("heart", 17)} I'm here to connect</button>
        <button class="${host ? "selected" : ""}" aria-pressed="${host}" onclick="obSelectRole('host',this)">${I("vid", 17)} I'm a creator</button></div>
        <button id="ob-start" class="ob-primary" onclick="obStart('signup')">${host ? "Start creating" : "Find your people"}${obArrow()}</button>
        <p class="za-welcome-note">Hosts join with an agency recruitment code, then complete verification.</p>
        <div class="ob-trust"><span>${I("lock", 13)} 18+ community</span>${OB_MODELS ? "<span>&middot; Photos posed by models</span>" : ""}</div></div>
    </div><p class="ob-desktop-note">A small hello. A world of possibilities.</p>
  </section>`;
}
function obStep(step, backward = false) {
  S.auth.step = step; S.auth.err = ""; S.auth.backward = backward; r();
}
function obBack() {
  const a = S.auth;
  if (a.busy || a.uploading) return;
  if (a.step === "interests") return obStep("photos", true);
  if (a.step === "photos") return obStep("profile", true);
  if (a.step === "profile" || a.step === "sprofile") {
    // Verification remains valid while editing this in-memory draft.
    return go("welcome");
  }
  if (a.step === "otp") { clearInterval(S.otpT); a.code = ""; return obStep("phone", true); }
  go("welcome");
}
function obSetError(message, field) {
  S.auth.err = message;
  const error = document.getElementById("ob-error");
  if (error) { error.textContent = message; error.hidden = !message; }
  document.querySelectorAll(".ob-shell [aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  if (message) {
    obHaptic("error");
    const target = field && document.getElementById(field);
    if (target) { target.setAttribute("aria-invalid", "true"); target.focus(); }
    else if (error) error.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
}
function obRequest(kind, data) {
  S.auth.busy = kind; S.auth.err = "";
  S.auth.requestId = ++obSequence;
  clearTimeout(obRequestTimer);
  obRequestTimer = setTimeout(() => {
    if (S.v !== "login" || S.auth.busy !== kind) return;
    S.auth.busy = false; S.auth.err = "This is taking longer than expected. Check your connection and try again."; r(); obHaptic("error");
  }, kind === "profile.save" ? 420000 : 25000);
  Native.send(kind, { ...data, requestId: S.auth.requestId }); r();
}
function obSendOtp() {
  const a = S.auth;
  if (a.busy) return;
  const v = ((document.getElementById("ph") || {}).value || a.phone || "").replace(/\D/g, "");
  a.phone = v;
  if (obWait("auth.sendOtp")) return obTrackRate();
  const problem = obPhoneProblem();
  if (problem) return obSetError(problem, "ph");
  obRememberCountry(obCountry().iso);
  const request = { phone: obE164(), dialCode: obCountry().dial, role: S.role };
  if (DEMO) { Native.send("auth.sendOtp", request); return obOtpSent(); }
  obRequest("auth.sendOtp", request);
}
function obValidOtpLength(value) { return Number.isInteger(value) && value >= 4 && value <= 8 ? value : 6; }
function obOtpLength() { return obValidOtpLength(S.auth.otpLength); }
function obOtpSent(data = {}) {
  clearTimeout(obRequestTimer); clearInterval(S.otpT);
  const resendAfter = Math.max(1, Math.min(3600, Number(data.resendAfter) || (DEMO ? 30 : 60)));
  Object.assign(S.auth, { busy: false, step: "otp", code: "", err: "", otpLength: obValidOtpLength(data.otpLength), resendAt: Date.now() + resendAfter * 1000, expiresAt: Date.now() + (Number(data.expiresIn) || 300) * 1000 });
  S.otpT = setInterval(() => {
    if (S.v !== "login" || S.auth.step !== "otp") return clearInterval(S.otpT);
    const el = document.getElementById("rs"); if (el) el.innerHTML = obResendText();
    if (Date.now() >= S.auth.resendAt) clearInterval(S.otpT);
  }, 1000);
  obHaptic("success"); r(); obTrackRate();
}
function obResendText() {
  const left = Math.max(obWait("auth.sendOtp"), Math.ceil(((S.auth.resendAt || 0) - Date.now()) / 1000), 0);
  return left ? `Request a new code in <b>${obDuration(left)}</b>` : `<span>Didn’t receive it?</span> <button class="ob-text-button" onclick="obResend()" ${S.auth.busy ? "disabled" : ""}>Send a new code</button>`;
}
function obResend() {
  if (S.auth.busy || Date.now() < S.auth.resendAt || obWait("auth.sendOtp")) return;
  if (DEMO) return obOtpSent();
  obRequest("auth.sendOtp", { phone: obE164(), dialCode: obCountry().dial, role: S.role });
}
function obOtpInput(el, index) {
  if (S.auth.busy) return;
  const length = obOtpLength(), digits = el.value.replace(/\D/g, "");
  if (digits.length > 1) {
    const start = digits.length >= length ? 0 : index;
    digits.slice(0, length - start).split("").forEach((digit, i) => { document.getElementById("o" + (start + i)).value = digit; });
  } else el.value = digits;
  const inputs = Array.from({ length }, (_, i) => document.getElementById("o" + i));
  inputs.forEach(input => input.classList.toggle("filled", !!input.value));
  S.auth.code = inputs.map(input => input.value).join("");
  obSetError("");
  if (S.auth.code.length === length) return obVerifyOtp();
  const next = inputs.find((input, i) => i > index && !input.value);
  if (digits && next) next.focus();
}
function obOtpKey(e, index) {
  if (e.key === "Backspace" && !e.target.value && index > 0) document.getElementById("o" + (index - 1)).focus();
  if (e.key === "ArrowLeft" && index > 0) document.getElementById("o" + (index - 1)).focus();
  if (e.key === "ArrowRight" && index < obOtpLength() - 1) document.getElementById("o" + (index + 1)).focus();
}
function obOtpPaste(e) {
  const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, obOtpLength());
  if (!digits) return;
  e.preventDefault();
  const input = document.getElementById("o0"); input.value = digits; obOtpInput(input, 0);
}
function obVerifyOtp() {
  if (S.auth.busy || obWait("auth.verifyOtp")) return;
  if (S.auth.expiresAt && Date.now() >= S.auth.expiresAt) return obSetError("That code has expired. Request a new code below.");
  const length = obOtpLength(), code = Array.from({ length }, (_, i) => (document.getElementById("o" + i) || {}).value || "").join("");
  S.auth.code = code;
  if (code.length !== length || !/^\d+$/.test(code)) return obSetError(`Enter all ${length} digits from your message.`, "o0");
  if (DEMO) { Native.send("auth.verifyOtp", { phone: obE164(), dialCode: obCountry().dial, code, role: S.role, signup: S.auth.mode === "signup" }); return signedIn(); }
  obRequest("auth.verifyOtp", { phone: obE164(), dialCode: obCountry().dial, code, role: S.role, signup: S.auth.mode === "signup" });
}
function obSignedIn() {
  clearInterval(S.otpT); clearTimeout(obRequestTimer); obHaptic("success");
  if (S.auth.mode === "signup") {
    Object.assign(S.auth, { step: "profile", busy: false, err: "", verified: true, cat: S.auth.cat || "", langs: S.auth.langs || [], photos: S.auth.photos || [], interests: S.auth.interests || [] });
    return r();
  }
  const creator = S.creatorSetup || S.auth.creatorIntent;
  S.loggedIn = 1; S.auth = { step: "phone" };
  if (creator && !isHost()) { S.creatorSetup = true; S.kf = { name: me.n, bio: me.about, langs: (S.user || {}).languages || [] }; }
  go(creator && !isHost() ? "kyc" : "home");
}
function obPickGender(value, button) {
  S.auth.gender = value;
  button.parentElement.removeAttribute("aria-invalid");
  button.parentElement.querySelectorAll("button").forEach(b => { const on = b === button; b.classList.toggle("selected", on); b.setAttribute("aria-pressed", String(on)); });
}
function obToggleLanguage(value, button) {
  const list = S.auth.langs;
  list.includes(value) ? list.splice(list.indexOf(value), 1) : list.push(value);
  button.classList.toggle("selected", list.includes(value)); button.setAttribute("aria-pressed", String(list.includes(value)));
}
const obEmailKey = value => String(value || "").trim().toLowerCase();
/** The server's answer for the address now in the field: checking, available, taken, invalid, unknown or "". */
function obEmailState() {
  const status = S.auth.emailStatus;
  return status && status.email === obEmailKey(S.auth.email) ? status.state : "";
}
function obEmailStatusText(state) {
  return state === "checking" ? "Checking this email…" : state === "taken" ? OB_EMAIL_TAKEN :
    state === "invalid" ? "Enter a valid email address, like name@example.com." : state === "available" ? `${I("check", 13)} Email available` : "";
}
// Painted in place so typing keeps focus and the caret.
function obPaintEmail() {
  const state = obEmailState(), status = document.getElementById("ob-email-status"), input = document.getElementById("pe");
  if (status) { status.className = `ob-email-status ${state}`; status.innerHTML = obEmailStatusText(state); }
  if (input) state === "taken" || state === "invalid" ? input.setAttribute("aria-invalid", "true") : input.removeAttribute("aria-invalid");
}
function obEmailInput(el) {
  S.auth.email = el.value;
  clearTimeout(obEmailTimer);
  // An error about the previous address no longer applies.
  if (S.auth.err === OB_EMAIL_TAKEN || S.auth.err === OB_EMAIL_INVALID) obSetError("");
  obPaintEmail();
  const key = obEmailKey(el.value), state = obEmailState();
  if (!DEMO && okEmail(key) && (!state || state === "unknown")) obEmailTimer = setTimeout(() => obCheckEmail(key), 500);
}
function obCheckEmail(key) {
  clearTimeout(obEmailTimer);
  const status = S.auth.emailStatus;
  if (DEMO || !okEmail(key) || (status && status.email === key && status.state !== "unknown")) return;
  const requestId = ++obEmailSequence;
  S.auth.emailStatus = { email: key, state: "checking", requestId };
  obPaintEmail();
  Native.send("auth.emailCheck", { email: key, requestId });
}
/** Next waits for the check; if it fails or is slow, the save-time check still protects the account. */
function obAwaitEmail() {
  const a = S.auth;
  obCheckEmail(obEmailKey(a.email));
  a.busy = "auth.emailCheck"; obEmailWaiting = a; r();
  clearTimeout(obEmailGateTimer);
  obEmailGateTimer = setTimeout(() => {
    if (a.emailStatus && a.emailStatus.state === "checking") a.emailStatus.state = "unknown";
    obEmailSettled(a);
  }, 10000);
}
function obEmailSettled(a) {
  if (obEmailWaiting !== a) return;
  obEmailWaiting = null; clearTimeout(obEmailGateTimer);
  if (S.auth !== a || a.busy !== "auth.emailCheck") return;
  a.busy = false; r();
  if (S.v === "login" && a.step === "profile") obNextProfile();
}
function obNextProfile() {
  const a = S.auth;
  if (a.busy) return;
  a.name = document.getElementById("pn").value.trim(); a.email = document.getElementById("pe").value.trim(); a.adult = document.getElementById("p18").checked;
  if (a.name.length < 2) return obSetError("Use at least two characters for your name.", "pn");
  if (!okEmail(a.email)) return obSetError(OB_EMAIL_INVALID, "pe");
  const email = obEmailState();
  if (email === "taken") return obSetError(OB_EMAIL_TAKEN, "pe");
  if (email === "invalid") return obSetError(OB_EMAIL_INVALID, "pe");
  if (!a.gender) return obSetError("Choose Female, Male or Prefer not to say.", "pg");
  if (obIsCreator() && !a.cat) return obSetError("Pick a category for your creator profile.", "pc");
  if (obIsCreator() && !a.langs.length) return obSetError("Select at least one language for your calls.");
  if (!a.adult) return obSetError("You need to be 18 or older to join BinzoLive.", "p18");
  if (!DEMO && (!email || email === "checking")) return obAwaitEmail();
  obStep("photos");
}
function obNextPhotos() {
  if (S.auth.uploading) return;
  if (S.auth.photos.length < MIN_PHOTOS) return obSetError(`Add ${MIN_PHOTOS - S.auth.photos.length} more ${S.auth.photos.length === 2 ? "photo" : "photos"} to continue.`);
  obStep("interests");
}
function obChoosePhotos(camera = false) { const input = document.getElementById(camera ? "ob-camera" : "ob-photos"); if (input) input.click(); }
function obReadPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file (JPG, PNG or WebP)."));
    if (file.size > 20 * 1024 * 1024) return reject(new Error("That photo is too large. Choose one under 20 MB."));
    const url = URL.createObjectURL(file), img = new Image();
    const timer = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error("This photo could not be opened. Try a JPG or PNG.")); }, 12000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const ratio = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .8));
      } catch (_) { reject(new Error("We couldn’t prepare that photo. Please try another.")); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error("This image format isn’t supported here. Try a JPG, PNG or WebP.")); };
    img.src = url;
  });
}
async function obUpload(event) {
  const a = S.auth;
  if (a.uploading) return;
  const files = Array.from(event.target.files || []); event.target.value = "";
  if (!files.length) return;
  const space = MAX_PHOTOS - a.photos.length;
  a.uploading = true; a.err = ""; r();
  let error = "";
  // Decode one at a time to keep peak memory low on mobile devices.
  for (const file of files.slice(0, space)) {
    try { const image = await obReadPhoto(file); if (a !== S.auth) return; a.photos.push(image); }
    catch (e) { error = e.message; }
  }
  if (a !== S.auth) return;
  a.uploading = false; a.err = error || (files.length > space ? "You can keep up to six photos. The first available photos were added." : "");
  a.featured = Math.min(a.featured || 0, Math.max(0, a.photos.length - 1));
  obHaptic(error ? "error" : "success"); r();
}
function obFeature(index) { if (S.auth.uploading) return; S.auth.featured = index; r(); }
function obRemovePhoto(index) {
  const a = S.auth; if (a.uploading) return;
  a.photos.splice(index, 1);
  a.featured = index < a.featured ? a.featured - 1 : index === a.featured ? 0 : a.featured;
  a.err = ""; r();
}
function obToggleInterest(index, button) {
  const value = OB_INTERESTS[index][1], list = S.auth.interests;
  list.includes(value) ? list.splice(list.indexOf(value), 1) : list.push(value);
  button.classList.toggle("selected", list.includes(value)); button.setAttribute("aria-pressed", String(list.includes(value)));
  const count = document.getElementById("ob-interest-count");
  if (count) count.textContent = obInterestCount();
}
function obInterestCount() { const n = S.auth.interests.length; return n ? `${n} picked. Add as many as you like.` : "Pick as many as you like."; }
function obFinish(skip = false) {
  const a = S.auth; if (a.busy) return;
  if (!a.verified || !a.name || !okEmail(a.email) || !a.gender || !a.adult) return obStep("profile");
  if (a.photos.length < MIN_PHOTOS) return obStep("photos");
  if (skip) a.interests = [];
  const photos = [a.photos[a.featured || 0], ...a.photos.filter((_, i) => i !== (a.featured || 0))];
  const profile = { onboarding: true, role: S.role, name: a.name, email: a.email, photos, category: a.cat || undefined, langs: a.langs, interests: a.interests, gender: a.gender, adultConfirmed: !!a.adult, preferredRole: obIsCreator() ? "creator" : "member" };
  if (DEMO) { Native.send("profile.save", profile); return obComplete(); }
  obRequest("profile.save", profile);
}
function obComplete(account) {
  const a = S.auth; clearTimeout(obRequestTimer); obHaptic("success");
  const creator = obIsCreator();
  me.n = a.name; S.editName = a.name; me.gender = a.gender; S.editGender = a.gender; S.avatarData = a.photos[a.featured || 0]; S.interests = a.interests.slice();
  if (account) obApplyAccount(account);
  if (creator) { me.tag = a.cat; S.creatorSetup = true; S.fromSignup = 1; S.kf = { ...S.kf, name: a.name, email: a.email, langs: a.langs, category: a.cat, bio: "", photos: account ? (account.user.photos || []).map(p => p.url) : a.photos }; }
  S.loggedIn = 1; S.auth = { step: "phone" }; go(creator ? "kyc" : "home");
}
function obErrorMarkup() { return `<p class="ob-error" id="ob-error" role="alert" ${S.auth.err ? "" : "hidden"}>${esc(S.auth.err || "")}</p>`; }
function obButton(text, handler, disabled = false) {
  const kind = handler === "obSendOtp()" ? "auth.sendOtp" : handler === "obVerifyOtp()" ? "auth.verifyOtp" : "";
  const left = kind ? obWait(kind) : 0, idle = kind === "auth.sendOtp" ? "Send my code" : "Verify & continue";
  return `<button ${kind ? `id="ob-auth-submit" data-idle-label="${idle}"` : ""} class="ob-primary" ${disabled || left ? "disabled" : ""} onclick="${handler}">${S.auth.busy || S.auth.uploading ? '<span class="ob-spinner" aria-hidden="true"></span>' : ""}${left && !S.auth.busy ? `Try again in ${obDuration(left)}` : text}${S.auth.busy || S.auth.uploading || left ? "" : obArrow()}</button>`;
}
function obLanguages() { return `<div class="ob-options">${LANGS.map(value => { const selected = S.auth.langs.includes(value); return `<button type="button" class="${selected ? "selected" : ""}" aria-pressed="${selected}" onclick="obToggleLanguage('${value}',this)">${value}</button>`; }).join("")}</div>`; }
function obPhotoContent() {
  const a = S.auth, count = a.photos.length, index = a.featured || 0;
  return `<input hidden id="ob-photos" type="file" accept="image/*" multiple onchange="obUpload(event)"><input hidden id="ob-camera" type="file" accept="image/*" capture="user" onchange="obUpload(event)">
    <div class="ob-photo-layout"><div class="ob-upload"><span class="ob-upload-camera">${I("flip", 23)}</span>
      <button class="ob-add-photo" onclick="obChoosePhotos()" ${a.uploading || count >= MAX_PHOTOS ? "disabled" : ""}><span class="ob-add-plus">${I("plus", 28)}</span><b>${a.uploading ? "Adding…" : "Add photos"}</b><small>From your gallery</small></button>
      <button class="ob-camera-button" onclick="obChoosePhotos(true)" ${a.uploading || count >= MAX_PHOTOS ? "disabled" : ""}>${I("flip", 15)} Take a photo</button></div>
    <div class="ob-featured">${count ? `<img src="${a.photos[index]}" alt="Your featured profile photo"><span class="ob-feature-badge">${I("star", 14)} FEATURED</span><button class="ob-photo-remove ob-icon" aria-label="Remove featured photo" onclick="obRemovePhoto(${index})" ${a.uploading ? "disabled" : ""}>×</button><div class="ob-photo-caption"><div><b>Your first hello</b><p>The photo people see first</p></div><span>${I("check", 19)}</span></div>` : `<div class="ob-photo-empty">${I("user", 45)}<b>A face to your name</b><p>Your favorite photo<br>goes right here.</p></div>`}</div></div>
    <div class="ob-preview-heading"><b>Your lineup</b><span>Tap a photo to feature it</span></div>
    <div class="ob-photo-strip">${Array.from({ length: MAX_PHOTOS }, (_, i) => `<button class="ob-thumb ${count && index === i ? "selected" : ""}" aria-label="${i < count ? `Feature photo ${i + 1}` : "Add photo"}" ${i < count ? `aria-pressed="${index === i}"` : ""} onclick="${i < count ? `obFeature(${i})` : "obChoosePhotos()"}" ${a.uploading ? "disabled" : ""}>${i < count ? `<img src="${a.photos[i]}" alt="Photo ${i + 1}">${index === i ? `<span>${I("star", 12)}</span>` : ""}` : I("plus", 22)}</button>`).join("")}</div>
    <div class="ob-photo-status" aria-live="polite"><span>${count} of ${MAX_PHOTOS} photos</span><span class="${count >= MIN_PHOTOS ? "ready" : ""}">${count >= MIN_PHOTOS ? "● Looking good" : `${MIN_PHOTOS - count} more to get started`}</span></div>`;
}
function obLogin() {
  const a = S.auth, signup = a.mode === "signup", host = obIsCreator();
  if (a.step === "choose") a.step = "phone";
  if (a.step === "sprofile") a.step = "profile";
  const step = a.step, number = ({ phone: 1, otp: 1, profile: 2, photos: 3, interests: 4 })[step] || 1;
  let title, description = "", content, actions;
  if (step === "phone") {
    title = !signup ? "Good to see you <em>again</em>." : host ? "Your creator <em>journey</em> starts here." : "Your next <em>hello</em> starts here.";
    description = "Enter your number. We’ll text you a code to get you in.";
    content = `<form class="ob-form" onsubmit="event.preventDefault();obSendOtp()"><label class="ob-label" for="ph">Mobile number</label><div class="ob-phone-field">${obCountryButton(!!a.busy)}<input id="ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="${obPhonePlaceholder()}" maxlength="18" value="${esc(a.phone || "")}" aria-describedby="ob-phone-hint ob-error" oninput="obPhoneInput(this)" ${a.busy ? "disabled" : ""}></div><p class="ob-field-hint" id="ob-phone-hint">${I("lock", 13)} Used to verify your account.</p><button type="submit" hidden tabindex="-1">Send code</button></form>`;
    actions = obButton(a.busy ? "Sending your code…" : "Send my code", "obSendOtp()", !!a.busy) + `<button class="ob-text-button" onclick="obShowHelp()">Need a hand? <b>Get help</b></button>`;
  } else if (step === "otp") {
    const length = obOtpLength();
    title = "Check your <em>messages</em>."; description = `Enter the ${length}-digit code sent to <strong>${esc(obCountry().dial)} ${esc(obNational(a.phone))}</strong>.`;
    content = `<button class="ob-text-button ob-change-number" onclick="obBack()" ${a.busy ? "disabled" : ""}>${I("back", 16)} Edit phone number</button><div class="ob-otp" style="--otp-length:${length}" onpaste="obOtpPaste(event)">${Array.from({ length }, (_, i) => `<input id="o${i}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="${i ? "off" : "one-time-code"}" maxlength="${length}" value="${esc((a.code || "")[i] || "")}" aria-label="Code digit ${i + 1}" aria-describedby="ob-error" onfocus="this.select()" oninput="obOtpInput(this,${i})" onkeydown="obOtpKey(event,${i})" ${a.busy ? "disabled" : ""}>`).join("")}</div><div id="rs" class="ob-resend">${obResendText()}</div>${DEMO ? `<p class="ob-field-hint ob-demo-note">Preview mode &middot; Enter any ${length} digits to explore.</p>` : ""}`;
    actions = obButton(a.busy ? "Checking your code…" : "Verify & continue", "obVerifyOtp()", !!a.busy);
  } else if (step === "profile") {
    title = "Let’s make it <em>yours</em>.";
    content = `<form class="ob-form" onsubmit="event.preventDefault();obNextProfile()"><div class="ob-field"><label for="pn">${host ? "Creator name" : "What should we call you?"}</label><input id="pn" autocomplete="nickname" maxlength="32" placeholder="Your name" value="${esc(a.name || "")}" oninput="S.auth.name=this.value" aria-describedby="ob-error"></div>
      <div class="ob-field"><label for="pe">Email address</label><input id="pe" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="100" placeholder="you@example.com" value="${esc(a.email || "")}" oninput="obEmailInput(this)" onblur="obCheckEmail(obEmailKey(this.value))" aria-describedby="ob-email-status ob-error" ${["taken", "invalid"].includes(obEmailState()) ? 'aria-invalid="true"' : ""}><p class="ob-email-status ${obEmailState()}" id="ob-email-status" aria-live="polite">${obEmailStatusText(obEmailState())}</p></div>
      <div class="ob-field ob-inline"><span class="ob-label" id="pg-label">I am</span><div class="ob-segment" id="pg" role="group" aria-labelledby="pg-label" aria-describedby="ob-error" tabindex="-1">${GENDERS.map(([value, label]) => `<button type="button" class="${a.gender === value ? "selected" : ""}" aria-pressed="${a.gender === value}" onclick="obPickGender('${value}',this)">${label}</button>`).join("")}</div></div>
      ${host ? `<div class="ob-field"><label for="pc">Your thing</label><select id="pc" onchange="S.auth.cat=this.value" aria-describedby="ob-error"><option value="" disabled ${a.cat ? "" : "selected"}>Choose a category</option>${CATS.map(c => `<option value="${c}" ${a.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>` : ""}
      <div><span class="ob-label">Languages you speak ${host ? "" : '<small>Optional</small>'}</span>${obLanguages()}</div>
      <label class="ob-check"><input id="p18" type="checkbox" ${a.adult ? "checked" : ""} onchange="S.auth.adult=this.checked" aria-describedby="ob-error"><span>I’m 18 or older.</span></label><button hidden type="submit" tabindex="-1">Continue</button></form>`;
    actions = obButton(a.busy === "auth.emailCheck" ? "Checking your email…" : "Next, your photos", "obNextProfile()", !!a.busy);
  } else if (step === "photos") {
    title = "Put a face to your <em>hello</em>."; description = "Add at least three clear photos of yourself.";
    content = obPhotoContent(); actions = obButton(a.uploading ? "Preparing your photos…" : "Looking good. Continue", "obNextPhotos()", a.uploading || a.photos.length < MIN_PHOTOS);
  } else {
    title = "Find your kind of <em>energy</em>."; description = `<span id="ob-interest-count" aria-live="polite">${obInterestCount()}</span>`;
    content = `<div class="ob-interests" aria-label="Your interests">${OB_INTERESTS.map(([emoji, label], i) => `<button class="ob-interest ${a.interests.includes(label) ? "selected" : ""}" aria-pressed="${a.interests.includes(label)}" onclick="obToggleInterest(${i},this)" ${a.busy ? "disabled" : ""}><span aria-hidden="true">${emoji}</span>${label}<span class="ob-chip-check" aria-hidden="true">${I("check", 13)}</span></button>`).join("")}</div>`;
    actions = obButton(a.busy ? "Making it yours…" : host ? "Finish my creator profile" : "Let’s meet your people", "obFinish()", !!a.busy) + `<button class="ob-secondary" onclick="obFinish(true)" ${a.busy ? "disabled" : ""}>Skip for now</button>`;
  }
  return `<section class="ob-shell" data-ob-step="${step}" aria-label="${signup ? "Create your BinzoLive account" : "Log in to BinzoLive"}">
    <header class="ob-header">${backButton("obBack()", {attrs: a.busy || a.uploading ? "disabled" : ""})}
      ${signup ? `<div class="ob-progress" role="progressbar" aria-label="Account setup" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${number}" aria-valuetext="Step ${number} of 4">${[1, 2, 3, 4].map(i => `<span class="${i < number ? "done" : i === number ? "current" : ""}"></span>`).join("")}</div>` : `<span class="ob-login-label"><img class="ob-login-logo" src="${BRAND_LOGO}" alt="BinzoLive" width="66" height="26" decoding="async"></span>`}
      <button class="ob-support" onclick="obShowHelp()">Help</button></header>
    <div class="ob-main">
      <h1 class="ob-heading" tabindex="-1">${title}</h1>${description ? `<p class="ob-description">${description}</p>` : ""}
      <div class="ob-content">${content}</div>${obErrorMarkup()}<div class="ob-actions">${actions}</div>
      ${step === "phone" ? '<p class="ob-footer">Standard SMS rates may apply.</p>' : ''}
    </div></section>`;
}
function obShowHelp() {
  if (document.getElementById("ob-help")) return;
  const dialog = document.createElement("dialog"); dialog.id = "ob-help"; dialog.className = "ob-dialog"; dialog.setAttribute("aria-labelledby", "ob-help-title");
  dialog.innerHTML = `<div class="ob-dialog-head"><span class="ob-eyebrow">WE’RE HERE TO HELP</span><button class="ob-dialog-close ob-icon" aria-label="Close help" onclick="obCloseHelp()">×</button></div><div class="ob-dialog-body"><h2 id="ob-help-title">A little help getting in.</h2><p>Choose your country, then enter your mobile number. You can also paste a full number that starts with + and its country code. Double-check it before requesting your code.</p><p>No message yet? Check your mobile signal and wait for the resend timer. Use the newest code if you requested more than one.</p><p>For photos, choose clear JPG, PNG or WebP images under 20 MB each. You can add up to six.</p><button class="ob-primary" onclick="obCloseHelp()">Got it ${I("check", 18)}</button></div>`;
  obModal(dialog);
}
function obCloseHelp() { const dialog = document.getElementById("ob-help"); if (dialog) dialog.close(); }
/** Opens a dialog with a focus trap, outside-click close and focus return. */
function obModal(dialog) {
  obDialogTrigger = document.activeElement;
  document.body.appendChild(dialog); dialog.addEventListener("close", () => { dialog.remove(); if (obDialogTrigger && obDialogTrigger.isConnected) obDialogTrigger.focus(); });
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll("button:not(:disabled):not([hidden]),a[href],input:not(:disabled),[tabindex='0']"));
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  dialog.showModal();
}
function obPhonePlaceholder() { return obCountry().iso === "IN" ? "Your 10-digit number" : "Mobile number"; }
function obCountryButton(busy) {
  const country = obCountry(), name = obCountryName(country.iso);
  return `<button type="button" class="ob-country" id="ob-country" onclick="obShowCountries()" aria-haspopup="dialog" aria-label="Country code: ${esc(name)} ${country.dial}. Change country" ${busy ? "disabled" : ""}><span aria-hidden="true">${obFlag(country.iso)}</span> ${country.dial} ${I("chev", 12)}</button>`;
}
function obPaintCountry() {
  const button = document.getElementById("ob-country"); if (button) button.outerHTML = obCountryButton(!!S.auth.busy);
  const input = document.getElementById("ph"); if (input) input.placeholder = obPhonePlaceholder();
}
/** Keeps digits; a pasted or typed "+44…" also picks the country (calling codes never prefix each other). */
function obPhoneInput(el) {
  const typed = el.value.trim();
  if (typed.startsWith("+")) {
    const parsed = obParseInternational(typed);
    if (parsed) { obRememberCountry(parsed.iso); el.value = parsed.national; obPaintCountry(); }
    else el.value = "+" + typed.replace(/\D/g, "");
  } else el.value = typed.replace(/\D/g, "");
  S.auth.phone = el.value; obSetError("");
}
function obCountryOptions(countries) {
  const current = obCountry().iso;
  return countries.map(country => `<button type="button" class="ob-country-option" ${country.iso === current ? 'aria-current="true"' : ""} onclick="obPickCountry('${country.iso}')"><span aria-hidden="true">${obFlag(country.iso)}</span><span>${esc(country.name)}</span><span class="ob-country-dial">${country.dial}</span></button>`).join("");
}
function obShowCountries() {
  if (document.getElementById("ob-countries") || S.auth.busy) return;
  obCountryList = obCountryIndex();
  const dialog = document.createElement("dialog"); dialog.id = "ob-countries"; dialog.className = "ob-dialog ob-country-dialog"; dialog.setAttribute("aria-labelledby", "ob-countries-title");
  dialog.innerHTML = `<div class="ob-dialog-head"><h2 id="ob-countries-title">Choose your country</h2><button class="ob-dialog-close ob-icon" aria-label="Close country list" onclick="obCloseCountries()">×</button></div><input id="ob-country-search" class="ob-country-search" type="search" placeholder="Search country or code" aria-label="Search countries" autocomplete="off" oninput="obQueueCountrySearch()" onkeydown="obCountrySearchKey(event)"><div class="ob-country-list" id="ob-country-list">${obCountryOptions(obCountryList)}</div><p class="ob-country-empty" id="ob-country-empty" role="status" hidden>No country matches that search.</p>`;
  obModal(dialog);
  dialog.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
  document.getElementById("ob-country-search").focus();
}
// Searches once typing pauses, not on every key.
function obQueueCountrySearch() { clearTimeout(obCountrySearchTimer); obCountrySearchTimer = setTimeout(obFilterCountries, 150); }
function obFilterCountries() {
  clearTimeout(obCountrySearchTimer); obCountrySearchTimer = 0;
  const list = document.getElementById("ob-country-list"), search = document.getElementById("ob-country-search"); if (!list || !search) return;
  const matches = obSearchCountries(obCountryList, search.value);
  list.innerHTML = obCountryOptions(matches); list.scrollTop = 0;
  document.getElementById("ob-country-empty").hidden = matches.length > 0;
}
// The keyboard's search key shows the results at once and moves to the best match.
function obCountrySearchKey(event) {
  if (event.key !== "Enter") return;
  event.preventDefault(); obFilterCountries();
  document.querySelector("#ob-country-list .ob-country-option")?.focus();
}
function obCloseCountries() { const dialog = document.getElementById("ob-countries"); if (dialog) dialog.close(); }
function obPickCountry(iso) {
  obRememberCountry(iso); obCloseCountries(); obSetError(""); obPaintCountry();
  document.getElementById("ph")?.focus();
}
document.addEventListener("click", event => {
  const target = event.target.closest(".ob-shell button,.ob-dialog button,.ob-check");
  if (target && !target.disabled) obHaptic("selection");
}, true);
document.addEventListener("pointerdown", event => {
  if (event.target.closest(".ob-showcase") && !event.target.closest("button")) obSwipe = { x: event.clientX, y: event.clientY, id: event.pointerId, card: document.querySelector(".ob-card-main") };
  const target = event.target.closest(".ob-primary,.ob-secondary,.ob-interest,.ob-options button");
  if (!target || target.disabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = target.getBoundingClientRect(), ripple = document.createElement("span"); ripple.className = "ob-ripple";
  ripple.style.left = `${event.clientX - rect.left}px`; ripple.style.top = `${event.clientY - rect.top}px`;
  target.appendChild(ripple); setTimeout(() => ripple.remove(), 600);
}, { passive: true });
/* The top card follows a sideways drag like a real card, then springs back unless it was swiped away. */
document.addEventListener("pointermove", event => {
  const swipe = obSwipe;
  if (!swipe || swipe.id !== event.pointerId || !swipe.card?.isConnected || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
  if (!swipe.dragging && (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy))) return;
  swipe.dragging = true;
  swipe.card.classList.remove("is-settling");
  swipe.card.classList.add("is-dragging");
  swipe.card.style.setProperty("--ob-drag", String(Math.max(-160, Math.min(160, dx))));
}, { passive: true });
function obSettle(card) {
  if (!card?.classList.contains("is-dragging")) return;
  card.classList.replace("is-dragging", "is-settling");
  card.style.removeProperty("--ob-drag");
  setTimeout(() => card.classList.remove("is-settling"), 450);
}
document.addEventListener("pointerup", event => {
  if (!obSwipe || obSwipe.id !== event.pointerId) return;
  const dx = event.clientX - obSwipe.x, dy = event.clientY - obSwipe.y, card = obSwipe.card; obSwipe = null;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5 && S.v === "welcome") { obDeck(dx < 0 ? 1 : -1); obHaptic(); }
  else obSettle(card);
}, { passive: true });
document.addEventListener("pointercancel", () => { obSettle(obSwipe?.card); obSwipe = null; }, { passive: true });
Native.on("auth.otpSent", d => { if (obMatches(d) && S.v === "login" && S.auth.busy === "auth.sendOtp" && d.phone === obE164()) obOtpSent(d); });
Native.on("profile.saved", d => { if (obMatches(d) && d.onboarding && S.v === "login" && S.auth.busy === "profile.save") obComplete(d.account); });
Native.on("profile.progress", d => {
  if (!obMatches(d) || S.v !== "login" || S.auth.busy !== "profile.save") return;
  const button = document.querySelector(".ob-actions .ob-primary");
  if (button) button.textContent = d.done < d.total ? `Saving photo ${d.done + 1} of ${d.total}…` : "Saving your profile…";
});
Native.on("profile.error", d => {
  if (!obMatches(d) || !d.onboarding || S.v !== "login") return;
  clearTimeout(obRequestTimer); S.auth.busy = false;
  // Someone else took the address since it was checked; photos stay in the draft.
  if (d.code === "EMAIL_IN_USE") {
    S.auth.emailStatus = { email: obEmailKey(S.auth.email), state: "taken" };
    obStep("profile", true); return obSetError(OB_EMAIL_TAKEN, "pe");
  }
  S.auth.err = d.message || "Your profile couldn’t be saved. Please try again."; r(); obHaptic("error");
});
Native.on("auth.emailChecked", d => {
  const a = S.auth, status = a && a.emailStatus;
  if (!status || status.requestId !== d.requestId || status.email !== d.email) return;
  status.state = typeof d.available === "boolean" ? (d.available ? "available" : "taken") : d.status === 400 ? "invalid" : "unknown";
  obPaintEmail();
  obEmailSettled(a);
});
