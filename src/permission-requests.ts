/* Android can drop a permission request if another native dialog is open.
   Camera/microphone setup and Expo notifications share this device-wide queue. */
let pending: Promise<void> = Promise.resolve();
export function queuePermissionRequest<T>(request: () => Promise<T>): Promise<T> {
  const result = pending.then(request, request);
  pending = result.then(() => {}, () => {});
  return result;
}
