import type { UpdateIdentity } from "./app-update-events";
import type { AppRelease, UpdatePolicy } from "./app-update-policy";
import type { ApkDownloadProgress, ApkDownloadRequest, ApkInstallResult, VerifiedApkReceipt } from "./native-apk-updater";
export interface UpdateState {
  status: "checking" | "allowed" | "required" | "error";
  deferred: boolean;
  phase: "idle" | "downloading" | "verifying" | "ready" | "permission" | "installer";
  installed?: UpdateIdentity; release?: AppRelease; progress: number; error?: string; checking: boolean;
}
export interface UpdateDependencies {
  installed(): Promise<UpdateIdentity & { supported: boolean }>;
  check(identity: UpdateIdentity): Promise<UpdatePolicy>;
  load(identity: UpdateIdentity): Promise<UpdatePolicy | null>;
  save(policy: UpdatePolicy): Promise<void>;
  configure(identity: UpdateIdentity): void;
  url(release: AppRelease): string;
  download(request: ApkDownloadRequest): Promise<VerifiedApkReceipt>;
  receipt(id: string): Promise<VerifiedApkReceipt | null>;
  install(receiptId: string): Promise<ApkInstallResult>;
  cancel(id: string, discard?: boolean): Promise<void>;
  grace?(identity: UpdateIdentity, release: AppRelease): Promise<{ deferUntil: string | null; activities: ("call" | "purchase")[] }>;
}
export const INITIAL_UPDATE_STATE: UpdateState = { status: "checking", phase: "idle", progress: 0, checking: true, deferred: false };
/** No successful check means no app access; an installer launch never grants access. */
export class AppUpdateController {
  state: UpdateState = { ...INITIAL_UPDATE_STATE };
  private closed = false;
  private generation = 0;
  private checking?: Promise<void>;
  private rerun = false;
  private downloading = false;
  private updating = false;
  private busy = false;
  private admitted = false;
  private pendingLock?: UpdateState["status"];
  private recovering = false;
  private graceUntil = 0;
  private graceTimer?: ReturnType<typeof setTimeout>;
  private receipt?: VerifiedApkReceipt;
  constructor(private deps: UpdateDependencies, private changed: (state: UpdateState) => void) {}
  private set(patch: Partial<UpdateState>) {
    if (this.closed) return;
    if (patch.status && patch.status !== "allowed" && this.state.status === "allowed" && this.protected()) {
      this.pendingLock = patch.status;
      patch = { ...patch, status: "allowed", deferred: true };
    }
    this.state = { ...this.state, ...patch }; this.changed(this.state);
  }
  private protected(): boolean { return this.busy || this.graceUntil > Date.now(); }
  setBusy(busy: boolean): void {
    if (this.closed || this.busy === busy) return;
    this.busy = busy;
    if (busy && this.state.status === "allowed" && this.recovering) {
      // The restored bridge now owns the real operation's lifetime.
      this.recovering = false; this.graceUntil = 0; clearTimeout(this.graceTimer);
    }
    if (!busy) this.finishDeferral();
  }
  private finishDeferral(): void {
    if (this.closed || this.protected() || !this.state.deferred) return;
    const status = this.state.release ? "required" : this.pendingLock ?? "checking";
    this.pendingLock = undefined;
    this.set({ status, deferred: false });
    if (status === "checking" && !this.checking) void this.check(true);
  }
  private async recover(identity: UpdateIdentity, release: AppRelease): Promise<boolean> {
    if (!this.deps.grace || (this.admitted && !this.recovering)) return false;
    const grace = await this.deps.grace(identity, release);
    const until = typeof grace?.deferUntil === "string" ? Date.parse(grace.deferUntil) : NaN;
    if (this.closed || !Number.isFinite(until) || until <= Date.now() || until > Date.now() + 24 * 60 * 60 * 1000 ||
      !Array.isArray(grace.activities) || !grace.activities.length || grace.activities.some(kind => kind !== "call" && kind !== "purchase")) return false;
    this.admitted = true; this.recovering = true; this.graceUntil = until; this.pendingLock = "required";
    clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => { this.graceUntil = 0; this.recovering = false; this.finishDeferral(); }, Math.max(0, until - Date.now()));
    this.set({ status: "allowed", deferred: true, release, error: undefined });
    return true;
  }
  async start(): Promise<void> {
    try {
      const installed = await this.deps.installed();
      if (!installed.supported || !Number.isSafeInteger(installed.versionCode) || installed.versionCode < 1) throw new Error("This build cannot install updates. Please install the latest BinzoLive build.");
      if (this.closed) return;
      this.deps.configure(installed); this.set({ installed });
      try {
        const cached = await this.deps.load(installed);
        if (cached?.updateRequired && cached.release) this.set({ status: "required", release: cached.release });
      } catch { /* A successful server check is still required. */ }
      await this.check();
    } catch (error) { this.set({ status: "error", checking: false, error: this.message(error) }); }
  }
  check(forceLock = false): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (forceLock && this.state.status === "allowed") this.set({ status: "checking", checking: true });
    if (this.checking) { if (forceLock) this.rerun = true; return this.checking; }
    const installed = this.state.installed;
    if (!installed) return this.start();
    this.set({ checking: true });
    this.checking = (async () => {
      try {
        const policy = await this.deps.check(installed);
        if (this.closed) return;
        if (!policy.updateRequired || !policy.release) {
          // A policy can never unlock an installed build below a previously verified minimum.
          if (this.state.release && installed.versionCode < this.state.release.versionCode) throw new Error("Couldn't confirm the required update. Please try again.");
          await this.deps.save(policy).catch(() => {});
          if (this.closed) return;
          this.admitted = true; this.pendingLock = undefined; this.recovering = false; this.graceUntil = 0; clearTimeout(this.graceTimer);
          this.set({ status: "allowed", deferred: false, phase: "idle", error: undefined, release: undefined });
          return;
        }
        const release = policy.release;
        if (this.state.release && release.versionCode < this.state.release.versionCode) throw new Error("The update server returned an older release. Please try again.");
        if (this.state.release?._id === release._id && (this.state.release.sha256 !== release.sha256 || this.state.release.versionCode !== release.versionCode || this.state.release.sizeBytes !== release.sizeBytes)) throw new Error("The required update details changed. Please try again.");
        if (this.state.release?._id !== release._id) {
          const previous = this.state.release;
          this.generation++; this.downloading = false; this.receipt = undefined;
          if (previous) void this.deps.cancel(previous._id, true).catch(() => {});
          this.set({ phase: "idle", progress: 0 });
        }
        let recovering = false;
        try { recovering = await this.recover(installed, release); } catch { /* No authenticated recovery proof: keep mandatory lock. */ }
        if (this.closed) return;
        if (!recovering) {
          if (this.recovering && !this.busy) { this.graceUntil = 0; this.recovering = false; clearTimeout(this.graceTimer); }
          this.set({ status: "required", release, error: undefined });
        }
        // Persist the required version even when an existing operation defers its UI.
        await this.deps.save(policy).catch(() => {});
        if (this.closed) return;
        if (!this.downloading) {
          const generation = this.generation;
          const receipt = await this.deps.receipt(release._id);
          if (this.closed || generation !== this.generation) return;
          if (receipt && receipt.versionCode === release.versionCode && receipt.sha256 === release.sha256 && receipt.sizeBytes === release.sizeBytes) {
            this.receipt = receipt;
            if (!["permission", "installer"].includes(this.state.phase)) this.set({ phase: "ready", progress: 1 });
          } else { this.receipt = undefined; this.set({ phase: "idle", progress: 0 }); }
        }
      } catch (error) {
        this.set({ status: this.state.release ? "required" : "error", error: this.message(error) });
      } finally {
        this.checking = undefined; this.set({ checking: false });
        if (this.rerun && !this.closed) { this.rerun = false; void this.check(true); }
      }
    })();
    return this.checking;
  }
  progress(event: ApkDownloadProgress): void {
    if (event.releaseId !== this.state.release?._id || !this.downloading) return;
    if (event.phase === "downloading" || event.phase === "verifying") this.set({ phase: event.phase, progress: Math.max(0, Math.min(1, event.totalBytes > 0 ? event.downloadedBytes / event.totalBytes : 0)) });
  }
  async update(): Promise<void> {
    if (this.closed || this.protected() || this.updating || this.downloading || this.checking) return;
    this.updating = true;
    try { await this.performUpdate(); } finally { this.updating = false; }
  }
  private async performUpdate(): Promise<void> {
    // Recheck at the user's tap so a superseded APK is never installed knowingly.
    await this.check();
    const release = this.state.release;
    if (this.closed || this.protected() || this.state.status !== "required" || !release || this.state.error) return;
    const generation = this.generation;
    try {
      if (!this.receipt) {
        this.downloading = true; this.set({ phase: "downloading", error: undefined });
        const receipt = await this.deps.download({ url: this.deps.url(release), releaseId: release._id, versionCode: release.versionCode, sha256: release.sha256, sizeBytes: release.sizeBytes });
        if (this.closed || generation !== this.generation) return;
        if (receipt.releaseId !== release._id || receipt.versionCode !== release.versionCode || receipt.sha256 !== release.sha256 || receipt.sizeBytes !== release.sizeBytes) throw new Error("The downloaded update could not be verified. Please retry.");
        this.receipt = receipt; this.set({ phase: "ready", progress: 1 });
      }
      this.downloading = false;
      await this.check();
      if (this.closed || this.protected() || this.state.status !== "required" || generation !== this.generation || this.state.error || !this.receipt) return;
      const result = await this.deps.install(this.receipt.receiptId);
      if (this.closed || generation !== this.generation) return;
      this.set({ phase: result.status === "permission_required" ? "permission" : "installer", error: undefined });
    } catch (error) {
      if (this.closed || generation !== this.generation) return;
      this.set({ phase: this.receipt ? "ready" : "idle", error: this.message(error) });
    } finally { if (generation === this.generation) this.downloading = false; }
  }
  close(): void { this.closed = true; this.generation++; clearTimeout(this.graceTimer); if (this.state.release) void this.deps.cancel(this.state.release._id).catch(() => {}); }
  private message(error: unknown): string { return error instanceof Error && error.message.length <= 500 ? error.message : "Couldn't check or install the app update. Please try again."; }
}
