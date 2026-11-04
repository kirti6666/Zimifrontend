/* Android can keep an older System WebView after the app itself is updated.
   Install only the small built-ins used by the UI, before any app script runs. */
(function () {
  'use strict';
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      configurable: true, writable: true,
      value: function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
    });
  }
  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true, writable: true,
      value: function (index) {
        if (this == null) throw new TypeError('Array.at requires an array');
        var length = Math.min(Math.max(Math.trunc(Number(this.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
        var offset = Math.trunc(Number(index)) || 0;
        if (offset < 0) offset += length;
        return offset < 0 || offset >= length ? undefined : this[offset];
      }
    });
    if (Array.prototype[Symbol.unscopables]) Array.prototype[Symbol.unscopables].at = true;
  }
  if (window.crypto && typeof window.crypto.randomUUID !== 'function' && typeof window.crypto.getRandomValues === 'function') {
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true, writable: true,
      value: function () {
        // Payment, gift and chat retry identities keep platform-grade randomness.
        var bytes = window.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
      }
    });
  }
})();
