/* Host capability is captured only from native account data. Presentation state
   such as S.role and A().kyc cannot turn it on. The backend authorizes every action. */
let zimiHostAuthority = null;
function isApprovedHost() {
  return !!zimiHostAuthority && zimiHostAuthority.approved === true && zimiHostAuthority.role === 'host' &&
    zimiHostAuthority.hostStatus === 'approved' && zimiHostAuthority.verified === true;
}
function zimiSetHostAccess(data, source = 'server') {
  const old = zimiHostAuthority;
  const previous = isApprovedHost();
  const checking = data?.checking === true;
  const approved = !checking && data?.approved === true && data.role === 'host' && data.hostStatus === 'approved' && data.verified === true;
  zimiHostAuthority = Object.freeze({ approved, checking, role: approved || (checking && S.role === 'host') ? 'host' : 'sender', serverRole: data?.serverRole || (data?.role === 'host' ? 'host' : old?.serverRole), hostStatus: typeof data?.hostStatus === 'string' ? data.hostStatus : '', verified: approved, source });
  S.hostAccess = { ...zimiHostAuthority };
  if (!checking) {
    S.role = zimiHostAuthority.role;
    if (S.user) S.user = { ...S.user, role: S.role, serverRole: zimiHostAuthority.serverRole || S.user.serverRole, hostStatus: zimiHostAuthority.hostStatus, isVerifiedHost: approved };
    const status = zimiHostAuthority.hostStatus;
    const verification = approved ? 'verified' : status === 'pending' || status === 'approved' ? 'pending' : status === 'rejected' || status === 'suspended' ? 'rejected' : 'none';
    S.acct.sender.kyc = verification; S.acct.host.kyc = verification;
    if (!approved) S.online = 0;
  }
  if (previous !== approved || !!old?.checking !== checking) window.dispatchEvent(new CustomEvent('zimi:host-access', { detail: { ...zimiHostAuthority } }));
  return !old || old.approved !== approved || old.checking !== checking || old.role !== zimiHostAuthority.role || old.serverRole !== zimiHostAuthority.serverRole || old.hostStatus !== zimiHostAuthority.hostStatus;
}
function zimiApplyHostAccount(account) {
  const user = account?.user || {};
  zimiSetHostAccess({ approved: account?.verification === 'verified', role: user.role, serverRole: user.serverRole || (user.role === 'host' ? 'host' : 'user'), hostStatus: user.hostStatus, verified: user.isVerifiedHost === true });
}
window.ZimiHostAccess = {
  approved: isApprovedHost,
  checking: () => zimiHostAuthority?.checking === true,
  apply: zimiApplyHostAccount,
  reset() { zimiHostAuthority = null; zimiSetHostAccess({ approved: false }); },
  guard(message = 'Your creator profile needs admin approval before you can host.') {
    if (isApprovedHost()) return true;
    appNotice(zimiHostAuthority?.checking ? 'Checking your creator approval. Please try again in a moment.' : message); return false;
  },
};
Native.on('host.access', data => { const changed = zimiSetHostAccess(data); if (changed && S.loggedIn) r(); });
Native.on('verification.status', data => {
  // A rejection/revocation can remove access immediately; a positive label alone
  // cannot grant it. Native refreshes the full account after an approval review.
  if (data.message || data.status === 'verified') return;
  const changed = zimiSetHostAccess({ approved: false, hostStatus: data.hostStatus || data.status || 'none' });
  if (changed && S.loggedIn) r();
});
// Explicit preview fixture only. Selecting a host role alone never grants access.
if (DEMO && roleParam === 'host' && new URLSearchParams(location.search).get('approvedHost') === '1') {
  zimiSetHostAccess({ approved: true, role: 'host', hostStatus: 'approved', verified: true }, 'preview');
}
