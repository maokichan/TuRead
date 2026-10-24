var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/spark-md5/spark-md5.js
var require_spark_md5 = __commonJS({
  "node_modules/spark-md5/spark-md5.js"(exports2, module2) {
    (function(factory) {
      if (typeof exports2 === "object") {
        module2.exports = factory();
      } else if (typeof define === "function" && define.amd) {
        define(factory);
      } else {
        var glob;
        try {
          glob = window;
        } catch (e) {
          glob = self;
        }
        glob.SparkMD5 = factory();
      }
    })(function(undefined2) {
      "use strict";
      var add32 = function(a, b) {
        return a + b & 4294967295;
      }, hex_chr = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
      function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32(a << s | a >>> 32 - s, b);
      }
      function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a += (b & c | ~b & d) + k[0] - 680876936 | 0;
        a = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[1] - 389564586 | 0;
        d = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[2] + 606105819 | 0;
        c = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[3] - 1044525330 | 0;
        b = (b << 22 | b >>> 10) + c | 0;
        a += (b & c | ~b & d) + k[4] - 176418897 | 0;
        a = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[5] + 1200080426 | 0;
        d = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[6] - 1473231341 | 0;
        c = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[7] - 45705983 | 0;
        b = (b << 22 | b >>> 10) + c | 0;
        a += (b & c | ~b & d) + k[8] + 1770035416 | 0;
        a = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[9] - 1958414417 | 0;
        d = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[10] - 42063 | 0;
        c = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[11] - 1990404162 | 0;
        b = (b << 22 | b >>> 10) + c | 0;
        a += (b & c | ~b & d) + k[12] + 1804603682 | 0;
        a = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[13] - 40341101 | 0;
        d = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[14] - 1502002290 | 0;
        c = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[15] + 1236535329 | 0;
        b = (b << 22 | b >>> 10) + c | 0;
        a += (b & d | c & ~d) + k[1] - 165796510 | 0;
        a = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[6] - 1069501632 | 0;
        d = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[11] + 643717713 | 0;
        c = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[0] - 373897302 | 0;
        b = (b << 20 | b >>> 12) + c | 0;
        a += (b & d | c & ~d) + k[5] - 701558691 | 0;
        a = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[10] + 38016083 | 0;
        d = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[15] - 660478335 | 0;
        c = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[4] - 405537848 | 0;
        b = (b << 20 | b >>> 12) + c | 0;
        a += (b & d | c & ~d) + k[9] + 568446438 | 0;
        a = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[14] - 1019803690 | 0;
        d = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[3] - 187363961 | 0;
        c = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[8] + 1163531501 | 0;
        b = (b << 20 | b >>> 12) + c | 0;
        a += (b & d | c & ~d) + k[13] - 1444681467 | 0;
        a = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[2] - 51403784 | 0;
        d = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[7] + 1735328473 | 0;
        c = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[12] - 1926607734 | 0;
        b = (b << 20 | b >>> 12) + c | 0;
        a += (b ^ c ^ d) + k[5] - 378558 | 0;
        a = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[8] - 2022574463 | 0;
        d = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[11] + 1839030562 | 0;
        c = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[14] - 35309556 | 0;
        b = (b << 23 | b >>> 9) + c | 0;
        a += (b ^ c ^ d) + k[1] - 1530992060 | 0;
        a = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[4] + 1272893353 | 0;
        d = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[7] - 155497632 | 0;
        c = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[10] - 1094730640 | 0;
        b = (b << 23 | b >>> 9) + c | 0;
        a += (b ^ c ^ d) + k[13] + 681279174 | 0;
        a = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[0] - 358537222 | 0;
        d = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[3] - 722521979 | 0;
        c = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[6] + 76029189 | 0;
        b = (b << 23 | b >>> 9) + c | 0;
        a += (b ^ c ^ d) + k[9] - 640364487 | 0;
        a = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[12] - 421815835 | 0;
        d = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[15] + 530742520 | 0;
        c = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[2] - 995338651 | 0;
        b = (b << 23 | b >>> 9) + c | 0;
        a += (c ^ (b | ~d)) + k[0] - 198630844 | 0;
        a = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[7] + 1126891415 | 0;
        d = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[14] - 1416354905 | 0;
        c = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[5] - 57434055 | 0;
        b = (b << 21 | b >>> 11) + c | 0;
        a += (c ^ (b | ~d)) + k[12] + 1700485571 | 0;
        a = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[3] - 1894986606 | 0;
        d = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[10] - 1051523 | 0;
        c = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[1] - 2054922799 | 0;
        b = (b << 21 | b >>> 11) + c | 0;
        a += (c ^ (b | ~d)) + k[8] + 1873313359 | 0;
        a = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[15] - 30611744 | 0;
        d = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[6] - 1560198380 | 0;
        c = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[13] + 1309151649 | 0;
        b = (b << 21 | b >>> 11) + c | 0;
        a += (c ^ (b | ~d)) + k[4] - 145523070 | 0;
        a = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[11] - 1120210379 | 0;
        d = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[2] + 718787259 | 0;
        c = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[9] - 343485551 | 0;
        b = (b << 21 | b >>> 11) + c | 0;
        x[0] = a + x[0] | 0;
        x[1] = b + x[1] | 0;
        x[2] = c + x[2] | 0;
        x[3] = d + x[3] | 0;
      }
      function md5blk(s) {
        var md5blks = [], i;
        for (i = 0; i < 64; i += 4) {
          md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
      }
      function md5blk_array(a) {
        var md5blks = [], i;
        for (i = 0; i < 64; i += 4) {
          md5blks[i >> 2] = a[i] + (a[i + 1] << 8) + (a[i + 2] << 16) + (a[i + 3] << 24);
        }
        return md5blks;
      }
      function md51(s) {
        var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i, length, tail, tmp, lo, hi;
        for (i = 64; i <= n; i += 64) {
          md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        length = s.length;
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < length; i += 1) {
          tail[i >> 2] |= s.charCodeAt(i) << (i % 4 << 3);
        }
        tail[i >> 2] |= 128 << (i % 4 << 3);
        if (i > 55) {
          md5cycle(state, tail);
          for (i = 0; i < 16; i += 1) {
            tail[i] = 0;
          }
        }
        tmp = n * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;
        tail[14] = lo;
        tail[15] = hi;
        md5cycle(state, tail);
        return state;
      }
      function md51_array(a) {
        var n = a.length, state = [1732584193, -271733879, -1732584194, 271733878], i, length, tail, tmp, lo, hi;
        for (i = 64; i <= n; i += 64) {
          md5cycle(state, md5blk_array(a.subarray(i - 64, i)));
        }
        a = i - 64 < n ? a.subarray(i - 64) : new Uint8Array(0);
        length = a.length;
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < length; i += 1) {
          tail[i >> 2] |= a[i] << (i % 4 << 3);
        }
        tail[i >> 2] |= 128 << (i % 4 << 3);
        if (i > 55) {
          md5cycle(state, tail);
          for (i = 0; i < 16; i += 1) {
            tail[i] = 0;
          }
        }
        tmp = n * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;
        tail[14] = lo;
        tail[15] = hi;
        md5cycle(state, tail);
        return state;
      }
      function rhex(n) {
        var s = "", j;
        for (j = 0; j < 4; j += 1) {
          s += hex_chr[n >> j * 8 + 4 & 15] + hex_chr[n >> j * 8 & 15];
        }
        return s;
      }
      function hex(x) {
        var i;
        for (i = 0; i < x.length; i += 1) {
          x[i] = rhex(x[i]);
        }
        return x.join("");
      }
      if (hex(md51("hello")) !== "5d41402abc4b2a76b9719d911017c592") {
        add32 = function(x, y) {
          var lsw = (x & 65535) + (y & 65535), msw = (x >> 16) + (y >> 16) + (lsw >> 16);
          return msw << 16 | lsw & 65535;
        };
      }
      if (typeof ArrayBuffer !== "undefined" && !ArrayBuffer.prototype.slice) {
        (function() {
          function clamp(val, length) {
            val = val | 0 || 0;
            if (val < 0) {
              return Math.max(val + length, 0);
            }
            return Math.min(val, length);
          }
          ArrayBuffer.prototype.slice = function(from, to) {
            var length = this.byteLength, begin = clamp(from, length), end = length, num, target, targetArray, sourceArray;
            if (to !== undefined2) {
              end = clamp(to, length);
            }
            if (begin > end) {
              return new ArrayBuffer(0);
            }
            num = end - begin;
            target = new ArrayBuffer(num);
            targetArray = new Uint8Array(target);
            sourceArray = new Uint8Array(this, begin, num);
            targetArray.set(sourceArray);
            return target;
          };
        })();
      }
      function toUtf8(str) {
        if (/[\u0080-\uFFFF]/.test(str)) {
          str = unescape(encodeURIComponent(str));
        }
        return str;
      }
      function utf8Str2ArrayBuffer(str, returnUInt8Array) {
        var length = str.length, buff = new ArrayBuffer(length), arr = new Uint8Array(buff), i;
        for (i = 0; i < length; i += 1) {
          arr[i] = str.charCodeAt(i);
        }
        return returnUInt8Array ? arr : buff;
      }
      function arrayBuffer2Utf8Str(buff) {
        return String.fromCharCode.apply(null, new Uint8Array(buff));
      }
      function concatenateArrayBuffers(first, second, returnUInt8Array) {
        var result = new Uint8Array(first.byteLength + second.byteLength);
        result.set(new Uint8Array(first));
        result.set(new Uint8Array(second), first.byteLength);
        return returnUInt8Array ? result : result.buffer;
      }
      function hexToBinaryString(hex2) {
        var bytes = [], length = hex2.length, x;
        for (x = 0; x < length - 1; x += 2) {
          bytes.push(parseInt(hex2.substr(x, 2), 16));
        }
        return String.fromCharCode.apply(String, bytes);
      }
      function SparkMD52() {
        this.reset();
      }
      SparkMD52.prototype.append = function(str) {
        this.appendBinary(toUtf8(str));
        return this;
      };
      SparkMD52.prototype.appendBinary = function(contents) {
        this._buff += contents;
        this._length += contents.length;
        var length = this._buff.length, i;
        for (i = 64; i <= length; i += 64) {
          md5cycle(this._hash, md5blk(this._buff.substring(i - 64, i)));
        }
        this._buff = this._buff.substring(i - 64);
        return this;
      };
      SparkMD52.prototype.end = function(raw) {
        var buff = this._buff, length = buff.length, i, tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ret;
        for (i = 0; i < length; i += 1) {
          tail[i >> 2] |= buff.charCodeAt(i) << (i % 4 << 3);
        }
        this._finish(tail, length);
        ret = hex(this._hash);
        if (raw) {
          ret = hexToBinaryString(ret);
        }
        this.reset();
        return ret;
      };
      SparkMD52.prototype.reset = function() {
        this._buff = "";
        this._length = 0;
        this._hash = [1732584193, -271733879, -1732584194, 271733878];
        return this;
      };
      SparkMD52.prototype.getState = function() {
        return {
          buff: this._buff,
          length: this._length,
          hash: this._hash.slice()
        };
      };
      SparkMD52.prototype.setState = function(state) {
        this._buff = state.buff;
        this._length = state.length;
        this._hash = state.hash;
        return this;
      };
      SparkMD52.prototype.destroy = function() {
        delete this._hash;
        delete this._buff;
        delete this._length;
      };
      SparkMD52.prototype._finish = function(tail, length) {
        var i = length, tmp, lo, hi;
        tail[i >> 2] |= 128 << (i % 4 << 3);
        if (i > 55) {
          md5cycle(this._hash, tail);
          for (i = 0; i < 16; i += 1) {
            tail[i] = 0;
          }
        }
        tmp = this._length * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;
        tail[14] = lo;
        tail[15] = hi;
        md5cycle(this._hash, tail);
      };
      SparkMD52.hash = function(str, raw) {
        return SparkMD52.hashBinary(toUtf8(str), raw);
      };
      SparkMD52.hashBinary = function(content, raw) {
        var hash = md51(content), ret = hex(hash);
        return raw ? hexToBinaryString(ret) : ret;
      };
      SparkMD52.ArrayBuffer = function() {
        this.reset();
      };
      SparkMD52.ArrayBuffer.prototype.append = function(arr) {
        var buff = concatenateArrayBuffers(this._buff.buffer, arr, true), length = buff.length, i;
        this._length += arr.byteLength;
        for (i = 64; i <= length; i += 64) {
          md5cycle(this._hash, md5blk_array(buff.subarray(i - 64, i)));
        }
        this._buff = i - 64 < length ? new Uint8Array(buff.buffer.slice(i - 64)) : new Uint8Array(0);
        return this;
      };
      SparkMD52.ArrayBuffer.prototype.end = function(raw) {
        var buff = this._buff, length = buff.length, tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], i, ret;
        for (i = 0; i < length; i += 1) {
          tail[i >> 2] |= buff[i] << (i % 4 << 3);
        }
        this._finish(tail, length);
        ret = hex(this._hash);
        if (raw) {
          ret = hexToBinaryString(ret);
        }
        this.reset();
        return ret;
      };
      SparkMD52.ArrayBuffer.prototype.reset = function() {
        this._buff = new Uint8Array(0);
        this._length = 0;
        this._hash = [1732584193, -271733879, -1732584194, 271733878];
        return this;
      };
      SparkMD52.ArrayBuffer.prototype.getState = function() {
        var state = SparkMD52.prototype.getState.call(this);
        state.buff = arrayBuffer2Utf8Str(state.buff);
        return state;
      };
      SparkMD52.ArrayBuffer.prototype.setState = function(state) {
        state.buff = utf8Str2ArrayBuffer(state.buff, true);
        return SparkMD52.prototype.setState.call(this, state);
      };
      SparkMD52.ArrayBuffer.prototype.destroy = SparkMD52.prototype.destroy;
      SparkMD52.ArrayBuffer.prototype._finish = SparkMD52.prototype._finish;
      SparkMD52.ArrayBuffer.hash = function(arr, raw) {
        var hash = md51_array(new Uint8Array(arr)), ret = hex(hash);
        return raw ? hexToBinaryString(ret) : ret;
      };
      return SparkMD52;
    });
  }
});

// src/core/ports/emitter.ts
var TypedEmitter = class {
  listeners = /* @__PURE__ */ new Map();
  on(event, listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }
  off(event, listener) {
    this.listeners.get(event)?.delete(listener);
  }
  emit(event, ...args) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const l of [...set]) {
      ;
      l(...args);
    }
  }
  removeAll() {
    this.listeners.clear();
  }
};

// src/core/domain/format.ts
var EXT_TO_FORMAT = {
  epub: "EPUB",
  pdf: "PDF",
  mobi: "MOBI",
  azw3: "AZW3",
  azw: "AZW",
  txt: "TXT",
  md: "MD",
  fb2: "FB2",
  docx: "DOCX",
  html: "HTML",
  mhtml: "MHTML",
  xml: "XML",
  cbz: "CBZ",
  cbr: "CBR",
  cbt: "CBT",
  cb7: "CB7"
};
function extToFormat(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_FORMAT[ext] ?? "TXT";
}

// src/core/domain/location.ts
function normalizeLocation(raw) {
  return {
    chapterDocIndex: toNonNegativeInt(raw?.chapterDocIndex),
    chapterHref: raw?.chapterHref ?? "",
    count: toNonNegativeInt(raw?.count),
    page: toNonNegativeInt(raw?.page),
    percentage: clamp01(Number(raw?.percentage) || 0),
    text: raw?.text ?? "",
    chapterTitle: raw?.chapterTitle ?? void 0
  };
}
function locationKey(loc, format) {
  const n = normalizeLocation(loc);
  return format === "PDF" ? `pdf:p${n.page}` : `text:c${n.chapterDocIndex}.${n.count}`;
}
function sameLocation(a, b, format) {
  return locationKey(a, format) === locationKey(b, format);
}
function toNonNegativeInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

// src/core/domain/protocol.ts
var ROOM_MSG = {
  /** client → server：加入房间（上报指纹标定） */
  join: "room.join",
  /** server → client：加入结果（ok / reason / edition / members 全量快照） */
  joinAck: "room.join-ack",
  /** client → server：位置上报（只同步状态，不转发翻页动作） */
  location: "room.location",
  /** server → 房间其他人：成员全量快照（含每人位置） */
  presence: "room.presence",
  /** client → server：发送聊天 */
  chat: "room.chat",
  /** server → 房间**全部**成员（含发送者）：聊天广播（server 权威回执） */
  message: "room.message",
  /** server → client：系统消息（已定义未发送） */
  system: "room.system",
  /** server → client：书籍不匹配（已定义未发送，当前走 join-ack 的 reason） */
  bookMismatch: "room.book-mismatch"
};
var MAX_NICK_LEN = 12;
function isValidNick(nick) {
  const n = (nick ?? "").trim();
  return n.length > 0 && Array.from(n).length <= MAX_NICK_LEN;
}
function normalizeJoinReason(reason) {
  const r = (reason ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  switch (r) {
    case "book-mismatch":
      return "book-mismatch";
    case "room-not-found":
      return "room-not-found";
    case "room-full":
      return "room-full";
    default:
      return "server-error";
  }
}
function buildRoomWsUrl(serverUrl, roomId, nick) {
  const u = new URL(serverUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = new URLSearchParams({ room: roomId, nick }).toString();
  return u.toString();
}
function clampChatHistoryLimit(limit) {
  if (limit == null || !Number.isFinite(limit)) return 50;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}
function buildChatHistoryPath(roomId, opts) {
  const q = new URLSearchParams();
  if (opts?.after != null && opts.after > 0) q.set("after", String(Math.floor(opts.after)));
  q.set("limit", String(clampChatHistoryLimit(opts?.limit)));
  return `/rooms/${encodeURIComponent(roomId)}/messages?${q.toString()}`;
}
function isChatMessage(value) {
  if (!value || typeof value !== "object") return false;
  const m = value;
  return typeof m.id === "number" && Number.isFinite(m.id) && typeof m.text === "string" && typeof m.createdAt === "number" && Number.isFinite(m.createdAt);
}
function normalizePresenceMembers(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.members;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m) => !!m && typeof m === "object" && typeof m.id === "string" && typeof m.nickName === "string"
  );
}

// src/core/usecases/RoomSession.ts
var LOCATION_THROTTLE_MS = 300;
var JOIN_TIMEOUT_MS = 1e4;
var CHAT_HISTORY_LIMIT = 50;
var RoomSession = class extends TypedEmitter {
  net;
  render;
  identity;
  state = null;
  myId = null;
  /** 当前房间（与 net 侧的房间连接同生命周期） */
  roomId = null;
  /** 已加入房间绑定的书（格式用于 presence diff 选位置 key；指纹用于断线重连后重发 room.join） */
  joinedBook = null;
  joinedFormat = null;
  /**
   * 房间标定指纹（审计 B-2）：带书加入 = 本书指纹；无书加入 = join-ack 的 edition 指纹。
   * `location-changed` 是渲染端口的全局事件 —— 上报前必须校验"当前打开的书 ≡ 房间的书"，
   * 判据与服务器标定同口径（`identity.verify`：algorithm+hash+size 全等）。
   */
  roomFingerprint = null;
  /** 是否已在本房间完成标定（join-ack ok）—— 重连后据此决定要不要重发 join */
  joined = false;
  /** 各成员的最近一次位置基线（server 用 presence 全量快照推位置 → 本侧 diff 才 emit location-updated） */
  memberLocs = /* @__PURE__ */ new Map();
  /** 已收到的最后一条聊天 id（重连后 `after=` 增量补拉的锚） */
  lastChatId = 0;
  /** 生命周期订阅：构造期（net）常驻，随实例销毁；joinRoom 期（render）随 leaveRoom 解绑 */
  netUnsubs = [];
  joinUnsubs = [];
  /**
   * join 等待槽（v0.4.3 修 TODO P2「单槽覆盖式赋值」）：**单槽 + 代次** ——
   * 并发 join 时旧的那次立即以 `server-error` 结束（而不是被覆盖后永久挂起），只有最新一次等 ack。
   */
  pendingJoin = null;
  joinGen = 0;
  joinTimer = null;
  /** joinRoom 调用代次（审计 C-2）：大厅快速连点两个房间 = 并发 join —— 旧的那次在每个
   *  await 恢复点作废自己（返回 `superseded`），不得再碰共享状态或触发失败清理路径。 */
  joinCallGen = 0;
  lastSentAt = 0;
  pendingEmit = null;
  emitTimer = null;
  constructor(net, render, identity) {
    super();
    this.net = net;
    this.render = render;
    this.identity = identity;
    this.netUnsubs.push(
      net.on("message", (env) => this.handleEnvelope(env)),
      net.on("connection-changed", (s) => {
        this.emit("connection-changed", s);
        if (s === "connected" && this.joined && this.roomId) {
          void this.rejoin();
        } else if (s === "failed" && this.joined) {
          void this.leaveRoom().then(() => {
            this.emit("system-message", {
              type: "error",
              text: "\u91CD\u9023\u591A\u6B21\u5931\u6557\uFF0C\u5DF2\u96E2\u958B\u623F\u9593\uFF08\u6AA2\u67E5\u7DB2\u8DEF\u5F8C\u53EF\u91CD\u65B0\u9032\u5165\uFF09"
            });
          });
        }
      })
    );
  }
  async joinRoom(roomId, book, lastLocation) {
    const gen = ++this.joinCallGen;
    const superseded = () => ({ ok: false, reason: "superseded" });
    if (this.roomId) await this.leaveRoom();
    if (gen !== this.joinCallGen) return superseded();
    const rid = roomId.trim().toLowerCase();
    if (!rid) return { ok: false, reason: "room-not-found" };
    this.myId = await this.net.getMemberId();
    if (gen !== this.joinCallGen) return superseded();
    this.joinedBook = book;
    this.joinedFormat = book ? book.format : null;
    this.roomId = rid;
    this.lastChatId = 0;
    try {
      await this.net.openRoom(rid);
    } catch (err) {
      if (gen !== this.joinCallGen) return superseded();
      this.resetJoinState();
      this.emit("system-message", {
        type: "error",
        text: `\u9023\u63A5\u623F\u9593\u5931\u6557\uFF1A${err.message}`
      });
      return { ok: false, reason: "server-error" };
    }
    if (gen !== this.joinCallGen) return superseded();
    const ack = await this.sendJoin();
    if (gen !== this.joinCallGen) return superseded();
    if (!ack || !ack.ok) {
      const reason = normalizeJoinReason(ack?.reason);
      if (reason === "book-mismatch" && ack?.edition && book) {
        this.emit("book-mismatch", {
          local: book.fingerprint,
          room: {
            algorithm: "md5-sample3-v1",
            hash: ack.edition.hash,
            size: ack.edition.size
          }
        });
      }
      await this.net.closeRoom();
      this.resetJoinState();
      return { ok: false, reason };
    }
    const members = (ack.members ?? []).map((m) => this.decorateMe(m));
    if (!this.joinedFormat && ack.edition?.ext) this.joinedFormat = extToFormat(`x.${ack.edition.ext}`);
    this.roomFingerprint = book ? book.fingerprint : ack.edition ? {
      algorithm: ack.edition.hashAlgo ?? "md5-sample3-v1",
      hash: ack.edition.hash,
      size: ack.edition.size
    } : null;
    this.state = {
      roomId: ack.roomId ?? rid,
      bookId: ack.edition ? String(ack.edition.id) : void 0,
      edition: ack.edition,
      members,
      currentLocation: lastLocation ?? null
    };
    this.joined = true;
    this.seedMemberLocs(members);
    this.joinUnsubs.push(this.render.on("location-changed", (loc) => this.onRenderLocation(loc)));
    this.emit("presence-updated", members);
    await this.loadHistory(0, () => gen === this.joinCallGen);
    if (gen !== this.joinCallGen) return superseded();
    return { ok: true, room: this.state };
  }
  async leaveRoom() {
    this.joinUnsubs.forEach((u) => u());
    this.joinUnsubs = [];
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.pendingEmit = null;
    this.clearPendingJoin();
    this.resetJoinState();
    await this.net.closeRoom();
  }
  async emitLocation(location) {
    if (!this.isOpenBookTheRoomsBook()) return;
    const loc = location ?? this.render.getPosition();
    this.throttleSend(loc);
  }
  async sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!this.joined) throw new Error("\u5C1A\u672A\u52A0\u5165\u623F\u9593");
    await this.net.send({ type: ROOM_MSG.chat, payload: { text: trimmed } });
  }
  async listMessages(roomId, opts) {
    const res = await this.net.request({
      method: "GET",
      path: buildChatHistoryPath(roomId, opts)
    });
    if (!res.ok) throw new Error(`\u62C9\u53D6\u804A\u5929\u6B77\u53F2\u5931\u6557\uFF1A${JSON.stringify(res.data)}`);
    const list = res.data?.messages;
    if (!Array.isArray(list)) return [];
    return list.filter(isChatMessage).sort((a, b) => a.id - b.id);
  }
  getRoomState() {
    return this.state;
  }
  getMyMemberId() {
    return this.myId;
  }
  async createRoom(book, owner) {
    const res = await this.net.request({
      method: "POST",
      path: "/rooms",
      body: {
        owner,
        book: {
          protocol: "content-hash-v1",
          code: book.fingerprint.hash,
          title: book.metadata.title,
          ext: book.format.toLowerCase(),
          hashAlgo: book.fingerprint.algorithm,
          hash: book.fingerprint.hash,
          size: book.fingerprint.size
        }
      }
    });
    if (!res.ok) throw new Error(`\u521B\u5EFA\u623F\u95F4\u5931\u8D25: ${JSON.stringify(res.data)}`);
    return res.data;
  }
  async uploadBookCopy(editionId, buffer) {
    const res = await this.net.request({
      method: "POST",
      path: `/books/${editionId}/file`,
      body: buffer,
      rawBody: true,
      responseType: "text"
    });
    if (!res.ok) throw new Error(`\u4E0A\u4F20\u526F\u672C\u5931\u8D25: ${JSON.stringify(res.data)}`);
  }
  async downloadBookCopy(editionId) {
    const res = await this.net.request({
      method: "GET",
      path: `/books/${editionId}/file`,
      responseType: "arraybuffer"
    });
    if (!res.ok) {
      const detail = typeof res.data === "string" || res.data == null ? String(res.data ?? "") : JSON.stringify(res.data);
      throw new Error(`\u4E0B\u8F7D\u526F\u672C\u5931\u8D25\uFF08HTTP ${res.status}\uFF09${detail ? `\uFF1A${detail.slice(0, 120)}` : ""}`);
    }
    return res.data;
  }
  async listRooms(editionId) {
    const q = editionId != null ? `?edition=${editionId}` : "";
    const res = await this.net.request({
      method: "GET",
      path: `/rooms${q}`
    });
    if (!res.ok) throw new Error(`\u62C9\u53D6\u623F\u95F4\u5217\u8868\u5931\u8D25: ${JSON.stringify(res.data)}`);
    return res.data.rooms;
  }
  /** 发 room.join 并等 join-ack（带超时 + 单槽代次，见 pendingJoin 注释） */
  async sendJoin() {
    const gen = ++this.joinGen;
    this.clearPendingJoin();
    const wait = new Promise((resolve) => {
      this.pendingJoin = { gen, resolve };
      this.joinTimer = setTimeout(() => {
        if (this.pendingJoin?.gen === gen) {
          this.pendingJoin = null;
          this.joinTimer = null;
          resolve(null);
        }
      }, JOIN_TIMEOUT_MS);
    });
    try {
      await this.net.send({
        type: ROOM_MSG.join,
        // 无书成员（joinedBook = null）= fingerprint: null —— 服务器允许加入并返回 edition
        // 供下载（API.md「room.join」；CONTRACTS v0.4.4）。⚠ 审计 A-1：此前的 `!joinedBook`
        // 守卫让"带 null 指纹的 room.join"永远发不出去，与契约背离的死代码，2026-10-03 摘除。
        payload: { fingerprint: this.joinedBook?.fingerprint ?? null }
      });
    } catch (err) {
      this.clearPendingJoin();
      this.emit("system-message", { type: "error", text: `\u767C\u9001\u52A0\u5165\u8ACB\u6C42\u5931\u6557\uFF1A${err.message}` });
      return null;
    }
    return wait;
  }
  clearPendingJoin() {
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.joinTimer = null;
    if (this.pendingJoin) {
      this.pendingJoin.resolve(null);
      this.pendingJoin = null;
    }
  }
  resetJoinState() {
    this.state = null;
    this.myId = null;
    this.roomId = null;
    this.joined = false;
    this.joinedBook = null;
    this.joinedFormat = null;
    this.roomFingerprint = null;
    this.memberLocs.clear();
  }
  /** 断线重连后重发 join（服务器侧成员表已随旧连接消失）；无书成员同样要重入（审计 A-1） */
  async rejoin() {
    if (!this.roomId) return;
    const ack = await this.sendJoin();
    const reason = normalizeJoinReason(ack?.reason);
    if (!ack || !ack.ok) {
      this.emit("system-message", {
        type: "error",
        text: `\u91CD\u9023\u5F8C\u91CD\u65B0\u52A0\u5165\u5931\u6557\uFF1A${reason}`
      });
      return;
    }
    const members = (ack.members ?? []).map((m) => this.decorateMe(m));
    this.state = this.state ? { ...this.state, members } : null;
    this.joined = true;
    this.seedMemberLocs(members);
    this.emit("presence-updated", members);
    await this.loadHistory(this.lastChatId);
  }
  /** 拉聊天历史：after=0 = 加入时的最近一页；after=lastChatId = 重连增量。
   *  isCurrent（审计 C-2）：并发 join 落败方的在途请求回来时不入账（lastChatId 是新会话的补拉锚，
   *  旧会话的历史也不能 emit 进新会话的共享态）。 */
  async loadHistory(after = 0, isCurrent) {
    if (!this.roomId) return;
    try {
      const msgs = await this.listMessages(this.roomId, { after, limit: CHAT_HISTORY_LIMIT });
      if (isCurrent && !isCurrent()) return;
      if (msgs.length === 0) return;
      this.lastChatId = Math.max(this.lastChatId, ...msgs.map((m) => m.id));
      this.emit("chat-history", msgs);
    } catch (err) {
      if (isCurrent && !isCurrent()) return;
      this.emit("system-message", { type: "error", text: `\u62C9\u53D6\u804A\u5929\u6B77\u53F2\u5931\u6557\uFF1A${err.message}` });
    }
  }
  decorateMe(m) {
    const normalized = m.location ? { ...m, location: normalizeLocation(m.location) } : m;
    return this.myId ? { ...normalized, isMe: normalized.id === this.myId } : normalized;
  }
  /** join-ack members 作为 presence diff 基线：记录各成员归一化位置 */
  seedMemberLocs(members) {
    this.memberLocs.clear();
    for (const m of members) {
      if (m.location) this.memberLocs.set(m.id, normalizeLocation(m.location));
    }
  }
  /**
   * 远端位置派生（v0.2.4 修复"location-updated 死端口"）：
   * server 不单独下发 room.location 信封，而是广播 room.presence 全量快照（含每人位置）。
   * 本侧以 join-ack 为基线、逐次 presence 快照 diff：某成员位置变化才 emit location-updated。
   * 位置一律先归一、比较走 sameLocation（定位系统纪律：不自行解释字段）。
   */
  deriveRemoteLocations(members) {
    if (!this.joinedFormat) return;
    for (const m of members) {
      if (m.isMe || !m.location) continue;
      const loc = normalizeLocation(m.location);
      const prev = this.memberLocs.get(m.id);
      if (!prev || !sameLocation(prev, loc, this.joinedFormat)) {
        this.memberLocs.set(m.id, loc);
        this.emit("location-updated", loc, m);
      }
    }
    const live = new Set(members.map((m) => m.id));
    for (const id of this.memberLocs.keys()) {
      if (!live.has(id)) this.memberLocs.delete(id);
    }
  }
  handleEnvelope(env) {
    switch (env.type) {
      case ROOM_MSG.joinAck: {
        if (this.pendingJoin) {
          const pending = this.pendingJoin;
          this.pendingJoin = null;
          if (this.joinTimer) {
            clearTimeout(this.joinTimer);
            this.joinTimer = null;
          }
          pending.resolve(env.payload);
        }
        break;
      }
      case ROOM_MSG.presence: {
        const members = normalizePresenceMembers(env.payload).map((m) => this.decorateMe(m));
        if (this.state) this.state = { ...this.state, members };
        this.emit("presence-updated", members);
        this.deriveRemoteLocations(members);
        break;
      }
      case ROOM_MSG.message: {
        const msg = env.payload;
        if (!isChatMessage(msg)) break;
        if (msg.id > this.lastChatId) this.lastChatId = msg.id;
        this.emit("chat-message", msg);
        break;
      }
      case ROOM_MSG.system: {
        this.emit("system-message", env.payload);
        break;
      }
      case ROOM_MSG.bookMismatch: {
        const p = env.payload;
        if (p.local && p.room) this.emit("book-mismatch", { local: p.local, room: p.room });
        break;
      }
      default:
        break;
    }
  }
  /**
   * 审计 B-2：`location-changed` 是渲染端口的全局事件，在 A 书的房间里打开 B 书会把
   * B 的位置广播进 A 房。上报前校验"当前打开的书 ≡ 房间标定的那本"（指纹口径与服务器一致）。
   * 渲染未打开任何书（书还没开/已关）时同样不上报 —— 没有可验证的归属。
   */
  isOpenBookTheRoomsBook() {
    if (!this.roomFingerprint) return false;
    const open = this.render.getOpenBook();
    if (!open) return false;
    return this.identity.verify(open.fingerprint, this.roomFingerprint);
  }
  onRenderLocation(loc) {
    if (!this.state) return;
    if (!this.isOpenBookTheRoomsBook()) return;
    this.state = { ...this.state, currentLocation: loc };
    this.throttleSend(loc);
  }
  /** 节流：300ms 窗口内最多发一次，末尾补齐 */
  throttleSend(loc) {
    const now = Date.now();
    const since = now - this.lastSentAt;
    if (since >= LOCATION_THROTTLE_MS) {
      this.lastSentAt = now;
      void this.net.send({ type: ROOM_MSG.location, payload: { location: loc } }).catch(() => {
      });
    } else {
      this.pendingEmit = loc;
      if (this.emitTimer) clearTimeout(this.emitTimer);
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null;
        if (this.pendingEmit) {
          this.lastSentAt = Date.now();
          void this.net.send({ type: ROOM_MSG.location, payload: { location: this.pendingEmit } }).catch(() => {
          });
          this.pendingEmit = null;
        }
      }, LOCATION_THROTTLE_MS - since);
    }
  }
};

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// src/main/net/wsNetAdapter.ts
var RECONNECT_DELAY_MS = 2e3;
var MAX_RECONNECT_ATTEMPTS = 5;
var REST_TIMEOUT_MS = 15e3;
var OPEN_TIMEOUT_MS = 15e3;
var WsNetAdapter = class extends TypedEmitter {
  config = null;
  memberToken = null;
  /** 当前房间（`openRoom` 成功时置，`closeRoom` 清）—— 重连时用它重建同一条握手地址 */
  roomId = null;
  ws = null;
  /** 在途握手（审计 A-2）：teardown/invalidate 作废 socket 时必须 reject 它，否则调用链永久挂起 */
  pendingOpen = null;
  explicitlyClosed = false;
  reconnectAttempts = 0;
  reconnectTimer = null;
  /** 审计 C-4：最近一次广播的连接状态 —— 状态未变不重复广播（closeRoom/connect 等路径的冗余事件是噪声） */
  lastState = null;
  get baseUrl() {
    return this.config?.serverUrl ?? "";
  }
  get accessToken() {
    return this.config?.accessToken ?? "";
  }
  /** 建立会话：只申请/复用成员 token（不建 WS） */
  async connect(config) {
    await this.closeRoom();
    this.lastState = null;
    this.config = config;
    const devToken = process.env["TUREAD_DEV_MEMBER_TOKEN"];
    if (devToken) {
      this.memberToken = devToken;
    } else if (config.memberToken) {
      this.memberToken = config.memberToken;
    } else {
      this.memberToken = await this.ensureMemberToken();
    }
  }
  async openRoom(roomId) {
    if (!this.config) throw new Error("\u5C1A\u672A\u5EFA\u7ACB\u4F1A\u8BDD\uFF08\u5148 connect\uFF09");
    const room = roomId.trim().toLowerCase();
    if (!room) throw new Error("\u623F\u95F4\u53F7\u4E3A\u7A7A");
    const nick = (this.config.nickName ?? "").trim();
    if (!isValidNick(nick)) {
      throw new Error(`\u6635\u79F0\u9700\u4E3A 1~${MAX_NICK_LEN} \u4E2A\u5B57\uFF08\u5F53\u524D ${Array.from(nick).length} \u4E2A\uFF09`);
    }
    if (this.roomId === room && this.ws && this.ws.readyState === wrapper_default.OPEN) return;
    this.teardownSocket();
    this.roomId = room;
    this.reconnectAttempts = 0;
    this.explicitlyClosed = false;
    await this.openSocket();
  }
  async closeRoom() {
    this.explicitlyClosed = true;
    this.roomId = null;
    this.teardownSocket();
    this.emitState("disconnected");
  }
  async disconnect() {
    await this.closeRoom();
    this.config = null;
    this.memberToken = null;
  }
  async send(envelope) {
    if (!this.ws || this.ws.readyState !== wrapper_default.OPEN) {
      throw new Error("\u672A\u8FDE\u63A5\uFF08WebSocket \u672A\u6253\u5F00\uFF09");
    }
    this.ws.send(JSON.stringify(envelope));
  }
  /** v0.4.9：对齐端口签名（INetService 声明 Promise —— 此前同步返回，机器人直连适配器时 typecheck 才暴露） */
  async getMemberId() {
    return this.memberToken;
  }
  async request(options) {
    const url = `${this.baseUrl}${options.path}`;
    const headers = {
      "X-Turead-Access": this.accessToken
    };
    if (this.memberToken) headers["Authorization"] = `Bearer ${this.memberToken}`;
    let body;
    if (options.body != null) {
      if (options.rawBody) {
        body = options.body;
        headers["Content-Type"] = "application/octet-stream";
      } else {
        body = JSON.stringify(options.body);
        headers["Content-Type"] = "application/json";
      }
    }
    const res = await fetch(url, { method: options.method, headers, body, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    let data;
    if (res.status === 204) {
      data = void 0;
    } else if (options.responseType === "arraybuffer") {
      data = await res.arrayBuffer();
    } else if (options.responseType === "text") {
      data = await res.text();
    } else {
      const raw = await res.text();
      try {
        data = raw === "" ? void 0 : JSON.parse(raw);
      } catch {
        throw new Error(
          `\u54CD\u5E94\u4E0D\u662F JSON\uFF08HTTP ${res.status}\uFF09\uFF1A${raw.slice(0, 200) || "<\u7A7A\u54CD\u5E94\u4F53>"}`
        );
      }
    }
    return { status: res.status, ok: res.ok, data };
  }
  async ensureMemberToken() {
    const res = await fetch(`${this.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "X-Turead-Access": this.accessToken },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS)
    });
    if (!res.ok) {
      throw new Error(`\u7B7E\u53D1\u6210\u5458 token \u5931\u8D25\uFF08HTTP ${res.status}\uFF09\uFF1A\u8BF7\u68C0\u67E5\u670D\u52A1\u5668\u5730\u5740\u4E0E\u4E8C\u7EA7\u4EE4\u724C`);
    }
    const data = await res.json();
    return data.token;
  }
  /** 清掉连接与重连计时器（幂等；不清 roomId/config） */
  teardownSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    const pending = this.pendingOpen;
    this.pendingOpen = null;
    if (ws) {
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {
      }
    }
    pending?.reject(new Error("\u8FDE\u63A5\u5DF2\u4F5C\u5E9F\uFF08\u8FDE\u63A5\u88AB\u5173\u95ED/\u91CD\u5EFA\uFF09"));
  }
  /** 作废某条连接：摘掉监听并关闭（其 close 不再触发，因此不会续连） */
  invalidateSocket(ws) {
    if (this.ws === ws) this.ws = null;
    const pending = this.pendingOpen?.ws === ws ? this.pendingOpen : null;
    this.pendingOpen = null;
    ws.removeAllListeners();
    try {
      ws.close();
    } catch {
    }
    pending?.reject(new Error("\u8FDE\u63A5\u5DF2\u4F5C\u5E9F\uFF08\u88AB\u66F4\u65B0\u7684\u8FDE\u63A5\u53D6\u4EE3\uFF09"));
  }
  openSocket() {
    return new Promise((resolve, reject) => {
      if (!this.config || !this.roomId) return reject(new Error("\u65E0\u8FDE\u63A5\u914D\u7F6E"));
      const url = buildRoomWsUrl(this.config.serverUrl, this.roomId, (this.config.nickName ?? "").trim());
      const ws = new wrapper_default(url, {
        headers: {
          "X-Turead-Access": this.accessToken,
          Authorization: `Bearer ${this.memberToken ?? ""}`
        }
      });
      this.ws = ws;
      this.pendingOpen = { ws, reject };
      let opened = false;
      const openTimer = setTimeout(() => {
        if (opened) return;
        this.invalidateSocket(ws);
        reject(new Error(`\u8FDE\u63A5\u8D85\u65F6\uFF08${OPEN_TIMEOUT_MS / 1e3}s \u5185\u63E1\u624B\u672A\u5B8C\u6210\uFF09`));
      }, OPEN_TIMEOUT_MS);
      ws.on("open", () => {
        opened = true;
        clearTimeout(openTimer);
        this.pendingOpen = null;
        this.reconnectAttempts = 0;
        this.emitState("connected");
        resolve();
      });
      ws.on("message", (raw) => {
        try {
          this.emit("message", JSON.parse(String(raw)));
        } catch {
        }
      });
      ws.on("error", (err) => {
        if (opened) return;
        clearTimeout(openTimer);
        if (this.pendingOpen?.ws === ws) this.pendingOpen = null;
        this.invalidateSocket(ws);
        reject(err);
      });
      ws.on("close", () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.explicitlyClosed || !opened) {
          this.emitState("disconnected");
          return;
        }
        this.scheduleReconnect();
      });
    });
  }
  /** 断线自动重连（只对"曾经连上过"的房间连接；握手失败/主动关闭不重连） */
  scheduleReconnect() {
    if (this.explicitlyClosed || !this.roomId) {
      this.emitState("disconnected");
      return;
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emitState("failed");
      return;
    }
    this.emitState("reconnecting");
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.explicitlyClosed || !this.roomId) return;
      this.openSocket().catch(() => this.scheduleReconnect());
    }, RECONNECT_DELAY_MS);
  }
  emitState(state) {
    if (this.lastState === state) return;
    this.lastState = state;
    this.emit("connection-changed", state);
  }
};

// src/core/adapters/identity/fingerprint.ts
var import_spark_md5 = __toESM(require_spark_md5());
var SAMPLE_SIZE = 64 * 1024;
function computeSample3Md5(buffer) {
  const bytes = new Uint8Array(buffer);
  const size = bytes.byteLength;
  const head = bytes.subarray(0, SAMPLE_SIZE);
  const midStart = Math.floor(size / 2);
  const mid = bytes.subarray(midStart, midStart + SAMPLE_SIZE);
  const tailStart = Math.max(0, size - SAMPLE_SIZE);
  const tail = bytes.subarray(tailStart);
  const combined = new Uint8Array(head.byteLength + mid.byteLength + tail.byteLength);
  combined.set(head, 0);
  combined.set(mid, head.byteLength);
  combined.set(tail, head.byteLength + mid.byteLength);
  const hash = import_spark_md5.default.ArrayBuffer.hash(combined.buffer);
  return { hash, size };
}
var FingerprintService = class {
  computeFingerprint(buffer) {
    const { hash, size } = computeSample3Md5(buffer);
    return Promise.resolve({ algorithm: "md5-sample3-v1", hash, size });
  }
  /** 元数据提取：骨架阶段从文件名推导 title，结构化字段（epub/fb2）后续交给 kookit 解析。 */
  extractMetadata(_buffer, _format, name) {
    const title = stripExtension(name) || "\u672A\u547D\u540D";
    return Promise.resolve({ title });
  }
  verify(local, room) {
    return local.algorithm === room.algorithm && local.hash === room.hash && local.size === room.size;
  }
};
function stripExtension(name) {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(0, idx) : base;
}

// tools/swarm/roombot.ts
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? String(process.argv[i + 1]) : fallback;
}
function argNum(name, fallback) {
  const v = parseInt(arg(name, ""), 10);
  return Number.isFinite(v) ? v : fallback;
}
var hasFlag = (name) => process.argv.includes(`--${name}`);
var SERVER = arg("server", "http://127.0.0.1:18234");
var ROOM = arg("room", "");
var NICK = arg("nick", "bot1");
var TOKEN = arg("token", "Aaa1111");
var FLIP_EVERY = argNum("flip-every", 0);
var CHAT_EVERY = argNum("chat-every", 0);
var LEAVE_AFTER = argNum("leave-after", 0);
var DURATION = argNum("duration", 0);
var TAG = arg("tag", NICK);
var QUIET = hasFlag("quiet");
var t0 = Date.now();
var say = (line) => {
  if (QUIET && !/^(STATE|EVT|SYS)/.test(line)) return;
  process.stdout.write(`[${TAG}] ${line}
`);
};
var elapsed = () => `+${Date.now() - t0}ms`;
var FakeRender = class {
  listeners = /* @__PURE__ */ new Set();
  openBook = null;
  pos = {
    chapterDocIndex: 0,
    chapterHref: "swarm-0",
    count: 0,
    page: 0,
    percentage: 0,
    text: "\u8702\u7FA4\u4F4D\u7F6E 0",
    chapterTitle: "\u7B2C 1 \u7AE0"
  };
  page = 0;
  on(event, fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  getPosition() {
    return this.pos;
  }
  getOpenBook() {
    return this.openBook;
  }
  /** 模拟翻页（roombot 的节奏器调用） */
  flip() {
    this.page += 1;
    this.pos = {
      chapterDocIndex: this.page % 12,
      chapterHref: `swarm-${this.page}`,
      count: 0,
      page: this.page,
      percentage: this.page % 100 / 100,
      text: `\u8702\u7FA4\u4F4D\u7F6E ${this.page}`,
      chapterTitle: `\u7B2C ${this.page % 12 + 1} \u7AE0`
    };
    for (const fn of this.listeners) fn(this.pos);
  }
  toPort() {
    return this;
  }
};
async function main() {
  const net = new WsNetAdapter();
  const render = new FakeRender();
  const identity = new FingerprintService();
  const room = new RoomSession(net, render.toPort(), identity);
  room.on("presence-updated", (members) => {
    say(`EVT presence n=${members.length} names=${members.map((m) => m.nickName).join(",")}`);
  });
  room.on("location-updated", (loc, from) => {
    say(
      `EVT location-updated from=${from.nickName} ch=${loc.chapterDocIndex} pct=${Math.round((loc.percentage ?? 0) * 100)} t=${elapsed()}`
    );
  });
  room.on("chat-message", (msg) => {
    say(`EVT chat from=${msg.nick} mine=${msg.member === room.getMyMemberId() ? 1 : 0} text=${msg.text}`);
  });
  room.on("connection-changed", (s) => say(`EVT connection s=${s}`));
  room.on("system-message", (m) => say(`SYS[${m.type}] ${m.text}`));
  await net.connect({ serverUrl: SERVER, accessToken: arg("access", ""), nickName: NICK, memberToken: TOKEN });
  say(`STATE connected server=${SERVER} token=${TOKEN}`);
  let roomId = ROOM.trim().toLowerCase();
  if (!roomId) {
    const rooms = await room.listRooms();
    if (rooms.length === 0) throw new Error("\u5927\u5385\u4E3A\u7A7A\u4E14\u672A\u7ED9 --room");
    roomId = [...rooms].sort((a, b) => b.createdAt - a.createdAt)[0].roomId;
    say(`STATE picked-room room=${roomId}`);
  }
  const res = await room.joinRoom(roomId, null, null);
  if (!res.ok) throw new Error(`\u52A0\u5165\u5931\u8D25\uFF1A${res.reason}`);
  const edition = res.room.edition;
  if (edition) {
    render.openBook = {
      id: `swarm-${edition.id}`,
      fingerprint: {
        algorithm: edition.hashAlgo ?? "md5-sample3-v1",
        hash: edition.hash,
        size: edition.size
      },
      metadata: { title: `\u8702\u7FA4\u66F8-${edition.id}` },
      format: extToFormat(`x.${edition.ext}`),
      filePath: "",
      createdAt: 0
    };
  }
  say(`STATE joined room=${res.room.roomId} members=${res.room.members.length}`);
  if (FLIP_EVERY > 0) {
    const timer = setInterval(() => render.flip(), FLIP_EVERY);
    timers.push(timer);
  }
  let chatNo = 0;
  if (CHAT_EVERY > 0) {
    const timer = setInterval(() => {
      chatNo += 1;
      void room.sendChat(`${NICK} \u5192\u6CE1 #${chatNo}`).catch((err) => say(`SYS[error] \u767C\u9001\u5931\u6557\uFF1A${err.message}`));
    }, CHAT_EVERY);
    timers.push(timer);
  }
  if (LEAVE_AFTER > 0) {
    const timer = setTimeout(() => {
      void room.leaveRoom().then(() => say("STATE left")).catch((err) => say(`SYS[error] \u96E2\u958B\u5931\u6557\uFF1A${err.message}`));
    }, LEAVE_AFTER);
    timers.push(timer);
  }
  if (DURATION > 0) {
    const timer = setTimeout(() => {
      say("STATE done");
      process.exit(0);
    }, DURATION);
    timers.push(timer);
  }
}
var timers = [];
main().catch((err) => {
  process.stderr.write(`[${TAG}] STATE fatal ${err.message}
`);
  process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9jb25zdGFudHMuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9idWZmZXItdXRpbC5qcyIsICIuLi8uLi9ub2RlX21vZHVsZXMvd3MvbGliL2xpbWl0ZXIuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9wZXJtZXNzYWdlLWRlZmxhdGUuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi92YWxpZGF0aW9uLmpzIiwgIi4uLy4uL25vZGVfbW9kdWxlcy93cy9saWIvcmVjZWl2ZXIuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9zZW5kZXIuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9ldmVudC10YXJnZXQuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9leHRlbnNpb24uanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi93ZWJzb2NrZXQuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9zdHJlYW0uanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL2xpYi9zdWJwcm90b2NvbC5qcyIsICIuLi8uLi9ub2RlX21vZHVsZXMvd3MvbGliL3dlYnNvY2tldC1zZXJ2ZXIuanMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3NwYXJrLW1kNS9zcGFyay1tZDUuanMiLCAiLi4vLi4vc3JjL2NvcmUvcG9ydHMvZW1pdHRlci50cyIsICIuLi8uLi9zcmMvY29yZS9kb21haW4vZm9ybWF0LnRzIiwgIi4uLy4uL3NyYy9jb3JlL2RvbWFpbi9sb2NhdGlvbi50cyIsICIuLi8uLi9zcmMvY29yZS9kb21haW4vcHJvdG9jb2wudHMiLCAiLi4vLi4vc3JjL2NvcmUvdXNlY2FzZXMvUm9vbVNlc3Npb24udHMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzL3dzL3dyYXBwZXIubWpzIiwgIi4uLy4uL3NyYy9tYWluL25ldC93c05ldEFkYXB0ZXIudHMiLCAiLi4vLi4vc3JjL2NvcmUvYWRhcHRlcnMvaWRlbnRpdHkvZmluZ2VycHJpbnQudHMiLCAicm9vbWJvdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBCSU5BUllfVFlQRVMgPSBbJ25vZGVidWZmZXInLCAnYXJyYXlidWZmZXInLCAnZnJhZ21lbnRzJ107XG5jb25zdCBoYXNCbG9iID0gdHlwZW9mIEJsb2IgIT09ICd1bmRlZmluZWQnO1xuXG5pZiAoaGFzQmxvYikgQklOQVJZX1RZUEVTLnB1c2goJ2Jsb2InKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEJJTkFSWV9UWVBFUyxcbiAgQ0xPU0VfVElNRU9VVDogMzAwMDAsXG4gIEVNUFRZX0JVRkZFUjogQnVmZmVyLmFsbG9jKDApLFxuICBHVUlEOiAnMjU4RUFGQTUtRTkxNC00N0RBLTk1Q0EtQzVBQjBEQzg1QjExJyxcbiAgaGFzQmxvYixcbiAga0Zvck9uRXZlbnRBdHRyaWJ1dGU6IFN5bWJvbCgna0lzRm9yT25FdmVudEF0dHJpYnV0ZScpLFxuICBrTGlzdGVuZXI6IFN5bWJvbCgna0xpc3RlbmVyJyksXG4gIGtTdGF0dXNDb2RlOiBTeW1ib2woJ3N0YXR1cy1jb2RlJyksXG4gIGtXZWJTb2NrZXQ6IFN5bWJvbCgnd2Vic29ja2V0JyksXG4gIE5PT1A6ICgpID0+IHt9XG59O1xuIiwgIid1c2Ugc3RyaWN0JztcblxuY29uc3QgeyBFTVBUWV9CVUZGRVIgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5cbmNvbnN0IEZhc3RCdWZmZXIgPSBCdWZmZXJbU3ltYm9sLnNwZWNpZXNdO1xuXG4vKipcbiAqIE1lcmdlcyBhbiBhcnJheSBvZiBidWZmZXJzIGludG8gYSBuZXcgYnVmZmVyLlxuICpcbiAqIEBwYXJhbSB7QnVmZmVyW119IGxpc3QgVGhlIGFycmF5IG9mIGJ1ZmZlcnMgdG8gY29uY2F0XG4gKiBAcGFyYW0ge051bWJlcn0gdG90YWxMZW5ndGggVGhlIHRvdGFsIGxlbmd0aCBvZiBidWZmZXJzIGluIHRoZSBsaXN0XG4gKiBAcmV0dXJuIHtCdWZmZXJ9IFRoZSByZXN1bHRpbmcgYnVmZmVyXG4gKiBAcHVibGljXG4gKi9cbmZ1bmN0aW9uIGNvbmNhdChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHJldHVybiBFTVBUWV9CVUZGRVI7XG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkgcmV0dXJuIGxpc3RbMF07XG5cbiAgY29uc3QgdGFyZ2V0ID0gQnVmZmVyLmFsbG9jVW5zYWZlKHRvdGFsTGVuZ3RoKTtcbiAgbGV0IG9mZnNldCA9IDA7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYnVmID0gbGlzdFtpXTtcbiAgICB0YXJnZXQuc2V0KGJ1Ziwgb2Zmc2V0KTtcbiAgICBvZmZzZXQgKz0gYnVmLmxlbmd0aDtcbiAgfVxuXG4gIGlmIChvZmZzZXQgPCB0b3RhbExlbmd0aCkge1xuICAgIHJldHVybiBuZXcgRmFzdEJ1ZmZlcih0YXJnZXQuYnVmZmVyLCB0YXJnZXQuYnl0ZU9mZnNldCwgb2Zmc2V0KTtcbiAgfVxuXG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbi8qKlxuICogTWFza3MgYSBidWZmZXIgdXNpbmcgdGhlIGdpdmVuIG1hc2suXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IHNvdXJjZSBUaGUgYnVmZmVyIHRvIG1hc2tcbiAqIEBwYXJhbSB7QnVmZmVyfSBtYXNrIFRoZSBtYXNrIHRvIHVzZVxuICogQHBhcmFtIHtCdWZmZXJ9IG91dHB1dCBUaGUgYnVmZmVyIHdoZXJlIHRvIHN0b3JlIHRoZSByZXN1bHRcbiAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgVGhlIG9mZnNldCBhdCB3aGljaCB0byBzdGFydCB3cml0aW5nXG4gKiBAcGFyYW0ge051bWJlcn0gbGVuZ3RoIFRoZSBudW1iZXIgb2YgYnl0ZXMgdG8gbWFzay5cbiAqIEBwdWJsaWNcbiAqL1xuZnVuY3Rpb24gX21hc2soc291cmNlLCBtYXNrLCBvdXRwdXQsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRbb2Zmc2V0ICsgaV0gPSBzb3VyY2VbaV0gXiBtYXNrW2kgJiAzXTtcbiAgfVxufVxuXG4vKipcbiAqIFVubWFza3MgYSBidWZmZXIgdXNpbmcgdGhlIGdpdmVuIG1hc2suXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IGJ1ZmZlciBUaGUgYnVmZmVyIHRvIHVubWFza1xuICogQHBhcmFtIHtCdWZmZXJ9IG1hc2sgVGhlIG1hc2sgdG8gdXNlXG4gKiBAcHVibGljXG4gKi9cbmZ1bmN0aW9uIF91bm1hc2soYnVmZmVyLCBtYXNrKSB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYnVmZmVyLmxlbmd0aDsgaSsrKSB7XG4gICAgYnVmZmVyW2ldIF49IG1hc2tbaSAmIDNdO1xuICB9XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBidWZmZXIgdG8gYW4gYEFycmF5QnVmZmVyYC5cbiAqXG4gKiBAcGFyYW0ge0J1ZmZlcn0gYnVmIFRoZSBidWZmZXIgdG8gY29udmVydFxuICogQHJldHVybiB7QXJyYXlCdWZmZXJ9IENvbnZlcnRlZCBidWZmZXJcbiAqIEBwdWJsaWNcbiAqL1xuZnVuY3Rpb24gdG9BcnJheUJ1ZmZlcihidWYpIHtcbiAgaWYgKGJ1Zi5sZW5ndGggPT09IGJ1Zi5idWZmZXIuYnl0ZUxlbmd0aCkge1xuICAgIHJldHVybiBidWYuYnVmZmVyO1xuICB9XG5cbiAgcmV0dXJuIGJ1Zi5idWZmZXIuc2xpY2UoYnVmLmJ5dGVPZmZzZXQsIGJ1Zi5ieXRlT2Zmc2V0ICsgYnVmLmxlbmd0aCk7XG59XG5cbi8qKlxuICogQ29udmVydHMgYGRhdGFgIHRvIGEgYEJ1ZmZlcmAuXG4gKlxuICogQHBhcmFtIHsqfSBkYXRhIFRoZSBkYXRhIHRvIGNvbnZlcnRcbiAqIEByZXR1cm4ge0J1ZmZlcn0gVGhlIGJ1ZmZlclxuICogQHRocm93cyB7VHlwZUVycm9yfVxuICogQHB1YmxpY1xuICovXG5mdW5jdGlvbiB0b0J1ZmZlcihkYXRhKSB7XG4gIHRvQnVmZmVyLnJlYWRPbmx5ID0gdHJ1ZTtcblxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSByZXR1cm4gZGF0YTtcblxuICBsZXQgYnVmO1xuXG4gIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICBidWYgPSBuZXcgRmFzdEJ1ZmZlcihkYXRhKTtcbiAgfSBlbHNlIGlmIChBcnJheUJ1ZmZlci5pc1ZpZXcoZGF0YSkpIHtcbiAgICBidWYgPSBuZXcgRmFzdEJ1ZmZlcihkYXRhLmJ1ZmZlciwgZGF0YS5ieXRlT2Zmc2V0LCBkYXRhLmJ5dGVMZW5ndGgpO1xuICB9IGVsc2Uge1xuICAgIGJ1ZiA9IEJ1ZmZlci5mcm9tKGRhdGEpO1xuICAgIHRvQnVmZmVyLnJlYWRPbmx5ID0gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gYnVmO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY29uY2F0LFxuICBtYXNrOiBfbWFzayxcbiAgdG9BcnJheUJ1ZmZlcixcbiAgdG9CdWZmZXIsXG4gIHVubWFzazogX3VubWFza1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIGVsc2UgICovXG5pZiAoIXByb2Nlc3MuZW52LldTX05PX0JVRkZFUl9VVElMKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgYnVmZmVyVXRpbCA9IHJlcXVpcmUoJ2J1ZmZlcnV0aWwnKTtcblxuICAgIG1vZHVsZS5leHBvcnRzLm1hc2sgPSBmdW5jdGlvbiAoc291cmNlLCBtYXNrLCBvdXRwdXQsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICBpZiAobGVuZ3RoIDwgNDgpIF9tYXNrKHNvdXJjZSwgbWFzaywgb3V0cHV0LCBvZmZzZXQsIGxlbmd0aCk7XG4gICAgICBlbHNlIGJ1ZmZlclV0aWwubWFzayhzb3VyY2UsIG1hc2ssIG91dHB1dCwgb2Zmc2V0LCBsZW5ndGgpO1xuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cy51bm1hc2sgPSBmdW5jdGlvbiAoYnVmZmVyLCBtYXNrKSB7XG4gICAgICBpZiAoYnVmZmVyLmxlbmd0aCA8IDMyKSBfdW5tYXNrKGJ1ZmZlciwgbWFzayk7XG4gICAgICBlbHNlIGJ1ZmZlclV0aWwudW5tYXNrKGJ1ZmZlciwgbWFzayk7XG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIC8vIENvbnRpbnVlIHJlZ2FyZGxlc3Mgb2YgdGhlIGVycm9yLlxuICB9XG59XG4iLCAiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBrRG9uZSA9IFN5bWJvbCgna0RvbmUnKTtcbmNvbnN0IGtSdW4gPSBTeW1ib2woJ2tSdW4nKTtcblxuLyoqXG4gKiBBIHZlcnkgc2ltcGxlIGpvYiBxdWV1ZSB3aXRoIGFkanVzdGFibGUgY29uY3VycmVuY3kuIEFkYXB0ZWQgZnJvbVxuICogaHR0cHM6Ly9naXRodWIuY29tL1NUUk1ML2FzeW5jLWxpbWl0ZXJcbiAqL1xuY2xhc3MgTGltaXRlciB7XG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IGBMaW1pdGVyYC5cbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtjb25jdXJyZW5jeT1JbmZpbml0eV0gVGhlIG1heGltdW0gbnVtYmVyIG9mIGpvYnMgYWxsb3dlZFxuICAgKiAgICAgdG8gcnVuIGNvbmN1cnJlbnRseVxuICAgKi9cbiAgY29uc3RydWN0b3IoY29uY3VycmVuY3kpIHtcbiAgICB0aGlzW2tEb25lXSA9ICgpID0+IHtcbiAgICAgIHRoaXMucGVuZGluZy0tO1xuICAgICAgdGhpc1trUnVuXSgpO1xuICAgIH07XG4gICAgdGhpcy5jb25jdXJyZW5jeSA9IGNvbmN1cnJlbmN5IHx8IEluZmluaXR5O1xuICAgIHRoaXMuam9icyA9IFtdO1xuICAgIHRoaXMucGVuZGluZyA9IDA7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyBhIGpvYiB0byB0aGUgcXVldWUuXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGpvYiBUaGUgam9iIHRvIHJ1blxuICAgKiBAcHVibGljXG4gICAqL1xuICBhZGQoam9iKSB7XG4gICAgdGhpcy5qb2JzLnB1c2goam9iKTtcbiAgICB0aGlzW2tSdW5dKCk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhIGpvYiBmcm9tIHRoZSBxdWV1ZSBhbmQgcnVucyBpdCBpZiBwb3NzaWJsZS5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICovXG4gIFtrUnVuXSgpIHtcbiAgICBpZiAodGhpcy5wZW5kaW5nID09PSB0aGlzLmNvbmN1cnJlbmN5KSByZXR1cm47XG5cbiAgICBpZiAodGhpcy5qb2JzLmxlbmd0aCkge1xuICAgICAgY29uc3Qgam9iID0gdGhpcy5qb2JzLnNoaWZ0KCk7XG5cbiAgICAgIHRoaXMucGVuZGluZysrO1xuICAgICAgam9iKHRoaXNba0RvbmVdKTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBMaW1pdGVyO1xuIiwgIid1c2Ugc3RyaWN0JztcblxuY29uc3QgemxpYiA9IHJlcXVpcmUoJ3psaWInKTtcblxuY29uc3QgYnVmZmVyVXRpbCA9IHJlcXVpcmUoJy4vYnVmZmVyLXV0aWwnKTtcbmNvbnN0IExpbWl0ZXIgPSByZXF1aXJlKCcuL2xpbWl0ZXInKTtcbmNvbnN0IHsga1N0YXR1c0NvZGUgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5cbmNvbnN0IEZhc3RCdWZmZXIgPSBCdWZmZXJbU3ltYm9sLnNwZWNpZXNdO1xuY29uc3QgVFJBSUxFUiA9IEJ1ZmZlci5mcm9tKFsweDAwLCAweDAwLCAweGZmLCAweGZmXSk7XG5jb25zdCBrUGVyTWVzc2FnZURlZmxhdGUgPSBTeW1ib2woJ3Blcm1lc3NhZ2UtZGVmbGF0ZScpO1xuY29uc3Qga1RvdGFsTGVuZ3RoID0gU3ltYm9sKCd0b3RhbC1sZW5ndGgnKTtcbmNvbnN0IGtDYWxsYmFjayA9IFN5bWJvbCgnY2FsbGJhY2snKTtcbmNvbnN0IGtCdWZmZXJzID0gU3ltYm9sKCdidWZmZXJzJyk7XG5jb25zdCBrRXJyb3IgPSBTeW1ib2woJ2Vycm9yJyk7XG5cbi8vXG4vLyBXZSBsaW1pdCB6bGliIGNvbmN1cnJlbmN5LCB3aGljaCBwcmV2ZW50cyBzZXZlcmUgbWVtb3J5IGZyYWdtZW50YXRpb25cbi8vIGFzIGRvY3VtZW50ZWQgaW4gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy84ODcxI2lzc3VlY29tbWVudC0yNTA5MTU5MTNcbi8vIGFuZCBodHRwczovL2dpdGh1Yi5jb20vd2Vic29ja2V0cy93cy9pc3N1ZXMvMTIwMlxuLy9cbi8vIEludGVudGlvbmFsbHkgZ2xvYmFsOyBpdCdzIHRoZSBnbG9iYWwgdGhyZWFkIHBvb2wgdGhhdCdzIGFuIGlzc3VlLlxuLy9cbmxldCB6bGliTGltaXRlcjtcblxuLyoqXG4gKiBwZXJtZXNzYWdlLWRlZmxhdGUgaW1wbGVtZW50YXRpb24uXG4gKi9cbmNsYXNzIFBlck1lc3NhZ2VEZWZsYXRlIHtcbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBQZXJNZXNzYWdlRGVmbGF0ZSBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBDb25maWd1cmF0aW9uIG9wdGlvbnNcbiAgICogQHBhcmFtIHsoQm9vbGVhbnxOdW1iZXIpfSBbb3B0aW9ucy5jbGllbnRNYXhXaW5kb3dCaXRzXSBBZHZlcnRpc2Ugc3VwcG9ydFxuICAgKiAgICAgZm9yLCBvciByZXF1ZXN0LCBhIGN1c3RvbSBjbGllbnQgd2luZG93IHNpemVcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5jbGllbnROb0NvbnRleHRUYWtlb3Zlcj1mYWxzZV0gQWR2ZXJ0aXNlL1xuICAgKiAgICAgYWNrbm93bGVkZ2UgZGlzYWJsaW5nIG9mIGNsaWVudCBjb250ZXh0IHRha2VvdmVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5jb25jdXJyZW5jeUxpbWl0PTEwXSBUaGUgbnVtYmVyIG9mIGNvbmN1cnJlbnRcbiAgICogICAgIGNhbGxzIHRvIHpsaWJcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5pc1NlcnZlcj1mYWxzZV0gQ3JlYXRlIHRoZSBpbnN0YW5jZSBpbiBlaXRoZXJcbiAgICogICAgIHNlcnZlciBvciBjbGllbnQgbW9kZVxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMubWF4UGF5bG9hZD0wXSBUaGUgbWF4aW11bSBhbGxvd2VkIG1lc3NhZ2UgbGVuZ3RoXG4gICAqIEBwYXJhbSB7KEJvb2xlYW58TnVtYmVyKX0gW29wdGlvbnMuc2VydmVyTWF4V2luZG93Qml0c10gUmVxdWVzdC9jb25maXJtIHRoZVxuICAgKiAgICAgdXNlIG9mIGEgY3VzdG9tIHNlcnZlciB3aW5kb3cgc2l6ZVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLnNlcnZlck5vQ29udGV4dFRha2VvdmVyPWZhbHNlXSBSZXF1ZXN0L2FjY2VwdFxuICAgKiAgICAgZGlzYWJsaW5nIG9mIHNlcnZlciBjb250ZXh0IHRha2VvdmVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy50aHJlc2hvbGQ9MTAyNF0gU2l6ZSAoaW4gYnl0ZXMpIGJlbG93IHdoaWNoXG4gICAqICAgICBtZXNzYWdlcyBzaG91bGQgbm90IGJlIGNvbXByZXNzZWQgaWYgY29udGV4dCB0YWtlb3ZlciBpcyBkaXNhYmxlZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMuemxpYkRlZmxhdGVPcHRpb25zXSBPcHRpb25zIHRvIHBhc3MgdG8gemxpYiBvblxuICAgKiAgICAgZGVmbGF0ZVxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMuemxpYkluZmxhdGVPcHRpb25zXSBPcHRpb25zIHRvIHBhc3MgdG8gemxpYiBvblxuICAgKiAgICAgaW5mbGF0ZVxuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHRoaXMuX29wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuX3RocmVzaG9sZCA9XG4gICAgICB0aGlzLl9vcHRpb25zLnRocmVzaG9sZCAhPT0gdW5kZWZpbmVkID8gdGhpcy5fb3B0aW9ucy50aHJlc2hvbGQgOiAxMDI0O1xuICAgIHRoaXMuX21heFBheWxvYWQgPSB0aGlzLl9vcHRpb25zLm1heFBheWxvYWQgfCAwO1xuICAgIHRoaXMuX2lzU2VydmVyID0gISF0aGlzLl9vcHRpb25zLmlzU2VydmVyO1xuICAgIHRoaXMuX2RlZmxhdGUgPSBudWxsO1xuICAgIHRoaXMuX2luZmxhdGUgPSBudWxsO1xuXG4gICAgdGhpcy5wYXJhbXMgPSBudWxsO1xuXG4gICAgaWYgKCF6bGliTGltaXRlcikge1xuICAgICAgY29uc3QgY29uY3VycmVuY3kgPVxuICAgICAgICB0aGlzLl9vcHRpb25zLmNvbmN1cnJlbmN5TGltaXQgIT09IHVuZGVmaW5lZFxuICAgICAgICAgID8gdGhpcy5fb3B0aW9ucy5jb25jdXJyZW5jeUxpbWl0XG4gICAgICAgICAgOiAxMDtcbiAgICAgIHpsaWJMaW1pdGVyID0gbmV3IExpbWl0ZXIoY29uY3VycmVuY3kpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgKi9cbiAgc3RhdGljIGdldCBleHRlbnNpb25OYW1lKCkge1xuICAgIHJldHVybiAncGVybWVzc2FnZS1kZWZsYXRlJztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYW4gZXh0ZW5zaW9uIG5lZ290aWF0aW9uIG9mZmVyLlxuICAgKlxuICAgKiBAcmV0dXJuIHtPYmplY3R9IEV4dGVuc2lvbiBwYXJhbWV0ZXJzXG4gICAqIEBwdWJsaWNcbiAgICovXG4gIG9mZmVyKCkge1xuICAgIGNvbnN0IHBhcmFtcyA9IHt9O1xuXG4gICAgaWYgKHRoaXMuX29wdGlvbnMuc2VydmVyTm9Db250ZXh0VGFrZW92ZXIpIHtcbiAgICAgIHBhcmFtcy5zZXJ2ZXJfbm9fY29udGV4dF90YWtlb3ZlciA9IHRydWU7XG4gICAgfVxuICAgIGlmICh0aGlzLl9vcHRpb25zLmNsaWVudE5vQ29udGV4dFRha2VvdmVyKSB7XG4gICAgICBwYXJhbXMuY2xpZW50X25vX2NvbnRleHRfdGFrZW92ZXIgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAodGhpcy5fb3B0aW9ucy5zZXJ2ZXJNYXhXaW5kb3dCaXRzKSB7XG4gICAgICBwYXJhbXMuc2VydmVyX21heF93aW5kb3dfYml0cyA9IHRoaXMuX29wdGlvbnMuc2VydmVyTWF4V2luZG93Qml0cztcbiAgICB9XG4gICAgaWYgKHRoaXMuX29wdGlvbnMuY2xpZW50TWF4V2luZG93Qml0cykge1xuICAgICAgcGFyYW1zLmNsaWVudF9tYXhfd2luZG93X2JpdHMgPSB0aGlzLl9vcHRpb25zLmNsaWVudE1heFdpbmRvd0JpdHM7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9vcHRpb25zLmNsaWVudE1heFdpbmRvd0JpdHMgPT0gbnVsbCkge1xuICAgICAgcGFyYW1zLmNsaWVudF9tYXhfd2luZG93X2JpdHMgPSB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJhbXM7XG4gIH1cblxuICAvKipcbiAgICogQWNjZXB0IGFuIGV4dGVuc2lvbiBuZWdvdGlhdGlvbiBvZmZlci9yZXNwb25zZS5cbiAgICpcbiAgICogQHBhcmFtIHtBcnJheX0gY29uZmlndXJhdGlvbnMgVGhlIGV4dGVuc2lvbiBuZWdvdGlhdGlvbiBvZmZlcnMvcmVwb25zZVxuICAgKiBAcmV0dXJuIHtPYmplY3R9IEFjY2VwdGVkIGNvbmZpZ3VyYXRpb25cbiAgICogQHB1YmxpY1xuICAgKi9cbiAgYWNjZXB0KGNvbmZpZ3VyYXRpb25zKSB7XG4gICAgY29uZmlndXJhdGlvbnMgPSB0aGlzLm5vcm1hbGl6ZVBhcmFtcyhjb25maWd1cmF0aW9ucyk7XG5cbiAgICB0aGlzLnBhcmFtcyA9IHRoaXMuX2lzU2VydmVyXG4gICAgICA/IHRoaXMuYWNjZXB0QXNTZXJ2ZXIoY29uZmlndXJhdGlvbnMpXG4gICAgICA6IHRoaXMuYWNjZXB0QXNDbGllbnQoY29uZmlndXJhdGlvbnMpO1xuXG4gICAgcmV0dXJuIHRoaXMucGFyYW1zO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbGVhc2VzIGFsbCByZXNvdXJjZXMgdXNlZCBieSB0aGUgZXh0ZW5zaW9uLlxuICAgKlxuICAgKiBAcHVibGljXG4gICAqL1xuICBjbGVhbnVwKCkge1xuICAgIGlmICh0aGlzLl9pbmZsYXRlKSB7XG4gICAgICB0aGlzLl9pbmZsYXRlLmNsb3NlKCk7XG4gICAgICB0aGlzLl9pbmZsYXRlID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZGVmbGF0ZSkge1xuICAgICAgY29uc3QgY2FsbGJhY2sgPSB0aGlzLl9kZWZsYXRlW2tDYWxsYmFja107XG5cbiAgICAgIHRoaXMuX2RlZmxhdGUuY2xvc2UoKTtcbiAgICAgIHRoaXMuX2RlZmxhdGUgPSBudWxsO1xuXG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2soXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgJ1RoZSBkZWZsYXRlIHN0cmVhbSB3YXMgY2xvc2VkIHdoaWxlIGRhdGEgd2FzIGJlaW5nIHByb2Nlc3NlZCdcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqICBBY2NlcHQgYW4gZXh0ZW5zaW9uIG5lZ290aWF0aW9uIG9mZmVyLlxuICAgKlxuICAgKiBAcGFyYW0ge0FycmF5fSBvZmZlcnMgVGhlIGV4dGVuc2lvbiBuZWdvdGlhdGlvbiBvZmZlcnNcbiAgICogQHJldHVybiB7T2JqZWN0fSBBY2NlcHRlZCBjb25maWd1cmF0aW9uXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBhY2NlcHRBc1NlcnZlcihvZmZlcnMpIHtcbiAgICBjb25zdCBvcHRzID0gdGhpcy5fb3B0aW9ucztcbiAgICBjb25zdCBhY2NlcHRlZCA9IG9mZmVycy5maW5kKChwYXJhbXMpID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgKG9wdHMuc2VydmVyTm9Db250ZXh0VGFrZW92ZXIgPT09IGZhbHNlICYmXG4gICAgICAgICAgcGFyYW1zLnNlcnZlcl9ub19jb250ZXh0X3Rha2VvdmVyKSB8fFxuICAgICAgICAocGFyYW1zLnNlcnZlcl9tYXhfd2luZG93X2JpdHMgJiZcbiAgICAgICAgICAob3B0cy5zZXJ2ZXJNYXhXaW5kb3dCaXRzID09PSBmYWxzZSB8fFxuICAgICAgICAgICAgKHR5cGVvZiBvcHRzLnNlcnZlck1heFdpbmRvd0JpdHMgPT09ICdudW1iZXInICYmXG4gICAgICAgICAgICAgIG9wdHMuc2VydmVyTWF4V2luZG93Qml0cyA+IHBhcmFtcy5zZXJ2ZXJfbWF4X3dpbmRvd19iaXRzKSkpIHx8XG4gICAgICAgICh0eXBlb2Ygb3B0cy5jbGllbnRNYXhXaW5kb3dCaXRzID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICh0eXBlb2YgcGFyYW1zLmNsaWVudF9tYXhfd2luZG93X2JpdHMgPT09ICdudW1iZXInXG4gICAgICAgICAgICA/IG9wdHMuY2xpZW50TWF4V2luZG93Qml0cyA+IHBhcmFtcy5jbGllbnRfbWF4X3dpbmRvd19iaXRzXG4gICAgICAgICAgICA6ICFwYXJhbXMuY2xpZW50X21heF93aW5kb3dfYml0cykpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIGlmICghYWNjZXB0ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm9uZSBvZiB0aGUgZXh0ZW5zaW9uIG9mZmVycyBjYW4gYmUgYWNjZXB0ZWQnKTtcbiAgICB9XG5cbiAgICBpZiAob3B0cy5zZXJ2ZXJOb0NvbnRleHRUYWtlb3Zlcikge1xuICAgICAgYWNjZXB0ZWQuc2VydmVyX25vX2NvbnRleHRfdGFrZW92ZXIgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAob3B0cy5jbGllbnROb0NvbnRleHRUYWtlb3Zlcikge1xuICAgICAgYWNjZXB0ZWQuY2xpZW50X25vX2NvbnRleHRfdGFrZW92ZXIgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIG9wdHMuc2VydmVyTWF4V2luZG93Qml0cyA9PT0gJ251bWJlcicpIHtcbiAgICAgIGFjY2VwdGVkLnNlcnZlcl9tYXhfd2luZG93X2JpdHMgPSBvcHRzLnNlcnZlck1heFdpbmRvd0JpdHM7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb3B0cy5jbGllbnRNYXhXaW5kb3dCaXRzID09PSAnbnVtYmVyJykge1xuICAgICAgYWNjZXB0ZWQuY2xpZW50X21heF93aW5kb3dfYml0cyA9IG9wdHMuY2xpZW50TWF4V2luZG93Qml0cztcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgYWNjZXB0ZWQuY2xpZW50X21heF93aW5kb3dfYml0cyA9PT0gdHJ1ZSB8fFxuICAgICAgb3B0cy5jbGllbnRNYXhXaW5kb3dCaXRzID09PSBmYWxzZVxuICAgICkge1xuICAgICAgZGVsZXRlIGFjY2VwdGVkLmNsaWVudF9tYXhfd2luZG93X2JpdHM7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFjY2VwdGVkO1xuICB9XG5cbiAgLyoqXG4gICAqIEFjY2VwdCB0aGUgZXh0ZW5zaW9uIG5lZ290aWF0aW9uIHJlc3BvbnNlLlxuICAgKlxuICAgKiBAcGFyYW0ge0FycmF5fSByZXNwb25zZSBUaGUgZXh0ZW5zaW9uIG5lZ290aWF0aW9uIHJlc3BvbnNlXG4gICAqIEByZXR1cm4ge09iamVjdH0gQWNjZXB0ZWQgY29uZmlndXJhdGlvblxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgYWNjZXB0QXNDbGllbnQocmVzcG9uc2UpIHtcbiAgICBjb25zdCBwYXJhbXMgPSByZXNwb25zZVswXTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuX29wdGlvbnMuY2xpZW50Tm9Db250ZXh0VGFrZW92ZXIgPT09IGZhbHNlICYmXG4gICAgICBwYXJhbXMuY2xpZW50X25vX2NvbnRleHRfdGFrZW92ZXJcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBwYXJhbWV0ZXIgXCJjbGllbnRfbm9fY29udGV4dF90YWtlb3ZlclwiJyk7XG4gICAgfVxuXG4gICAgaWYgKCFwYXJhbXMuY2xpZW50X21heF93aW5kb3dfYml0cykge1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLl9vcHRpb25zLmNsaWVudE1heFdpbmRvd0JpdHMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHBhcmFtcy5jbGllbnRfbWF4X3dpbmRvd19iaXRzID0gdGhpcy5fb3B0aW9ucy5jbGllbnRNYXhXaW5kb3dCaXRzO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0aGlzLl9vcHRpb25zLmNsaWVudE1heFdpbmRvd0JpdHMgPT09IGZhbHNlIHx8XG4gICAgICAodHlwZW9mIHRoaXMuX29wdGlvbnMuY2xpZW50TWF4V2luZG93Qml0cyA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgcGFyYW1zLmNsaWVudF9tYXhfd2luZG93X2JpdHMgPiB0aGlzLl9vcHRpb25zLmNsaWVudE1heFdpbmRvd0JpdHMpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdVbmV4cGVjdGVkIG9yIGludmFsaWQgcGFyYW1ldGVyIFwiY2xpZW50X21heF93aW5kb3dfYml0c1wiJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFyYW1zO1xuICB9XG5cbiAgLyoqXG4gICAqIE5vcm1hbGl6ZSBwYXJhbWV0ZXJzLlxuICAgKlxuICAgKiBAcGFyYW0ge0FycmF5fSBjb25maWd1cmF0aW9ucyBUaGUgZXh0ZW5zaW9uIG5lZ290aWF0aW9uIG9mZmVycy9yZXBvbnNlXG4gICAqIEByZXR1cm4ge0FycmF5fSBUaGUgb2ZmZXJzL3Jlc3BvbnNlIHdpdGggbm9ybWFsaXplZCBwYXJhbWV0ZXJzXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBub3JtYWxpemVQYXJhbXMoY29uZmlndXJhdGlvbnMpIHtcbiAgICBjb25maWd1cmF0aW9ucy5mb3JFYWNoKChwYXJhbXMpID0+IHtcbiAgICAgIE9iamVjdC5rZXlzKHBhcmFtcykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICAgIGxldCB2YWx1ZSA9IHBhcmFtc1trZXldO1xuXG4gICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYXJhbWV0ZXIgXCIke2tleX1cIiBtdXN0IGhhdmUgb25seSBhIHNpbmdsZSB2YWx1ZWApO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFsdWUgPSB2YWx1ZVswXTtcblxuICAgICAgICBpZiAoa2V5ID09PSAnY2xpZW50X21heF93aW5kb3dfYml0cycpIHtcbiAgICAgICAgICBpZiAodmFsdWUgIT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbnN0IG51bSA9ICt2YWx1ZTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihudW0pIHx8IG51bSA8IDggfHwgbnVtID4gMTUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgICAgICAgICBgSW52YWxpZCB2YWx1ZSBmb3IgcGFyYW1ldGVyIFwiJHtrZXl9XCI6ICR7dmFsdWV9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFsdWUgPSBudW07XG4gICAgICAgICAgfSBlbHNlIGlmICghdGhpcy5faXNTZXJ2ZXIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICAgICAgIGBJbnZhbGlkIHZhbHVlIGZvciBwYXJhbWV0ZXIgXCIke2tleX1cIjogJHt2YWx1ZX1gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChrZXkgPT09ICdzZXJ2ZXJfbWF4X3dpbmRvd19iaXRzJykge1xuICAgICAgICAgIGNvbnN0IG51bSA9ICt2YWx1ZTtcbiAgICAgICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIobnVtKSB8fCBudW0gPCA4IHx8IG51bSA+IDE1KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAgICAgICBgSW52YWxpZCB2YWx1ZSBmb3IgcGFyYW1ldGVyIFwiJHtrZXl9XCI6ICR7dmFsdWV9YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWUgPSBudW07XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAga2V5ID09PSAnY2xpZW50X25vX2NvbnRleHRfdGFrZW92ZXInIHx8XG4gICAgICAgICAga2V5ID09PSAnc2VydmVyX25vX2NvbnRleHRfdGFrZW92ZXInXG4gICAgICAgICkge1xuICAgICAgICAgIGlmICh2YWx1ZSAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgICAgICAgYEludmFsaWQgdmFsdWUgZm9yIHBhcmFtZXRlciBcIiR7a2V5fVwiOiAke3ZhbHVlfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwYXJhbWV0ZXIgXCIke2tleX1cImApO1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyYW1zW2tleV0gPSB2YWx1ZTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbmZpZ3VyYXRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIERlY29tcHJlc3MgZGF0YS4gQ29uY3VycmVuY3kgbGltaXRlZC5cbiAgICpcbiAgICogQHBhcmFtIHtCdWZmZXJ9IGRhdGEgQ29tcHJlc3NlZCBkYXRhXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gZmluIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0aGlzIGlzIHRoZSBsYXN0IGZyYWdtZW50XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrXG4gICAqIEBwdWJsaWNcbiAgICovXG4gIGRlY29tcHJlc3MoZGF0YSwgZmluLCBjYWxsYmFjaykge1xuICAgIHpsaWJMaW1pdGVyLmFkZCgoZG9uZSkgPT4ge1xuICAgICAgdGhpcy5fZGVjb21wcmVzcyhkYXRhLCBmaW4sIChlcnIsIHJlc3VsdCkgPT4ge1xuICAgICAgICBkb25lKCk7XG4gICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbXByZXNzIGRhdGEuIENvbmN1cnJlbmN5IGxpbWl0ZWQuXG4gICAqXG4gICAqIEBwYXJhbSB7KEJ1ZmZlcnxTdHJpbmcpfSBkYXRhIERhdGEgdG8gY29tcHJlc3NcbiAgICogQHBhcmFtIHtCb29sZWFufSBmaW4gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRoaXMgaXMgdGhlIGxhc3QgZnJhZ21lbnRcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2tcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgY29tcHJlc3MoZGF0YSwgZmluLCBjYWxsYmFjaykge1xuICAgIHpsaWJMaW1pdGVyLmFkZCgoZG9uZSkgPT4ge1xuICAgICAgdGhpcy5fY29tcHJlc3MoZGF0YSwgZmluLCAoZXJyLCByZXN1bHQpID0+IHtcbiAgICAgICAgZG9uZSgpO1xuICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWNvbXByZXNzIGRhdGEuXG4gICAqXG4gICAqIEBwYXJhbSB7QnVmZmVyfSBkYXRhIENvbXByZXNzZWQgZGF0YVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZpbiBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdGhpcyBpcyB0aGUgbGFzdCBmcmFnbWVudFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFja1xuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2RlY29tcHJlc3MoZGF0YSwgZmluLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5faXNTZXJ2ZXIgPyAnY2xpZW50JyA6ICdzZXJ2ZXInO1xuXG4gICAgaWYgKCF0aGlzLl9pbmZsYXRlKSB7XG4gICAgICBjb25zdCBrZXkgPSBgJHtlbmRwb2ludH1fbWF4X3dpbmRvd19iaXRzYDtcbiAgICAgIGNvbnN0IHdpbmRvd0JpdHMgPVxuICAgICAgICB0eXBlb2YgdGhpcy5wYXJhbXNba2V5XSAhPT0gJ251bWJlcidcbiAgICAgICAgICA/IHpsaWIuWl9ERUZBVUxUX1dJTkRPV0JJVFNcbiAgICAgICAgICA6IHRoaXMucGFyYW1zW2tleV07XG5cbiAgICAgIHRoaXMuX2luZmxhdGUgPSB6bGliLmNyZWF0ZUluZmxhdGVSYXcoe1xuICAgICAgICAuLi50aGlzLl9vcHRpb25zLnpsaWJJbmZsYXRlT3B0aW9ucyxcbiAgICAgICAgd2luZG93Qml0c1xuICAgICAgfSk7XG4gICAgICB0aGlzLl9pbmZsYXRlW2tQZXJNZXNzYWdlRGVmbGF0ZV0gPSB0aGlzO1xuICAgICAgdGhpcy5faW5mbGF0ZVtrVG90YWxMZW5ndGhdID0gMDtcbiAgICAgIHRoaXMuX2luZmxhdGVba0J1ZmZlcnNdID0gW107XG4gICAgICB0aGlzLl9pbmZsYXRlLm9uKCdlcnJvcicsIGluZmxhdGVPbkVycm9yKTtcbiAgICAgIHRoaXMuX2luZmxhdGUub24oJ2RhdGEnLCBpbmZsYXRlT25EYXRhKTtcbiAgICB9XG5cbiAgICB0aGlzLl9pbmZsYXRlW2tDYWxsYmFja10gPSBjYWxsYmFjaztcblxuICAgIHRoaXMuX2luZmxhdGUud3JpdGUoZGF0YSk7XG4gICAgaWYgKGZpbikgdGhpcy5faW5mbGF0ZS53cml0ZShUUkFJTEVSKTtcblxuICAgIHRoaXMuX2luZmxhdGUuZmx1c2goKCkgPT4ge1xuICAgICAgY29uc3QgZXJyID0gdGhpcy5faW5mbGF0ZVtrRXJyb3JdO1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHRoaXMuX2luZmxhdGUuY2xvc2UoKTtcbiAgICAgICAgdGhpcy5faW5mbGF0ZSA9IG51bGw7XG4gICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGF0YSA9IGJ1ZmZlclV0aWwuY29uY2F0KFxuICAgICAgICB0aGlzLl9pbmZsYXRlW2tCdWZmZXJzXSxcbiAgICAgICAgdGhpcy5faW5mbGF0ZVtrVG90YWxMZW5ndGhdXG4gICAgICApO1xuXG4gICAgICBpZiAodGhpcy5faW5mbGF0ZS5fcmVhZGFibGVTdGF0ZS5lbmRFbWl0dGVkKSB7XG4gICAgICAgIHRoaXMuX2luZmxhdGUuY2xvc2UoKTtcbiAgICAgICAgdGhpcy5faW5mbGF0ZSA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9pbmZsYXRlW2tUb3RhbExlbmd0aF0gPSAwO1xuICAgICAgICB0aGlzLl9pbmZsYXRlW2tCdWZmZXJzXSA9IFtdO1xuXG4gICAgICAgIGlmIChmaW4gJiYgdGhpcy5wYXJhbXNbYCR7ZW5kcG9pbnR9X25vX2NvbnRleHRfdGFrZW92ZXJgXSkge1xuICAgICAgICAgIHRoaXMuX2luZmxhdGUucmVzZXQoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wcmVzcyBkYXRhLlxuICAgKlxuICAgKiBAcGFyYW0geyhCdWZmZXJ8U3RyaW5nKX0gZGF0YSBEYXRhIHRvIGNvbXByZXNzXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gZmluIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0aGlzIGlzIHRoZSBsYXN0IGZyYWdtZW50XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfY29tcHJlc3MoZGF0YSwgZmluLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5faXNTZXJ2ZXIgPyAnc2VydmVyJyA6ICdjbGllbnQnO1xuXG4gICAgaWYgKCF0aGlzLl9kZWZsYXRlKSB7XG4gICAgICBjb25zdCBrZXkgPSBgJHtlbmRwb2ludH1fbWF4X3dpbmRvd19iaXRzYDtcbiAgICAgIGNvbnN0IHdpbmRvd0JpdHMgPVxuICAgICAgICB0eXBlb2YgdGhpcy5wYXJhbXNba2V5XSAhPT0gJ251bWJlcidcbiAgICAgICAgICA/IHpsaWIuWl9ERUZBVUxUX1dJTkRPV0JJVFNcbiAgICAgICAgICA6IHRoaXMucGFyYW1zW2tleV07XG5cbiAgICAgIHRoaXMuX2RlZmxhdGUgPSB6bGliLmNyZWF0ZURlZmxhdGVSYXcoe1xuICAgICAgICAuLi50aGlzLl9vcHRpb25zLnpsaWJEZWZsYXRlT3B0aW9ucyxcbiAgICAgICAgd2luZG93Qml0c1xuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuX2RlZmxhdGVba1RvdGFsTGVuZ3RoXSA9IDA7XG4gICAgICB0aGlzLl9kZWZsYXRlW2tCdWZmZXJzXSA9IFtdO1xuXG4gICAgICB0aGlzLl9kZWZsYXRlLm9uKCdkYXRhJywgZGVmbGF0ZU9uRGF0YSk7XG4gICAgfVxuXG4gICAgdGhpcy5fZGVmbGF0ZVtrQ2FsbGJhY2tdID0gY2FsbGJhY2s7XG5cbiAgICB0aGlzLl9kZWZsYXRlLndyaXRlKGRhdGEpO1xuICAgIHRoaXMuX2RlZmxhdGUuZmx1c2goemxpYi5aX1NZTkNfRkxVU0gsICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5fZGVmbGF0ZSkge1xuICAgICAgICAvL1xuICAgICAgICAvLyBUaGUgZGVmbGF0ZSBzdHJlYW0gd2FzIGNsb3NlZCB3aGlsZSBkYXRhIHdhcyBiZWluZyBwcm9jZXNzZWQuXG4gICAgICAgIC8vXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IGRhdGEgPSBidWZmZXJVdGlsLmNvbmNhdChcbiAgICAgICAgdGhpcy5fZGVmbGF0ZVtrQnVmZmVyc10sXG4gICAgICAgIHRoaXMuX2RlZmxhdGVba1RvdGFsTGVuZ3RoXVxuICAgICAgKTtcblxuICAgICAgaWYgKGZpbikge1xuICAgICAgICBkYXRhID0gbmV3IEZhc3RCdWZmZXIoZGF0YS5idWZmZXIsIGRhdGEuYnl0ZU9mZnNldCwgZGF0YS5sZW5ndGggLSA0KTtcbiAgICAgIH1cblxuICAgICAgLy9cbiAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBjYWxsYmFjayB3aWxsIG5vdCBiZSBjYWxsZWQgYWdhaW4gaW5cbiAgICAgIC8vIGBQZXJNZXNzYWdlRGVmbGF0ZSNjbGVhbnVwKClgLlxuICAgICAgLy9cbiAgICAgIHRoaXMuX2RlZmxhdGVba0NhbGxiYWNrXSA9IG51bGw7XG5cbiAgICAgIHRoaXMuX2RlZmxhdGVba1RvdGFsTGVuZ3RoXSA9IDA7XG4gICAgICB0aGlzLl9kZWZsYXRlW2tCdWZmZXJzXSA9IFtdO1xuXG4gICAgICBpZiAoZmluICYmIHRoaXMucGFyYW1zW2Ake2VuZHBvaW50fV9ub19jb250ZXh0X3Rha2VvdmVyYF0pIHtcbiAgICAgICAgdGhpcy5fZGVmbGF0ZS5yZXNldCgpO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICB9KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFBlck1lc3NhZ2VEZWZsYXRlO1xuXG4vKipcbiAqIFRoZSBsaXN0ZW5lciBvZiB0aGUgYHpsaWIuRGVmbGF0ZVJhd2Agc3RyZWFtIGAnZGF0YSdgIGV2ZW50LlxuICpcbiAqIEBwYXJhbSB7QnVmZmVyfSBjaHVuayBBIGNodW5rIG9mIGRhdGFcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGRlZmxhdGVPbkRhdGEoY2h1bmspIHtcbiAgdGhpc1trQnVmZmVyc10ucHVzaChjaHVuayk7XG4gIHRoaXNba1RvdGFsTGVuZ3RoXSArPSBjaHVuay5sZW5ndGg7XG59XG5cbi8qKlxuICogVGhlIGxpc3RlbmVyIG9mIHRoZSBgemxpYi5JbmZsYXRlUmF3YCBzdHJlYW0gYCdkYXRhJ2AgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IGNodW5rIEEgY2h1bmsgb2YgZGF0YVxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gaW5mbGF0ZU9uRGF0YShjaHVuaykge1xuICB0aGlzW2tUb3RhbExlbmd0aF0gKz0gY2h1bmsubGVuZ3RoO1xuXG4gIGlmIChcbiAgICB0aGlzW2tQZXJNZXNzYWdlRGVmbGF0ZV0uX21heFBheWxvYWQgPCAxIHx8XG4gICAgdGhpc1trVG90YWxMZW5ndGhdIDw9IHRoaXNba1Blck1lc3NhZ2VEZWZsYXRlXS5fbWF4UGF5bG9hZFxuICApIHtcbiAgICB0aGlzW2tCdWZmZXJzXS5wdXNoKGNodW5rKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzW2tFcnJvcl0gPSBuZXcgUmFuZ2VFcnJvcignTWF4IHBheWxvYWQgc2l6ZSBleGNlZWRlZCcpO1xuICB0aGlzW2tFcnJvcl0uY29kZSA9ICdXU19FUlJfVU5TVVBQT1JURURfTUVTU0FHRV9MRU5HVEgnO1xuICB0aGlzW2tFcnJvcl1ba1N0YXR1c0NvZGVdID0gMTAwOTtcbiAgdGhpcy5yZW1vdmVMaXN0ZW5lcignZGF0YScsIGluZmxhdGVPbkRhdGEpO1xuXG4gIC8vXG4gIC8vIFRoZSBjaG9pY2UgdG8gZW1wbG95IGB6bGliLnJlc2V0KClgIG92ZXIgYHpsaWIuY2xvc2UoKWAgaXMgZGljdGF0ZWQgYnkgdGhlXG4gIC8vIGZhY3QgdGhhdCBpbiBOb2RlLmpzIHZlcnNpb25zIHByaW9yIHRvIDEzLjEwLjAsIHRoZSBjYWxsYmFjayBmb3JcbiAgLy8gYHpsaWIuZmx1c2goKWAgaXMgbm90IGNhbGxlZCBpZiBgemxpYi5jbG9zZSgpYCBpcyB1c2VkLiBVdGlsaXppbmdcbiAgLy8gYHpsaWIucmVzZXQoKWAgZW5zdXJlcyB0aGF0IGVpdGhlciB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZCBvciBhbiBlcnJvciBpc1xuICAvLyBlbWl0dGVkLlxuICAvL1xuICB0aGlzLnJlc2V0KCk7XG59XG5cbi8qKlxuICogVGhlIGxpc3RlbmVyIG9mIHRoZSBgemxpYi5JbmZsYXRlUmF3YCBzdHJlYW0gYCdlcnJvcidgIGV2ZW50LlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyciBUaGUgZW1pdHRlZCBlcnJvclxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gaW5mbGF0ZU9uRXJyb3IoZXJyKSB7XG4gIC8vXG4gIC8vIFRoZXJlIGlzIG5vIG5lZWQgdG8gY2FsbCBgWmxpYiNjbG9zZSgpYCBhcyB0aGUgaGFuZGxlIGlzIGF1dG9tYXRpY2FsbHlcbiAgLy8gY2xvc2VkIHdoZW4gYW4gZXJyb3IgaXMgZW1pdHRlZC5cbiAgLy9cbiAgdGhpc1trUGVyTWVzc2FnZURlZmxhdGVdLl9pbmZsYXRlID0gbnVsbDtcblxuICBpZiAodGhpc1trRXJyb3JdKSB7XG4gICAgdGhpc1trQ2FsbGJhY2tdKHRoaXNba0Vycm9yXSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgZXJyW2tTdGF0dXNDb2RlXSA9IDEwMDc7XG4gIHRoaXNba0NhbGxiYWNrXShlcnIpO1xufVxuIiwgIid1c2Ugc3RyaWN0JztcblxuY29uc3QgeyBpc1V0ZjggfSA9IHJlcXVpcmUoJ2J1ZmZlcicpO1xuXG5jb25zdCB7IGhhc0Jsb2IgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5cbi8vXG4vLyBBbGxvd2VkIHRva2VuIGNoYXJhY3RlcnM6XG4vL1xuLy8gJyEnLCAnIycsICckJywgJyUnLCAnJicsICcnJywgJyonLCAnKycsICctJyxcbi8vICcuJywgMC05LCBBLVosICdeJywgJ18nLCAnYCcsIGEteiwgJ3wnLCAnfidcbi8vXG4vLyB0b2tlbkNoYXJzWzMyXSA9PT0gMCAvLyAnICdcbi8vIHRva2VuQ2hhcnNbMzNdID09PSAxIC8vICchJ1xuLy8gdG9rZW5DaGFyc1szNF0gPT09IDAgLy8gJ1wiJ1xuLy8gLi4uXG4vL1xuLy8gcHJldHRpZXItaWdub3JlXG5jb25zdCB0b2tlbkNoYXJzID0gW1xuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAvLyAwIC0gMTVcbiAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgLy8gMTYgLSAzMVxuICAwLCAxLCAwLCAxLCAxLCAxLCAxLCAxLCAwLCAwLCAxLCAxLCAwLCAxLCAxLCAwLCAvLyAzMiAtIDQ3XG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDQ4IC0gNjNcbiAgMCwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgLy8gNjQgLSA3OVxuICAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAwLCAwLCAwLCAxLCAxLCAvLyA4MCAtIDk1XG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIC8vIDk2IC0gMTExXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDEsIDAsIDEsIDAgLy8gMTEyIC0gMTI3XG5dO1xuXG4vKipcbiAqIENoZWNrcyBpZiBhIHN0YXR1cyBjb2RlIGlzIGFsbG93ZWQgaW4gYSBjbG9zZSBmcmFtZS5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gY29kZSBUaGUgc3RhdHVzIGNvZGVcbiAqIEByZXR1cm4ge0Jvb2xlYW59IGB0cnVlYCBpZiB0aGUgc3RhdHVzIGNvZGUgaXMgdmFsaWQsIGVsc2UgYGZhbHNlYFxuICogQHB1YmxpY1xuICovXG5mdW5jdGlvbiBpc1ZhbGlkU3RhdHVzQ29kZShjb2RlKSB7XG4gIHJldHVybiAoXG4gICAgKGNvZGUgPj0gMTAwMCAmJlxuICAgICAgY29kZSA8PSAxMDE0ICYmXG4gICAgICBjb2RlICE9PSAxMDA0ICYmXG4gICAgICBjb2RlICE9PSAxMDA1ICYmXG4gICAgICBjb2RlICE9PSAxMDA2KSB8fFxuICAgIChjb2RlID49IDMwMDAgJiYgY29kZSA8PSA0OTk5KVxuICApO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBhIGdpdmVuIGJ1ZmZlciBjb250YWlucyBvbmx5IGNvcnJlY3QgVVRGLTguXG4gKiBQb3J0ZWQgZnJvbSBodHRwczovL3d3dy5jbC5jYW0uYWMudWsvJTdFbWdrMjUvdWNzL3V0ZjhfY2hlY2suYyBieVxuICogTWFya3VzIEt1aG4uXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IGJ1ZiBUaGUgYnVmZmVyIHRvIGNoZWNrXG4gKiBAcmV0dXJuIHtCb29sZWFufSBgdHJ1ZWAgaWYgYGJ1ZmAgY29udGFpbnMgb25seSBjb3JyZWN0IFVURi04LCBlbHNlIGBmYWxzZWBcbiAqIEBwdWJsaWNcbiAqL1xuZnVuY3Rpb24gX2lzVmFsaWRVVEY4KGJ1Zikge1xuICBjb25zdCBsZW4gPSBidWYubGVuZ3RoO1xuICBsZXQgaSA9IDA7XG5cbiAgd2hpbGUgKGkgPCBsZW4pIHtcbiAgICBpZiAoKGJ1ZltpXSAmIDB4ODApID09PSAwKSB7XG4gICAgICAvLyAweHh4eHh4eFxuICAgICAgaSsrO1xuICAgIH0gZWxzZSBpZiAoKGJ1ZltpXSAmIDB4ZTApID09PSAweGMwKSB7XG4gICAgICAvLyAxMTB4eHh4eCAxMHh4eHh4eFxuICAgICAgaWYgKFxuICAgICAgICBpICsgMSA9PT0gbGVuIHx8XG4gICAgICAgIChidWZbaSArIDFdICYgMHhjMCkgIT09IDB4ODAgfHxcbiAgICAgICAgKGJ1ZltpXSAmIDB4ZmUpID09PSAweGMwIC8vIE92ZXJsb25nXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBpICs9IDI7XG4gICAgfSBlbHNlIGlmICgoYnVmW2ldICYgMHhmMCkgPT09IDB4ZTApIHtcbiAgICAgIC8vIDExMTB4eHh4IDEweHh4eHh4IDEweHh4eHh4XG4gICAgICBpZiAoXG4gICAgICAgIGkgKyAyID49IGxlbiB8fFxuICAgICAgICAoYnVmW2kgKyAxXSAmIDB4YzApICE9PSAweDgwIHx8XG4gICAgICAgIChidWZbaSArIDJdICYgMHhjMCkgIT09IDB4ODAgfHxcbiAgICAgICAgKGJ1ZltpXSA9PT0gMHhlMCAmJiAoYnVmW2kgKyAxXSAmIDB4ZTApID09PSAweDgwKSB8fCAvLyBPdmVybG9uZ1xuICAgICAgICAoYnVmW2ldID09PSAweGVkICYmIChidWZbaSArIDFdICYgMHhlMCkgPT09IDB4YTApIC8vIFN1cnJvZ2F0ZSAoVStEODAwIC0gVStERkZGKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaSArPSAzO1xuICAgIH0gZWxzZSBpZiAoKGJ1ZltpXSAmIDB4ZjgpID09PSAweGYwKSB7XG4gICAgICAvLyAxMTExMHh4eCAxMHh4eHh4eCAxMHh4eHh4eCAxMHh4eHh4eFxuICAgICAgaWYgKFxuICAgICAgICBpICsgMyA+PSBsZW4gfHxcbiAgICAgICAgKGJ1ZltpICsgMV0gJiAweGMwKSAhPT0gMHg4MCB8fFxuICAgICAgICAoYnVmW2kgKyAyXSAmIDB4YzApICE9PSAweDgwIHx8XG4gICAgICAgIChidWZbaSArIDNdICYgMHhjMCkgIT09IDB4ODAgfHxcbiAgICAgICAgKGJ1ZltpXSA9PT0gMHhmMCAmJiAoYnVmW2kgKyAxXSAmIDB4ZjApID09PSAweDgwKSB8fCAvLyBPdmVybG9uZ1xuICAgICAgICAoYnVmW2ldID09PSAweGY0ICYmIGJ1ZltpICsgMV0gPiAweDhmKSB8fFxuICAgICAgICBidWZbaV0gPiAweGY0IC8vID4gVSsxMEZGRkZcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGkgKz0gNDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBhIHZhbHVlIGlzIGEgYEJsb2JgLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGJlIHRlc3RlZFxuICogQHJldHVybiB7Qm9vbGVhbn0gYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBgQmxvYmAsIGVsc2UgYGZhbHNlYFxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gaXNCbG9iKHZhbHVlKSB7XG4gIHJldHVybiAoXG4gICAgaGFzQmxvYiAmJlxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2YgdmFsdWUuYXJyYXlCdWZmZXIgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgdmFsdWUudHlwZSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgdmFsdWUuc3RyZWFtID09PSAnZnVuY3Rpb24nICYmXG4gICAgKHZhbHVlW1N5bWJvbC50b1N0cmluZ1RhZ10gPT09ICdCbG9iJyB8fFxuICAgICAgdmFsdWVbU3ltYm9sLnRvU3RyaW5nVGFnXSA9PT0gJ0ZpbGUnKVxuICApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgaXNCbG9iLFxuICBpc1ZhbGlkU3RhdHVzQ29kZSxcbiAgaXNWYWxpZFVURjg6IF9pc1ZhbGlkVVRGOCxcbiAgdG9rZW5DaGFyc1xufTtcblxuaWYgKGlzVXRmOCkge1xuICBtb2R1bGUuZXhwb3J0cy5pc1ZhbGlkVVRGOCA9IGZ1bmN0aW9uIChidWYpIHtcbiAgICByZXR1cm4gYnVmLmxlbmd0aCA8IDI0ID8gX2lzVmFsaWRVVEY4KGJ1ZikgOiBpc1V0ZjgoYnVmKTtcbiAgfTtcbn0gLyogaXN0YW5idWwgaWdub3JlIGVsc2UgICovIGVsc2UgaWYgKCFwcm9jZXNzLmVudi5XU19OT19VVEZfOF9WQUxJREFURSkge1xuICB0cnkge1xuICAgIGNvbnN0IGlzVmFsaWRVVEY4ID0gcmVxdWlyZSgndXRmLTgtdmFsaWRhdGUnKTtcblxuICAgIG1vZHVsZS5leHBvcnRzLmlzVmFsaWRVVEY4ID0gZnVuY3Rpb24gKGJ1Zikge1xuICAgICAgcmV0dXJuIGJ1Zi5sZW5ndGggPCAzMiA/IF9pc1ZhbGlkVVRGOChidWYpIDogaXNWYWxpZFVURjgoYnVmKTtcbiAgICB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgLy8gQ29udGludWUgcmVnYXJkbGVzcyBvZiB0aGUgZXJyb3IuXG4gIH1cbn1cbiIsICIndXNlIHN0cmljdCc7XG5cbmNvbnN0IHsgV3JpdGFibGUgfSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xuXG5jb25zdCBQZXJNZXNzYWdlRGVmbGF0ZSA9IHJlcXVpcmUoJy4vcGVybWVzc2FnZS1kZWZsYXRlJyk7XG5jb25zdCB7XG4gIEJJTkFSWV9UWVBFUyxcbiAgRU1QVFlfQlVGRkVSLFxuICBrU3RhdHVzQ29kZSxcbiAga1dlYlNvY2tldFxufSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5jb25zdCB7IGNvbmNhdCwgdG9BcnJheUJ1ZmZlciwgdW5tYXNrIH0gPSByZXF1aXJlKCcuL2J1ZmZlci11dGlsJyk7XG5jb25zdCB7IGlzVmFsaWRTdGF0dXNDb2RlLCBpc1ZhbGlkVVRGOCB9ID0gcmVxdWlyZSgnLi92YWxpZGF0aW9uJyk7XG5cbmNvbnN0IEZhc3RCdWZmZXIgPSBCdWZmZXJbU3ltYm9sLnNwZWNpZXNdO1xuXG5jb25zdCBHRVRfSU5GTyA9IDA7XG5jb25zdCBHRVRfUEFZTE9BRF9MRU5HVEhfMTYgPSAxO1xuY29uc3QgR0VUX1BBWUxPQURfTEVOR1RIXzY0ID0gMjtcbmNvbnN0IEdFVF9NQVNLID0gMztcbmNvbnN0IEdFVF9EQVRBID0gNDtcbmNvbnN0IElORkxBVElORyA9IDU7XG5jb25zdCBERUZFUl9FVkVOVCA9IDY7XG5cbi8qKlxuICogSHlCaSBSZWNlaXZlciBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAZXh0ZW5kcyBXcml0YWJsZVxuICovXG5jbGFzcyBSZWNlaXZlciBleHRlbmRzIFdyaXRhYmxlIHtcbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBSZWNlaXZlciBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25zIG9iamVjdFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmFsbG93U3luY2hyb25vdXNFdmVudHM9dHJ1ZV0gU3BlY2lmaWVzIHdoZXRoZXJcbiAgICogICAgIGFueSBvZiB0aGUgYCdtZXNzYWdlJ2AsIGAncGluZydgLCBhbmQgYCdwb25nJ2AgZXZlbnRzIGNhbiBiZSBlbWl0dGVkXG4gICAqICAgICBtdWx0aXBsZSB0aW1lcyBpbiB0aGUgc2FtZSB0aWNrXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5iaW5hcnlUeXBlPW5vZGVidWZmZXJdIFRoZSB0eXBlIGZvciBiaW5hcnkgZGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMuZXh0ZW5zaW9uc10gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIG5lZ290aWF0ZWRcbiAgICogICAgIGV4dGVuc2lvbnNcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5pc1NlcnZlcj1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgdG8gb3BlcmF0ZSBpblxuICAgKiAgICAgY2xpZW50IG9yIHNlcnZlciBtb2RlXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5tYXhCdWZmZXJlZENodW5rcz0wXSBUaGUgbWF4aW11bSBudW1iZXIgb2ZcbiAgICogICAgIGJ1ZmZlcmVkIGRhdGEgY2h1bmtzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5tYXhGcmFnbWVudHM9MF0gVGhlIG1heGltdW0gbnVtYmVyIG9mIG1lc3NhZ2VcbiAgICogICAgIGZyYWdtZW50c1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMubWF4UGF5bG9hZD0wXSBUaGUgbWF4aW11bSBhbGxvd2VkIG1lc3NhZ2UgbGVuZ3RoXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuc2tpcFVURjhWYWxpZGF0aW9uPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvclxuICAgKiAgICAgbm90IHRvIHNraXAgVVRGLTggdmFsaWRhdGlvbiBmb3IgdGV4dCBhbmQgY2xvc2UgbWVzc2FnZXNcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMgPSB7fSkge1xuICAgIHN1cGVyKCk7XG5cbiAgICB0aGlzLl9hbGxvd1N5bmNocm9ub3VzRXZlbnRzID1cbiAgICAgIG9wdGlvbnMuYWxsb3dTeW5jaHJvbm91c0V2ZW50cyAhPT0gdW5kZWZpbmVkXG4gICAgICAgID8gb3B0aW9ucy5hbGxvd1N5bmNocm9ub3VzRXZlbnRzXG4gICAgICAgIDogdHJ1ZTtcbiAgICB0aGlzLl9iaW5hcnlUeXBlID0gb3B0aW9ucy5iaW5hcnlUeXBlIHx8IEJJTkFSWV9UWVBFU1swXTtcbiAgICB0aGlzLl9leHRlbnNpb25zID0gb3B0aW9ucy5leHRlbnNpb25zIHx8IHt9O1xuICAgIHRoaXMuX2lzU2VydmVyID0gISFvcHRpb25zLmlzU2VydmVyO1xuICAgIHRoaXMuX21heEJ1ZmZlcmVkQ2h1bmtzID0gb3B0aW9ucy5tYXhCdWZmZXJlZENodW5rcyB8IDA7XG4gICAgdGhpcy5fbWF4RnJhZ21lbnRzID0gb3B0aW9ucy5tYXhGcmFnbWVudHMgfCAwO1xuICAgIHRoaXMuX21heFBheWxvYWQgPSBvcHRpb25zLm1heFBheWxvYWQgfCAwO1xuICAgIHRoaXMuX3NraXBVVEY4VmFsaWRhdGlvbiA9ICEhb3B0aW9ucy5za2lwVVRGOFZhbGlkYXRpb247XG4gICAgdGhpc1trV2ViU29ja2V0XSA9IHVuZGVmaW5lZDtcblxuICAgIHRoaXMuX2J1ZmZlcmVkQnl0ZXMgPSAwO1xuICAgIHRoaXMuX2J1ZmZlcnMgPSBbXTtcblxuICAgIHRoaXMuX2NvbXByZXNzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXlsb2FkTGVuZ3RoID0gMDtcbiAgICB0aGlzLl9tYXNrID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuX2ZyYWdtZW50ZWQgPSAwO1xuICAgIHRoaXMuX21hc2tlZCA9IGZhbHNlO1xuICAgIHRoaXMuX2ZpbiA9IGZhbHNlO1xuICAgIHRoaXMuX29wY29kZSA9IDA7XG5cbiAgICB0aGlzLl90b3RhbFBheWxvYWRMZW5ndGggPSAwO1xuICAgIHRoaXMuX21lc3NhZ2VMZW5ndGggPSAwO1xuICAgIHRoaXMuX251bUZyYWdtZW50cyA9IDA7XG4gICAgdGhpcy5fZnJhZ21lbnRzID0gW107XG5cbiAgICB0aGlzLl9lcnJvcmVkID0gZmFsc2U7XG4gICAgdGhpcy5fbG9vcCA9IGZhbHNlO1xuICAgIHRoaXMuX3N0YXRlID0gR0VUX0lORk87XG4gIH1cblxuICAvKipcbiAgICogSW1wbGVtZW50cyBgV3JpdGFibGUucHJvdG90eXBlLl93cml0ZSgpYC5cbiAgICpcbiAgICogQHBhcmFtIHtCdWZmZXJ9IGNodW5rIFRoZSBjaHVuayBvZiBkYXRhIHRvIHdyaXRlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBlbmNvZGluZyBUaGUgY2hhcmFjdGVyIGVuY29kaW5nIG9mIGBjaHVua2BcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgQ2FsbGJhY2tcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF93cml0ZShjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gICAgaWYgKHRoaXMuX29wY29kZSA9PT0gMHgwOCAmJiB0aGlzLl9zdGF0ZSA9PSBHRVRfSU5GTykgcmV0dXJuIGNiKCk7XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLl9tYXhCdWZmZXJlZENodW5rcyA+IDAgJiZcbiAgICAgIHRoaXMuX2J1ZmZlcnMubGVuZ3RoID49IHRoaXMuX21heEJ1ZmZlcmVkQ2h1bmtzXG4gICAgKSB7XG4gICAgICBjYihcbiAgICAgICAgdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgICBSYW5nZUVycm9yLFxuICAgICAgICAgICdUb28gbWFueSBidWZmZXJlZCBjaHVua3MnLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIDEwMDgsXG4gICAgICAgICAgJ1dTX0VSUl9UT09fTUFOWV9CVUZGRVJFRF9QQVJUUydcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9idWZmZXJlZEJ5dGVzICs9IGNodW5rLmxlbmd0aDtcbiAgICB0aGlzLl9idWZmZXJzLnB1c2goY2h1bmspO1xuICAgIHRoaXMuc3RhcnRMb29wKGNiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb25zdW1lcyBgbmAgYnl0ZXMgZnJvbSB0aGUgYnVmZmVyZWQgZGF0YS5cbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG4gVGhlIG51bWJlciBvZiBieXRlcyB0byBjb25zdW1lXG4gICAqIEByZXR1cm4ge0J1ZmZlcn0gVGhlIGNvbnN1bWVkIGJ5dGVzXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBjb25zdW1lKG4pIHtcbiAgICB0aGlzLl9idWZmZXJlZEJ5dGVzIC09IG47XG5cbiAgICBpZiAobiA9PT0gdGhpcy5fYnVmZmVyc1swXS5sZW5ndGgpIHJldHVybiB0aGlzLl9idWZmZXJzLnNoaWZ0KCk7XG5cbiAgICBpZiAobiA8IHRoaXMuX2J1ZmZlcnNbMF0ubGVuZ3RoKSB7XG4gICAgICBjb25zdCBidWYgPSB0aGlzLl9idWZmZXJzWzBdO1xuICAgICAgdGhpcy5fYnVmZmVyc1swXSA9IG5ldyBGYXN0QnVmZmVyKFxuICAgICAgICBidWYuYnVmZmVyLFxuICAgICAgICBidWYuYnl0ZU9mZnNldCArIG4sXG4gICAgICAgIGJ1Zi5sZW5ndGggLSBuXG4gICAgICApO1xuXG4gICAgICByZXR1cm4gbmV3IEZhc3RCdWZmZXIoYnVmLmJ1ZmZlciwgYnVmLmJ5dGVPZmZzZXQsIG4pO1xuICAgIH1cblxuICAgIGNvbnN0IGRzdCA9IEJ1ZmZlci5hbGxvY1Vuc2FmZShuKTtcblxuICAgIGRvIHtcbiAgICAgIGNvbnN0IGJ1ZiA9IHRoaXMuX2J1ZmZlcnNbMF07XG4gICAgICBjb25zdCBvZmZzZXQgPSBkc3QubGVuZ3RoIC0gbjtcblxuICAgICAgaWYgKG4gPj0gYnVmLmxlbmd0aCkge1xuICAgICAgICBkc3Quc2V0KHRoaXMuX2J1ZmZlcnMuc2hpZnQoKSwgb2Zmc2V0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRzdC5zZXQobmV3IFVpbnQ4QXJyYXkoYnVmLmJ1ZmZlciwgYnVmLmJ5dGVPZmZzZXQsIG4pLCBvZmZzZXQpO1xuICAgICAgICB0aGlzLl9idWZmZXJzWzBdID0gbmV3IEZhc3RCdWZmZXIoXG4gICAgICAgICAgYnVmLmJ1ZmZlcixcbiAgICAgICAgICBidWYuYnl0ZU9mZnNldCArIG4sXG4gICAgICAgICAgYnVmLmxlbmd0aCAtIG5cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgbiAtPSBidWYubGVuZ3RoO1xuICAgIH0gd2hpbGUgKG4gPiAwKTtcblxuICAgIHJldHVybiBkc3Q7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIHRoZSBwYXJzaW5nIGxvb3AuXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIENhbGxiYWNrXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBzdGFydExvb3AoY2IpIHtcbiAgICB0aGlzLl9sb29wID0gdHJ1ZTtcblxuICAgIGRvIHtcbiAgICAgIHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcbiAgICAgICAgY2FzZSBHRVRfSU5GTzpcbiAgICAgICAgICB0aGlzLmdldEluZm8oY2IpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIEdFVF9QQVlMT0FEX0xFTkdUSF8xNjpcbiAgICAgICAgICB0aGlzLmdldFBheWxvYWRMZW5ndGgxNihjYik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgR0VUX1BBWUxPQURfTEVOR1RIXzY0OlxuICAgICAgICAgIHRoaXMuZ2V0UGF5bG9hZExlbmd0aDY0KGNiKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBHRVRfTUFTSzpcbiAgICAgICAgICB0aGlzLmdldE1hc2soKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBHRVRfREFUQTpcbiAgICAgICAgICB0aGlzLmdldERhdGEoY2IpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIElORkxBVElORzpcbiAgICAgICAgY2FzZSBERUZFUl9FVkVOVDpcbiAgICAgICAgICB0aGlzLl9sb29wID0gZmFsc2U7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH0gd2hpbGUgKHRoaXMuX2xvb3ApO1xuXG4gICAgaWYgKCF0aGlzLl9lcnJvcmVkKSBjYigpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIHRoZSBmaXJzdCB0d28gYnl0ZXMgb2YgYSBmcmFtZS5cbiAgICpcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgQ2FsbGJhY2tcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGdldEluZm8oY2IpIHtcbiAgICBpZiAodGhpcy5fYnVmZmVyZWRCeXRlcyA8IDIpIHtcbiAgICAgIHRoaXMuX2xvb3AgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBidWYgPSB0aGlzLmNvbnN1bWUoMik7XG5cbiAgICBpZiAoKGJ1ZlswXSAmIDB4MzApICE9PSAweDAwKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgICdSU1YyIGFuZCBSU1YzIG11c3QgYmUgY2xlYXInLFxuICAgICAgICB0cnVlLFxuICAgICAgICAxMDAyLFxuICAgICAgICAnV1NfRVJSX1VORVhQRUNURURfUlNWXzJfMydcbiAgICAgICk7XG5cbiAgICAgIGNiKGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb21wcmVzc2VkID0gKGJ1ZlswXSAmIDB4NDApID09PSAweDQwO1xuXG4gICAgaWYgKGNvbXByZXNzZWQgJiYgIXRoaXMuX2V4dGVuc2lvbnNbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV0pIHtcbiAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgUmFuZ2VFcnJvcixcbiAgICAgICAgJ1JTVjEgbXVzdCBiZSBjbGVhcicsXG4gICAgICAgIHRydWUsXG4gICAgICAgIDEwMDIsXG4gICAgICAgICdXU19FUlJfVU5FWFBFQ1RFRF9SU1ZfMSdcbiAgICAgICk7XG5cbiAgICAgIGNiKGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9maW4gPSAoYnVmWzBdICYgMHg4MCkgPT09IDB4ODA7XG4gICAgdGhpcy5fb3Bjb2RlID0gYnVmWzBdICYgMHgwZjtcbiAgICB0aGlzLl9wYXlsb2FkTGVuZ3RoID0gYnVmWzFdICYgMHg3ZjtcblxuICAgIGlmICh0aGlzLl9vcGNvZGUgPT09IDB4MDApIHtcbiAgICAgIGlmIChjb21wcmVzc2VkKSB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgICBSYW5nZUVycm9yLFxuICAgICAgICAgICdSU1YxIG11c3QgYmUgY2xlYXInLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgMTAwMixcbiAgICAgICAgICAnV1NfRVJSX1VORVhQRUNURURfUlNWXzEnXG4gICAgICAgICk7XG5cbiAgICAgICAgY2IoZXJyb3IpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghdGhpcy5fZnJhZ21lbnRlZCkge1xuICAgICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgICAgUmFuZ2VFcnJvcixcbiAgICAgICAgICAnaW52YWxpZCBvcGNvZGUgMCcsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAxMDAyLFxuICAgICAgICAgICdXU19FUlJfSU5WQUxJRF9PUENPREUnXG4gICAgICAgICk7XG5cbiAgICAgICAgY2IoZXJyb3IpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX29wY29kZSA9IHRoaXMuX2ZyYWdtZW50ZWQ7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9vcGNvZGUgPT09IDB4MDEgfHwgdGhpcy5fb3Bjb2RlID09PSAweDAyKSB7XG4gICAgICBpZiAodGhpcy5fZnJhZ21lbnRlZCkge1xuICAgICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgICAgUmFuZ2VFcnJvcixcbiAgICAgICAgICBgaW52YWxpZCBvcGNvZGUgJHt0aGlzLl9vcGNvZGV9YCxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIDEwMDIsXG4gICAgICAgICAgJ1dTX0VSUl9JTlZBTElEX09QQ09ERSdcbiAgICAgICAgKTtcblxuICAgICAgICBjYihlcnJvcik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fY29tcHJlc3NlZCA9IGNvbXByZXNzZWQ7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9vcGNvZGUgPiAweDA3ICYmIHRoaXMuX29wY29kZSA8IDB4MGIpIHtcbiAgICAgIGlmICghdGhpcy5fZmluKSB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgICBSYW5nZUVycm9yLFxuICAgICAgICAgICdGSU4gbXVzdCBiZSBzZXQnLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgMTAwMixcbiAgICAgICAgICAnV1NfRVJSX0VYUEVDVEVEX0ZJTidcbiAgICAgICAgKTtcblxuICAgICAgICBjYihlcnJvcik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKGNvbXByZXNzZWQpIHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSB0aGlzLmNyZWF0ZUVycm9yKFxuICAgICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgICAgJ1JTVjEgbXVzdCBiZSBjbGVhcicsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAxMDAyLFxuICAgICAgICAgICdXU19FUlJfVU5FWFBFQ1RFRF9SU1ZfMSdcbiAgICAgICAgKTtcblxuICAgICAgICBjYihlcnJvcik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICB0aGlzLl9wYXlsb2FkTGVuZ3RoID4gMHg3ZCB8fFxuICAgICAgICAodGhpcy5fb3Bjb2RlID09PSAweDA4ICYmIHRoaXMuX3BheWxvYWRMZW5ndGggPT09IDEpXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSB0aGlzLmNyZWF0ZUVycm9yKFxuICAgICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgICAgYGludmFsaWQgcGF5bG9hZCBsZW5ndGggJHt0aGlzLl9wYXlsb2FkTGVuZ3RofWAsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAxMDAyLFxuICAgICAgICAgICdXU19FUlJfSU5WQUxJRF9DT05UUk9MX1BBWUxPQURfTEVOR1RIJ1xuICAgICAgICApO1xuXG4gICAgICAgIGNiKGVycm9yKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgIGBpbnZhbGlkIG9wY29kZSAke3RoaXMuX29wY29kZX1gLFxuICAgICAgICB0cnVlLFxuICAgICAgICAxMDAyLFxuICAgICAgICAnV1NfRVJSX0lOVkFMSURfT1BDT0RFJ1xuICAgICAgKTtcblxuICAgICAgY2IoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5fZmluICYmICF0aGlzLl9mcmFnbWVudGVkKSB0aGlzLl9mcmFnbWVudGVkID0gdGhpcy5fb3Bjb2RlO1xuICAgIHRoaXMuX21hc2tlZCA9IChidWZbMV0gJiAweDgwKSA9PT0gMHg4MDtcblxuICAgIGlmICh0aGlzLl9pc1NlcnZlcikge1xuICAgICAgaWYgKCF0aGlzLl9tYXNrZWQpIHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSB0aGlzLmNyZWF0ZUVycm9yKFxuICAgICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgICAgJ01BU0sgbXVzdCBiZSBzZXQnLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgMTAwMixcbiAgICAgICAgICAnV1NfRVJSX0VYUEVDVEVEX01BU0snXG4gICAgICAgICk7XG5cbiAgICAgICAgY2IoZXJyb3IpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLl9tYXNrZWQpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgUmFuZ2VFcnJvcixcbiAgICAgICAgJ01BU0sgbXVzdCBiZSBjbGVhcicsXG4gICAgICAgIHRydWUsXG4gICAgICAgIDEwMDIsXG4gICAgICAgICdXU19FUlJfVU5FWFBFQ1RFRF9NQVNLJ1xuICAgICAgKTtcblxuICAgICAgY2IoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9wYXlsb2FkTGVuZ3RoID09PSAxMjYpIHRoaXMuX3N0YXRlID0gR0VUX1BBWUxPQURfTEVOR1RIXzE2O1xuICAgIGVsc2UgaWYgKHRoaXMuX3BheWxvYWRMZW5ndGggPT09IDEyNykgdGhpcy5fc3RhdGUgPSBHRVRfUEFZTE9BRF9MRU5HVEhfNjQ7XG4gICAgZWxzZSB0aGlzLmhhdmVMZW5ndGgoY2IpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgZXh0ZW5kZWQgcGF5bG9hZCBsZW5ndGggKDcrMTYpLlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYiBDYWxsYmFja1xuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZ2V0UGF5bG9hZExlbmd0aDE2KGNiKSB7XG4gICAgaWYgKHRoaXMuX2J1ZmZlcmVkQnl0ZXMgPCAyKSB7XG4gICAgICB0aGlzLl9sb29wID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fcGF5bG9hZExlbmd0aCA9IHRoaXMuY29uc3VtZSgyKS5yZWFkVUludDE2QkUoMCk7XG4gICAgdGhpcy5oYXZlTGVuZ3RoKGNiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGV4dGVuZGVkIHBheWxvYWQgbGVuZ3RoICg3KzY0KS5cbiAgICpcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgQ2FsbGJhY2tcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGdldFBheWxvYWRMZW5ndGg2NChjYikge1xuICAgIGlmICh0aGlzLl9idWZmZXJlZEJ5dGVzIDwgOCkge1xuICAgICAgdGhpcy5fbG9vcCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGJ1ZiA9IHRoaXMuY29uc3VtZSg4KTtcbiAgICBjb25zdCBudW0gPSBidWYucmVhZFVJbnQzMkJFKDApO1xuXG4gICAgLy9cbiAgICAvLyBUaGUgbWF4aW11bSBzYWZlIGludGVnZXIgaW4gSmF2YVNjcmlwdCBpcyAyXjUzIC0gMS4gQW4gZXJyb3IgaXMgcmV0dXJuZWRcbiAgICAvLyBpZiBwYXlsb2FkIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhpcyBudW1iZXIuXG4gICAgLy9cbiAgICBpZiAobnVtID4gTWF0aC5wb3coMiwgNTMgLSAzMikgLSAxKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgICdVbnN1cHBvcnRlZCBXZWJTb2NrZXQgZnJhbWU6IHBheWxvYWQgbGVuZ3RoID4gMl41MyAtIDEnLFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgMTAwOSxcbiAgICAgICAgJ1dTX0VSUl9VTlNVUFBPUlRFRF9EQVRBX1BBWUxPQURfTEVOR1RIJ1xuICAgICAgKTtcblxuICAgICAgY2IoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuX3BheWxvYWRMZW5ndGggPSBudW0gKiBNYXRoLnBvdygyLCAzMikgKyBidWYucmVhZFVJbnQzMkJFKDQpO1xuICAgIHRoaXMuaGF2ZUxlbmd0aChjYik7XG4gIH1cblxuICAvKipcbiAgICogUGF5bG9hZCBsZW5ndGggaGFzIGJlZW4gcmVhZC5cbiAgICpcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgQ2FsbGJhY2tcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGhhdmVMZW5ndGgoY2IpIHtcbiAgICBpZiAodGhpcy5fcGF5bG9hZExlbmd0aCAmJiB0aGlzLl9vcGNvZGUgPCAweDA4KSB7XG4gICAgICB0aGlzLl90b3RhbFBheWxvYWRMZW5ndGggKz0gdGhpcy5fcGF5bG9hZExlbmd0aDtcbiAgICAgIGlmICh0aGlzLl90b3RhbFBheWxvYWRMZW5ndGggPiB0aGlzLl9tYXhQYXlsb2FkICYmIHRoaXMuX21heFBheWxvYWQgPiAwKSB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgICBSYW5nZUVycm9yLFxuICAgICAgICAgICdNYXggcGF5bG9hZCBzaXplIGV4Y2VlZGVkJyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAxMDA5LFxuICAgICAgICAgICdXU19FUlJfVU5TVVBQT1JURURfTUVTU0FHRV9MRU5HVEgnXG4gICAgICAgICk7XG5cbiAgICAgICAgY2IoZXJyb3IpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX21hc2tlZCkgdGhpcy5fc3RhdGUgPSBHRVRfTUFTSztcbiAgICBlbHNlIHRoaXMuX3N0YXRlID0gR0VUX0RBVEE7XG4gIH1cblxuICAvKipcbiAgICogUmVhZHMgbWFzayBieXRlcy5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGdldE1hc2soKSB7XG4gICAgaWYgKHRoaXMuX2J1ZmZlcmVkQnl0ZXMgPCA0KSB7XG4gICAgICB0aGlzLl9sb29wID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fbWFzayA9IHRoaXMuY29uc3VtZSg0KTtcbiAgICB0aGlzLl9zdGF0ZSA9IEdFVF9EQVRBO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIGRhdGEgYnl0ZXMuXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIENhbGxiYWNrXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBnZXREYXRhKGNiKSB7XG4gICAgbGV0IGRhdGEgPSBFTVBUWV9CVUZGRVI7XG5cbiAgICBpZiAodGhpcy5fcGF5bG9hZExlbmd0aCkge1xuICAgICAgaWYgKHRoaXMuX2J1ZmZlcmVkQnl0ZXMgPCB0aGlzLl9wYXlsb2FkTGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuX2xvb3AgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkYXRhID0gdGhpcy5jb25zdW1lKHRoaXMuX3BheWxvYWRMZW5ndGgpO1xuXG4gICAgICBpZiAoXG4gICAgICAgIHRoaXMuX21hc2tlZCAmJlxuICAgICAgICAodGhpcy5fbWFza1swXSB8IHRoaXMuX21hc2tbMV0gfCB0aGlzLl9tYXNrWzJdIHwgdGhpcy5fbWFza1szXSkgIT09IDBcbiAgICAgICkge1xuICAgICAgICB1bm1hc2soZGF0YSwgdGhpcy5fbWFzayk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX29wY29kZSA+IDB4MDcpIHtcbiAgICAgIHRoaXMuY29udHJvbE1lc3NhZ2UoZGF0YSwgY2IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9tYXhGcmFnbWVudHMgPiAwICYmICsrdGhpcy5fbnVtRnJhZ21lbnRzID4gdGhpcy5fbWF4RnJhZ21lbnRzKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgIFJhbmdlRXJyb3IsXG4gICAgICAgICdUb28gbWFueSBtZXNzYWdlIGZyYWdtZW50cycsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICAxMDA4LFxuICAgICAgICAnV1NfRVJSX1RPT19NQU5ZX0JVRkZFUkVEX1BBUlRTJ1xuICAgICAgKTtcblxuICAgICAgY2IoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9jb21wcmVzc2VkKSB7XG4gICAgICB0aGlzLl9zdGF0ZSA9IElORkxBVElORztcbiAgICAgIHRoaXMuZGVjb21wcmVzcyhkYXRhLCBjYik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGRhdGEubGVuZ3RoKSB7XG4gICAgICAvL1xuICAgICAgLy8gVGhpcyBtZXNzYWdlIGlzIG5vdCBjb21wcmVzc2VkIHNvIGl0cyBsZW5ndGggaXMgdGhlIHN1bSBvZiB0aGUgcGF5bG9hZFxuICAgICAgLy8gbGVuZ3RoIG9mIGFsbCBmcmFnbWVudHMuXG4gICAgICAvL1xuICAgICAgdGhpcy5fbWVzc2FnZUxlbmd0aCA9IHRoaXMuX3RvdGFsUGF5bG9hZExlbmd0aDtcbiAgICAgIHRoaXMuX2ZyYWdtZW50cy5wdXNoKGRhdGEpO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YU1lc3NhZ2UoY2IpO1xuICB9XG5cbiAgLyoqXG4gICAqIERlY29tcHJlc3NlcyBkYXRhLlxuICAgKlxuICAgKiBAcGFyYW0ge0J1ZmZlcn0gZGF0YSBDb21wcmVzc2VkIGRhdGFcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgQ2FsbGJhY2tcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGRlY29tcHJlc3MoZGF0YSwgY2IpIHtcbiAgICBjb25zdCBwZXJNZXNzYWdlRGVmbGF0ZSA9IHRoaXMuX2V4dGVuc2lvbnNbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV07XG5cbiAgICBwZXJNZXNzYWdlRGVmbGF0ZS5kZWNvbXByZXNzKGRhdGEsIHRoaXMuX2ZpbiwgKGVyciwgYnVmKSA9PiB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKTtcblxuICAgICAgaWYgKGJ1Zi5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxlbmd0aCArPSBidWYubGVuZ3RoO1xuICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxlbmd0aCA+IHRoaXMuX21heFBheWxvYWQgJiYgdGhpcy5fbWF4UGF5bG9hZCA+IDApIHtcbiAgICAgICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgICAgICBSYW5nZUVycm9yLFxuICAgICAgICAgICAgJ01heCBwYXlsb2FkIHNpemUgZXhjZWVkZWQnLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAxMDA5LFxuICAgICAgICAgICAgJ1dTX0VSUl9VTlNVUFBPUlRFRF9NRVNTQUdFX0xFTkdUSCdcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY2IoZXJyb3IpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2ZyYWdtZW50cy5wdXNoKGJ1Zik7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZGF0YU1lc3NhZ2UoY2IpO1xuICAgICAgaWYgKHRoaXMuX3N0YXRlID09PSBHRVRfSU5GTykgdGhpcy5zdGFydExvb3AoY2IpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZXMgYSBkYXRhIG1lc3NhZ2UuXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIENhbGxiYWNrXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBkYXRhTWVzc2FnZShjYikge1xuICAgIGlmICghdGhpcy5fZmluKSB7XG4gICAgICB0aGlzLl9zdGF0ZSA9IEdFVF9JTkZPO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG1lc3NhZ2VMZW5ndGggPSB0aGlzLl9tZXNzYWdlTGVuZ3RoO1xuICAgIGNvbnN0IGZyYWdtZW50cyA9IHRoaXMuX2ZyYWdtZW50cztcblxuICAgIHRoaXMuX3RvdGFsUGF5bG9hZExlbmd0aCA9IDA7XG4gICAgdGhpcy5fbWVzc2FnZUxlbmd0aCA9IDA7XG4gICAgdGhpcy5fZnJhZ21lbnRlZCA9IDA7XG4gICAgdGhpcy5fbnVtRnJhZ21lbnRzID0gMDtcbiAgICB0aGlzLl9mcmFnbWVudHMgPSBbXTtcblxuICAgIGlmICh0aGlzLl9vcGNvZGUgPT09IDIpIHtcbiAgICAgIGxldCBkYXRhO1xuXG4gICAgICBpZiAodGhpcy5fYmluYXJ5VHlwZSA9PT0gJ25vZGVidWZmZXInKSB7XG4gICAgICAgIGRhdGEgPSBjb25jYXQoZnJhZ21lbnRzLCBtZXNzYWdlTGVuZ3RoKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fYmluYXJ5VHlwZSA9PT0gJ2FycmF5YnVmZmVyJykge1xuICAgICAgICBkYXRhID0gdG9BcnJheUJ1ZmZlcihjb25jYXQoZnJhZ21lbnRzLCBtZXNzYWdlTGVuZ3RoKSk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuX2JpbmFyeVR5cGUgPT09ICdibG9iJykge1xuICAgICAgICBkYXRhID0gbmV3IEJsb2IoZnJhZ21lbnRzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRhdGEgPSBmcmFnbWVudHM7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9hbGxvd1N5bmNocm9ub3VzRXZlbnRzKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIGRhdGEsIHRydWUpO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IEdFVF9JTkZPO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fc3RhdGUgPSBERUZFUl9FVkVOVDtcbiAgICAgICAgc2V0SW1tZWRpYXRlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCBkYXRhLCB0cnVlKTtcbiAgICAgICAgICB0aGlzLl9zdGF0ZSA9IEdFVF9JTkZPO1xuICAgICAgICAgIHRoaXMuc3RhcnRMb29wKGNiKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGJ1ZiA9IGNvbmNhdChmcmFnbWVudHMsIG1lc3NhZ2VMZW5ndGgpO1xuXG4gICAgICBpZiAoIXRoaXMuX3NraXBVVEY4VmFsaWRhdGlvbiAmJiAhaXNWYWxpZFVURjgoYnVmKSkge1xuICAgICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgICAgRXJyb3IsXG4gICAgICAgICAgJ2ludmFsaWQgVVRGLTggc2VxdWVuY2UnLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgMTAwNyxcbiAgICAgICAgICAnV1NfRVJSX0lOVkFMSURfVVRGOCdcbiAgICAgICAgKTtcblxuICAgICAgICBjYihlcnJvcik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuX3N0YXRlID09PSBJTkZMQVRJTkcgfHwgdGhpcy5fYWxsb3dTeW5jaHJvbm91c0V2ZW50cykge1xuICAgICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCBidWYsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5fc3RhdGUgPSBHRVRfSU5GTztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3N0YXRlID0gREVGRVJfRVZFTlQ7XG4gICAgICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgYnVmLCBmYWxzZSk7XG4gICAgICAgICAgdGhpcy5fc3RhdGUgPSBHRVRfSU5GTztcbiAgICAgICAgICB0aGlzLnN0YXJ0TG9vcChjYik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGVzIGEgY29udHJvbCBtZXNzYWdlLlxuICAgKlxuICAgKiBAcGFyYW0ge0J1ZmZlcn0gZGF0YSBEYXRhIHRvIGhhbmRsZVxuICAgKiBAcmV0dXJuIHsoRXJyb3J8UmFuZ2VFcnJvcnx1bmRlZmluZWQpfSBBIHBvc3NpYmxlIGVycm9yXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBjb250cm9sTWVzc2FnZShkYXRhLCBjYikge1xuICAgIGlmICh0aGlzLl9vcGNvZGUgPT09IDB4MDgpIHtcbiAgICAgIGlmIChkYXRhLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aGlzLl9sb29wID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZW1pdCgnY29uY2x1ZGUnLCAxMDA1LCBFTVBUWV9CVUZGRVIpO1xuICAgICAgICB0aGlzLmVuZCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY29kZSA9IGRhdGEucmVhZFVJbnQxNkJFKDApO1xuXG4gICAgICAgIGlmICghaXNWYWxpZFN0YXR1c0NvZGUoY29kZSkpIHtcbiAgICAgICAgICBjb25zdCBlcnJvciA9IHRoaXMuY3JlYXRlRXJyb3IoXG4gICAgICAgICAgICBSYW5nZUVycm9yLFxuICAgICAgICAgICAgYGludmFsaWQgc3RhdHVzIGNvZGUgJHtjb2RlfWAsXG4gICAgICAgICAgICB0cnVlLFxuICAgICAgICAgICAgMTAwMixcbiAgICAgICAgICAgICdXU19FUlJfSU5WQUxJRF9DTE9TRV9DT0RFJ1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjYihlcnJvcik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnVmID0gbmV3IEZhc3RCdWZmZXIoXG4gICAgICAgICAgZGF0YS5idWZmZXIsXG4gICAgICAgICAgZGF0YS5ieXRlT2Zmc2V0ICsgMixcbiAgICAgICAgICBkYXRhLmxlbmd0aCAtIDJcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoIXRoaXMuX3NraXBVVEY4VmFsaWRhdGlvbiAmJiAhaXNWYWxpZFVURjgoYnVmKSkge1xuICAgICAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5jcmVhdGVFcnJvcihcbiAgICAgICAgICAgIEVycm9yLFxuICAgICAgICAgICAgJ2ludmFsaWQgVVRGLTggc2VxdWVuY2UnLFxuICAgICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAgIDEwMDcsXG4gICAgICAgICAgICAnV1NfRVJSX0lOVkFMSURfVVRGOCdcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY2IoZXJyb3IpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2xvb3AgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5lbWl0KCdjb25jbHVkZScsIGNvZGUsIGJ1Zik7XG4gICAgICAgIHRoaXMuZW5kKCk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3N0YXRlID0gR0VUX0lORk87XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2FsbG93U3luY2hyb25vdXNFdmVudHMpIHtcbiAgICAgIHRoaXMuZW1pdCh0aGlzLl9vcGNvZGUgPT09IDB4MDkgPyAncGluZycgOiAncG9uZycsIGRhdGEpO1xuICAgICAgdGhpcy5fc3RhdGUgPSBHRVRfSU5GTztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc3RhdGUgPSBERUZFUl9FVkVOVDtcbiAgICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICAgIHRoaXMuZW1pdCh0aGlzLl9vcGNvZGUgPT09IDB4MDkgPyAncGluZycgOiAncG9uZycsIGRhdGEpO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IEdFVF9JTkZPO1xuICAgICAgICB0aGlzLnN0YXJ0TG9vcChjYik7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQnVpbGRzIGFuIGVycm9yIG9iamVjdC5cbiAgICpcbiAgICogQHBhcmFtIHtmdW5jdGlvbihuZXc6RXJyb3J8UmFuZ2VFcnJvcil9IEVycm9yQ3RvciBUaGUgZXJyb3IgY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIGVycm9yIG1lc3NhZ2VcbiAgICogQHBhcmFtIHtCb29sZWFufSBwcmVmaXggU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIGFkZCBhIGRlZmF1bHQgcHJlZml4IHRvXG4gICAqICAgICBgbWVzc2FnZWBcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXR1c0NvZGUgVGhlIHN0YXR1cyBjb2RlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBlcnJvckNvZGUgVGhlIGV4cG9zZWQgZXJyb3IgY29kZVxuICAgKiBAcmV0dXJuIHsoRXJyb3J8UmFuZ2VFcnJvcil9IFRoZSBlcnJvclxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgY3JlYXRlRXJyb3IoRXJyb3JDdG9yLCBtZXNzYWdlLCBwcmVmaXgsIHN0YXR1c0NvZGUsIGVycm9yQ29kZSkge1xuICAgIHRoaXMuX2xvb3AgPSBmYWxzZTtcbiAgICB0aGlzLl9lcnJvcmVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IGVyciA9IG5ldyBFcnJvckN0b3IoXG4gICAgICBwcmVmaXggPyBgSW52YWxpZCBXZWJTb2NrZXQgZnJhbWU6ICR7bWVzc2FnZX1gIDogbWVzc2FnZVxuICAgICk7XG5cbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShlcnIsIHRoaXMuY3JlYXRlRXJyb3IpO1xuICAgIGVyci5jb2RlID0gZXJyb3JDb2RlO1xuICAgIGVycltrU3RhdHVzQ29kZV0gPSBzdGF0dXNDb2RlO1xuICAgIHJldHVybiBlcnI7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZWNlaXZlcjtcbiIsICIvKiBlc2xpbnQgbm8tdW51c2VkLXZhcnM6IFtcImVycm9yXCIsIHsgXCJ2YXJzSWdub3JlUGF0dGVyblwiOiBcIl5EdXBsZXhcIiB9XSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IHsgRHVwbGV4IH0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbmNvbnN0IHsgcmFuZG9tRmlsbFN5bmMgfSA9IHJlcXVpcmUoJ2NyeXB0bycpO1xuY29uc3Qge1xuICB0eXBlczogeyBpc1VpbnQ4QXJyYXkgfVxufSA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuY29uc3QgUGVyTWVzc2FnZURlZmxhdGUgPSByZXF1aXJlKCcuL3Blcm1lc3NhZ2UtZGVmbGF0ZScpO1xuY29uc3QgeyBFTVBUWV9CVUZGRVIsIGtXZWJTb2NrZXQsIE5PT1AgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5jb25zdCB7IGlzQmxvYiwgaXNWYWxpZFN0YXR1c0NvZGUgfSA9IHJlcXVpcmUoJy4vdmFsaWRhdGlvbicpO1xuY29uc3QgeyBtYXNrOiBhcHBseU1hc2ssIHRvQnVmZmVyIH0gPSByZXF1aXJlKCcuL2J1ZmZlci11dGlsJyk7XG5cbmNvbnN0IGtCeXRlTGVuZ3RoID0gU3ltYm9sKCdrQnl0ZUxlbmd0aCcpO1xuY29uc3QgbWFza0J1ZmZlciA9IEJ1ZmZlci5hbGxvYyg0KTtcbmNvbnN0IFJBTkRPTV9QT09MX1NJWkUgPSA4ICogMTAyNDtcbmxldCByYW5kb21Qb29sO1xubGV0IHJhbmRvbVBvb2xQb2ludGVyID0gUkFORE9NX1BPT0xfU0laRTtcblxuY29uc3QgREVGQVVMVCA9IDA7XG5jb25zdCBERUZMQVRJTkcgPSAxO1xuY29uc3QgR0VUX0JMT0JfREFUQSA9IDI7XG5cbi8qKlxuICogSHlCaSBTZW5kZXIgaW1wbGVtZW50YXRpb24uXG4gKi9cbmNsYXNzIFNlbmRlciB7XG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgU2VuZGVyIGluc3RhbmNlLlxuICAgKlxuICAgKiBAcGFyYW0ge0R1cGxleH0gc29ja2V0IFRoZSBjb25uZWN0aW9uIHNvY2tldFxuICAgKiBAcGFyYW0ge09iamVjdH0gW2V4dGVuc2lvbnNdIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSBuZWdvdGlhdGVkIGV4dGVuc2lvbnNcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2dlbmVyYXRlTWFza10gVGhlIGZ1bmN0aW9uIHVzZWQgdG8gZ2VuZXJhdGUgdGhlIG1hc2tpbmdcbiAgICogICAgIGtleVxuICAgKi9cbiAgY29uc3RydWN0b3Ioc29ja2V0LCBleHRlbnNpb25zLCBnZW5lcmF0ZU1hc2spIHtcbiAgICB0aGlzLl9leHRlbnNpb25zID0gZXh0ZW5zaW9ucyB8fCB7fTtcblxuICAgIGlmIChnZW5lcmF0ZU1hc2spIHtcbiAgICAgIHRoaXMuX2dlbmVyYXRlTWFzayA9IGdlbmVyYXRlTWFzaztcbiAgICAgIHRoaXMuX21hc2tCdWZmZXIgPSBCdWZmZXIuYWxsb2MoNCk7XG4gICAgfVxuXG4gICAgdGhpcy5fc29ja2V0ID0gc29ja2V0O1xuXG4gICAgdGhpcy5fZmlyc3RGcmFnbWVudCA9IHRydWU7XG4gICAgdGhpcy5fY29tcHJlc3MgPSBmYWxzZTtcblxuICAgIHRoaXMuX2J1ZmZlcmVkQnl0ZXMgPSAwO1xuICAgIHRoaXMuX3F1ZXVlID0gW107XG4gICAgdGhpcy5fc3RhdGUgPSBERUZBVUxUO1xuICAgIHRoaXMub25lcnJvciA9IE5PT1A7XG4gICAgdGhpc1trV2ViU29ja2V0XSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBGcmFtZXMgYSBwaWVjZSBvZiBkYXRhIGFjY29yZGluZyB0byB0aGUgSHlCaSBXZWJTb2NrZXQgcHJvdG9jb2wuXG4gICAqXG4gICAqIEBwYXJhbSB7KEJ1ZmZlcnxTdHJpbmcpfSBkYXRhIFRoZSBkYXRhIHRvIGZyYW1lXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wdGlvbnMgb2JqZWN0XG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuZmluPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2V0IHRoZVxuICAgKiAgICAgRklOIGJpdFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5nZW5lcmF0ZU1hc2tdIFRoZSBmdW5jdGlvbiB1c2VkIHRvIGdlbmVyYXRlIHRoZVxuICAgKiAgICAgbWFza2luZyBrZXlcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5tYXNrPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gbWFza1xuICAgKiAgICAgYGRhdGFgXG4gICAqIEBwYXJhbSB7QnVmZmVyfSBbb3B0aW9ucy5tYXNrQnVmZmVyXSBUaGUgYnVmZmVyIHVzZWQgdG8gc3RvcmUgdGhlIG1hc2tpbmdcbiAgICogICAgIGtleVxuICAgKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy5vcGNvZGUgVGhlIG9wY29kZVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLnJlYWRPbmx5PWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBgZGF0YWAgY2FuIGJlXG4gICAqICAgICBtb2RpZmllZFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLnJzdjE9ZmFsc2VdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzZXQgdGhlXG4gICAqICAgICBSU1YxIGJpdFxuICAgKiBAcmV0dXJuIHsoQnVmZmVyfFN0cmluZylbXX0gVGhlIGZyYW1lZCBkYXRhXG4gICAqIEBwdWJsaWNcbiAgICovXG4gIHN0YXRpYyBmcmFtZShkYXRhLCBvcHRpb25zKSB7XG4gICAgbGV0IG1hc2s7XG4gICAgbGV0IG1lcmdlID0gZmFsc2U7XG4gICAgbGV0IG9mZnNldCA9IDI7XG4gICAgbGV0IHNraXBNYXNraW5nID0gZmFsc2U7XG5cbiAgICBpZiAob3B0aW9ucy5tYXNrKSB7XG4gICAgICBtYXNrID0gb3B0aW9ucy5tYXNrQnVmZmVyIHx8IG1hc2tCdWZmZXI7XG5cbiAgICAgIGlmIChvcHRpb25zLmdlbmVyYXRlTWFzaykge1xuICAgICAgICBvcHRpb25zLmdlbmVyYXRlTWFzayhtYXNrKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChyYW5kb21Qb29sUG9pbnRlciA9PT0gUkFORE9NX1BPT0xfU0laRSkge1xuICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICAqL1xuICAgICAgICAgIGlmIChyYW5kb21Qb29sID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGxhemlseSBpbml0aWFsaXplZCBiZWNhdXNlIHNlcnZlci1zZW50IGZyYW1lcyBtdXN0IG5vdFxuICAgICAgICAgICAgLy8gYmUgbWFza2VkIHNvIGl0IG1heSBuZXZlciBiZSB1c2VkLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIHJhbmRvbVBvb2wgPSBCdWZmZXIuYWxsb2MoUkFORE9NX1BPT0xfU0laRSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmFuZG9tRmlsbFN5bmMocmFuZG9tUG9vbCwgMCwgUkFORE9NX1BPT0xfU0laRSk7XG4gICAgICAgICAgcmFuZG9tUG9vbFBvaW50ZXIgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgbWFza1swXSA9IHJhbmRvbVBvb2xbcmFuZG9tUG9vbFBvaW50ZXIrK107XG4gICAgICAgIG1hc2tbMV0gPSByYW5kb21Qb29sW3JhbmRvbVBvb2xQb2ludGVyKytdO1xuICAgICAgICBtYXNrWzJdID0gcmFuZG9tUG9vbFtyYW5kb21Qb29sUG9pbnRlcisrXTtcbiAgICAgICAgbWFza1szXSA9IHJhbmRvbVBvb2xbcmFuZG9tUG9vbFBvaW50ZXIrK107XG4gICAgICB9XG5cbiAgICAgIHNraXBNYXNraW5nID0gKG1hc2tbMF0gfCBtYXNrWzFdIHwgbWFza1syXSB8IG1hc2tbM10pID09PSAwO1xuICAgICAgb2Zmc2V0ID0gNjtcbiAgICB9XG5cbiAgICBsZXQgZGF0YUxlbmd0aDtcblxuICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmIChcbiAgICAgICAgKCFvcHRpb25zLm1hc2sgfHwgc2tpcE1hc2tpbmcpICYmXG4gICAgICAgIG9wdGlvbnNba0J5dGVMZW5ndGhdICE9PSB1bmRlZmluZWRcbiAgICAgICkge1xuICAgICAgICBkYXRhTGVuZ3RoID0gb3B0aW9uc1trQnl0ZUxlbmd0aF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhID0gQnVmZmVyLmZyb20oZGF0YSk7XG4gICAgICAgIGRhdGFMZW5ndGggPSBkYXRhLmxlbmd0aDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YUxlbmd0aCA9IGRhdGEubGVuZ3RoO1xuICAgICAgbWVyZ2UgPSBvcHRpb25zLm1hc2sgJiYgb3B0aW9ucy5yZWFkT25seSAmJiAhc2tpcE1hc2tpbmc7XG4gICAgfVxuXG4gICAgbGV0IHBheWxvYWRMZW5ndGggPSBkYXRhTGVuZ3RoO1xuXG4gICAgaWYgKGRhdGFMZW5ndGggPj0gNjU1MzYpIHtcbiAgICAgIG9mZnNldCArPSA4O1xuICAgICAgcGF5bG9hZExlbmd0aCA9IDEyNztcbiAgICB9IGVsc2UgaWYgKGRhdGFMZW5ndGggPiAxMjUpIHtcbiAgICAgIG9mZnNldCArPSAyO1xuICAgICAgcGF5bG9hZExlbmd0aCA9IDEyNjtcbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXQgPSBCdWZmZXIuYWxsb2NVbnNhZmUobWVyZ2UgPyBkYXRhTGVuZ3RoICsgb2Zmc2V0IDogb2Zmc2V0KTtcblxuICAgIHRhcmdldFswXSA9IG9wdGlvbnMuZmluID8gb3B0aW9ucy5vcGNvZGUgfCAweDgwIDogb3B0aW9ucy5vcGNvZGU7XG4gICAgaWYgKG9wdGlvbnMucnN2MSkgdGFyZ2V0WzBdIHw9IDB4NDA7XG5cbiAgICB0YXJnZXRbMV0gPSBwYXlsb2FkTGVuZ3RoO1xuXG4gICAgaWYgKHBheWxvYWRMZW5ndGggPT09IDEyNikge1xuICAgICAgdGFyZ2V0LndyaXRlVUludDE2QkUoZGF0YUxlbmd0aCwgMik7XG4gICAgfSBlbHNlIGlmIChwYXlsb2FkTGVuZ3RoID09PSAxMjcpIHtcbiAgICAgIHRhcmdldFsyXSA9IHRhcmdldFszXSA9IDA7XG4gICAgICB0YXJnZXQud3JpdGVVSW50QkUoZGF0YUxlbmd0aCwgNCwgNik7XG4gICAgfVxuXG4gICAgaWYgKCFvcHRpb25zLm1hc2spIHJldHVybiBbdGFyZ2V0LCBkYXRhXTtcblxuICAgIHRhcmdldFsxXSB8PSAweDgwO1xuICAgIHRhcmdldFtvZmZzZXQgLSA0XSA9IG1hc2tbMF07XG4gICAgdGFyZ2V0W29mZnNldCAtIDNdID0gbWFza1sxXTtcbiAgICB0YXJnZXRbb2Zmc2V0IC0gMl0gPSBtYXNrWzJdO1xuICAgIHRhcmdldFtvZmZzZXQgLSAxXSA9IG1hc2tbM107XG5cbiAgICBpZiAoc2tpcE1hc2tpbmcpIHJldHVybiBbdGFyZ2V0LCBkYXRhXTtcblxuICAgIGlmIChtZXJnZSkge1xuICAgICAgYXBwbHlNYXNrKGRhdGEsIG1hc2ssIHRhcmdldCwgb2Zmc2V0LCBkYXRhTGVuZ3RoKTtcbiAgICAgIHJldHVybiBbdGFyZ2V0XTtcbiAgICB9XG5cbiAgICBhcHBseU1hc2soZGF0YSwgbWFzaywgZGF0YSwgMCwgZGF0YUxlbmd0aCk7XG4gICAgcmV0dXJuIFt0YXJnZXQsIGRhdGFdO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmRzIGEgY2xvc2UgbWVzc2FnZSB0byB0aGUgb3RoZXIgcGVlci5cbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtjb2RlXSBUaGUgc3RhdHVzIGNvZGUgY29tcG9uZW50IG9mIHRoZSBib2R5XG4gICAqIEBwYXJhbSB7KFN0cmluZ3xCdWZmZXIpfSBbZGF0YV0gVGhlIG1lc3NhZ2UgY29tcG9uZW50IG9mIHRoZSBib2R5XG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW21hc2s9ZmFsc2VdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBtYXNrIHRoZSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYl0gQ2FsbGJhY2tcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgY2xvc2UoY29kZSwgZGF0YSwgbWFzaywgY2IpIHtcbiAgICBsZXQgYnVmO1xuXG4gICAgaWYgKGNvZGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgYnVmID0gRU1QVFlfQlVGRkVSO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvZGUgIT09ICdudW1iZXInIHx8ICFpc1ZhbGlkU3RhdHVzQ29kZShjb2RlKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhIHZhbGlkIGVycm9yIGNvZGUgbnVtYmVyJyk7XG4gICAgfSBlbHNlIGlmIChkYXRhID09PSB1bmRlZmluZWQgfHwgIWRhdGEubGVuZ3RoKSB7XG4gICAgICBidWYgPSBCdWZmZXIuYWxsb2NVbnNhZmUoMik7XG4gICAgICBidWYud3JpdGVVSW50MTZCRShjb2RlLCAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoZGF0YSk7XG5cbiAgICAgIGlmIChsZW5ndGggPiAxMjMpIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSBtZXNzYWdlIG11c3Qgbm90IGJlIGdyZWF0ZXIgdGhhbiAxMjMgYnl0ZXMnKTtcbiAgICAgIH1cblxuICAgICAgYnVmID0gQnVmZmVyLmFsbG9jVW5zYWZlKDIgKyBsZW5ndGgpO1xuICAgICAgYnVmLndyaXRlVUludDE2QkUoY29kZSwgMCk7XG5cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgYnVmLndyaXRlKGRhdGEsIDIpO1xuICAgICAgfSBlbHNlIGlmIChpc1VpbnQ4QXJyYXkoZGF0YSkpIHtcbiAgICAgICAgYnVmLnNldChkYXRhLCAyKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIGEgc3RyaW5nIG9yIGEgVWludDhBcnJheScpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBba0J5dGVMZW5ndGhdOiBidWYubGVuZ3RoLFxuICAgICAgZmluOiB0cnVlLFxuICAgICAgZ2VuZXJhdGVNYXNrOiB0aGlzLl9nZW5lcmF0ZU1hc2ssXG4gICAgICBtYXNrLFxuICAgICAgbWFza0J1ZmZlcjogdGhpcy5fbWFza0J1ZmZlcixcbiAgICAgIG9wY29kZTogMHgwOCxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZSxcbiAgICAgIHJzdjE6IGZhbHNlXG4gICAgfTtcblxuICAgIGlmICh0aGlzLl9zdGF0ZSAhPT0gREVGQVVMVCkge1xuICAgICAgdGhpcy5lbnF1ZXVlKFt0aGlzLmRpc3BhdGNoLCBidWYsIGZhbHNlLCBvcHRpb25zLCBjYl0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlbmRGcmFtZShTZW5kZXIuZnJhbWUoYnVmLCBvcHRpb25zKSwgY2IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kcyBhIHBpbmcgbWVzc2FnZSB0byB0aGUgb3RoZXIgcGVlci5cbiAgICpcbiAgICogQHBhcmFtIHsqfSBkYXRhIFRoZSBtZXNzYWdlIHRvIHNlbmRcbiAgICogQHBhcmFtIHtCb29sZWFufSBbbWFzaz1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIG1hc2sgYGRhdGFgXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYl0gQ2FsbGJhY2tcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgcGluZyhkYXRhLCBtYXNrLCBjYikge1xuICAgIGxldCBieXRlTGVuZ3RoO1xuICAgIGxldCByZWFkT25seTtcblxuICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGJ5dGVMZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChkYXRhKTtcbiAgICAgIHJlYWRPbmx5ID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChpc0Jsb2IoZGF0YSkpIHtcbiAgICAgIGJ5dGVMZW5ndGggPSBkYXRhLnNpemU7XG4gICAgICByZWFkT25seSA9IGZhbHNlO1xuICAgIH0gZWxzZSB7XG4gICAgICBkYXRhID0gdG9CdWZmZXIoZGF0YSk7XG4gICAgICBieXRlTGVuZ3RoID0gZGF0YS5sZW5ndGg7XG4gICAgICByZWFkT25seSA9IHRvQnVmZmVyLnJlYWRPbmx5O1xuICAgIH1cblxuICAgIGlmIChieXRlTGVuZ3RoID4gMTI1KSB7XG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVGhlIGRhdGEgc2l6ZSBtdXN0IG5vdCBiZSBncmVhdGVyIHRoYW4gMTI1IGJ5dGVzJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIFtrQnl0ZUxlbmd0aF06IGJ5dGVMZW5ndGgsXG4gICAgICBmaW46IHRydWUsXG4gICAgICBnZW5lcmF0ZU1hc2s6IHRoaXMuX2dlbmVyYXRlTWFzayxcbiAgICAgIG1hc2ssXG4gICAgICBtYXNrQnVmZmVyOiB0aGlzLl9tYXNrQnVmZmVyLFxuICAgICAgb3Bjb2RlOiAweDA5LFxuICAgICAgcmVhZE9ubHksXG4gICAgICByc3YxOiBmYWxzZVxuICAgIH07XG5cbiAgICBpZiAoaXNCbG9iKGRhdGEpKSB7XG4gICAgICBpZiAodGhpcy5fc3RhdGUgIT09IERFRkFVTFQpIHtcbiAgICAgICAgdGhpcy5lbnF1ZXVlKFt0aGlzLmdldEJsb2JEYXRhLCBkYXRhLCBmYWxzZSwgb3B0aW9ucywgY2JdKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ2V0QmxvYkRhdGEoZGF0YSwgZmFsc2UsIG9wdGlvbnMsIGNiKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRoaXMuX3N0YXRlICE9PSBERUZBVUxUKSB7XG4gICAgICB0aGlzLmVucXVldWUoW3RoaXMuZGlzcGF0Y2gsIGRhdGEsIGZhbHNlLCBvcHRpb25zLCBjYl0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlbmRGcmFtZShTZW5kZXIuZnJhbWUoZGF0YSwgb3B0aW9ucyksIGNiKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2VuZHMgYSBwb25nIG1lc3NhZ2UgdG8gdGhlIG90aGVyIHBlZXIuXG4gICAqXG4gICAqIEBwYXJhbSB7Kn0gZGF0YSBUaGUgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW21hc2s9ZmFsc2VdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBtYXNrIGBkYXRhYFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2JdIENhbGxiYWNrXG4gICAqIEBwdWJsaWNcbiAgICovXG4gIHBvbmcoZGF0YSwgbWFzaywgY2IpIHtcbiAgICBsZXQgYnl0ZUxlbmd0aDtcbiAgICBsZXQgcmVhZE9ubHk7XG5cbiAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICBieXRlTGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoZGF0YSk7XG4gICAgICByZWFkT25seSA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAoaXNCbG9iKGRhdGEpKSB7XG4gICAgICBieXRlTGVuZ3RoID0gZGF0YS5zaXplO1xuICAgICAgcmVhZE9ubHkgPSBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YSA9IHRvQnVmZmVyKGRhdGEpO1xuICAgICAgYnl0ZUxlbmd0aCA9IGRhdGEubGVuZ3RoO1xuICAgICAgcmVhZE9ubHkgPSB0b0J1ZmZlci5yZWFkT25seTtcbiAgICB9XG5cbiAgICBpZiAoYnl0ZUxlbmd0aCA+IDEyNSkge1xuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSBkYXRhIHNpemUgbXVzdCBub3QgYmUgZ3JlYXRlciB0aGFuIDEyNSBieXRlcycpO1xuICAgIH1cblxuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBba0J5dGVMZW5ndGhdOiBieXRlTGVuZ3RoLFxuICAgICAgZmluOiB0cnVlLFxuICAgICAgZ2VuZXJhdGVNYXNrOiB0aGlzLl9nZW5lcmF0ZU1hc2ssXG4gICAgICBtYXNrLFxuICAgICAgbWFza0J1ZmZlcjogdGhpcy5fbWFza0J1ZmZlcixcbiAgICAgIG9wY29kZTogMHgwYSxcbiAgICAgIHJlYWRPbmx5LFxuICAgICAgcnN2MTogZmFsc2VcbiAgICB9O1xuXG4gICAgaWYgKGlzQmxvYihkYXRhKSkge1xuICAgICAgaWYgKHRoaXMuX3N0YXRlICE9PSBERUZBVUxUKSB7XG4gICAgICAgIHRoaXMuZW5xdWV1ZShbdGhpcy5nZXRCbG9iRGF0YSwgZGF0YSwgZmFsc2UsIG9wdGlvbnMsIGNiXSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdldEJsb2JEYXRhKGRhdGEsIGZhbHNlLCBvcHRpb25zLCBjYik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLl9zdGF0ZSAhPT0gREVGQVVMVCkge1xuICAgICAgdGhpcy5lbnF1ZXVlKFt0aGlzLmRpc3BhdGNoLCBkYXRhLCBmYWxzZSwgb3B0aW9ucywgY2JdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZW5kRnJhbWUoU2VuZGVyLmZyYW1lKGRhdGEsIG9wdGlvbnMpLCBjYik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbmRzIGEgZGF0YSBtZXNzYWdlIHRvIHRoZSBvdGhlciBwZWVyLlxuICAgKlxuICAgKiBAcGFyYW0geyp9IGRhdGEgVGhlIG1lc3NhZ2UgdG8gc2VuZFxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcHRpb25zIG9iamVjdFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmJpbmFyeT1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgYGRhdGFgIGlzIGJpbmFyeVxuICAgKiAgICAgb3IgdGV4dFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmNvbXByZXNzPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG9cbiAgICogICAgIGNvbXByZXNzIGBkYXRhYFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmZpbj1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGZyYWdtZW50IGlzIHRoZVxuICAgKiAgICAgbGFzdCBvbmVcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5tYXNrPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gbWFza1xuICAgKiAgICAgYGRhdGFgXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYl0gQ2FsbGJhY2tcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgc2VuZChkYXRhLCBvcHRpb25zLCBjYikge1xuICAgIGNvbnN0IHBlck1lc3NhZ2VEZWZsYXRlID0gdGhpcy5fZXh0ZW5zaW9uc1tQZXJNZXNzYWdlRGVmbGF0ZS5leHRlbnNpb25OYW1lXTtcbiAgICBsZXQgb3Bjb2RlID0gb3B0aW9ucy5iaW5hcnkgPyAyIDogMTtcbiAgICBsZXQgcnN2MSA9IG9wdGlvbnMuY29tcHJlc3M7XG5cbiAgICBsZXQgYnl0ZUxlbmd0aDtcbiAgICBsZXQgcmVhZE9ubHk7XG5cbiAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICBieXRlTGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoZGF0YSk7XG4gICAgICByZWFkT25seSA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAoaXNCbG9iKGRhdGEpKSB7XG4gICAgICBieXRlTGVuZ3RoID0gZGF0YS5zaXplO1xuICAgICAgcmVhZE9ubHkgPSBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YSA9IHRvQnVmZmVyKGRhdGEpO1xuICAgICAgYnl0ZUxlbmd0aCA9IGRhdGEubGVuZ3RoO1xuICAgICAgcmVhZE9ubHkgPSB0b0J1ZmZlci5yZWFkT25seTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZmlyc3RGcmFnbWVudCkge1xuICAgICAgdGhpcy5fZmlyc3RGcmFnbWVudCA9IGZhbHNlO1xuICAgICAgaWYgKFxuICAgICAgICByc3YxICYmXG4gICAgICAgIHBlck1lc3NhZ2VEZWZsYXRlICYmXG4gICAgICAgIHBlck1lc3NhZ2VEZWZsYXRlLnBhcmFtc1tcbiAgICAgICAgICBwZXJNZXNzYWdlRGVmbGF0ZS5faXNTZXJ2ZXJcbiAgICAgICAgICAgID8gJ3NlcnZlcl9ub19jb250ZXh0X3Rha2VvdmVyJ1xuICAgICAgICAgICAgOiAnY2xpZW50X25vX2NvbnRleHRfdGFrZW92ZXInXG4gICAgICAgIF1cbiAgICAgICkge1xuICAgICAgICByc3YxID0gYnl0ZUxlbmd0aCA+PSBwZXJNZXNzYWdlRGVmbGF0ZS5fdGhyZXNob2xkO1xuICAgICAgfVxuICAgICAgdGhpcy5fY29tcHJlc3MgPSByc3YxO1xuICAgIH0gZWxzZSB7XG4gICAgICByc3YxID0gZmFsc2U7XG4gICAgICBvcGNvZGUgPSAwO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25zLmZpbikgdGhpcy5fZmlyc3RGcmFnbWVudCA9IHRydWU7XG5cbiAgICBjb25zdCBvcHRzID0ge1xuICAgICAgW2tCeXRlTGVuZ3RoXTogYnl0ZUxlbmd0aCxcbiAgICAgIGZpbjogb3B0aW9ucy5maW4sXG4gICAgICBnZW5lcmF0ZU1hc2s6IHRoaXMuX2dlbmVyYXRlTWFzayxcbiAgICAgIG1hc2s6IG9wdGlvbnMubWFzayxcbiAgICAgIG1hc2tCdWZmZXI6IHRoaXMuX21hc2tCdWZmZXIsXG4gICAgICBvcGNvZGUsXG4gICAgICByZWFkT25seSxcbiAgICAgIHJzdjFcbiAgICB9O1xuXG4gICAgaWYgKGlzQmxvYihkYXRhKSkge1xuICAgICAgaWYgKHRoaXMuX3N0YXRlICE9PSBERUZBVUxUKSB7XG4gICAgICAgIHRoaXMuZW5xdWV1ZShbdGhpcy5nZXRCbG9iRGF0YSwgZGF0YSwgdGhpcy5fY29tcHJlc3MsIG9wdHMsIGNiXSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdldEJsb2JEYXRhKGRhdGEsIHRoaXMuX2NvbXByZXNzLCBvcHRzLCBjYik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLl9zdGF0ZSAhPT0gREVGQVVMVCkge1xuICAgICAgdGhpcy5lbnF1ZXVlKFt0aGlzLmRpc3BhdGNoLCBkYXRhLCB0aGlzLl9jb21wcmVzcywgb3B0cywgY2JdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5kaXNwYXRjaChkYXRhLCB0aGlzLl9jb21wcmVzcywgb3B0cywgY2IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIHRoZSBjb250ZW50cyBvZiBhIGJsb2IgYXMgYmluYXJ5IGRhdGEuXG4gICAqXG4gICAqIEBwYXJhbSB7QmxvYn0gYmxvYiBUaGUgYmxvYlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtjb21wcmVzcz1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIGNvbXByZXNzXG4gICAqICAgICB0aGUgZGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcHRpb25zIG9iamVjdFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmZpbj1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIHNldCB0aGVcbiAgICogICAgIEZJTiBiaXRcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMuZ2VuZXJhdGVNYXNrXSBUaGUgZnVuY3Rpb24gdXNlZCB0byBnZW5lcmF0ZSB0aGVcbiAgICogICAgIG1hc2tpbmcga2V5XG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMubWFzaz1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIG1hc2tcbiAgICogICAgIGBkYXRhYFxuICAgKiBAcGFyYW0ge0J1ZmZlcn0gW29wdGlvbnMubWFza0J1ZmZlcl0gVGhlIGJ1ZmZlciB1c2VkIHRvIHN0b3JlIHRoZSBtYXNraW5nXG4gICAqICAgICBrZXlcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMub3Bjb2RlIFRoZSBvcGNvZGVcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5yZWFkT25seT1mYWxzZV0gU3BlY2lmaWVzIHdoZXRoZXIgYGRhdGFgIGNhbiBiZVxuICAgKiAgICAgbW9kaWZpZWRcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5yc3YxPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2V0IHRoZVxuICAgKiAgICAgUlNWMSBiaXRcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2NiXSBDYWxsYmFja1xuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZ2V0QmxvYkRhdGEoYmxvYiwgY29tcHJlc3MsIG9wdGlvbnMsIGNiKSB7XG4gICAgdGhpcy5fYnVmZmVyZWRCeXRlcyArPSBvcHRpb25zW2tCeXRlTGVuZ3RoXTtcbiAgICB0aGlzLl9zdGF0ZSA9IEdFVF9CTE9CX0RBVEE7XG5cbiAgICBibG9iXG4gICAgICAuYXJyYXlCdWZmZXIoKVxuICAgICAgLnRoZW4oKGFycmF5QnVmZmVyKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLl9zb2NrZXQuZGVzdHJveWVkKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKFxuICAgICAgICAgICAgJ1RoZSBzb2NrZXQgd2FzIGNsb3NlZCB3aGlsZSB0aGUgYmxvYiB3YXMgYmVpbmcgcmVhZCdcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgLy9cbiAgICAgICAgICAvLyBgY2FsbENhbGxiYWNrc2AgaXMgY2FsbGVkIGluIHRoZSBuZXh0IHRpY2sgdG8gZW5zdXJlIHRoYXQgZXJyb3JzXG4gICAgICAgICAgLy8gdGhhdCBtaWdodCBiZSB0aHJvd24gaW4gdGhlIGNhbGxiYWNrcyBiZWhhdmUgbGlrZSBlcnJvcnMgdGhyb3duXG4gICAgICAgICAgLy8gb3V0c2lkZSB0aGUgcHJvbWlzZSBjaGFpbi5cbiAgICAgICAgICAvL1xuICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2soY2FsbENhbGxiYWNrcywgdGhpcywgZXJyLCBjYik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fYnVmZmVyZWRCeXRlcyAtPSBvcHRpb25zW2tCeXRlTGVuZ3RoXTtcbiAgICAgICAgY29uc3QgZGF0YSA9IHRvQnVmZmVyKGFycmF5QnVmZmVyKTtcblxuICAgICAgICBpZiAoIWNvbXByZXNzKSB7XG4gICAgICAgICAgdGhpcy5fc3RhdGUgPSBERUZBVUxUO1xuICAgICAgICAgIHRoaXMuc2VuZEZyYW1lKFNlbmRlci5mcmFtZShkYXRhLCBvcHRpb25zKSwgY2IpO1xuICAgICAgICAgIHRoaXMuZGVxdWV1ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuZGlzcGF0Y2goZGF0YSwgY29tcHJlc3MsIG9wdGlvbnMsIGNiKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIC8vXG4gICAgICAgIC8vIGBvbkVycm9yYCBpcyBjYWxsZWQgaW4gdGhlIG5leHQgdGljayBmb3IgdGhlIHNhbWUgcmVhc29uIHRoYXRcbiAgICAgICAgLy8gYGNhbGxDYWxsYmFja3NgIGFib3ZlIGlzLlxuICAgICAgICAvL1xuICAgICAgICBwcm9jZXNzLm5leHRUaWNrKG9uRXJyb3IsIHRoaXMsIGVyciwgY2IpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogRGlzcGF0Y2hlcyBhIG1lc3NhZ2UuXG4gICAqXG4gICAqIEBwYXJhbSB7KEJ1ZmZlcnxTdHJpbmcpfSBkYXRhIFRoZSBtZXNzYWdlIHRvIHNlbmRcbiAgICogQHBhcmFtIHtCb29sZWFufSBbY29tcHJlc3M9ZmFsc2VdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBjb21wcmVzc1xuICAgKiAgICAgYGRhdGFgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wdGlvbnMgb2JqZWN0XG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuZmluPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2V0IHRoZVxuICAgKiAgICAgRklOIGJpdFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5nZW5lcmF0ZU1hc2tdIFRoZSBmdW5jdGlvbiB1c2VkIHRvIGdlbmVyYXRlIHRoZVxuICAgKiAgICAgbWFza2luZyBrZXlcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5tYXNrPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gbWFza1xuICAgKiAgICAgYGRhdGFgXG4gICAqIEBwYXJhbSB7QnVmZmVyfSBbb3B0aW9ucy5tYXNrQnVmZmVyXSBUaGUgYnVmZmVyIHVzZWQgdG8gc3RvcmUgdGhlIG1hc2tpbmdcbiAgICogICAgIGtleVxuICAgKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy5vcGNvZGUgVGhlIG9wY29kZVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLnJlYWRPbmx5PWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBgZGF0YWAgY2FuIGJlXG4gICAqICAgICBtb2RpZmllZFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLnJzdjE9ZmFsc2VdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzZXQgdGhlXG4gICAqICAgICBSU1YxIGJpdFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2JdIENhbGxiYWNrXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBkaXNwYXRjaChkYXRhLCBjb21wcmVzcywgb3B0aW9ucywgY2IpIHtcbiAgICBpZiAoIWNvbXByZXNzKSB7XG4gICAgICB0aGlzLnNlbmRGcmFtZShTZW5kZXIuZnJhbWUoZGF0YSwgb3B0aW9ucyksIGNiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwZXJNZXNzYWdlRGVmbGF0ZSA9IHRoaXMuX2V4dGVuc2lvbnNbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV07XG5cbiAgICB0aGlzLl9idWZmZXJlZEJ5dGVzICs9IG9wdGlvbnNba0J5dGVMZW5ndGhdO1xuICAgIHRoaXMuX3N0YXRlID0gREVGTEFUSU5HO1xuICAgIHBlck1lc3NhZ2VEZWZsYXRlLmNvbXByZXNzKGRhdGEsIG9wdGlvbnMuZmluLCAoXywgYnVmKSA9PiB7XG4gICAgICBpZiAodGhpcy5fc29ja2V0LmRlc3Ryb3llZCkge1xuICAgICAgICBjb25zdCBlcnIgPSBuZXcgRXJyb3IoXG4gICAgICAgICAgJ1RoZSBzb2NrZXQgd2FzIGNsb3NlZCB3aGlsZSBkYXRhIHdhcyBiZWluZyBjb21wcmVzc2VkJ1xuICAgICAgICApO1xuXG4gICAgICAgIGNhbGxDYWxsYmFja3ModGhpcywgZXJyLCBjYik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fYnVmZmVyZWRCeXRlcyAtPSBvcHRpb25zW2tCeXRlTGVuZ3RoXTtcbiAgICAgIHRoaXMuX3N0YXRlID0gREVGQVVMVDtcbiAgICAgIG9wdGlvbnMucmVhZE9ubHkgPSBmYWxzZTtcbiAgICAgIHRoaXMuc2VuZEZyYW1lKFNlbmRlci5mcmFtZShidWYsIG9wdGlvbnMpLCBjYik7XG4gICAgICB0aGlzLmRlcXVldWUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlcyBxdWV1ZWQgc2VuZCBvcGVyYXRpb25zLlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZGVxdWV1ZSgpIHtcbiAgICB3aGlsZSAodGhpcy5fc3RhdGUgPT09IERFRkFVTFQgJiYgdGhpcy5fcXVldWUubGVuZ3RoKSB7XG4gICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLl9xdWV1ZS5zaGlmdCgpO1xuXG4gICAgICB0aGlzLl9idWZmZXJlZEJ5dGVzIC09IHBhcmFtc1szXVtrQnl0ZUxlbmd0aF07XG4gICAgICBSZWZsZWN0LmFwcGx5KHBhcmFtc1swXSwgdGhpcywgcGFyYW1zLnNsaWNlKDEpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRW5xdWV1ZXMgYSBzZW5kIG9wZXJhdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIHtBcnJheX0gcGFyYW1zIFNlbmQgb3BlcmF0aW9uIHBhcmFtZXRlcnMuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBlbnF1ZXVlKHBhcmFtcykge1xuICAgIHRoaXMuX2J1ZmZlcmVkQnl0ZXMgKz0gcGFyYW1zWzNdW2tCeXRlTGVuZ3RoXTtcbiAgICB0aGlzLl9xdWV1ZS5wdXNoKHBhcmFtcyk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZHMgYSBmcmFtZS5cbiAgICpcbiAgICogQHBhcmFtIHsoQnVmZmVyIHwgU3RyaW5nKVtdfSBsaXN0IFRoZSBmcmFtZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYl0gQ2FsbGJhY2tcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHNlbmRGcmFtZShsaXN0LCBjYikge1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMikge1xuICAgICAgdGhpcy5fc29ja2V0LmNvcmsoKTtcbiAgICAgIHRoaXMuX3NvY2tldC53cml0ZShsaXN0WzBdKTtcbiAgICAgIHRoaXMuX3NvY2tldC53cml0ZShsaXN0WzFdLCBjYik7XG4gICAgICB0aGlzLl9zb2NrZXQudW5jb3JrKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NvY2tldC53cml0ZShsaXN0WzBdLCBjYik7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gU2VuZGVyO1xuXG4vKipcbiAqIENhbGxzIHF1ZXVlZCBjYWxsYmFja3Mgd2l0aCBhbiBlcnJvci5cbiAqXG4gKiBAcGFyYW0ge1NlbmRlcn0gc2VuZGVyIFRoZSBgU2VuZGVyYCBpbnN0YW5jZVxuICogQHBhcmFtIHtFcnJvcn0gZXJyIFRoZSBlcnJvciB0byBjYWxsIHRoZSBjYWxsYmFja3Mgd2l0aFxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NiXSBUaGUgZmlyc3QgY2FsbGJhY2tcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGNhbGxDYWxsYmFja3Moc2VuZGVyLCBlcnIsIGNiKSB7XG4gIGlmICh0eXBlb2YgY2IgPT09ICdmdW5jdGlvbicpIGNiKGVycik7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZW5kZXIuX3F1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcGFyYW1zID0gc2VuZGVyLl9xdWV1ZVtpXTtcbiAgICBjb25zdCBjYWxsYmFjayA9IHBhcmFtc1twYXJhbXMubGVuZ3RoIC0gMV07XG5cbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSBjYWxsYmFjayhlcnIpO1xuICB9XG59XG5cbi8qKlxuICogSGFuZGxlcyBhIGBTZW5kZXJgIGVycm9yLlxuICpcbiAqIEBwYXJhbSB7U2VuZGVyfSBzZW5kZXIgVGhlIGBTZW5kZXJgIGluc3RhbmNlXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnIgVGhlIGVycm9yXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2JdIFRoZSBmaXJzdCBwZW5kaW5nIGNhbGxiYWNrXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBvbkVycm9yKHNlbmRlciwgZXJyLCBjYikge1xuICBjYWxsQ2FsbGJhY2tzKHNlbmRlciwgZXJyLCBjYik7XG4gIHNlbmRlci5vbmVycm9yKGVycik7XG59XG4iLCAiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCB7IGtGb3JPbkV2ZW50QXR0cmlidXRlLCBrTGlzdGVuZXIgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5cbmNvbnN0IGtDb2RlID0gU3ltYm9sKCdrQ29kZScpO1xuY29uc3Qga0RhdGEgPSBTeW1ib2woJ2tEYXRhJyk7XG5jb25zdCBrRXJyb3IgPSBTeW1ib2woJ2tFcnJvcicpO1xuY29uc3Qga01lc3NhZ2UgPSBTeW1ib2woJ2tNZXNzYWdlJyk7XG5jb25zdCBrUmVhc29uID0gU3ltYm9sKCdrUmVhc29uJyk7XG5jb25zdCBrVGFyZ2V0ID0gU3ltYm9sKCdrVGFyZ2V0Jyk7XG5jb25zdCBrVHlwZSA9IFN5bWJvbCgna1R5cGUnKTtcbmNvbnN0IGtXYXNDbGVhbiA9IFN5bWJvbCgna1dhc0NsZWFuJyk7XG5cbi8qKlxuICogQ2xhc3MgcmVwcmVzZW50aW5nIGFuIGV2ZW50LlxuICovXG5jbGFzcyBFdmVudCB7XG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuZXcgYEV2ZW50YC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIG5hbWUgb2YgdGhlIGV2ZW50XG4gICAqIEB0aHJvd3Mge1R5cGVFcnJvcn0gSWYgdGhlIGB0eXBlYCBhcmd1bWVudCBpcyBub3Qgc3BlY2lmaWVkXG4gICAqL1xuICBjb25zdHJ1Y3Rvcih0eXBlKSB7XG4gICAgdGhpc1trVGFyZ2V0XSA9IG51bGw7XG4gICAgdGhpc1trVHlwZV0gPSB0eXBlO1xuICB9XG5cbiAgLyoqXG4gICAqIEB0eXBlIHsqfVxuICAgKi9cbiAgZ2V0IHRhcmdldCgpIHtcbiAgICByZXR1cm4gdGhpc1trVGFyZ2V0XTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgKi9cbiAgZ2V0IHR5cGUoKSB7XG4gICAgcmV0dXJuIHRoaXNba1R5cGVdO1xuICB9XG59XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShFdmVudC5wcm90b3R5cGUsICd0YXJnZXQnLCB7IGVudW1lcmFibGU6IHRydWUgfSk7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRXZlbnQucHJvdG90eXBlLCAndHlwZScsIHsgZW51bWVyYWJsZTogdHJ1ZSB9KTtcblxuLyoqXG4gKiBDbGFzcyByZXByZXNlbnRpbmcgYSBjbG9zZSBldmVudC5cbiAqXG4gKiBAZXh0ZW5kcyBFdmVudFxuICovXG5jbGFzcyBDbG9zZUV2ZW50IGV4dGVuZHMgRXZlbnQge1xuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IGBDbG9zZUV2ZW50YC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIG5hbWUgb2YgdGhlIGV2ZW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQSBkaWN0aW9uYXJ5IG9iamVjdCB0aGF0IGFsbG93cyBmb3Igc2V0dGluZ1xuICAgKiAgICAgYXR0cmlidXRlcyB2aWEgb2JqZWN0IG1lbWJlcnMgb2YgdGhlIHNhbWUgbmFtZVxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMuY29kZT0wXSBUaGUgc3RhdHVzIGNvZGUgZXhwbGFpbmluZyB3aHkgdGhlXG4gICAqICAgICBjb25uZWN0aW9uIHdhcyBjbG9zZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLnJlYXNvbj0nJ10gQSBodW1hbi1yZWFkYWJsZSBzdHJpbmcgZXhwbGFpbmluZyB3aHlcbiAgICogICAgIHRoZSBjb25uZWN0aW9uIHdhcyBjbG9zZWRcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy53YXNDbGVhbj1mYWxzZV0gSW5kaWNhdGVzIHdoZXRoZXIgb3Igbm90IHRoZVxuICAgKiAgICAgY29ubmVjdGlvbiB3YXMgY2xlYW5seSBjbG9zZWRcbiAgICovXG4gIGNvbnN0cnVjdG9yKHR5cGUsIG9wdGlvbnMgPSB7fSkge1xuICAgIHN1cGVyKHR5cGUpO1xuXG4gICAgdGhpc1trQ29kZV0gPSBvcHRpb25zLmNvZGUgPT09IHVuZGVmaW5lZCA/IDAgOiBvcHRpb25zLmNvZGU7XG4gICAgdGhpc1trUmVhc29uXSA9IG9wdGlvbnMucmVhc29uID09PSB1bmRlZmluZWQgPyAnJyA6IG9wdGlvbnMucmVhc29uO1xuICAgIHRoaXNba1dhc0NsZWFuXSA9IG9wdGlvbnMud2FzQ2xlYW4gPT09IHVuZGVmaW5lZCA/IGZhbHNlIDogb3B0aW9ucy53YXNDbGVhbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgKi9cbiAgZ2V0IGNvZGUoKSB7XG4gICAgcmV0dXJuIHRoaXNba0NvZGVdO1xuICB9XG5cbiAgLyoqXG4gICAqIEB0eXBlIHtTdHJpbmd9XG4gICAqL1xuICBnZXQgcmVhc29uKCkge1xuICAgIHJldHVybiB0aGlzW2tSZWFzb25dO1xuICB9XG5cbiAgLyoqXG4gICAqIEB0eXBlIHtCb29sZWFufVxuICAgKi9cbiAgZ2V0IHdhc0NsZWFuKCkge1xuICAgIHJldHVybiB0aGlzW2tXYXNDbGVhbl07XG4gIH1cbn1cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KENsb3NlRXZlbnQucHJvdG90eXBlLCAnY29kZScsIHsgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShDbG9zZUV2ZW50LnByb3RvdHlwZSwgJ3JlYXNvbicsIHsgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShDbG9zZUV2ZW50LnByb3RvdHlwZSwgJ3dhc0NsZWFuJywgeyBlbnVtZXJhYmxlOiB0cnVlIH0pO1xuXG4vKipcbiAqIENsYXNzIHJlcHJlc2VudGluZyBhbiBlcnJvciBldmVudC5cbiAqXG4gKiBAZXh0ZW5kcyBFdmVudFxuICovXG5jbGFzcyBFcnJvckV2ZW50IGV4dGVuZHMgRXZlbnQge1xuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IGBFcnJvckV2ZW50YC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIG5hbWUgb2YgdGhlIGV2ZW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQSBkaWN0aW9uYXJ5IG9iamVjdCB0aGF0IGFsbG93cyBmb3Igc2V0dGluZ1xuICAgKiAgICAgYXR0cmlidXRlcyB2aWEgb2JqZWN0IG1lbWJlcnMgb2YgdGhlIHNhbWUgbmFtZVxuICAgKiBAcGFyYW0geyp9IFtvcHRpb25zLmVycm9yPW51bGxdIFRoZSBlcnJvciB0aGF0IGdlbmVyYXRlZCB0aGlzIGV2ZW50XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5tZXNzYWdlPScnXSBUaGUgZXJyb3IgbWVzc2FnZVxuICAgKi9cbiAgY29uc3RydWN0b3IodHlwZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIodHlwZSk7XG5cbiAgICB0aGlzW2tFcnJvcl0gPSBvcHRpb25zLmVycm9yID09PSB1bmRlZmluZWQgPyBudWxsIDogb3B0aW9ucy5lcnJvcjtcbiAgICB0aGlzW2tNZXNzYWdlXSA9IG9wdGlvbnMubWVzc2FnZSA9PT0gdW5kZWZpbmVkID8gJycgOiBvcHRpb25zLm1lc3NhZ2U7XG4gIH1cblxuICAvKipcbiAgICogQHR5cGUgeyp9XG4gICAqL1xuICBnZXQgZXJyb3IoKSB7XG4gICAgcmV0dXJuIHRoaXNba0Vycm9yXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgKi9cbiAgZ2V0IG1lc3NhZ2UoKSB7XG4gICAgcmV0dXJuIHRoaXNba01lc3NhZ2VdO1xuICB9XG59XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShFcnJvckV2ZW50LnByb3RvdHlwZSwgJ2Vycm9yJywgeyBlbnVtZXJhYmxlOiB0cnVlIH0pO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KEVycm9yRXZlbnQucHJvdG90eXBlLCAnbWVzc2FnZScsIHsgZW51bWVyYWJsZTogdHJ1ZSB9KTtcblxuLyoqXG4gKiBDbGFzcyByZXByZXNlbnRpbmcgYSBtZXNzYWdlIGV2ZW50LlxuICpcbiAqIEBleHRlbmRzIEV2ZW50XG4gKi9cbmNsYXNzIE1lc3NhZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyBgTWVzc2FnZUV2ZW50YC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIG5hbWUgb2YgdGhlIGV2ZW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQSBkaWN0aW9uYXJ5IG9iamVjdCB0aGF0IGFsbG93cyBmb3Igc2V0dGluZ1xuICAgKiAgICAgYXR0cmlidXRlcyB2aWEgb2JqZWN0IG1lbWJlcnMgb2YgdGhlIHNhbWUgbmFtZVxuICAgKiBAcGFyYW0geyp9IFtvcHRpb25zLmRhdGE9bnVsbF0gVGhlIG1lc3NhZ2UgY29udGVudFxuICAgKi9cbiAgY29uc3RydWN0b3IodHlwZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIodHlwZSk7XG5cbiAgICB0aGlzW2tEYXRhXSA9IG9wdGlvbnMuZGF0YSA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IG9wdGlvbnMuZGF0YTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7Kn1cbiAgICovXG4gIGdldCBkYXRhKCkge1xuICAgIHJldHVybiB0aGlzW2tEYXRhXTtcbiAgfVxufVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVzc2FnZUV2ZW50LnByb3RvdHlwZSwgJ2RhdGEnLCB7IGVudW1lcmFibGU6IHRydWUgfSk7XG5cbi8qKlxuICogVGhpcyBwcm92aWRlcyBtZXRob2RzIGZvciBlbXVsYXRpbmcgdGhlIGBFdmVudFRhcmdldGAgaW50ZXJmYWNlLiBJdCdzIG5vdFxuICogbWVhbnQgdG8gYmUgdXNlZCBkaXJlY3RseS5cbiAqXG4gKiBAbWl4aW5cbiAqL1xuY29uc3QgRXZlbnRUYXJnZXQgPSB7XG4gIC8qKlxuICAgKiBSZWdpc3RlciBhbiBldmVudCBsaXN0ZW5lci5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBldmVudCB0eXBlIHRvIGxpc3RlbiBmb3JcbiAgICogQHBhcmFtIHsoRnVuY3Rpb258T2JqZWN0KX0gaGFuZGxlciBUaGUgbGlzdGVuZXIgdG8gYWRkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQW4gb3B0aW9ucyBvYmplY3Qgc3BlY2lmaWVzIGNoYXJhY3RlcmlzdGljcyBhYm91dFxuICAgKiAgICAgdGhlIGV2ZW50IGxpc3RlbmVyXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMub25jZT1mYWxzZV0gQSBgQm9vbGVhbmAgaW5kaWNhdGluZyB0aGF0IHRoZVxuICAgKiAgICAgbGlzdGVuZXIgc2hvdWxkIGJlIGludm9rZWQgYXQgbW9zdCBvbmNlIGFmdGVyIGJlaW5nIGFkZGVkLiBJZiBgdHJ1ZWAsXG4gICAqICAgICB0aGUgbGlzdGVuZXIgd291bGQgYmUgYXV0b21hdGljYWxseSByZW1vdmVkIHdoZW4gaW52b2tlZC5cbiAgICogQHB1YmxpY1xuICAgKi9cbiAgYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBoYW5kbGVyLCBvcHRpb25zID0ge30pIHtcbiAgICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHRoaXMubGlzdGVuZXJzKHR5cGUpKSB7XG4gICAgICBpZiAoXG4gICAgICAgICFvcHRpb25zW2tGb3JPbkV2ZW50QXR0cmlidXRlXSAmJlxuICAgICAgICBsaXN0ZW5lcltrTGlzdGVuZXJdID09PSBoYW5kbGVyICYmXG4gICAgICAgICFsaXN0ZW5lcltrRm9yT25FdmVudEF0dHJpYnV0ZV1cbiAgICAgICkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHdyYXBwZXI7XG5cbiAgICBpZiAodHlwZSA9PT0gJ21lc3NhZ2UnKSB7XG4gICAgICB3cmFwcGVyID0gZnVuY3Rpb24gb25NZXNzYWdlKGRhdGEsIGlzQmluYXJ5KSB7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gbmV3IE1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcbiAgICAgICAgICBkYXRhOiBpc0JpbmFyeSA/IGRhdGEgOiBkYXRhLnRvU3RyaW5nKClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZXZlbnRba1RhcmdldF0gPSB0aGlzO1xuICAgICAgICBjYWxsTGlzdGVuZXIoaGFuZGxlciwgdGhpcywgZXZlbnQpO1xuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdjbG9zZScpIHtcbiAgICAgIHdyYXBwZXIgPSBmdW5jdGlvbiBvbkNsb3NlKGNvZGUsIG1lc3NhZ2UpIHtcbiAgICAgICAgY29uc3QgZXZlbnQgPSBuZXcgQ2xvc2VFdmVudCgnY2xvc2UnLCB7XG4gICAgICAgICAgY29kZSxcbiAgICAgICAgICByZWFzb246IG1lc3NhZ2UudG9TdHJpbmcoKSxcbiAgICAgICAgICB3YXNDbGVhbjogdGhpcy5fY2xvc2VGcmFtZVJlY2VpdmVkICYmIHRoaXMuX2Nsb3NlRnJhbWVTZW50XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGV2ZW50W2tUYXJnZXRdID0gdGhpcztcbiAgICAgICAgY2FsbExpc3RlbmVyKGhhbmRsZXIsIHRoaXMsIGV2ZW50KTtcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgICB3cmFwcGVyID0gZnVuY3Rpb24gb25FcnJvcihlcnJvcikge1xuICAgICAgICBjb25zdCBldmVudCA9IG5ldyBFcnJvckV2ZW50KCdlcnJvcicsIHtcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGV2ZW50W2tUYXJnZXRdID0gdGhpcztcbiAgICAgICAgY2FsbExpc3RlbmVyKGhhbmRsZXIsIHRoaXMsIGV2ZW50KTtcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnb3BlbicpIHtcbiAgICAgIHdyYXBwZXIgPSBmdW5jdGlvbiBvbk9wZW4oKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50KCdvcGVuJyk7XG5cbiAgICAgICAgZXZlbnRba1RhcmdldF0gPSB0aGlzO1xuICAgICAgICBjYWxsTGlzdGVuZXIoaGFuZGxlciwgdGhpcywgZXZlbnQpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHdyYXBwZXJba0Zvck9uRXZlbnRBdHRyaWJ1dGVdID0gISFvcHRpb25zW2tGb3JPbkV2ZW50QXR0cmlidXRlXTtcbiAgICB3cmFwcGVyW2tMaXN0ZW5lcl0gPSBoYW5kbGVyO1xuXG4gICAgaWYgKG9wdGlvbnMub25jZSkge1xuICAgICAgdGhpcy5vbmNlKHR5cGUsIHdyYXBwZXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLm9uKHR5cGUsIHdyYXBwZXIpO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogUmVtb3ZlIGFuIGV2ZW50IGxpc3RlbmVyLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBBIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGV2ZW50IHR5cGUgdG8gcmVtb3ZlXG4gICAqIEBwYXJhbSB7KEZ1bmN0aW9ufE9iamVjdCl9IGhhbmRsZXIgVGhlIGxpc3RlbmVyIHRvIHJlbW92ZVxuICAgKiBAcHVibGljXG4gICAqL1xuICByZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIpIHtcbiAgICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHRoaXMubGlzdGVuZXJzKHR5cGUpKSB7XG4gICAgICBpZiAobGlzdGVuZXJba0xpc3RlbmVyXSA9PT0gaGFuZGxlciAmJiAhbGlzdGVuZXJba0Zvck9uRXZlbnRBdHRyaWJ1dGVdKSB7XG4gICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBDbG9zZUV2ZW50LFxuICBFcnJvckV2ZW50LFxuICBFdmVudCxcbiAgRXZlbnRUYXJnZXQsXG4gIE1lc3NhZ2VFdmVudFxufTtcblxuLyoqXG4gKiBDYWxsIGFuIGV2ZW50IGxpc3RlbmVyXG4gKlxuICogQHBhcmFtIHsoRnVuY3Rpb258T2JqZWN0KX0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIHRvIGNhbGxcbiAqIEBwYXJhbSB7Kn0gdGhpc0FyZyBUaGUgdmFsdWUgdG8gdXNlIGFzIGB0aGlzYGAgd2hlbiBjYWxsaW5nIHRoZSBsaXN0ZW5lclxuICogQHBhcmFtIHtFdmVudH0gZXZlbnQgVGhlIGV2ZW50IHRvIHBhc3MgdG8gdGhlIGxpc3RlbmVyXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBjYWxsTGlzdGVuZXIobGlzdGVuZXIsIHRoaXNBcmcsIGV2ZW50KSB7XG4gIGlmICh0eXBlb2YgbGlzdGVuZXIgPT09ICdvYmplY3QnICYmIGxpc3RlbmVyLmhhbmRsZUV2ZW50KSB7XG4gICAgbGlzdGVuZXIuaGFuZGxlRXZlbnQuY2FsbChsaXN0ZW5lciwgZXZlbnQpO1xuICB9IGVsc2Uge1xuICAgIGxpc3RlbmVyLmNhbGwodGhpc0FyZywgZXZlbnQpO1xuICB9XG59XG4iLCAiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCB7IHRva2VuQ2hhcnMgfSA9IHJlcXVpcmUoJy4vdmFsaWRhdGlvbicpO1xuXG4vKipcbiAqIEFkZHMgYW4gb2ZmZXIgdG8gdGhlIG1hcCBvZiBleHRlbnNpb24gb2ZmZXJzIG9yIGEgcGFyYW1ldGVyIHRvIHRoZSBtYXAgb2ZcbiAqIHBhcmFtZXRlcnMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGRlc3QgVGhlIG1hcCBvZiBleHRlbnNpb24gb2ZmZXJzIG9yIHBhcmFtZXRlcnNcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBleHRlbnNpb24gb3IgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7KE9iamVjdHxCb29sZWFufFN0cmluZyl9IGVsZW0gVGhlIGV4dGVuc2lvbiBwYXJhbWV0ZXJzIG9yIHRoZVxuICogICAgIHBhcmFtZXRlciB2YWx1ZVxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcHVzaChkZXN0LCBuYW1lLCBlbGVtKSB7XG4gIGlmIChkZXN0W25hbWVdID09PSB1bmRlZmluZWQpIGRlc3RbbmFtZV0gPSBbZWxlbV07XG4gIGVsc2UgZGVzdFtuYW1lXS5wdXNoKGVsZW0pO1xufVxuXG4vKipcbiAqIFBhcnNlcyB0aGUgYFNlYy1XZWJTb2NrZXQtRXh0ZW5zaW9uc2AgaGVhZGVyIGludG8gYW4gb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBoZWFkZXIgVGhlIGZpZWxkIHZhbHVlIG9mIHRoZSBoZWFkZXJcbiAqIEByZXR1cm4ge09iamVjdH0gVGhlIHBhcnNlZCBvYmplY3RcbiAqIEBwdWJsaWNcbiAqL1xuZnVuY3Rpb24gcGFyc2UoaGVhZGVyKSB7XG4gIGNvbnN0IG9mZmVycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIGxldCBwYXJhbXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICBsZXQgbXVzdFVuZXNjYXBlID0gZmFsc2U7XG4gIGxldCBpc0VzY2FwaW5nID0gZmFsc2U7XG4gIGxldCBpblF1b3RlcyA9IGZhbHNlO1xuICBsZXQgZXh0ZW5zaW9uTmFtZTtcbiAgbGV0IHBhcmFtTmFtZTtcbiAgbGV0IHN0YXJ0ID0gLTE7XG4gIGxldCBjb2RlID0gLTE7XG4gIGxldCBlbmQgPSAtMTtcbiAgbGV0IGkgPSAwO1xuXG4gIGZvciAoOyBpIDwgaGVhZGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgY29kZSA9IGhlYWRlci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgaWYgKGV4dGVuc2lvbk5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGVuZCA9PT0gLTEgJiYgdG9rZW5DaGFyc1tjb2RlXSA9PT0gMSkge1xuICAgICAgICBpZiAoc3RhcnQgPT09IC0xKSBzdGFydCA9IGk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBpICE9PSAwICYmXG4gICAgICAgIChjb2RlID09PSAweDIwIC8qICcgJyAqLyB8fCBjb2RlID09PSAweDA5KSAvKiAnXFx0JyAqL1xuICAgICAgKSB7XG4gICAgICAgIGlmIChlbmQgPT09IC0xICYmIHN0YXJ0ICE9PSAtMSkgZW5kID0gaTtcbiAgICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gMHgzYiAvKiAnOycgKi8gfHwgY29kZSA9PT0gMHgyYyAvKiAnLCcgKi8pIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVW5leHBlY3RlZCBjaGFyYWN0ZXIgYXQgaW5kZXggJHtpfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVuZCA9PT0gLTEpIGVuZCA9IGk7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBoZWFkZXIuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgICAgIGlmIChjb2RlID09PSAweDJjKSB7XG4gICAgICAgICAgcHVzaChvZmZlcnMsIG5hbWUsIHBhcmFtcyk7XG4gICAgICAgICAgcGFyYW1zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBleHRlbnNpb25OYW1lID0gbmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXJ0ID0gZW5kID0gLTE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoYFVuZXhwZWN0ZWQgY2hhcmFjdGVyIGF0IGluZGV4ICR7aX1gKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHBhcmFtTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZW5kID09PSAtMSAmJiB0b2tlbkNoYXJzW2NvZGVdID09PSAxKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gLTEpIHN0YXJ0ID0gaTtcbiAgICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gMHgyMCB8fCBjb2RlID09PSAweDA5KSB7XG4gICAgICAgIGlmIChlbmQgPT09IC0xICYmIHN0YXJ0ICE9PSAtMSkgZW5kID0gaTtcbiAgICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gMHgzYiB8fCBjb2RlID09PSAweDJjKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoYFVuZXhwZWN0ZWQgY2hhcmFjdGVyIGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbmQgPT09IC0xKSBlbmQgPSBpO1xuICAgICAgICBwdXNoKHBhcmFtcywgaGVhZGVyLnNsaWNlKHN0YXJ0LCBlbmQpLCB0cnVlKTtcbiAgICAgICAgaWYgKGNvZGUgPT09IDB4MmMpIHtcbiAgICAgICAgICBwdXNoKG9mZmVycywgZXh0ZW5zaW9uTmFtZSwgcGFyYW1zKTtcbiAgICAgICAgICBwYXJhbXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICAgIGV4dGVuc2lvbk5hbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBzdGFydCA9IGVuZCA9IC0xO1xuICAgICAgfSBlbHNlIGlmIChjb2RlID09PSAweDNkIC8qICc9JyAqLyAmJiBzdGFydCAhPT0gLTEgJiYgZW5kID09PSAtMSkge1xuICAgICAgICBwYXJhbU5hbWUgPSBoZWFkZXIuc2xpY2Uoc3RhcnQsIGkpO1xuICAgICAgICBzdGFydCA9IGVuZCA9IC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKGBVbmV4cGVjdGVkIGNoYXJhY3RlciBhdCBpbmRleCAke2l9YCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vXG4gICAgICAvLyBUaGUgdmFsdWUgb2YgYSBxdW90ZWQtc3RyaW5nIGFmdGVyIHVuZXNjYXBpbmcgbXVzdCBjb25mb3JtIHRvIHRoZVxuICAgICAgLy8gdG9rZW4gQUJORiwgc28gb25seSB0b2tlbiBjaGFyYWN0ZXJzIGFyZSB2YWxpZC5cbiAgICAgIC8vIFJlZjogaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY0NTUjc2VjdGlvbi05LjFcbiAgICAgIC8vXG4gICAgICBpZiAoaXNFc2NhcGluZykge1xuICAgICAgICBpZiAodG9rZW5DaGFyc1tjb2RlXSAhPT0gMSkge1xuICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVW5leHBlY3RlZCBjaGFyYWN0ZXIgYXQgaW5kZXggJHtpfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGFydCA9PT0gLTEpIHN0YXJ0ID0gaTtcbiAgICAgICAgZWxzZSBpZiAoIW11c3RVbmVzY2FwZSkgbXVzdFVuZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgaXNFc2NhcGluZyA9IGZhbHNlO1xuICAgICAgfSBlbHNlIGlmIChpblF1b3Rlcykge1xuICAgICAgICBpZiAodG9rZW5DaGFyc1tjb2RlXSA9PT0gMSkge1xuICAgICAgICAgIGlmIChzdGFydCA9PT0gLTEpIHN0YXJ0ID0gaTtcbiAgICAgICAgfSBlbHNlIGlmIChjb2RlID09PSAweDIyIC8qICdcIicgKi8gJiYgc3RhcnQgIT09IC0xKSB7XG4gICAgICAgICAgaW5RdW90ZXMgPSBmYWxzZTtcbiAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvZGUgPT09IDB4NWMgLyogJ1xcJyAqLykge1xuICAgICAgICAgIGlzRXNjYXBpbmcgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVW5leHBlY3RlZCBjaGFyYWN0ZXIgYXQgaW5kZXggJHtpfWApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGNvZGUgPT09IDB4MjIgJiYgaGVhZGVyLmNoYXJDb2RlQXQoaSAtIDEpID09PSAweDNkKSB7XG4gICAgICAgIGluUXVvdGVzID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSAmJiB0b2tlbkNoYXJzW2NvZGVdID09PSAxKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gLTEpIHN0YXJ0ID0gaTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhcnQgIT09IC0xICYmIChjb2RlID09PSAweDIwIHx8IGNvZGUgPT09IDB4MDkpKSB7XG4gICAgICAgIGlmIChlbmQgPT09IC0xKSBlbmQgPSBpO1xuICAgICAgfSBlbHNlIGlmIChjb2RlID09PSAweDNiIHx8IGNvZGUgPT09IDB4MmMpIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVW5leHBlY3RlZCBjaGFyYWN0ZXIgYXQgaW5kZXggJHtpfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVuZCA9PT0gLTEpIGVuZCA9IGk7XG4gICAgICAgIGxldCB2YWx1ZSA9IGhlYWRlci5zbGljZShzdGFydCwgZW5kKTtcbiAgICAgICAgaWYgKG11c3RVbmVzY2FwZSkge1xuICAgICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZSgvXFxcXC9nLCAnJyk7XG4gICAgICAgICAgbXVzdFVuZXNjYXBlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcHVzaChwYXJhbXMsIHBhcmFtTmFtZSwgdmFsdWUpO1xuICAgICAgICBpZiAoY29kZSA9PT0gMHgyYykge1xuICAgICAgICAgIHB1c2gob2ZmZXJzLCBleHRlbnNpb25OYW1lLCBwYXJhbXMpO1xuICAgICAgICAgIHBhcmFtcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgICAgZXh0ZW5zaW9uTmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHBhcmFtTmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgc3RhcnQgPSBlbmQgPSAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVW5leHBlY3RlZCBjaGFyYWN0ZXIgYXQgaW5kZXggJHtpfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChzdGFydCA9PT0gLTEgfHwgaW5RdW90ZXMgfHwgY29kZSA9PT0gMHgyMCB8fCBjb2RlID09PSAweDA5KSB7XG4gICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdVbmV4cGVjdGVkIGVuZCBvZiBpbnB1dCcpO1xuICB9XG5cbiAgaWYgKGVuZCA9PT0gLTEpIGVuZCA9IGk7XG4gIGNvbnN0IHRva2VuID0gaGVhZGVyLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICBpZiAoZXh0ZW5zaW9uTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcHVzaChvZmZlcnMsIHRva2VuLCBwYXJhbXMpO1xuICB9IGVsc2Uge1xuICAgIGlmIChwYXJhbU5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcHVzaChwYXJhbXMsIHRva2VuLCB0cnVlKTtcbiAgICB9IGVsc2UgaWYgKG11c3RVbmVzY2FwZSkge1xuICAgICAgcHVzaChwYXJhbXMsIHBhcmFtTmFtZSwgdG9rZW4ucmVwbGFjZSgvXFxcXC9nLCAnJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwdXNoKHBhcmFtcywgcGFyYW1OYW1lLCB0b2tlbik7XG4gICAgfVxuICAgIHB1c2gob2ZmZXJzLCBleHRlbnNpb25OYW1lLCBwYXJhbXMpO1xuICB9XG5cbiAgcmV0dXJuIG9mZmVycztcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGBTZWMtV2ViU29ja2V0LUV4dGVuc2lvbnNgIGhlYWRlciBmaWVsZCB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gZXh0ZW5zaW9ucyBUaGUgbWFwIG9mIGV4dGVuc2lvbnMgYW5kIHBhcmFtZXRlcnMgdG8gZm9ybWF0XG4gKiBAcmV0dXJuIHtTdHJpbmd9IEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgZ2l2ZW4gb2JqZWN0XG4gKiBAcHVibGljXG4gKi9cbmZ1bmN0aW9uIGZvcm1hdChleHRlbnNpb25zKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhleHRlbnNpb25zKVxuICAgIC5tYXAoKGV4dGVuc2lvbikgPT4ge1xuICAgICAgbGV0IGNvbmZpZ3VyYXRpb25zID0gZXh0ZW5zaW9uc1tleHRlbnNpb25dO1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbmZpZ3VyYXRpb25zKSkgY29uZmlndXJhdGlvbnMgPSBbY29uZmlndXJhdGlvbnNdO1xuICAgICAgcmV0dXJuIGNvbmZpZ3VyYXRpb25zXG4gICAgICAgIC5tYXAoKHBhcmFtcykgPT4ge1xuICAgICAgICAgIHJldHVybiBbZXh0ZW5zaW9uXVxuICAgICAgICAgICAgLmNvbmNhdChcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMocGFyYW1zKS5tYXAoKGspID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgdmFsdWVzID0gcGFyYW1zW2tdO1xuICAgICAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB2YWx1ZXMgPSBbdmFsdWVzXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWVzXG4gICAgICAgICAgICAgICAgICAubWFwKCh2KSA9PiAodiA9PT0gdHJ1ZSA/IGsgOiBgJHtrfT0ke3Z9YCkpXG4gICAgICAgICAgICAgICAgICAuam9pbignOyAnKTtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5qb2luKCc7ICcpO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgZm9ybWF0LCBwYXJzZSB9O1xuIiwgIi8qIGVzbGludCBuby11bnVzZWQtdmFyczogW1wiZXJyb3JcIiwgeyBcInZhcnNJZ25vcmVQYXR0ZXJuXCI6IFwiXkR1cGxleHxSZWFkYWJsZSRcIiwgXCJjYXVnaHRFcnJvcnNcIjogXCJub25lXCIgfV0gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKTtcbmNvbnN0IGh0dHBzID0gcmVxdWlyZSgnaHR0cHMnKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCBuZXQgPSByZXF1aXJlKCduZXQnKTtcbmNvbnN0IHRscyA9IHJlcXVpcmUoJ3RscycpO1xuY29uc3QgeyByYW5kb21CeXRlcywgY3JlYXRlSGFzaCB9ID0gcmVxdWlyZSgnY3J5cHRvJyk7XG5jb25zdCB7IER1cGxleCwgUmVhZGFibGUgfSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xuY29uc3QgeyBVUkwgfSA9IHJlcXVpcmUoJ3VybCcpO1xuXG5jb25zdCBQZXJNZXNzYWdlRGVmbGF0ZSA9IHJlcXVpcmUoJy4vcGVybWVzc2FnZS1kZWZsYXRlJyk7XG5jb25zdCBSZWNlaXZlciA9IHJlcXVpcmUoJy4vcmVjZWl2ZXInKTtcbmNvbnN0IFNlbmRlciA9IHJlcXVpcmUoJy4vc2VuZGVyJyk7XG5jb25zdCB7IGlzQmxvYiB9ID0gcmVxdWlyZSgnLi92YWxpZGF0aW9uJyk7XG5cbmNvbnN0IHtcbiAgQklOQVJZX1RZUEVTLFxuICBDTE9TRV9USU1FT1VULFxuICBFTVBUWV9CVUZGRVIsXG4gIEdVSUQsXG4gIGtGb3JPbkV2ZW50QXR0cmlidXRlLFxuICBrTGlzdGVuZXIsXG4gIGtTdGF0dXNDb2RlLFxuICBrV2ViU29ja2V0LFxuICBOT09QXG59ID0gcmVxdWlyZSgnLi9jb25zdGFudHMnKTtcbmNvbnN0IHtcbiAgRXZlbnRUYXJnZXQ6IHsgYWRkRXZlbnRMaXN0ZW5lciwgcmVtb3ZlRXZlbnRMaXN0ZW5lciB9XG59ID0gcmVxdWlyZSgnLi9ldmVudC10YXJnZXQnKTtcbmNvbnN0IHsgZm9ybWF0LCBwYXJzZSB9ID0gcmVxdWlyZSgnLi9leHRlbnNpb24nKTtcbmNvbnN0IHsgdG9CdWZmZXIgfSA9IHJlcXVpcmUoJy4vYnVmZmVyLXV0aWwnKTtcblxuY29uc3Qga0Fib3J0ZWQgPSBTeW1ib2woJ2tBYm9ydGVkJyk7XG5jb25zdCBwcm90b2NvbFZlcnNpb25zID0gWzgsIDEzXTtcbmNvbnN0IHJlYWR5U3RhdGVzID0gWydDT05ORUNUSU5HJywgJ09QRU4nLCAnQ0xPU0lORycsICdDTE9TRUQnXTtcbmNvbnN0IHN1YnByb3RvY29sUmVnZXggPSAvXlshIyQlJicqK1xcLS4wLTlBLVpeX2B8YS16fl0rJC87XG5cbi8qKlxuICogQ2xhc3MgcmVwcmVzZW50aW5nIGEgV2ViU29ja2V0LlxuICpcbiAqIEBleHRlbmRzIEV2ZW50RW1pdHRlclxuICovXG5jbGFzcyBXZWJTb2NrZXQgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IGBXZWJTb2NrZXRgLlxuICAgKlxuICAgKiBAcGFyYW0geyhTdHJpbmd8VVJMKX0gYWRkcmVzcyBUaGUgVVJMIHRvIHdoaWNoIHRvIGNvbm5lY3RcbiAgICogQHBhcmFtIHsoU3RyaW5nfFN0cmluZ1tdKX0gW3Byb3RvY29sc10gVGhlIHN1YnByb3RvY29sc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIENvbm5lY3Rpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3IoYWRkcmVzcywgcHJvdG9jb2xzLCBvcHRpb25zKSB7XG4gICAgc3VwZXIoKTtcblxuICAgIHRoaXMuX2JpbmFyeVR5cGUgPSBCSU5BUllfVFlQRVNbMF07XG4gICAgdGhpcy5fY2xvc2VDb2RlID0gMTAwNjtcbiAgICB0aGlzLl9jbG9zZUZyYW1lUmVjZWl2ZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9jbG9zZUZyYW1lU2VudCA9IGZhbHNlO1xuICAgIHRoaXMuX2Nsb3NlTWVzc2FnZSA9IEVNUFRZX0JVRkZFUjtcbiAgICB0aGlzLl9jbG9zZVRpbWVyID0gbnVsbDtcbiAgICB0aGlzLl9lcnJvckVtaXR0ZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9leHRlbnNpb25zID0ge307XG4gICAgdGhpcy5fcGF1c2VkID0gZmFsc2U7XG4gICAgdGhpcy5fcHJvdG9jb2wgPSAnJztcbiAgICB0aGlzLl9yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNPTk5FQ1RJTkc7XG4gICAgdGhpcy5fcmVjZWl2ZXIgPSBudWxsO1xuICAgIHRoaXMuX3NlbmRlciA9IG51bGw7XG4gICAgdGhpcy5fc29ja2V0ID0gbnVsbDtcblxuICAgIGlmIChhZGRyZXNzICE9PSBudWxsKSB7XG4gICAgICB0aGlzLl9idWZmZXJlZEFtb3VudCA9IDA7XG4gICAgICB0aGlzLl9pc1NlcnZlciA9IGZhbHNlO1xuICAgICAgdGhpcy5fcmVkaXJlY3RzID0gMDtcblxuICAgICAgaWYgKHByb3RvY29scyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHByb3RvY29scyA9IFtdO1xuICAgICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShwcm90b2NvbHMpKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcHJvdG9jb2xzID09PSAnb2JqZWN0JyAmJiBwcm90b2NvbHMgIT09IG51bGwpIHtcbiAgICAgICAgICBvcHRpb25zID0gcHJvdG9jb2xzO1xuICAgICAgICAgIHByb3RvY29scyA9IFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHByb3RvY29scyA9IFtwcm90b2NvbHNdO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGluaXRBc0NsaWVudCh0aGlzLCBhZGRyZXNzLCBwcm90b2NvbHMsIG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9hdXRvUG9uZyA9IG9wdGlvbnMuYXV0b1Bvbmc7XG4gICAgICB0aGlzLl9jbG9zZVRpbWVvdXQgPSBvcHRpb25zLmNsb3NlVGltZW91dDtcbiAgICAgIHRoaXMuX2lzU2VydmVyID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRm9yIGhpc3RvcmljYWwgcmVhc29ucywgdGhlIGN1c3RvbSBcIm5vZGVidWZmZXJcIiB0eXBlIGlzIHVzZWQgYnkgdGhlIGRlZmF1bHRcbiAgICogaW5zdGVhZCBvZiBcImJsb2JcIi5cbiAgICpcbiAgICogQHR5cGUge1N0cmluZ31cbiAgICovXG4gIGdldCBiaW5hcnlUeXBlKCkge1xuICAgIHJldHVybiB0aGlzLl9iaW5hcnlUeXBlO1xuICB9XG5cbiAgc2V0IGJpbmFyeVR5cGUodHlwZSkge1xuICAgIGlmICghQklOQVJZX1RZUEVTLmluY2x1ZGVzKHR5cGUpKSByZXR1cm47XG5cbiAgICB0aGlzLl9iaW5hcnlUeXBlID0gdHlwZTtcblxuICAgIC8vXG4gICAgLy8gQWxsb3cgdG8gY2hhbmdlIGBiaW5hcnlUeXBlYCBvbiB0aGUgZmx5LlxuICAgIC8vXG4gICAgaWYgKHRoaXMuX3JlY2VpdmVyKSB0aGlzLl9yZWNlaXZlci5fYmluYXJ5VHlwZSA9IHR5cGU7XG4gIH1cblxuICAvKipcbiAgICogQHR5cGUge051bWJlcn1cbiAgICovXG4gIGdldCBidWZmZXJlZEFtb3VudCgpIHtcbiAgICBpZiAoIXRoaXMuX3NvY2tldCkgcmV0dXJuIHRoaXMuX2J1ZmZlcmVkQW1vdW50O1xuXG4gICAgcmV0dXJuIHRoaXMuX3NvY2tldC5fd3JpdGFibGVTdGF0ZS5sZW5ndGggKyB0aGlzLl9zZW5kZXIuX2J1ZmZlcmVkQnl0ZXM7XG4gIH1cblxuICAvKipcbiAgICogQHR5cGUge1N0cmluZ31cbiAgICovXG4gIGdldCBleHRlbnNpb25zKCkge1xuICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9leHRlbnNpb25zKS5qb2luKCk7XG4gIH1cblxuICAvKipcbiAgICogQHR5cGUge0Jvb2xlYW59XG4gICAqL1xuICBnZXQgaXNQYXVzZWQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3BhdXNlZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICBnZXQgb25jbG9zZSgpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICBnZXQgb25lcnJvcigpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICBnZXQgb25vcGVuKCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICovXG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gIGdldCBvbm1lc3NhZ2UoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogQHR5cGUge1N0cmluZ31cbiAgICovXG4gIGdldCBwcm90b2NvbCgpIHtcbiAgICByZXR1cm4gdGhpcy5fcHJvdG9jb2w7XG4gIH1cblxuICAvKipcbiAgICogQHR5cGUge051bWJlcn1cbiAgICovXG4gIGdldCByZWFkeVN0YXRlKCkge1xuICAgIHJldHVybiB0aGlzLl9yZWFkeVN0YXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIEB0eXBlIHtTdHJpbmd9XG4gICAqL1xuICBnZXQgdXJsKCkge1xuICAgIHJldHVybiB0aGlzLl91cmw7XG4gIH1cblxuICAvKipcbiAgICogU2V0IHVwIHRoZSBzb2NrZXQgYW5kIHRoZSBpbnRlcm5hbCByZXNvdXJjZXMuXG4gICAqXG4gICAqIEBwYXJhbSB7RHVwbGV4fSBzb2NrZXQgVGhlIG5ldHdvcmsgc29ja2V0IGJldHdlZW4gdGhlIHNlcnZlciBhbmQgY2xpZW50XG4gICAqIEBwYXJhbSB7QnVmZmVyfSBoZWFkIFRoZSBmaXJzdCBwYWNrZXQgb2YgdGhlIHVwZ3JhZGVkIHN0cmVhbVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcHRpb25zIG9iamVjdFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmFsbG93U3luY2hyb25vdXNFdmVudHM9ZmFsc2VdIFNwZWNpZmllcyB3aGV0aGVyXG4gICAqICAgICBhbnkgb2YgdGhlIGAnbWVzc2FnZSdgLCBgJ3BpbmcnYCwgYW5kIGAncG9uZydgIGV2ZW50cyBjYW4gYmUgZW1pdHRlZFxuICAgKiAgICAgbXVsdGlwbGUgdGltZXMgaW4gdGhlIHNhbWUgdGlja1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5nZW5lcmF0ZU1hc2tdIFRoZSBmdW5jdGlvbiB1c2VkIHRvIGdlbmVyYXRlIHRoZVxuICAgKiAgICAgbWFza2luZyBrZXlcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLm1heEJ1ZmZlcmVkQ2h1bmtzPTBdIFRoZSBtYXhpbXVtIG51bWJlciBvZlxuICAgKiAgICAgYnVmZmVyZWQgZGF0YSBjaHVua3NcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLm1heEZyYWdtZW50cz0wXSBUaGUgbWF4aW11bSBudW1iZXIgb2YgbWVzc2FnZVxuICAgKiAgICAgZnJhZ21lbnRzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5tYXhQYXlsb2FkPTBdIFRoZSBtYXhpbXVtIGFsbG93ZWQgbWVzc2FnZSBzaXplXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuc2tpcFVURjhWYWxpZGF0aW9uPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvclxuICAgKiAgICAgbm90IHRvIHNraXAgVVRGLTggdmFsaWRhdGlvbiBmb3IgdGV4dCBhbmQgY2xvc2UgbWVzc2FnZXNcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHNldFNvY2tldChzb2NrZXQsIGhlYWQsIG9wdGlvbnMpIHtcbiAgICBjb25zdCByZWNlaXZlciA9IG5ldyBSZWNlaXZlcih7XG4gICAgICBhbGxvd1N5bmNocm9ub3VzRXZlbnRzOiBvcHRpb25zLmFsbG93U3luY2hyb25vdXNFdmVudHMsXG4gICAgICBiaW5hcnlUeXBlOiB0aGlzLmJpbmFyeVR5cGUsXG4gICAgICBleHRlbnNpb25zOiB0aGlzLl9leHRlbnNpb25zLFxuICAgICAgaXNTZXJ2ZXI6IHRoaXMuX2lzU2VydmVyLFxuICAgICAgbWF4QnVmZmVyZWRDaHVua3M6IG9wdGlvbnMubWF4QnVmZmVyZWRDaHVua3MsXG4gICAgICBtYXhGcmFnbWVudHM6IG9wdGlvbnMubWF4RnJhZ21lbnRzLFxuICAgICAgbWF4UGF5bG9hZDogb3B0aW9ucy5tYXhQYXlsb2FkLFxuICAgICAgc2tpcFVURjhWYWxpZGF0aW9uOiBvcHRpb25zLnNraXBVVEY4VmFsaWRhdGlvblxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2VuZGVyID0gbmV3IFNlbmRlcihzb2NrZXQsIHRoaXMuX2V4dGVuc2lvbnMsIG9wdGlvbnMuZ2VuZXJhdGVNYXNrKTtcblxuICAgIHRoaXMuX3JlY2VpdmVyID0gcmVjZWl2ZXI7XG4gICAgdGhpcy5fc2VuZGVyID0gc2VuZGVyO1xuICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcblxuICAgIHJlY2VpdmVyW2tXZWJTb2NrZXRdID0gdGhpcztcbiAgICBzZW5kZXJba1dlYlNvY2tldF0gPSB0aGlzO1xuICAgIHNvY2tldFtrV2ViU29ja2V0XSA9IHRoaXM7XG5cbiAgICByZWNlaXZlci5vbignY29uY2x1ZGUnLCByZWNlaXZlck9uQ29uY2x1ZGUpO1xuICAgIHJlY2VpdmVyLm9uKCdkcmFpbicsIHJlY2VpdmVyT25EcmFpbik7XG4gICAgcmVjZWl2ZXIub24oJ2Vycm9yJywgcmVjZWl2ZXJPbkVycm9yKTtcbiAgICByZWNlaXZlci5vbignbWVzc2FnZScsIHJlY2VpdmVyT25NZXNzYWdlKTtcbiAgICByZWNlaXZlci5vbigncGluZycsIHJlY2VpdmVyT25QaW5nKTtcbiAgICByZWNlaXZlci5vbigncG9uZycsIHJlY2VpdmVyT25Qb25nKTtcblxuICAgIHNlbmRlci5vbmVycm9yID0gc2VuZGVyT25FcnJvcjtcblxuICAgIC8vXG4gICAgLy8gVGhlc2UgbWV0aG9kcyBtYXkgbm90IGJlIGF2YWlsYWJsZSBpZiBgc29ja2V0YCBpcyBqdXN0IGEgYER1cGxleGAuXG4gICAgLy9cbiAgICBpZiAoc29ja2V0LnNldFRpbWVvdXQpIHNvY2tldC5zZXRUaW1lb3V0KDApO1xuICAgIGlmIChzb2NrZXQuc2V0Tm9EZWxheSkgc29ja2V0LnNldE5vRGVsYXkoKTtcblxuICAgIGlmIChoZWFkLmxlbmd0aCA+IDApIHNvY2tldC51bnNoaWZ0KGhlYWQpO1xuXG4gICAgc29ja2V0Lm9uKCdjbG9zZScsIHNvY2tldE9uQ2xvc2UpO1xuICAgIHNvY2tldC5vbignZGF0YScsIHNvY2tldE9uRGF0YSk7XG4gICAgc29ja2V0Lm9uKCdlbmQnLCBzb2NrZXRPbkVuZCk7XG4gICAgc29ja2V0Lm9uKCdlcnJvcicsIHNvY2tldE9uRXJyb3IpO1xuXG4gICAgdGhpcy5fcmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5PUEVOO1xuICAgIHRoaXMuZW1pdCgnb3BlbicpO1xuICB9XG5cbiAgLyoqXG4gICAqIEVtaXQgdGhlIGAnY2xvc2UnYCBldmVudC5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGVtaXRDbG9zZSgpIHtcbiAgICBpZiAoIXRoaXMuX3NvY2tldCkge1xuICAgICAgdGhpcy5fcmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TRUQ7XG4gICAgICB0aGlzLmVtaXQoJ2Nsb3NlJywgdGhpcy5fY2xvc2VDb2RlLCB0aGlzLl9jbG9zZU1lc3NhZ2UpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9leHRlbnNpb25zW1Blck1lc3NhZ2VEZWZsYXRlLmV4dGVuc2lvbk5hbWVdKSB7XG4gICAgICB0aGlzLl9leHRlbnNpb25zW1Blck1lc3NhZ2VEZWZsYXRlLmV4dGVuc2lvbk5hbWVdLmNsZWFudXAoKTtcbiAgICB9XG5cbiAgICB0aGlzLl9yZWNlaXZlci5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcbiAgICB0aGlzLl9yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NFRDtcbiAgICB0aGlzLmVtaXQoJ2Nsb3NlJywgdGhpcy5fY2xvc2VDb2RlLCB0aGlzLl9jbG9zZU1lc3NhZ2UpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IGEgY2xvc2luZyBoYW5kc2hha2UuXG4gICAqXG4gICAqICAgICAgICAgICstLS0tLS0tLS0tKyAgICstLS0tLS0tLS0tLSsgICArLS0tLS0tLS0tLStcbiAgICogICAgIC0gLSAtfHdzLmNsb3NlKCl8LS0+fGNsb3NlIGZyYW1lfC0tPnx3cy5jbG9zZSgpfC0gLSAtXG4gICAqICAgIHwgICAgICstLS0tLS0tLS0tKyAgICstLS0tLS0tLS0tLSsgICArLS0tLS0tLS0tLSsgICAgIHxcbiAgICogICAgICAgICAgKy0tLS0tLS0tLS0rICAgKy0tLS0tLS0tLS0tKyAgICAgICAgIHxcbiAgICogQ0xPU0lORyAgfHdzLmNsb3NlKCl8PC0tfGNsb3NlIGZyYW1lfDwtLSstLS0tLSsgICAgICAgQ0xPU0lOR1xuICAgKiAgICAgICAgICArLS0tLS0tLS0tLSsgICArLS0tLS0tLS0tLS0rICAgfFxuICAgKiAgICB8ICAgICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgICstLS0rICAgICAgICB8XG4gICAqICAgICAgICAgICAgICAgICstLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0rLS0+fGZpbnwgLSAtIC0gLVxuICAgKiAgICB8ICAgICAgICAgKy0tLSsgICAgICAgICAgICAgICAgICAgICAgfCAgICstLS0rXG4gICAqICAgICAtIC0gLSAtIC18ZmlufDwtLS0tLS0tLS0tLS0tLS0tLS0tLS0rXG4gICAqICAgICAgICAgICAgICArLS0tK1xuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gW2NvZGVdIFN0YXR1cyBjb2RlIGV4cGxhaW5pbmcgd2h5IHRoZSBjb25uZWN0aW9uIGlzIGNsb3NpbmdcbiAgICogQHBhcmFtIHsoU3RyaW5nfEJ1ZmZlcil9IFtkYXRhXSBUaGUgcmVhc29uIHdoeSB0aGUgY29ubmVjdGlvbiBpc1xuICAgKiAgICAgY2xvc2luZ1xuICAgKiBAcHVibGljXG4gICAqL1xuICBjbG9zZShjb2RlLCBkYXRhKSB7XG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0LkNMT1NFRCkgcmV0dXJuO1xuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HKSB7XG4gICAgICBjb25zdCBtc2cgPSAnV2ViU29ja2V0IHdhcyBjbG9zZWQgYmVmb3JlIHRoZSBjb25uZWN0aW9uIHdhcyBlc3RhYmxpc2hlZCc7XG4gICAgICBhYm9ydEhhbmRzaGFrZSh0aGlzLCB0aGlzLl9yZXEsIG1zZyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0LkNMT1NJTkcpIHtcbiAgICAgIGlmIChcbiAgICAgICAgdGhpcy5fY2xvc2VGcmFtZVNlbnQgJiZcbiAgICAgICAgKHRoaXMuX2Nsb3NlRnJhbWVSZWNlaXZlZCB8fCB0aGlzLl9yZWNlaXZlci5fd3JpdGFibGVTdGF0ZS5lcnJvckVtaXR0ZWQpXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVuZCgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fcmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TSU5HO1xuICAgIHRoaXMuX3NlbmRlci5jbG9zZShjb2RlLCBkYXRhLCAhdGhpcy5faXNTZXJ2ZXIsIChlcnIpID0+IHtcbiAgICAgIC8vXG4gICAgICAvLyBUaGlzIGVycm9yIGlzIGhhbmRsZWQgYnkgdGhlIGAnZXJyb3InYCBsaXN0ZW5lciBvbiB0aGUgc29ja2V0LiBXZSBvbmx5XG4gICAgICAvLyB3YW50IHRvIGtub3cgaWYgdGhlIGNsb3NlIGZyYW1lIGhhcyBiZWVuIHNlbnQgaGVyZS5cbiAgICAgIC8vXG4gICAgICBpZiAoZXJyKSByZXR1cm47XG5cbiAgICAgIHRoaXMuX2Nsb3NlRnJhbWVTZW50ID0gdHJ1ZTtcblxuICAgICAgaWYgKFxuICAgICAgICB0aGlzLl9jbG9zZUZyYW1lUmVjZWl2ZWQgfHxcbiAgICAgICAgdGhpcy5fcmVjZWl2ZXIuX3dyaXRhYmxlU3RhdGUuZXJyb3JFbWl0dGVkXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVuZCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgc2V0Q2xvc2VUaW1lcih0aGlzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXVzZSB0aGUgc29ja2V0LlxuICAgKlxuICAgKiBAcHVibGljXG4gICAqL1xuICBwYXVzZSgpIHtcbiAgICBpZiAoXG4gICAgICB0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HIHx8XG4gICAgICB0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DTE9TRURcbiAgICApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9wYXVzZWQgPSB0cnVlO1xuICAgIHRoaXMuX3NvY2tldC5wYXVzZSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgYSBwaW5nLlxuICAgKlxuICAgKiBAcGFyYW0geyp9IFtkYXRhXSBUaGUgZGF0YSB0byBzZW5kXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW21hc2tdIEluZGljYXRlcyB3aGV0aGVyIG9yIG5vdCB0byBtYXNrIGBkYXRhYFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2JdIENhbGxiYWNrIHdoaWNoIGlzIGV4ZWN1dGVkIHdoZW4gdGhlIHBpbmcgaXMgc2VudFxuICAgKiBAcHVibGljXG4gICAqL1xuICBwaW5nKGRhdGEsIG1hc2ssIGNiKSB7XG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0LkNPTk5FQ1RJTkcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignV2ViU29ja2V0IGlzIG5vdCBvcGVuOiByZWFkeVN0YXRlIDAgKENPTk5FQ1RJTkcpJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBkYXRhID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYiA9IGRhdGE7XG4gICAgICBkYXRhID0gbWFzayA9IHVuZGVmaW5lZDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtYXNrID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYiA9IG1hc2s7XG4gICAgICBtYXNrID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicpIGRhdGEgPSBkYXRhLnRvU3RyaW5nKCk7XG5cbiAgICBpZiAodGhpcy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgc2VuZEFmdGVyQ2xvc2UodGhpcywgZGF0YSwgY2IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChtYXNrID09PSB1bmRlZmluZWQpIG1hc2sgPSAhdGhpcy5faXNTZXJ2ZXI7XG4gICAgdGhpcy5fc2VuZGVyLnBpbmcoZGF0YSB8fCBFTVBUWV9CVUZGRVIsIG1hc2ssIGNiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGEgcG9uZy5cbiAgICpcbiAgICogQHBhcmFtIHsqfSBbZGF0YV0gVGhlIGRhdGEgdG8gc2VuZFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFttYXNrXSBJbmRpY2F0ZXMgd2hldGhlciBvciBub3QgdG8gbWFzayBgZGF0YWBcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2NiXSBDYWxsYmFjayB3aGljaCBpcyBleGVjdXRlZCB3aGVuIHRoZSBwb25nIGlzIHNlbnRcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgcG9uZyhkYXRhLCBtYXNrLCBjYikge1xuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dlYlNvY2tldCBpcyBub3Qgb3BlbjogcmVhZHlTdGF0ZSAwIChDT05ORUNUSU5HKScpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2IgPSBkYXRhO1xuICAgICAgZGF0YSA9IG1hc2sgPSB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbWFzayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2IgPSBtYXNrO1xuICAgICAgbWFzayA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSBkYXRhID0gZGF0YS50b1N0cmluZygpO1xuXG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgIHNlbmRBZnRlckNsb3NlKHRoaXMsIGRhdGEsIGNiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAobWFzayA9PT0gdW5kZWZpbmVkKSBtYXNrID0gIXRoaXMuX2lzU2VydmVyO1xuICAgIHRoaXMuX3NlbmRlci5wb25nKGRhdGEgfHwgRU1QVFlfQlVGRkVSLCBtYXNrLCBjYik7XG4gIH1cblxuICAvKipcbiAgICogUmVzdW1lIHRoZSBzb2NrZXQuXG4gICAqXG4gICAqIEBwdWJsaWNcbiAgICovXG4gIHJlc3VtZSgpIHtcbiAgICBpZiAoXG4gICAgICB0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HIHx8XG4gICAgICB0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DTE9TRURcbiAgICApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICBpZiAoIXRoaXMuX3JlY2VpdmVyLl93cml0YWJsZVN0YXRlLm5lZWREcmFpbikgdGhpcy5fc29ja2V0LnJlc3VtZSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgYSBkYXRhIG1lc3NhZ2UuXG4gICAqXG4gICAqIEBwYXJhbSB7Kn0gZGF0YSBUaGUgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3B0aW9ucyBvYmplY3RcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5iaW5hcnldIFNwZWNpZmllcyB3aGV0aGVyIGBkYXRhYCBpcyBiaW5hcnkgb3JcbiAgICogICAgIHRleHRcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5jb21wcmVzc10gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIGNvbXByZXNzXG4gICAqICAgICBgZGF0YWBcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5maW49dHJ1ZV0gU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGZyYWdtZW50IGlzIHRoZVxuICAgKiAgICAgbGFzdCBvbmVcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5tYXNrXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gbWFzayBgZGF0YWBcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2NiXSBDYWxsYmFjayB3aGljaCBpcyBleGVjdXRlZCB3aGVuIGRhdGEgaXMgd3JpdHRlbiBvdXRcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgc2VuZChkYXRhLCBvcHRpb25zLCBjYikge1xuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dlYlNvY2tldCBpcyBub3Qgb3BlbjogcmVhZHlTdGF0ZSAwIChDT05ORUNUSU5HKScpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2IgPSBvcHRpb25zO1xuICAgICAgb3B0aW9ucyA9IHt9O1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicpIGRhdGEgPSBkYXRhLnRvU3RyaW5nKCk7XG5cbiAgICBpZiAodGhpcy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgc2VuZEFmdGVyQ2xvc2UodGhpcywgZGF0YSwgY2IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG9wdHMgPSB7XG4gICAgICBiaW5hcnk6IHR5cGVvZiBkYXRhICE9PSAnc3RyaW5nJyxcbiAgICAgIG1hc2s6ICF0aGlzLl9pc1NlcnZlcixcbiAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgZmluOiB0cnVlLFxuICAgICAgLi4ub3B0aW9uc1xuICAgIH07XG5cbiAgICBpZiAoIXRoaXMuX2V4dGVuc2lvbnNbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV0pIHtcbiAgICAgIG9wdHMuY29tcHJlc3MgPSBmYWxzZTtcbiAgICB9XG5cbiAgICB0aGlzLl9zZW5kZXIuc2VuZChkYXRhIHx8IEVNUFRZX0JVRkZFUiwgb3B0cywgY2IpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNpYmx5IGNsb3NlIHRoZSBjb25uZWN0aW9uLlxuICAgKlxuICAgKiBAcHVibGljXG4gICAqL1xuICB0ZXJtaW5hdGUoKSB7XG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0LkNMT1NFRCkgcmV0dXJuO1xuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HKSB7XG4gICAgICBjb25zdCBtc2cgPSAnV2ViU29ja2V0IHdhcyBjbG9zZWQgYmVmb3JlIHRoZSBjb25uZWN0aW9uIHdhcyBlc3RhYmxpc2hlZCc7XG4gICAgICBhYm9ydEhhbmRzaGFrZSh0aGlzLCB0aGlzLl9yZXEsIG1zZyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3NvY2tldCkge1xuICAgICAgdGhpcy5fcmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TSU5HO1xuICAgICAgdGhpcy5fc29ja2V0LmRlc3Ryb3koKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBAY29uc3RhbnQge051bWJlcn0gQ09OTkVDVElOR1xuICogQG1lbWJlcm9mIFdlYlNvY2tldFxuICovXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoV2ViU29ja2V0LCAnQ09OTkVDVElORycsIHtcbiAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgdmFsdWU6IHJlYWR5U3RhdGVzLmluZGV4T2YoJ0NPTk5FQ1RJTkcnKVxufSk7XG5cbi8qKlxuICogQGNvbnN0YW50IHtOdW1iZXJ9IENPTk5FQ1RJTkdcbiAqIEBtZW1iZXJvZiBXZWJTb2NrZXQucHJvdG90eXBlXG4gKi9cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWJTb2NrZXQucHJvdG90eXBlLCAnQ09OTkVDVElORycsIHtcbiAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgdmFsdWU6IHJlYWR5U3RhdGVzLmluZGV4T2YoJ0NPTk5FQ1RJTkcnKVxufSk7XG5cbi8qKlxuICogQGNvbnN0YW50IHtOdW1iZXJ9IE9QRU5cbiAqIEBtZW1iZXJvZiBXZWJTb2NrZXRcbiAqL1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KFdlYlNvY2tldCwgJ09QRU4nLCB7XG4gIGVudW1lcmFibGU6IHRydWUsXG4gIHZhbHVlOiByZWFkeVN0YXRlcy5pbmRleE9mKCdPUEVOJylcbn0pO1xuXG4vKipcbiAqIEBjb25zdGFudCB7TnVtYmVyfSBPUEVOXG4gKiBAbWVtYmVyb2YgV2ViU29ja2V0LnByb3RvdHlwZVxuICovXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoV2ViU29ja2V0LnByb3RvdHlwZSwgJ09QRU4nLCB7XG4gIGVudW1lcmFibGU6IHRydWUsXG4gIHZhbHVlOiByZWFkeVN0YXRlcy5pbmRleE9mKCdPUEVOJylcbn0pO1xuXG4vKipcbiAqIEBjb25zdGFudCB7TnVtYmVyfSBDTE9TSU5HXG4gKiBAbWVtYmVyb2YgV2ViU29ja2V0XG4gKi9cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWJTb2NrZXQsICdDTE9TSU5HJywge1xuICBlbnVtZXJhYmxlOiB0cnVlLFxuICB2YWx1ZTogcmVhZHlTdGF0ZXMuaW5kZXhPZignQ0xPU0lORycpXG59KTtcblxuLyoqXG4gKiBAY29uc3RhbnQge051bWJlcn0gQ0xPU0lOR1xuICogQG1lbWJlcm9mIFdlYlNvY2tldC5wcm90b3R5cGVcbiAqL1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KFdlYlNvY2tldC5wcm90b3R5cGUsICdDTE9TSU5HJywge1xuICBlbnVtZXJhYmxlOiB0cnVlLFxuICB2YWx1ZTogcmVhZHlTdGF0ZXMuaW5kZXhPZignQ0xPU0lORycpXG59KTtcblxuLyoqXG4gKiBAY29uc3RhbnQge051bWJlcn0gQ0xPU0VEXG4gKiBAbWVtYmVyb2YgV2ViU29ja2V0XG4gKi9cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWJTb2NrZXQsICdDTE9TRUQnLCB7XG4gIGVudW1lcmFibGU6IHRydWUsXG4gIHZhbHVlOiByZWFkeVN0YXRlcy5pbmRleE9mKCdDTE9TRUQnKVxufSk7XG5cbi8qKlxuICogQGNvbnN0YW50IHtOdW1iZXJ9IENMT1NFRFxuICogQG1lbWJlcm9mIFdlYlNvY2tldC5wcm90b3R5cGVcbiAqL1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KFdlYlNvY2tldC5wcm90b3R5cGUsICdDTE9TRUQnLCB7XG4gIGVudW1lcmFibGU6IHRydWUsXG4gIHZhbHVlOiByZWFkeVN0YXRlcy5pbmRleE9mKCdDTE9TRUQnKVxufSk7XG5cbltcbiAgJ2JpbmFyeVR5cGUnLFxuICAnYnVmZmVyZWRBbW91bnQnLFxuICAnZXh0ZW5zaW9ucycsXG4gICdpc1BhdXNlZCcsXG4gICdwcm90b2NvbCcsXG4gICdyZWFkeVN0YXRlJyxcbiAgJ3VybCdcbl0uZm9yRWFjaCgocHJvcGVydHkpID0+IHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFdlYlNvY2tldC5wcm90b3R5cGUsIHByb3BlcnR5LCB7IGVudW1lcmFibGU6IHRydWUgfSk7XG59KTtcblxuLy9cbi8vIEFkZCB0aGUgYG9ub3BlbmAsIGBvbmVycm9yYCwgYG9uY2xvc2VgLCBhbmQgYG9ubWVzc2FnZWAgYXR0cmlidXRlcy5cbi8vIFNlZSBodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9jb21tcy5odG1sI3RoZS13ZWJzb2NrZXQtaW50ZXJmYWNlXG4vL1xuWydvcGVuJywgJ2Vycm9yJywgJ2Nsb3NlJywgJ21lc3NhZ2UnXS5mb3JFYWNoKChtZXRob2QpID0+IHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFdlYlNvY2tldC5wcm90b3R5cGUsIGBvbiR7bWV0aG9kfWAsIHtcbiAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgIGdldCgpIHtcbiAgICAgIGZvciAoY29uc3QgbGlzdGVuZXIgb2YgdGhpcy5saXN0ZW5lcnMobWV0aG9kKSkge1xuICAgICAgICBpZiAobGlzdGVuZXJba0Zvck9uRXZlbnRBdHRyaWJ1dGVdKSByZXR1cm4gbGlzdGVuZXJba0xpc3RlbmVyXTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBzZXQoaGFuZGxlcikge1xuICAgICAgZm9yIChjb25zdCBsaXN0ZW5lciBvZiB0aGlzLmxpc3RlbmVycyhtZXRob2QpKSB7XG4gICAgICAgIGlmIChsaXN0ZW5lcltrRm9yT25FdmVudEF0dHJpYnV0ZV0pIHtcbiAgICAgICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKG1ldGhvZCwgbGlzdGVuZXIpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgaGFuZGxlciAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuO1xuXG4gICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIobWV0aG9kLCBoYW5kbGVyLCB7XG4gICAgICAgIFtrRm9yT25FdmVudEF0dHJpYnV0ZV06IHRydWVcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59KTtcblxuV2ViU29ja2V0LnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVyID0gYWRkRXZlbnRMaXN0ZW5lcjtcbldlYlNvY2tldC5wcm90b3R5cGUucmVtb3ZlRXZlbnRMaXN0ZW5lciA9IHJlbW92ZUV2ZW50TGlzdGVuZXI7XG5cbm1vZHVsZS5leHBvcnRzID0gV2ViU29ja2V0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBXZWJTb2NrZXQgY2xpZW50LlxuICpcbiAqIEBwYXJhbSB7V2ViU29ja2V0fSB3ZWJzb2NrZXQgVGhlIGNsaWVudCB0byBpbml0aWFsaXplXG4gKiBAcGFyYW0geyhTdHJpbmd8VVJMKX0gYWRkcmVzcyBUaGUgVVJMIHRvIHdoaWNoIHRvIGNvbm5lY3RcbiAqIEBwYXJhbSB7QXJyYXl9IHByb3RvY29scyBUaGUgc3VicHJvdG9jb2xzXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIENvbm5lY3Rpb24gb3B0aW9uc1xuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5hbGxvd1N5bmNocm9ub3VzRXZlbnRzPXRydWVdIFNwZWNpZmllcyB3aGV0aGVyIGFueVxuICogICAgIG9mIHRoZSBgJ21lc3NhZ2UnYCwgYCdwaW5nJ2AsIGFuZCBgJ3BvbmcnYCBldmVudHMgY2FuIGJlIGVtaXR0ZWQgbXVsdGlwbGVcbiAqICAgICB0aW1lcyBpbiB0aGUgc2FtZSB0aWNrXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmF1dG9Qb25nPXRydWVdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0b1xuICogICAgIGF1dG9tYXRpY2FsbHkgc2VuZCBhIHBvbmcgaW4gcmVzcG9uc2UgdG8gYSBwaW5nXG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMuY2xvc2VUaW1lb3V0PTMwMDAwXSBEdXJhdGlvbiBpbiBtaWxsaXNlY29uZHMgdG8gd2FpdFxuICogICAgIGZvciB0aGUgY2xvc2luZyBoYW5kc2hha2UgdG8gZmluaXNoIGFmdGVyIGB3ZWJzb2NrZXQuY2xvc2UoKWAgaXMgY2FsbGVkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5maW5pc2hSZXF1ZXN0XSBBIGZ1bmN0aW9uIHdoaWNoIGNhbiBiZSB1c2VkIHRvXG4gKiAgICAgY3VzdG9taXplIHRoZSBoZWFkZXJzIG9mIGVhY2ggaHR0cCByZXF1ZXN0IGJlZm9yZSBpdCBpcyBzZW50XG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmZvbGxvd1JlZGlyZWN0cz1mYWxzZV0gV2hldGhlciBvciBub3QgdG8gZm9sbG93XG4gKiAgICAgcmVkaXJlY3RzXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5nZW5lcmF0ZU1hc2tdIFRoZSBmdW5jdGlvbiB1c2VkIHRvIGdlbmVyYXRlIHRoZVxuICogICAgIG1hc2tpbmcga2V5XG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMuaGFuZHNoYWtlVGltZW91dF0gVGltZW91dCBpbiBtaWxsaXNlY29uZHMgZm9yIHRoZVxuICogICAgIGhhbmRzaGFrZSByZXF1ZXN0XG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMubWF4QnVmZmVyZWRDaHVua3M9MjYyMTQ0XSBUaGUgbWF4aW11bSBudW1iZXIgb2ZcbiAqICAgICBidWZmZXJlZCBkYXRhIGNodW5rc1xuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLm1heEZyYWdtZW50cz0xNjM4NF0gVGhlIG1heGltdW0gbnVtYmVyIG9mIG1lc3NhZ2VcbiAqICAgICBmcmFnbWVudHNcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5tYXhQYXlsb2FkPTEwNDg1NzYwMF0gVGhlIG1heGltdW0gYWxsb3dlZCBtZXNzYWdlXG4gKiAgICAgc2l6ZVxuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLm1heFJlZGlyZWN0cz0xMF0gVGhlIG1heGltdW0gbnVtYmVyIG9mIHJlZGlyZWN0c1xuICogICAgIGFsbG93ZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5vcmlnaW5dIFZhbHVlIG9mIHRoZSBgT3JpZ2luYCBvclxuICogICAgIGBTZWMtV2ViU29ja2V0LU9yaWdpbmAgaGVhZGVyXG4gKiBAcGFyYW0geyhCb29sZWFufE9iamVjdCl9IFtvcHRpb25zLnBlck1lc3NhZ2VEZWZsYXRlPXRydWVdIEVuYWJsZS9kaXNhYmxlXG4gKiAgICAgcGVybWVzc2FnZS1kZWZsYXRlXG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucHJvdG9jb2xWZXJzaW9uPTEzXSBWYWx1ZSBvZiB0aGVcbiAqICAgICBgU2VjLVdlYlNvY2tldC1WZXJzaW9uYCBoZWFkZXJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuc2tpcFVURjhWYWxpZGF0aW9uPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvclxuICogICAgIG5vdCB0byBza2lwIFVURi04IHZhbGlkYXRpb24gZm9yIHRleHQgYW5kIGNsb3NlIG1lc3NhZ2VzXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBpbml0QXNDbGllbnQod2Vic29ja2V0LCBhZGRyZXNzLCBwcm90b2NvbHMsIG9wdGlvbnMpIHtcbiAgY29uc3Qgb3B0cyA9IHtcbiAgICBhbGxvd1N5bmNocm9ub3VzRXZlbnRzOiB0cnVlLFxuICAgIGF1dG9Qb25nOiB0cnVlLFxuICAgIGNsb3NlVGltZW91dDogQ0xPU0VfVElNRU9VVCxcbiAgICBwcm90b2NvbFZlcnNpb246IHByb3RvY29sVmVyc2lvbnNbMV0sXG4gICAgbWF4QnVmZmVyZWRDaHVua3M6IDI1NiAqIDEwMjQsXG4gICAgbWF4RnJhZ21lbnRzOiAxNiAqIDEwMjQsXG4gICAgbWF4UGF5bG9hZDogMTAwICogMTAyNCAqIDEwMjQsXG4gICAgc2tpcFVURjhWYWxpZGF0aW9uOiBmYWxzZSxcbiAgICBwZXJNZXNzYWdlRGVmbGF0ZTogdHJ1ZSxcbiAgICBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlLFxuICAgIG1heFJlZGlyZWN0czogMTAsXG4gICAgLi4ub3B0aW9ucyxcbiAgICBzb2NrZXRQYXRoOiB1bmRlZmluZWQsXG4gICAgaG9zdG5hbWU6IHVuZGVmaW5lZCxcbiAgICBwcm90b2NvbDogdW5kZWZpbmVkLFxuICAgIHRpbWVvdXQ6IHVuZGVmaW5lZCxcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIGhvc3Q6IHVuZGVmaW5lZCxcbiAgICBwYXRoOiB1bmRlZmluZWQsXG4gICAgcG9ydDogdW5kZWZpbmVkXG4gIH07XG5cbiAgd2Vic29ja2V0Ll9hdXRvUG9uZyA9IG9wdHMuYXV0b1Bvbmc7XG4gIHdlYnNvY2tldC5fY2xvc2VUaW1lb3V0ID0gb3B0cy5jbG9zZVRpbWVvdXQ7XG5cbiAgaWYgKCFwcm90b2NvbFZlcnNpb25zLmluY2x1ZGVzKG9wdHMucHJvdG9jb2xWZXJzaW9uKSkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFxuICAgICAgYFVuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb246ICR7b3B0cy5wcm90b2NvbFZlcnNpb259IGAgK1xuICAgICAgICBgKHN1cHBvcnRlZCB2ZXJzaW9uczogJHtwcm90b2NvbFZlcnNpb25zLmpvaW4oJywgJyl9KWBcbiAgICApO1xuICB9XG5cbiAgbGV0IHBhcnNlZFVybDtcblxuICBpZiAoYWRkcmVzcyBpbnN0YW5jZW9mIFVSTCkge1xuICAgIHBhcnNlZFVybCA9IGFkZHJlc3M7XG4gIH0gZWxzZSB7XG4gICAgdHJ5IHtcbiAgICAgIHBhcnNlZFVybCA9IG5ldyBVUkwoYWRkcmVzcyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoYEludmFsaWQgVVJMOiAke2FkZHJlc3N9YCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHBhcnNlZFVybC5wcm90b2NvbCA9PT0gJ2h0dHA6Jykge1xuICAgIHBhcnNlZFVybC5wcm90b2NvbCA9ICd3czonO1xuICB9IGVsc2UgaWYgKHBhcnNlZFVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOicpIHtcbiAgICBwYXJzZWRVcmwucHJvdG9jb2wgPSAnd3NzOic7XG4gIH1cblxuICB3ZWJzb2NrZXQuX3VybCA9IHBhcnNlZFVybC5ocmVmO1xuXG4gIGNvbnN0IGlzU2VjdXJlID0gcGFyc2VkVXJsLnByb3RvY29sID09PSAnd3NzOic7XG4gIGNvbnN0IGlzSXBjVXJsID0gcGFyc2VkVXJsLnByb3RvY29sID09PSAnd3MrdW5peDonO1xuICBsZXQgaW52YWxpZFVybE1lc3NhZ2U7XG5cbiAgaWYgKHBhcnNlZFVybC5wcm90b2NvbCAhPT0gJ3dzOicgJiYgIWlzU2VjdXJlICYmICFpc0lwY1VybCkge1xuICAgIGludmFsaWRVcmxNZXNzYWdlID1cbiAgICAgICdUaGUgVVJMXFwncyBwcm90b2NvbCBtdXN0IGJlIG9uZSBvZiBcIndzOlwiLCBcIndzczpcIiwgJyArXG4gICAgICAnXCJodHRwOlwiLCBcImh0dHBzOlwiLCBvciBcIndzK3VuaXg6XCInO1xuICB9IGVsc2UgaWYgKGlzSXBjVXJsICYmICFwYXJzZWRVcmwucGF0aG5hbWUpIHtcbiAgICBpbnZhbGlkVXJsTWVzc2FnZSA9IFwiVGhlIFVSTCdzIHBhdGhuYW1lIGlzIGVtcHR5XCI7XG4gIH0gZWxzZSBpZiAocGFyc2VkVXJsLmhhc2gpIHtcbiAgICBpbnZhbGlkVXJsTWVzc2FnZSA9ICdUaGUgVVJMIGNvbnRhaW5zIGEgZnJhZ21lbnQgaWRlbnRpZmllcic7XG4gIH1cblxuICBpZiAoaW52YWxpZFVybE1lc3NhZ2UpIHtcbiAgICBjb25zdCBlcnIgPSBuZXcgU3ludGF4RXJyb3IoaW52YWxpZFVybE1lc3NhZ2UpO1xuXG4gICAgaWYgKHdlYnNvY2tldC5fcmVkaXJlY3RzID09PSAwKSB7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRFcnJvckFuZENsb3NlKHdlYnNvY2tldCwgZXJyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBkZWZhdWx0UG9ydCA9IGlzU2VjdXJlID8gNDQzIDogODA7XG4gIGNvbnN0IGtleSA9IHJhbmRvbUJ5dGVzKDE2KS50b1N0cmluZygnYmFzZTY0Jyk7XG4gIGNvbnN0IHJlcXVlc3QgPSBpc1NlY3VyZSA/IGh0dHBzLnJlcXVlc3QgOiBodHRwLnJlcXVlc3Q7XG4gIGNvbnN0IHByb3RvY29sU2V0ID0gbmV3IFNldCgpO1xuICBsZXQgcGVyTWVzc2FnZURlZmxhdGU7XG5cbiAgb3B0cy5jcmVhdGVDb25uZWN0aW9uID1cbiAgICBvcHRzLmNyZWF0ZUNvbm5lY3Rpb24gfHwgKGlzU2VjdXJlID8gdGxzQ29ubmVjdCA6IG5ldENvbm5lY3QpO1xuICBvcHRzLmRlZmF1bHRQb3J0ID0gb3B0cy5kZWZhdWx0UG9ydCB8fCBkZWZhdWx0UG9ydDtcbiAgb3B0cy5wb3J0ID0gcGFyc2VkVXJsLnBvcnQgfHwgZGVmYXVsdFBvcnQ7XG4gIG9wdHMuaG9zdCA9IHBhcnNlZFVybC5ob3N0bmFtZS5zdGFydHNXaXRoKCdbJylcbiAgICA/IHBhcnNlZFVybC5ob3N0bmFtZS5zbGljZSgxLCAtMSlcbiAgICA6IHBhcnNlZFVybC5ob3N0bmFtZTtcbiAgb3B0cy5oZWFkZXJzID0ge1xuICAgIC4uLm9wdHMuaGVhZGVycyxcbiAgICAnU2VjLVdlYlNvY2tldC1WZXJzaW9uJzogb3B0cy5wcm90b2NvbFZlcnNpb24sXG4gICAgJ1NlYy1XZWJTb2NrZXQtS2V5Jzoga2V5LFxuICAgIENvbm5lY3Rpb246ICdVcGdyYWRlJyxcbiAgICBVcGdyYWRlOiAnd2Vic29ja2V0J1xuICB9O1xuICBvcHRzLnBhdGggPSBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoO1xuICBvcHRzLnRpbWVvdXQgPSBvcHRzLmhhbmRzaGFrZVRpbWVvdXQ7XG5cbiAgaWYgKG9wdHMucGVyTWVzc2FnZURlZmxhdGUpIHtcbiAgICBwZXJNZXNzYWdlRGVmbGF0ZSA9IG5ldyBQZXJNZXNzYWdlRGVmbGF0ZSh7XG4gICAgICAuLi5vcHRzLnBlck1lc3NhZ2VEZWZsYXRlLFxuICAgICAgaXNTZXJ2ZXI6IGZhbHNlLFxuICAgICAgbWF4UGF5bG9hZDogb3B0cy5tYXhQYXlsb2FkXG4gICAgfSk7XG4gICAgb3B0cy5oZWFkZXJzWydTZWMtV2ViU29ja2V0LUV4dGVuc2lvbnMnXSA9IGZvcm1hdCh7XG4gICAgICBbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV06IHBlck1lc3NhZ2VEZWZsYXRlLm9mZmVyKClcbiAgICB9KTtcbiAgfVxuICBpZiAocHJvdG9jb2xzLmxlbmd0aCkge1xuICAgIGZvciAoY29uc3QgcHJvdG9jb2wgb2YgcHJvdG9jb2xzKSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwcm90b2NvbCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgIXN1YnByb3RvY29sUmVnZXgudGVzdChwcm90b2NvbCkgfHxcbiAgICAgICAgcHJvdG9jb2xTZXQuaGFzKHByb3RvY29sKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihcbiAgICAgICAgICAnQW4gaW52YWxpZCBvciBkdXBsaWNhdGVkIHN1YnByb3RvY29sIHdhcyBzcGVjaWZpZWQnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHByb3RvY29sU2V0LmFkZChwcm90b2NvbCk7XG4gICAgfVxuXG4gICAgb3B0cy5oZWFkZXJzWydTZWMtV2ViU29ja2V0LVByb3RvY29sJ10gPSBwcm90b2NvbHMuam9pbignLCcpO1xuICB9XG4gIGlmIChvcHRzLm9yaWdpbikge1xuICAgIGlmIChvcHRzLnByb3RvY29sVmVyc2lvbiA8IDEzKSB7XG4gICAgICBvcHRzLmhlYWRlcnNbJ1NlYy1XZWJTb2NrZXQtT3JpZ2luJ10gPSBvcHRzLm9yaWdpbjtcbiAgICB9IGVsc2Uge1xuICAgICAgb3B0cy5oZWFkZXJzLk9yaWdpbiA9IG9wdHMub3JpZ2luO1xuICAgIH1cbiAgfVxuICBpZiAocGFyc2VkVXJsLnVzZXJuYW1lIHx8IHBhcnNlZFVybC5wYXNzd29yZCkge1xuICAgIG9wdHMuYXV0aCA9IGAke3BhcnNlZFVybC51c2VybmFtZX06JHtwYXJzZWRVcmwucGFzc3dvcmR9YDtcbiAgfVxuXG4gIGlmIChpc0lwY1VybCkge1xuICAgIGNvbnN0IHBhcnRzID0gb3B0cy5wYXRoLnNwbGl0KCc6Jyk7XG5cbiAgICBvcHRzLnNvY2tldFBhdGggPSBwYXJ0c1swXTtcbiAgICBvcHRzLnBhdGggPSBwYXJ0c1sxXTtcbiAgfVxuXG4gIGxldCByZXE7XG5cbiAgaWYgKG9wdHMuZm9sbG93UmVkaXJlY3RzKSB7XG4gICAgaWYgKHdlYnNvY2tldC5fcmVkaXJlY3RzID09PSAwKSB7XG4gICAgICB3ZWJzb2NrZXQuX29yaWdpbmFsSXBjID0gaXNJcGNVcmw7XG4gICAgICB3ZWJzb2NrZXQuX29yaWdpbmFsU2VjdXJlID0gaXNTZWN1cmU7XG4gICAgICB3ZWJzb2NrZXQuX29yaWdpbmFsSG9zdE9yU29ja2V0UGF0aCA9IGlzSXBjVXJsXG4gICAgICAgID8gb3B0cy5zb2NrZXRQYXRoXG4gICAgICAgIDogcGFyc2VkVXJsLmhvc3Q7XG5cbiAgICAgIGNvbnN0IGhlYWRlcnMgPSBvcHRpb25zICYmIG9wdGlvbnMuaGVhZGVycztcblxuICAgICAgLy9cbiAgICAgIC8vIFNoYWxsb3cgY29weSB0aGUgdXNlciBwcm92aWRlZCBvcHRpb25zIHNvIHRoYXQgaGVhZGVycyBjYW4gYmUgY2hhbmdlZFxuICAgICAgLy8gd2l0aG91dCBtdXRhdGluZyB0aGUgb3JpZ2luYWwgb2JqZWN0LlxuICAgICAgLy9cbiAgICAgIG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGhlYWRlcnM6IHt9IH07XG5cbiAgICAgIGlmIChoZWFkZXJzKSB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpKSB7XG4gICAgICAgICAgb3B0aW9ucy5oZWFkZXJzW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh3ZWJzb2NrZXQubGlzdGVuZXJDb3VudCgncmVkaXJlY3QnKSA9PT0gMCkge1xuICAgICAgY29uc3QgaXNTYW1lSG9zdCA9IGlzSXBjVXJsXG4gICAgICAgID8gd2Vic29ja2V0Ll9vcmlnaW5hbElwY1xuICAgICAgICAgID8gb3B0cy5zb2NrZXRQYXRoID09PSB3ZWJzb2NrZXQuX29yaWdpbmFsSG9zdE9yU29ja2V0UGF0aFxuICAgICAgICAgIDogZmFsc2VcbiAgICAgICAgOiB3ZWJzb2NrZXQuX29yaWdpbmFsSXBjXG4gICAgICAgICAgPyBmYWxzZVxuICAgICAgICAgIDogcGFyc2VkVXJsLmhvc3QgPT09IHdlYnNvY2tldC5fb3JpZ2luYWxIb3N0T3JTb2NrZXRQYXRoO1xuXG4gICAgICBpZiAoIWlzU2FtZUhvc3QgfHwgKHdlYnNvY2tldC5fb3JpZ2luYWxTZWN1cmUgJiYgIWlzU2VjdXJlKSkge1xuICAgICAgICAvL1xuICAgICAgICAvLyBNYXRjaCBjdXJsIDcuNzcuMCBiZWhhdmlvciBhbmQgZHJvcCB0aGUgZm9sbG93aW5nIGhlYWRlcnMuIFRoZXNlXG4gICAgICAgIC8vIGhlYWRlcnMgYXJlIGFsc28gZHJvcHBlZCB3aGVuIGZvbGxvd2luZyBhIHJlZGlyZWN0IHRvIGEgc3ViZG9tYWluLlxuICAgICAgICAvL1xuICAgICAgICBkZWxldGUgb3B0cy5oZWFkZXJzLmF1dGhvcml6YXRpb247XG4gICAgICAgIGRlbGV0ZSBvcHRzLmhlYWRlcnMuY29va2llO1xuXG4gICAgICAgIGlmICghaXNTYW1lSG9zdCkgZGVsZXRlIG9wdHMuaGVhZGVycy5ob3N0O1xuXG4gICAgICAgIG9wdHMuYXV0aCA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL1xuICAgIC8vIE1hdGNoIGN1cmwgNy43Ny4wIGJlaGF2aW9yIGFuZCBtYWtlIHRoZSBmaXJzdCBgQXV0aG9yaXphdGlvbmAgaGVhZGVyIHdpbi5cbiAgICAvLyBJZiB0aGUgYEF1dGhvcml6YXRpb25gIGhlYWRlciBpcyBzZXQsIHRoZW4gdGhlcmUgaXMgbm90aGluZyB0byBkbyBhcyBpdFxuICAgIC8vIHdpbGwgdGFrZSBwcmVjZWRlbmNlLlxuICAgIC8vXG4gICAgaWYgKG9wdHMuYXV0aCAmJiAhb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24pIHtcbiAgICAgIG9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID1cbiAgICAgICAgJ0Jhc2ljICcgKyBCdWZmZXIuZnJvbShvcHRzLmF1dGgpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICB9XG5cbiAgICByZXEgPSB3ZWJzb2NrZXQuX3JlcSA9IHJlcXVlc3Qob3B0cyk7XG5cbiAgICBpZiAod2Vic29ja2V0Ll9yZWRpcmVjdHMpIHtcbiAgICAgIC8vXG4gICAgICAvLyBVbmxpa2Ugd2hhdCBpcyBkb25lIGZvciB0aGUgYCd1cGdyYWRlJ2AgZXZlbnQsIG5vIGVhcmx5IGV4aXQgaXNcbiAgICAgIC8vIHRyaWdnZXJlZCBoZXJlIGlmIHRoZSB1c2VyIGNhbGxzIGB3ZWJzb2NrZXQuY2xvc2UoKWAgb3JcbiAgICAgIC8vIGB3ZWJzb2NrZXQudGVybWluYXRlKClgIGZyb20gYSBsaXN0ZW5lciBvZiB0aGUgYCdyZWRpcmVjdCdgIGV2ZW50LiBUaGlzXG4gICAgICAvLyBpcyBiZWNhdXNlIHRoZSB1c2VyIGNhbiBhbHNvIGNhbGwgYHJlcXVlc3QuZGVzdHJveSgpYCB3aXRoIGFuIGVycm9yXG4gICAgICAvLyBiZWZvcmUgY2FsbGluZyBgd2Vic29ja2V0LmNsb3NlKClgIG9yIGB3ZWJzb2NrZXQudGVybWluYXRlKClgIGFuZCB0aGlzXG4gICAgICAvLyB3b3VsZCByZXN1bHQgaW4gYW4gZXJyb3IgYmVpbmcgZW1pdHRlZCBvbiB0aGUgYHJlcXVlc3RgIG9iamVjdCB3aXRoIG5vXG4gICAgICAvLyBgJ2Vycm9yJ2AgZXZlbnQgbGlzdGVuZXJzIGF0dGFjaGVkLlxuICAgICAgLy9cbiAgICAgIHdlYnNvY2tldC5lbWl0KCdyZWRpcmVjdCcsIHdlYnNvY2tldC51cmwsIHJlcSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJlcSA9IHdlYnNvY2tldC5fcmVxID0gcmVxdWVzdChvcHRzKTtcbiAgfVxuXG4gIGlmIChvcHRzLnRpbWVvdXQpIHtcbiAgICByZXEub24oJ3RpbWVvdXQnLCAoKSA9PiB7XG4gICAgICBhYm9ydEhhbmRzaGFrZSh3ZWJzb2NrZXQsIHJlcSwgJ09wZW5pbmcgaGFuZHNoYWtlIGhhcyB0aW1lZCBvdXQnKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlcS5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgaWYgKHJlcSA9PT0gbnVsbCB8fCByZXFba0Fib3J0ZWRdKSByZXR1cm47XG5cbiAgICByZXEgPSB3ZWJzb2NrZXQuX3JlcSA9IG51bGw7XG4gICAgZW1pdEVycm9yQW5kQ2xvc2Uod2Vic29ja2V0LCBlcnIpO1xuICB9KTtcblxuICByZXEub24oJ3Jlc3BvbnNlJywgKHJlcykgPT4ge1xuICAgIGNvbnN0IGxvY2F0aW9uID0gcmVzLmhlYWRlcnMubG9jYXRpb247XG4gICAgY29uc3Qgc3RhdHVzQ29kZSA9IHJlcy5zdGF0dXNDb2RlO1xuXG4gICAgaWYgKFxuICAgICAgbG9jYXRpb24gJiZcbiAgICAgIG9wdHMuZm9sbG93UmVkaXJlY3RzICYmXG4gICAgICBzdGF0dXNDb2RlID49IDMwMCAmJlxuICAgICAgc3RhdHVzQ29kZSA8IDQwMFxuICAgICkge1xuICAgICAgaWYgKCsrd2Vic29ja2V0Ll9yZWRpcmVjdHMgPiBvcHRzLm1heFJlZGlyZWN0cykge1xuICAgICAgICBhYm9ydEhhbmRzaGFrZSh3ZWJzb2NrZXQsIHJlcSwgJ01heGltdW0gcmVkaXJlY3RzIGV4Y2VlZGVkJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgcmVxLmFib3J0KCk7XG5cbiAgICAgIGxldCBhZGRyO1xuXG4gICAgICB0cnkge1xuICAgICAgICBhZGRyID0gbmV3IFVSTChsb2NhdGlvbiwgYWRkcmVzcyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGVyciA9IG5ldyBTeW50YXhFcnJvcihgSW52YWxpZCBVUkw6ICR7bG9jYXRpb259YCk7XG4gICAgICAgIGVtaXRFcnJvckFuZENsb3NlKHdlYnNvY2tldCwgZXJyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpbml0QXNDbGllbnQod2Vic29ja2V0LCBhZGRyLCBwcm90b2NvbHMsIG9wdGlvbnMpO1xuICAgIH0gZWxzZSBpZiAoIXdlYnNvY2tldC5lbWl0KCd1bmV4cGVjdGVkLXJlc3BvbnNlJywgcmVxLCByZXMpKSB7XG4gICAgICBhYm9ydEhhbmRzaGFrZShcbiAgICAgICAgd2Vic29ja2V0LFxuICAgICAgICByZXEsXG4gICAgICAgIGBVbmV4cGVjdGVkIHNlcnZlciByZXNwb25zZTogJHtyZXMuc3RhdHVzQ29kZX1gXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG5cbiAgcmVxLm9uKCd1cGdyYWRlJywgKHJlcywgc29ja2V0LCBoZWFkKSA9PiB7XG4gICAgd2Vic29ja2V0LmVtaXQoJ3VwZ3JhZGUnLCByZXMpO1xuXG4gICAgLy9cbiAgICAvLyBUaGUgdXNlciBtYXkgaGF2ZSBjbG9zZWQgdGhlIGNvbm5lY3Rpb24gZnJvbSBhIGxpc3RlbmVyIG9mIHRoZVxuICAgIC8vIGAndXBncmFkZSdgIGV2ZW50LlxuICAgIC8vXG4gICAgaWYgKHdlYnNvY2tldC5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuQ09OTkVDVElORykgcmV0dXJuO1xuXG4gICAgcmVxID0gd2Vic29ja2V0Ll9yZXEgPSBudWxsO1xuXG4gICAgY29uc3QgdXBncmFkZSA9IHJlcy5oZWFkZXJzLnVwZ3JhZGU7XG5cbiAgICBpZiAodXBncmFkZSA9PT0gdW5kZWZpbmVkIHx8IHVwZ3JhZGUudG9Mb3dlckNhc2UoKSAhPT0gJ3dlYnNvY2tldCcpIHtcbiAgICAgIGFib3J0SGFuZHNoYWtlKHdlYnNvY2tldCwgc29ja2V0LCAnSW52YWxpZCBVcGdyYWRlIGhlYWRlcicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGRpZ2VzdCA9IGNyZWF0ZUhhc2goJ3NoYTEnKVxuICAgICAgLnVwZGF0ZShrZXkgKyBHVUlEKVxuICAgICAgLmRpZ2VzdCgnYmFzZTY0Jyk7XG5cbiAgICBpZiAocmVzLmhlYWRlcnNbJ3NlYy13ZWJzb2NrZXQtYWNjZXB0J10gIT09IGRpZ2VzdCkge1xuICAgICAgYWJvcnRIYW5kc2hha2Uod2Vic29ja2V0LCBzb2NrZXQsICdJbnZhbGlkIFNlYy1XZWJTb2NrZXQtQWNjZXB0IGhlYWRlcicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlclByb3QgPSByZXMuaGVhZGVyc1snc2VjLXdlYnNvY2tldC1wcm90b2NvbCddO1xuICAgIGxldCBwcm90RXJyb3I7XG5cbiAgICBpZiAoc2VydmVyUHJvdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoIXByb3RvY29sU2V0LnNpemUpIHtcbiAgICAgICAgcHJvdEVycm9yID0gJ1NlcnZlciBzZW50IGEgc3VicHJvdG9jb2wgYnV0IG5vbmUgd2FzIHJlcXVlc3RlZCc7XG4gICAgICB9IGVsc2UgaWYgKCFwcm90b2NvbFNldC5oYXMoc2VydmVyUHJvdCkpIHtcbiAgICAgICAgcHJvdEVycm9yID0gJ1NlcnZlciBzZW50IGFuIGludmFsaWQgc3VicHJvdG9jb2wnO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocHJvdG9jb2xTZXQuc2l6ZSkge1xuICAgICAgcHJvdEVycm9yID0gJ1NlcnZlciBzZW50IG5vIHN1YnByb3RvY29sJztcbiAgICB9XG5cbiAgICBpZiAocHJvdEVycm9yKSB7XG4gICAgICBhYm9ydEhhbmRzaGFrZSh3ZWJzb2NrZXQsIHNvY2tldCwgcHJvdEVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc2VydmVyUHJvdCkgd2Vic29ja2V0Ll9wcm90b2NvbCA9IHNlcnZlclByb3Q7XG5cbiAgICBjb25zdCBzZWNXZWJTb2NrZXRFeHRlbnNpb25zID0gcmVzLmhlYWRlcnNbJ3NlYy13ZWJzb2NrZXQtZXh0ZW5zaW9ucyddO1xuXG4gICAgaWYgKHNlY1dlYlNvY2tldEV4dGVuc2lvbnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKCFwZXJNZXNzYWdlRGVmbGF0ZSkge1xuICAgICAgICBjb25zdCBtZXNzYWdlID1cbiAgICAgICAgICAnU2VydmVyIHNlbnQgYSBTZWMtV2ViU29ja2V0LUV4dGVuc2lvbnMgaGVhZGVyIGJ1dCBubyBleHRlbnNpb24gJyArXG4gICAgICAgICAgJ3dhcyByZXF1ZXN0ZWQnO1xuICAgICAgICBhYm9ydEhhbmRzaGFrZSh3ZWJzb2NrZXQsIHNvY2tldCwgbWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IGV4dGVuc2lvbnM7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGV4dGVuc2lvbnMgPSBwYXJzZShzZWNXZWJTb2NrZXRFeHRlbnNpb25zKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zdCBtZXNzYWdlID0gJ0ludmFsaWQgU2VjLVdlYlNvY2tldC1FeHRlbnNpb25zIGhlYWRlcic7XG4gICAgICAgIGFib3J0SGFuZHNoYWtlKHdlYnNvY2tldCwgc29ja2V0LCBtZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHRlbnNpb25OYW1lcyA9IE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpO1xuXG4gICAgICBpZiAoXG4gICAgICAgIGV4dGVuc2lvbk5hbWVzLmxlbmd0aCAhPT0gMSB8fFxuICAgICAgICBleHRlbnNpb25OYW1lc1swXSAhPT0gUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZVxuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSAnU2VydmVyIGluZGljYXRlZCBhbiBleHRlbnNpb24gdGhhdCB3YXMgbm90IHJlcXVlc3RlZCc7XG4gICAgICAgIGFib3J0SGFuZHNoYWtlKHdlYnNvY2tldCwgc29ja2V0LCBtZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBwZXJNZXNzYWdlRGVmbGF0ZS5hY2NlcHQoZXh0ZW5zaW9uc1tQZXJNZXNzYWdlRGVmbGF0ZS5leHRlbnNpb25OYW1lXSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9ICdJbnZhbGlkIFNlYy1XZWJTb2NrZXQtRXh0ZW5zaW9ucyBoZWFkZXInO1xuICAgICAgICBhYm9ydEhhbmRzaGFrZSh3ZWJzb2NrZXQsIHNvY2tldCwgbWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgd2Vic29ja2V0Ll9leHRlbnNpb25zW1Blck1lc3NhZ2VEZWZsYXRlLmV4dGVuc2lvbk5hbWVdID1cbiAgICAgICAgcGVyTWVzc2FnZURlZmxhdGU7XG4gICAgfVxuXG4gICAgd2Vic29ja2V0LnNldFNvY2tldChzb2NrZXQsIGhlYWQsIHtcbiAgICAgIGFsbG93U3luY2hyb25vdXNFdmVudHM6IG9wdHMuYWxsb3dTeW5jaHJvbm91c0V2ZW50cyxcbiAgICAgIGdlbmVyYXRlTWFzazogb3B0cy5nZW5lcmF0ZU1hc2ssXG4gICAgICBtYXhCdWZmZXJlZENodW5rczogb3B0cy5tYXhCdWZmZXJlZENodW5rcyxcbiAgICAgIG1heEZyYWdtZW50czogb3B0cy5tYXhGcmFnbWVudHMsXG4gICAgICBtYXhQYXlsb2FkOiBvcHRzLm1heFBheWxvYWQsXG4gICAgICBza2lwVVRGOFZhbGlkYXRpb246IG9wdHMuc2tpcFVURjhWYWxpZGF0aW9uXG4gICAgfSk7XG4gIH0pO1xuXG4gIGlmIChvcHRzLmZpbmlzaFJlcXVlc3QpIHtcbiAgICBvcHRzLmZpbmlzaFJlcXVlc3QocmVxLCB3ZWJzb2NrZXQpO1xuICB9IGVsc2Uge1xuICAgIHJlcS5lbmQoKTtcbiAgfVxufVxuXG4vKipcbiAqIEVtaXQgdGhlIGAnZXJyb3InYCBhbmQgYCdjbG9zZSdgIGV2ZW50cy5cbiAqXG4gKiBAcGFyYW0ge1dlYlNvY2tldH0gd2Vic29ja2V0IFRoZSBXZWJTb2NrZXQgaW5zdGFuY2VcbiAqIEBwYXJhbSB7RXJyb3J9IFRoZSBlcnJvciB0byBlbWl0XG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBlbWl0RXJyb3JBbmRDbG9zZSh3ZWJzb2NrZXQsIGVycikge1xuICB3ZWJzb2NrZXQuX3JlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0lORztcbiAgLy9cbiAgLy8gVGhlIGZvbGxvd2luZyBhc3NpZ25tZW50IGlzIHByYWN0aWNhbGx5IHVzZWxlc3MgYW5kIGlzIGRvbmUgb25seSBmb3JcbiAgLy8gY29uc2lzdGVuY3kuXG4gIC8vXG4gIHdlYnNvY2tldC5fZXJyb3JFbWl0dGVkID0gdHJ1ZTtcbiAgd2Vic29ja2V0LmVtaXQoJ2Vycm9yJywgZXJyKTtcbiAgd2Vic29ja2V0LmVtaXRDbG9zZSgpO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGBuZXQuU29ja2V0YCBhbmQgaW5pdGlhdGUgYSBjb25uZWN0aW9uLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIENvbm5lY3Rpb24gb3B0aW9uc1xuICogQHJldHVybiB7bmV0LlNvY2tldH0gVGhlIG5ld2x5IGNyZWF0ZWQgc29ja2V0IHVzZWQgdG8gc3RhcnQgdGhlIGNvbm5lY3Rpb25cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIG5ldENvbm5lY3Qob3B0aW9ucykge1xuICBvcHRpb25zLnBhdGggPSBvcHRpb25zLnNvY2tldFBhdGg7XG4gIHJldHVybiBuZXQuY29ubmVjdChvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBgdGxzLlRMU1NvY2tldGAgYW5kIGluaXRpYXRlIGEgY29ubmVjdGlvbi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBDb25uZWN0aW9uIG9wdGlvbnNcbiAqIEByZXR1cm4ge3Rscy5UTFNTb2NrZXR9IFRoZSBuZXdseSBjcmVhdGVkIHNvY2tldCB1c2VkIHRvIHN0YXJ0IHRoZSBjb25uZWN0aW9uXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiB0bHNDb25uZWN0KG9wdGlvbnMpIHtcbiAgb3B0aW9ucy5wYXRoID0gdW5kZWZpbmVkO1xuXG4gIGlmICghb3B0aW9ucy5zZXJ2ZXJuYW1lICYmIG9wdGlvbnMuc2VydmVybmFtZSAhPT0gJycpIHtcbiAgICBvcHRpb25zLnNlcnZlcm5hbWUgPSBuZXQuaXNJUChvcHRpb25zLmhvc3QpID8gJycgOiBvcHRpb25zLmhvc3Q7XG4gIH1cblxuICByZXR1cm4gdGxzLmNvbm5lY3Qob3B0aW9ucyk7XG59XG5cbi8qKlxuICogQWJvcnQgdGhlIGhhbmRzaGFrZSBhbmQgZW1pdCBhbiBlcnJvci5cbiAqXG4gKiBAcGFyYW0ge1dlYlNvY2tldH0gd2Vic29ja2V0IFRoZSBXZWJTb2NrZXQgaW5zdGFuY2VcbiAqIEBwYXJhbSB7KGh0dHAuQ2xpZW50UmVxdWVzdHxuZXQuU29ja2V0fHRscy5Tb2NrZXQpfSBzdHJlYW0gVGhlIHJlcXVlc3QgdG9cbiAqICAgICBhYm9ydCBvciB0aGUgc29ja2V0IHRvIGRlc3Ryb3lcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBhYm9ydEhhbmRzaGFrZSh3ZWJzb2NrZXQsIHN0cmVhbSwgbWVzc2FnZSkge1xuICB3ZWJzb2NrZXQuX3JlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0lORztcblxuICBjb25zdCBlcnIgPSBuZXcgRXJyb3IobWVzc2FnZSk7XG4gIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKGVyciwgYWJvcnRIYW5kc2hha2UpO1xuXG4gIGlmIChzdHJlYW0uc2V0SGVhZGVyKSB7XG4gICAgc3RyZWFtW2tBYm9ydGVkXSA9IHRydWU7XG4gICAgc3RyZWFtLmFib3J0KCk7XG5cbiAgICBpZiAoc3RyZWFtLnNvY2tldCAmJiAhc3RyZWFtLnNvY2tldC5kZXN0cm95ZWQpIHtcbiAgICAgIC8vXG4gICAgICAvLyBPbiBOb2RlLmpzID49IDE0LjMuMCBgcmVxdWVzdC5hYm9ydCgpYCBkb2VzIG5vdCBkZXN0cm95IHRoZSBzb2NrZXQgaWZcbiAgICAgIC8vIGNhbGxlZCBhZnRlciB0aGUgcmVxdWVzdCBjb21wbGV0ZWQuIFNlZVxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3dlYnNvY2tldHMvd3MvaXNzdWVzLzE4NjkuXG4gICAgICAvL1xuICAgICAgc3RyZWFtLnNvY2tldC5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgcHJvY2Vzcy5uZXh0VGljayhlbWl0RXJyb3JBbmRDbG9zZSwgd2Vic29ja2V0LCBlcnIpO1xuICB9IGVsc2Uge1xuICAgIHN0cmVhbS5kZXN0cm95KGVycik7XG4gICAgc3RyZWFtLm9uY2UoJ2Vycm9yJywgd2Vic29ja2V0LmVtaXQuYmluZCh3ZWJzb2NrZXQsICdlcnJvcicpKTtcbiAgICBzdHJlYW0ub25jZSgnY2xvc2UnLCB3ZWJzb2NrZXQuZW1pdENsb3NlLmJpbmQod2Vic29ja2V0KSk7XG4gIH1cbn1cblxuLyoqXG4gKiBIYW5kbGUgY2FzZXMgd2hlcmUgdGhlIGBwaW5nKClgLCBgcG9uZygpYCwgb3IgYHNlbmQoKWAgbWV0aG9kcyBhcmUgY2FsbGVkXG4gKiB3aGVuIHRoZSBgcmVhZHlTdGF0ZWAgYXR0cmlidXRlIGlzIGBDTE9TSU5HYCBvciBgQ0xPU0VEYC5cbiAqXG4gKiBAcGFyYW0ge1dlYlNvY2tldH0gd2Vic29ja2V0IFRoZSBXZWJTb2NrZXQgaW5zdGFuY2VcbiAqIEBwYXJhbSB7Kn0gW2RhdGFdIFRoZSBkYXRhIHRvIHNlbmRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYl0gQ2FsbGJhY2tcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHNlbmRBZnRlckNsb3NlKHdlYnNvY2tldCwgZGF0YSwgY2IpIHtcbiAgaWYgKGRhdGEpIHtcbiAgICBjb25zdCBsZW5ndGggPSBpc0Jsb2IoZGF0YSkgPyBkYXRhLnNpemUgOiB0b0J1ZmZlcihkYXRhKS5sZW5ndGg7XG5cbiAgICAvL1xuICAgIC8vIFRoZSBgX2J1ZmZlcmVkQW1vdW50YCBwcm9wZXJ0eSBpcyB1c2VkIG9ubHkgd2hlbiB0aGUgcGVlciBpcyBhIGNsaWVudCBhbmRcbiAgICAvLyB0aGUgb3BlbmluZyBoYW5kc2hha2UgZmFpbHMuIFVuZGVyIHRoZXNlIGNpcmN1bXN0YW5jZXMsIGluIGZhY3QsIHRoZVxuICAgIC8vIGBzZXRTb2NrZXQoKWAgbWV0aG9kIGlzIG5vdCBjYWxsZWQsIHNvIHRoZSBgX3NvY2tldGAgYW5kIGBfc2VuZGVyYFxuICAgIC8vIHByb3BlcnRpZXMgYXJlIHNldCB0byBgbnVsbGAuXG4gICAgLy9cbiAgICBpZiAod2Vic29ja2V0Ll9zb2NrZXQpIHdlYnNvY2tldC5fc2VuZGVyLl9idWZmZXJlZEJ5dGVzICs9IGxlbmd0aDtcbiAgICBlbHNlIHdlYnNvY2tldC5fYnVmZmVyZWRBbW91bnQgKz0gbGVuZ3RoO1xuICB9XG5cbiAgaWYgKGNiKSB7XG4gICAgY29uc3QgZXJyID0gbmV3IEVycm9yKFxuICAgICAgYFdlYlNvY2tldCBpcyBub3Qgb3BlbjogcmVhZHlTdGF0ZSAke3dlYnNvY2tldC5yZWFkeVN0YXRlfSBgICtcbiAgICAgICAgYCgke3JlYWR5U3RhdGVzW3dlYnNvY2tldC5yZWFkeVN0YXRlXX0pYFxuICAgICk7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhjYiwgZXJyKTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBsaXN0ZW5lciBvZiB0aGUgYFJlY2VpdmVyYCBgJ2NvbmNsdWRlJ2AgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGNvZGUgVGhlIHN0YXR1cyBjb2RlXG4gKiBAcGFyYW0ge0J1ZmZlcn0gcmVhc29uIFRoZSByZWFzb24gZm9yIGNsb3NpbmdcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlY2VpdmVyT25Db25jbHVkZShjb2RlLCByZWFzb24pIHtcbiAgY29uc3Qgd2Vic29ja2V0ID0gdGhpc1trV2ViU29ja2V0XTtcblxuICB3ZWJzb2NrZXQuX2Nsb3NlRnJhbWVSZWNlaXZlZCA9IHRydWU7XG4gIHdlYnNvY2tldC5fY2xvc2VNZXNzYWdlID0gcmVhc29uO1xuICB3ZWJzb2NrZXQuX2Nsb3NlQ29kZSA9IGNvZGU7XG5cbiAgaWYgKHdlYnNvY2tldC5fc29ja2V0W2tXZWJTb2NrZXRdID09PSB1bmRlZmluZWQpIHJldHVybjtcblxuICB3ZWJzb2NrZXQuX3NvY2tldC5yZW1vdmVMaXN0ZW5lcignZGF0YScsIHNvY2tldE9uRGF0YSk7XG4gIHByb2Nlc3MubmV4dFRpY2socmVzdW1lLCB3ZWJzb2NrZXQuX3NvY2tldCk7XG5cbiAgaWYgKGNvZGUgPT09IDEwMDUpIHdlYnNvY2tldC5jbG9zZSgpO1xuICBlbHNlIHdlYnNvY2tldC5jbG9zZShjb2RlLCByZWFzb24pO1xufVxuXG4vKipcbiAqIFRoZSBsaXN0ZW5lciBvZiB0aGUgYFJlY2VpdmVyYCBgJ2RyYWluJ2AgZXZlbnQuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcmVjZWl2ZXJPbkRyYWluKCkge1xuICBjb25zdCB3ZWJzb2NrZXQgPSB0aGlzW2tXZWJTb2NrZXRdO1xuXG4gIGlmICghd2Vic29ja2V0LmlzUGF1c2VkKSB3ZWJzb2NrZXQuX3NvY2tldC5yZXN1bWUoKTtcbn1cblxuLyoqXG4gKiBUaGUgbGlzdGVuZXIgb2YgdGhlIGBSZWNlaXZlcmAgYCdlcnJvcidgIGV2ZW50LlxuICpcbiAqIEBwYXJhbSB7KFJhbmdlRXJyb3J8RXJyb3IpfSBlcnIgVGhlIGVtaXR0ZWQgZXJyb3JcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlY2VpdmVyT25FcnJvcihlcnIpIHtcbiAgY29uc3Qgd2Vic29ja2V0ID0gdGhpc1trV2ViU29ja2V0XTtcblxuICBpZiAod2Vic29ja2V0Ll9zb2NrZXRba1dlYlNvY2tldF0gIT09IHVuZGVmaW5lZCkge1xuICAgIHdlYnNvY2tldC5fc29ja2V0LnJlbW92ZUxpc3RlbmVyKCdkYXRhJywgc29ja2V0T25EYXRhKTtcblxuICAgIC8vXG4gICAgLy8gT24gTm9kZS5qcyA8IDE0LjAuMCB0aGUgYCdlcnJvcidgIGV2ZW50IGlzIGVtaXR0ZWQgc3luY2hyb25vdXNseS4gU2VlXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3dlYnNvY2tldHMvd3MvaXNzdWVzLzE5NDAuXG4gICAgLy9cbiAgICBwcm9jZXNzLm5leHRUaWNrKHJlc3VtZSwgd2Vic29ja2V0Ll9zb2NrZXQpO1xuXG4gICAgd2Vic29ja2V0LmNsb3NlKGVycltrU3RhdHVzQ29kZV0pO1xuICB9XG5cbiAgaWYgKCF3ZWJzb2NrZXQuX2Vycm9yRW1pdHRlZCkge1xuICAgIHdlYnNvY2tldC5fZXJyb3JFbWl0dGVkID0gdHJ1ZTtcbiAgICB3ZWJzb2NrZXQuZW1pdCgnZXJyb3InLCBlcnIpO1xuICB9XG59XG5cbi8qKlxuICogVGhlIGxpc3RlbmVyIG9mIHRoZSBgUmVjZWl2ZXJgIGAnZmluaXNoJ2AgZXZlbnQuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcmVjZWl2ZXJPbkZpbmlzaCgpIHtcbiAgdGhpc1trV2ViU29ja2V0XS5lbWl0Q2xvc2UoKTtcbn1cblxuLyoqXG4gKiBUaGUgbGlzdGVuZXIgb2YgdGhlIGBSZWNlaXZlcmAgYCdtZXNzYWdlJ2AgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ8QXJyYXlCdWZmZXJ8QnVmZmVyW10pfSBkYXRhIFRoZSBtZXNzYWdlXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzQmluYXJ5IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBtZXNzYWdlIGlzIGJpbmFyeSBvciBub3RcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlY2VpdmVyT25NZXNzYWdlKGRhdGEsIGlzQmluYXJ5KSB7XG4gIHRoaXNba1dlYlNvY2tldF0uZW1pdCgnbWVzc2FnZScsIGRhdGEsIGlzQmluYXJ5KTtcbn1cblxuLyoqXG4gKiBUaGUgbGlzdGVuZXIgb2YgdGhlIGBSZWNlaXZlcmAgYCdwaW5nJ2AgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IGRhdGEgVGhlIGRhdGEgaW5jbHVkZWQgaW4gdGhlIHBpbmcgZnJhbWVcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlY2VpdmVyT25QaW5nKGRhdGEpIHtcbiAgY29uc3Qgd2Vic29ja2V0ID0gdGhpc1trV2ViU29ja2V0XTtcblxuICBpZiAod2Vic29ja2V0Ll9hdXRvUG9uZykgd2Vic29ja2V0LnBvbmcoZGF0YSwgIXRoaXMuX2lzU2VydmVyLCBOT09QKTtcbiAgd2Vic29ja2V0LmVtaXQoJ3BpbmcnLCBkYXRhKTtcbn1cblxuLyoqXG4gKiBUaGUgbGlzdGVuZXIgb2YgdGhlIGBSZWNlaXZlcmAgYCdwb25nJ2AgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IGRhdGEgVGhlIGRhdGEgaW5jbHVkZWQgaW4gdGhlIHBvbmcgZnJhbWVcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlY2VpdmVyT25Qb25nKGRhdGEpIHtcbiAgdGhpc1trV2ViU29ja2V0XS5lbWl0KCdwb25nJywgZGF0YSk7XG59XG5cbi8qKlxuICogUmVzdW1lIGEgcmVhZGFibGUgc3RyZWFtXG4gKlxuICogQHBhcmFtIHtSZWFkYWJsZX0gc3RyZWFtIFRoZSByZWFkYWJsZSBzdHJlYW1cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlc3VtZShzdHJlYW0pIHtcbiAgc3RyZWFtLnJlc3VtZSgpO1xufVxuXG4vKipcbiAqIFRoZSBgU2VuZGVyYCBlcnJvciBldmVudCBoYW5kbGVyLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IFRoZSBlcnJvclxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gc2VuZGVyT25FcnJvcihlcnIpIHtcbiAgY29uc3Qgd2Vic29ja2V0ID0gdGhpc1trV2ViU29ja2V0XTtcblxuICBpZiAod2Vic29ja2V0LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DTE9TRUQpIHJldHVybjtcbiAgaWYgKHdlYnNvY2tldC5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuICAgIHdlYnNvY2tldC5fcmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TSU5HO1xuICAgIHNldENsb3NlVGltZXIod2Vic29ja2V0KTtcbiAgfVxuXG4gIC8vXG4gIC8vIGBzb2NrZXQuZW5kKClgIGlzIHVzZWQgaW5zdGVhZCBvZiBgc29ja2V0LmRlc3Ryb3koKWAgdG8gYWxsb3cgdGhlIG90aGVyXG4gIC8vIHBlZXIgdG8gZmluaXNoIHNlbmRpbmcgcXVldWVkIGRhdGEuIFRoZXJlIGlzIG5vIG5lZWQgdG8gc2V0IGEgdGltZXIgaGVyZVxuICAvLyBiZWNhdXNlIGBDTE9TSU5HYCBtZWFucyB0aGF0IGl0IGlzIGFscmVhZHkgc2V0IG9yIG5vdCBuZWVkZWQuXG4gIC8vXG4gIHRoaXMuX3NvY2tldC5lbmQoKTtcblxuICBpZiAoIXdlYnNvY2tldC5fZXJyb3JFbWl0dGVkKSB7XG4gICAgd2Vic29ja2V0Ll9lcnJvckVtaXR0ZWQgPSB0cnVlO1xuICAgIHdlYnNvY2tldC5lbWl0KCdlcnJvcicsIGVycik7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXQgYSB0aW1lciB0byBkZXN0cm95IHRoZSB1bmRlcmx5aW5nIHJhdyBzb2NrZXQgb2YgYSBXZWJTb2NrZXQuXG4gKlxuICogQHBhcmFtIHtXZWJTb2NrZXR9IHdlYnNvY2tldCBUaGUgV2ViU29ja2V0IGluc3RhbmNlXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBzZXRDbG9zZVRpbWVyKHdlYnNvY2tldCkge1xuICB3ZWJzb2NrZXQuX2Nsb3NlVGltZXIgPSBzZXRUaW1lb3V0KFxuICAgIHdlYnNvY2tldC5fc29ja2V0LmRlc3Ryb3kuYmluZCh3ZWJzb2NrZXQuX3NvY2tldCksXG4gICAgd2Vic29ja2V0Ll9jbG9zZVRpbWVvdXRcbiAgKTtcbn1cblxuLyoqXG4gKiBUaGUgbGlzdGVuZXIgb2YgdGhlIHNvY2tldCBgJ2Nsb3NlJ2AgZXZlbnQuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gc29ja2V0T25DbG9zZSgpIHtcbiAgY29uc3Qgd2Vic29ja2V0ID0gdGhpc1trV2ViU29ja2V0XTtcblxuICB0aGlzLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIHNvY2tldE9uQ2xvc2UpO1xuICB0aGlzLnJlbW92ZUxpc3RlbmVyKCdkYXRhJywgc29ja2V0T25EYXRhKTtcbiAgdGhpcy5yZW1vdmVMaXN0ZW5lcignZW5kJywgc29ja2V0T25FbmQpO1xuXG4gIHdlYnNvY2tldC5fcmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TSU5HO1xuXG4gIC8vXG4gIC8vIFRoZSBjbG9zZSBmcmFtZSBtaWdodCBub3QgaGF2ZSBiZWVuIHJlY2VpdmVkIG9yIHRoZSBgJ2VuZCdgIGV2ZW50IGVtaXR0ZWQsXG4gIC8vIGZvciBleGFtcGxlLCBpZiB0aGUgc29ja2V0IHdhcyBkZXN0cm95ZWQgZHVlIHRvIGFuIGVycm9yLiBFbnN1cmUgdGhhdCB0aGVcbiAgLy8gYHJlY2VpdmVyYCBzdHJlYW0gaXMgY2xvc2VkIGFmdGVyIHdyaXRpbmcgYW55IHJlbWFpbmluZyBidWZmZXJlZCBkYXRhIHRvXG4gIC8vIGl0LiBJZiB0aGUgcmVhZGFibGUgc2lkZSBvZiB0aGUgc29ja2V0IGlzIGluIGZsb3dpbmcgbW9kZSB0aGVuIHRoZXJlIGlzIG5vXG4gIC8vIGJ1ZmZlcmVkIGRhdGEgYXMgZXZlcnl0aGluZyBoYXMgYmVlbiBhbHJlYWR5IHdyaXR0ZW4uIElmIGluc3RlYWQsIHRoZVxuICAvLyBzb2NrZXQgaXMgcGF1c2VkLCBhbnkgcG9zc2libGUgYnVmZmVyZWQgZGF0YSB3aWxsIGJlIHJlYWQgYXMgYSBzaW5nbGVcbiAgLy8gY2h1bmsuXG4gIC8vXG4gIGlmIChcbiAgICAhdGhpcy5fcmVhZGFibGVTdGF0ZS5lbmRFbWl0dGVkICYmXG4gICAgIXdlYnNvY2tldC5fY2xvc2VGcmFtZVJlY2VpdmVkICYmXG4gICAgIXdlYnNvY2tldC5fcmVjZWl2ZXIuX3dyaXRhYmxlU3RhdGUuZXJyb3JFbWl0dGVkICYmXG4gICAgdGhpcy5fcmVhZGFibGVTdGF0ZS5sZW5ndGggIT09IDBcbiAgKSB7XG4gICAgY29uc3QgY2h1bmsgPSB0aGlzLnJlYWQodGhpcy5fcmVhZGFibGVTdGF0ZS5sZW5ndGgpO1xuXG4gICAgd2Vic29ja2V0Ll9yZWNlaXZlci53cml0ZShjaHVuayk7XG4gIH1cblxuICB3ZWJzb2NrZXQuX3JlY2VpdmVyLmVuZCgpO1xuXG4gIHRoaXNba1dlYlNvY2tldF0gPSB1bmRlZmluZWQ7XG5cbiAgY2xlYXJUaW1lb3V0KHdlYnNvY2tldC5fY2xvc2VUaW1lcik7XG5cbiAgaWYgKFxuICAgIHdlYnNvY2tldC5fcmVjZWl2ZXIuX3dyaXRhYmxlU3RhdGUuZmluaXNoZWQgfHxcbiAgICB3ZWJzb2NrZXQuX3JlY2VpdmVyLl93cml0YWJsZVN0YXRlLmVycm9yRW1pdHRlZFxuICApIHtcbiAgICB3ZWJzb2NrZXQuZW1pdENsb3NlKCk7XG4gIH0gZWxzZSB7XG4gICAgd2Vic29ja2V0Ll9yZWNlaXZlci5vbignZXJyb3InLCByZWNlaXZlck9uRmluaXNoKTtcbiAgICB3ZWJzb2NrZXQuX3JlY2VpdmVyLm9uKCdmaW5pc2gnLCByZWNlaXZlck9uRmluaXNoKTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBsaXN0ZW5lciBvZiB0aGUgc29ja2V0IGAnZGF0YSdgIGV2ZW50LlxuICpcbiAqIEBwYXJhbSB7QnVmZmVyfSBjaHVuayBBIGNodW5rIG9mIGRhdGFcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHNvY2tldE9uRGF0YShjaHVuaykge1xuICBpZiAoIXRoaXNba1dlYlNvY2tldF0uX3JlY2VpdmVyLndyaXRlKGNodW5rKSkge1xuICAgIHRoaXMucGF1c2UoKTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBsaXN0ZW5lciBvZiB0aGUgc29ja2V0IGAnZW5kJ2AgZXZlbnQuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gc29ja2V0T25FbmQoKSB7XG4gIGNvbnN0IHdlYnNvY2tldCA9IHRoaXNba1dlYlNvY2tldF07XG5cbiAgd2Vic29ja2V0Ll9yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NJTkc7XG4gIHdlYnNvY2tldC5fcmVjZWl2ZXIuZW5kKCk7XG4gIHRoaXMuZW5kKCk7XG59XG5cbi8qKlxuICogVGhlIGxpc3RlbmVyIG9mIHRoZSBzb2NrZXQgYCdlcnJvcidgIGV2ZW50LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHNvY2tldE9uRXJyb3IoKSB7XG4gIGNvbnN0IHdlYnNvY2tldCA9IHRoaXNba1dlYlNvY2tldF07XG5cbiAgdGhpcy5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBzb2NrZXRPbkVycm9yKTtcbiAgdGhpcy5vbignZXJyb3InLCBOT09QKTtcblxuICBpZiAod2Vic29ja2V0KSB7XG4gICAgd2Vic29ja2V0Ll9yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NJTkc7XG4gICAgdGhpcy5kZXN0cm95KCk7XG4gIH1cbn1cbiIsICIvKiBlc2xpbnQgbm8tdW51c2VkLXZhcnM6IFtcImVycm9yXCIsIHsgXCJ2YXJzSWdub3JlUGF0dGVyblwiOiBcIl5XZWJTb2NrZXQkXCIgfV0gKi9cbid1c2Ugc3RyaWN0JztcblxuY29uc3QgV2ViU29ja2V0ID0gcmVxdWlyZSgnLi93ZWJzb2NrZXQnKTtcbmNvbnN0IHsgRHVwbGV4IH0gPSByZXF1aXJlKCdzdHJlYW0nKTtcblxuLyoqXG4gKiBFbWl0cyB0aGUgYCdjbG9zZSdgIGV2ZW50IG9uIGEgc3RyZWFtLlxuICpcbiAqIEBwYXJhbSB7RHVwbGV4fSBzdHJlYW0gVGhlIHN0cmVhbS5cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGVtaXRDbG9zZShzdHJlYW0pIHtcbiAgc3RyZWFtLmVtaXQoJ2Nsb3NlJyk7XG59XG5cbi8qKlxuICogVGhlIGxpc3RlbmVyIG9mIHRoZSBgJ2VuZCdgIGV2ZW50LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGR1cGxleE9uRW5kKCkge1xuICBpZiAoIXRoaXMuZGVzdHJveWVkICYmIHRoaXMuX3dyaXRhYmxlU3RhdGUuZmluaXNoZWQpIHtcbiAgICB0aGlzLmRlc3Ryb3koKTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBsaXN0ZW5lciBvZiB0aGUgYCdlcnJvcidgIGV2ZW50LlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyciBUaGUgZXJyb3JcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGR1cGxleE9uRXJyb3IoZXJyKSB7XG4gIHRoaXMucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgZHVwbGV4T25FcnJvcik7XG4gIHRoaXMuZGVzdHJveSgpO1xuICBpZiAodGhpcy5saXN0ZW5lckNvdW50KCdlcnJvcicpID09PSAwKSB7XG4gICAgLy8gRG8gbm90IHN1cHByZXNzIHRoZSB0aHJvd2luZyBiZWhhdmlvci5cbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcbiAgfVxufVxuXG4vKipcbiAqIFdyYXBzIGEgYFdlYlNvY2tldGAgaW4gYSBkdXBsZXggc3RyZWFtLlxuICpcbiAqIEBwYXJhbSB7V2ViU29ja2V0fSB3cyBUaGUgYFdlYlNvY2tldGAgdG8gd3JhcFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBUaGUgb3B0aW9ucyBmb3IgdGhlIGBEdXBsZXhgIGNvbnN0cnVjdG9yXG4gKiBAcmV0dXJuIHtEdXBsZXh9IFRoZSBkdXBsZXggc3RyZWFtXG4gKiBAcHVibGljXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVdlYlNvY2tldFN0cmVhbSh3cywgb3B0aW9ucykge1xuICBsZXQgdGVybWluYXRlT25EZXN0cm95ID0gdHJ1ZTtcblxuICBjb25zdCBkdXBsZXggPSBuZXcgRHVwbGV4KHtcbiAgICAuLi5vcHRpb25zLFxuICAgIGF1dG9EZXN0cm95OiBmYWxzZSxcbiAgICBlbWl0Q2xvc2U6IGZhbHNlLFxuICAgIG9iamVjdE1vZGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlT2JqZWN0TW9kZTogZmFsc2VcbiAgfSk7XG5cbiAgd3Mub24oJ21lc3NhZ2UnLCBmdW5jdGlvbiBtZXNzYWdlKG1zZywgaXNCaW5hcnkpIHtcbiAgICBjb25zdCBkYXRhID1cbiAgICAgICFpc0JpbmFyeSAmJiBkdXBsZXguX3JlYWRhYmxlU3RhdGUub2JqZWN0TW9kZSA/IG1zZy50b1N0cmluZygpIDogbXNnO1xuXG4gICAgaWYgKCFkdXBsZXgucHVzaChkYXRhKSkgd3MucGF1c2UoKTtcbiAgfSk7XG5cbiAgd3Mub25jZSgnZXJyb3InLCBmdW5jdGlvbiBlcnJvcihlcnIpIHtcbiAgICBpZiAoZHVwbGV4LmRlc3Ryb3llZCkgcmV0dXJuO1xuXG4gICAgLy8gUHJldmVudCBgd3MudGVybWluYXRlKClgIGZyb20gYmVpbmcgY2FsbGVkIGJ5IGBkdXBsZXguX2Rlc3Ryb3koKWAuXG4gICAgLy9cbiAgICAvLyAtIElmIHRoZSBgJ2Vycm9yJ2AgZXZlbnQgaXMgZW1pdHRlZCBiZWZvcmUgdGhlIGAnb3BlbidgIGV2ZW50LCB0aGVuXG4gICAgLy8gICBgd3MudGVybWluYXRlKClgIGlzIGEgbm9vcCBhcyBubyBzb2NrZXQgaXMgYXNzaWduZWQuXG4gICAgLy8gLSBPdGhlcndpc2UsIHRoZSBlcnJvciBpcyByZS1lbWl0dGVkIGJ5IHRoZSBsaXN0ZW5lciBvZiB0aGUgYCdlcnJvcidgXG4gICAgLy8gICBldmVudCBvZiB0aGUgYFJlY2VpdmVyYCBvYmplY3QuIFRoZSBsaXN0ZW5lciBhbHJlYWR5IGNsb3NlcyB0aGVcbiAgICAvLyAgIGNvbm5lY3Rpb24gYnkgY2FsbGluZyBgd3MuY2xvc2UoKWAuIFRoaXMgYWxsb3dzIGEgY2xvc2UgZnJhbWUgdG8gYmVcbiAgICAvLyAgIHNlbnQgdG8gdGhlIG90aGVyIHBlZXIuIElmIGB3cy50ZXJtaW5hdGUoKWAgaXMgY2FsbGVkIHJpZ2h0IGFmdGVyIHRoaXMsXG4gICAgLy8gICB0aGVuIHRoZSBjbG9zZSBmcmFtZSBtaWdodCBub3QgYmUgc2VudC5cbiAgICB0ZXJtaW5hdGVPbkRlc3Ryb3kgPSBmYWxzZTtcbiAgICBkdXBsZXguZGVzdHJveShlcnIpO1xuICB9KTtcblxuICB3cy5vbmNlKCdjbG9zZScsIGZ1bmN0aW9uIGNsb3NlKCkge1xuICAgIGlmIChkdXBsZXguZGVzdHJveWVkKSByZXR1cm47XG5cbiAgICBkdXBsZXgucHVzaChudWxsKTtcbiAgfSk7XG5cbiAgZHVwbGV4Ll9kZXN0cm95ID0gZnVuY3Rpb24gKGVyciwgY2FsbGJhY2spIHtcbiAgICBpZiAod3MucmVhZHlTdGF0ZSA9PT0gd3MuQ0xPU0VEKSB7XG4gICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgcHJvY2Vzcy5uZXh0VGljayhlbWl0Q2xvc2UsIGR1cGxleCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGNhbGxlZCA9IGZhbHNlO1xuXG4gICAgd3Mub25jZSgnZXJyb3InLCBmdW5jdGlvbiBlcnJvcihlcnIpIHtcbiAgICAgIGNhbGxlZCA9IHRydWU7XG4gICAgICBjYWxsYmFjayhlcnIpO1xuICAgIH0pO1xuXG4gICAgd3Mub25jZSgnY2xvc2UnLCBmdW5jdGlvbiBjbG9zZSgpIHtcbiAgICAgIGlmICghY2FsbGVkKSBjYWxsYmFjayhlcnIpO1xuICAgICAgcHJvY2Vzcy5uZXh0VGljayhlbWl0Q2xvc2UsIGR1cGxleCk7XG4gICAgfSk7XG5cbiAgICBpZiAodGVybWluYXRlT25EZXN0cm95KSB3cy50ZXJtaW5hdGUoKTtcbiAgfTtcblxuICBkdXBsZXguX2ZpbmFsID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgaWYgKHdzLnJlYWR5U3RhdGUgPT09IHdzLkNPTk5FQ1RJTkcpIHtcbiAgICAgIHdzLm9uY2UoJ29wZW4nLCBmdW5jdGlvbiBvcGVuKCkge1xuICAgICAgICBkdXBsZXguX2ZpbmFsKGNhbGxiYWNrKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgYF9zb2NrZXRgIHByb3BlcnR5IGlzIGBudWxsYCBpdCBtZWFucyB0aGF0IGB3c2AgaXMgYVxuICAgIC8vIGNsaWVudCB3ZWJzb2NrZXQgYW5kIHRoZSBoYW5kc2hha2UgZmFpbGVkLiBJbiBmYWN0LCB3aGVuIHRoaXMgaGFwcGVucywgYVxuICAgIC8vIHNvY2tldCBpcyBuZXZlciBhc3NpZ25lZCB0byB0aGUgd2Vic29ja2V0LiBXYWl0IGZvciB0aGUgYCdlcnJvcidgIGV2ZW50XG4gICAgLy8gdGhhdCB3aWxsIGJlIGVtaXR0ZWQgYnkgdGhlIHdlYnNvY2tldC5cbiAgICBpZiAod3MuX3NvY2tldCA9PT0gbnVsbCkgcmV0dXJuO1xuXG4gICAgaWYgKHdzLl9zb2NrZXQuX3dyaXRhYmxlU3RhdGUuZmluaXNoZWQpIHtcbiAgICAgIGNhbGxiYWNrKCk7XG4gICAgICBpZiAoZHVwbGV4Ll9yZWFkYWJsZVN0YXRlLmVuZEVtaXR0ZWQpIGR1cGxleC5kZXN0cm95KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHdzLl9zb2NrZXQub25jZSgnZmluaXNoJywgZnVuY3Rpb24gZmluaXNoKCkge1xuICAgICAgICAvLyBgZHVwbGV4YCBpcyBub3QgZGVzdHJveWVkIGhlcmUgYmVjYXVzZSB0aGUgYCdlbmQnYCBldmVudCB3aWxsIGJlXG4gICAgICAgIC8vIGVtaXR0ZWQgb24gYGR1cGxleGAgYWZ0ZXIgdGhpcyBgJ2ZpbmlzaCdgIGV2ZW50LiBUaGUgRU9GIHNpZ25hbGluZ1xuICAgICAgICAvLyBgbnVsbGAgY2h1bmsgaXMsIGluIGZhY3QsIHB1c2hlZCB3aGVuIHRoZSB3ZWJzb2NrZXQgZW1pdHMgYCdjbG9zZSdgLlxuICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgfSk7XG4gICAgICB3cy5jbG9zZSgpO1xuICAgIH1cbiAgfTtcblxuICBkdXBsZXguX3JlYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHdzLmlzUGF1c2VkKSB3cy5yZXN1bWUoKTtcbiAgfTtcblxuICBkdXBsZXguX3dyaXRlID0gZnVuY3Rpb24gKGNodW5rLCBlbmNvZGluZywgY2FsbGJhY2spIHtcbiAgICBpZiAod3MucmVhZHlTdGF0ZSA9PT0gd3MuQ09OTkVDVElORykge1xuICAgICAgd3Mub25jZSgnb3BlbicsIGZ1bmN0aW9uIG9wZW4oKSB7XG4gICAgICAgIGR1cGxleC5fd3JpdGUoY2h1bmssIGVuY29kaW5nLCBjYWxsYmFjayk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB3cy5zZW5kKGNodW5rLCBjYWxsYmFjayk7XG4gIH07XG5cbiAgZHVwbGV4Lm9uKCdlbmQnLCBkdXBsZXhPbkVuZCk7XG4gIGR1cGxleC5vbignZXJyb3InLCBkdXBsZXhPbkVycm9yKTtcbiAgcmV0dXJuIGR1cGxleDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVXZWJTb2NrZXRTdHJlYW07XG4iLCAiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCB7IHRva2VuQ2hhcnMgfSA9IHJlcXVpcmUoJy4vdmFsaWRhdGlvbicpO1xuXG4vKipcbiAqIFBhcnNlcyB0aGUgYFNlYy1XZWJTb2NrZXQtUHJvdG9jb2xgIGhlYWRlciBpbnRvIGEgc2V0IG9mIHN1YnByb3RvY29sIG5hbWVzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBoZWFkZXIgVGhlIGZpZWxkIHZhbHVlIG9mIHRoZSBoZWFkZXJcbiAqIEByZXR1cm4ge1NldH0gVGhlIHN1YnByb3RvY29sIG5hbWVzXG4gKiBAcHVibGljXG4gKi9cbmZ1bmN0aW9uIHBhcnNlKGhlYWRlcikge1xuICBjb25zdCBwcm90b2NvbHMgPSBuZXcgU2V0KCk7XG4gIGxldCBzdGFydCA9IC0xO1xuICBsZXQgZW5kID0gLTE7XG4gIGxldCBpID0gMDtcblxuICBmb3IgKGk7IGkgPCBoZWFkZXIubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjb2RlID0gaGVhZGVyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICBpZiAoZW5kID09PSAtMSAmJiB0b2tlbkNoYXJzW2NvZGVdID09PSAxKSB7XG4gICAgICBpZiAoc3RhcnQgPT09IC0xKSBzdGFydCA9IGk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGkgIT09IDAgJiZcbiAgICAgIChjb2RlID09PSAweDIwIC8qICcgJyAqLyB8fCBjb2RlID09PSAweDA5KSAvKiAnXFx0JyAqL1xuICAgICkge1xuICAgICAgaWYgKGVuZCA9PT0gLTEgJiYgc3RhcnQgIT09IC0xKSBlbmQgPSBpO1xuICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gMHgyYyAvKiAnLCcgKi8pIHtcbiAgICAgIGlmIChzdGFydCA9PT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKGBVbmV4cGVjdGVkIGNoYXJhY3RlciBhdCBpbmRleCAke2l9YCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChlbmQgPT09IC0xKSBlbmQgPSBpO1xuXG4gICAgICBjb25zdCBwcm90b2NvbCA9IGhlYWRlci5zbGljZShzdGFydCwgZW5kKTtcblxuICAgICAgaWYgKHByb3RvY29scy5oYXMocHJvdG9jb2wpKSB7XG4gICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVGhlIFwiJHtwcm90b2NvbH1cIiBzdWJwcm90b2NvbCBpcyBkdXBsaWNhdGVkYCk7XG4gICAgICB9XG5cbiAgICAgIHByb3RvY29scy5hZGQocHJvdG9jb2wpO1xuICAgICAgc3RhcnQgPSBlbmQgPSAtMTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKGBVbmV4cGVjdGVkIGNoYXJhY3RlciBhdCBpbmRleCAke2l9YCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0YXJ0ID09PSAtMSB8fCBlbmQgIT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdVbmV4cGVjdGVkIGVuZCBvZiBpbnB1dCcpO1xuICB9XG5cbiAgY29uc3QgcHJvdG9jb2wgPSBoZWFkZXIuc2xpY2Uoc3RhcnQsIGkpO1xuXG4gIGlmIChwcm90b2NvbHMuaGFzKHByb3RvY29sKSkge1xuICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihgVGhlIFwiJHtwcm90b2NvbH1cIiBzdWJwcm90b2NvbCBpcyBkdXBsaWNhdGVkYCk7XG4gIH1cblxuICBwcm90b2NvbHMuYWRkKHByb3RvY29sKTtcbiAgcmV0dXJuIHByb3RvY29scztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7IHBhcnNlIH07XG4iLCAiLyogZXNsaW50IG5vLXVudXNlZC12YXJzOiBbXCJlcnJvclwiLCB7IFwidmFyc0lnbm9yZVBhdHRlcm5cIjogXCJeRHVwbGV4JFwiLCBcImNhdWdodEVycm9yc1wiOiBcIm5vbmVcIiB9XSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpO1xuY29uc3QgaHR0cCA9IHJlcXVpcmUoJ2h0dHAnKTtcbmNvbnN0IHsgRHVwbGV4IH0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbmNvbnN0IHsgY3JlYXRlSGFzaCB9ID0gcmVxdWlyZSgnY3J5cHRvJyk7XG5cbmNvbnN0IGV4dGVuc2lvbiA9IHJlcXVpcmUoJy4vZXh0ZW5zaW9uJyk7XG5jb25zdCBQZXJNZXNzYWdlRGVmbGF0ZSA9IHJlcXVpcmUoJy4vcGVybWVzc2FnZS1kZWZsYXRlJyk7XG5jb25zdCBzdWJwcm90b2NvbCA9IHJlcXVpcmUoJy4vc3VicHJvdG9jb2wnKTtcbmNvbnN0IFdlYlNvY2tldCA9IHJlcXVpcmUoJy4vd2Vic29ja2V0Jyk7XG5jb25zdCB7IENMT1NFX1RJTUVPVVQsIEdVSUQsIGtXZWJTb2NrZXQgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5cbmNvbnN0IGtleVJlZ2V4ID0gL15bKy8wLTlBLVphLXpdezIyfT09JC87XG5cbmNvbnN0IFJVTk5JTkcgPSAwO1xuY29uc3QgQ0xPU0lORyA9IDE7XG5jb25zdCBDTE9TRUQgPSAyO1xuXG4vKipcbiAqIENsYXNzIHJlcHJlc2VudGluZyBhIFdlYlNvY2tldCBzZXJ2ZXIuXG4gKlxuICogQGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gKi9cbmNsYXNzIFdlYlNvY2tldFNlcnZlciBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG4gIC8qKlxuICAgKiBDcmVhdGUgYSBgV2ViU29ja2V0U2VydmVyYCBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQ29uZmlndXJhdGlvbiBvcHRpb25zXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuYWxsb3dTeW5jaHJvbm91c0V2ZW50cz10cnVlXSBTcGVjaWZpZXMgd2hldGhlclxuICAgKiAgICAgYW55IG9mIHRoZSBgJ21lc3NhZ2UnYCwgYCdwaW5nJ2AsIGFuZCBgJ3BvbmcnYCBldmVudHMgY2FuIGJlIGVtaXR0ZWRcbiAgICogICAgIG11bHRpcGxlIHRpbWVzIGluIHRoZSBzYW1lIHRpY2tcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5hdXRvUG9uZz10cnVlXSBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG9cbiAgICogICAgIGF1dG9tYXRpY2FsbHkgc2VuZCBhIHBvbmcgaW4gcmVzcG9uc2UgdG8gYSBwaW5nXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5iYWNrbG9nPTUxMV0gVGhlIG1heGltdW0gbGVuZ3RoIG9mIHRoZSBxdWV1ZSBvZlxuICAgKiAgICAgcGVuZGluZyBjb25uZWN0aW9uc1xuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmNsaWVudFRyYWNraW5nPXRydWVdIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0b1xuICAgKiAgICAgdHJhY2sgY2xpZW50c1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMuY2xvc2VUaW1lb3V0PTMwMDAwXSBEdXJhdGlvbiBpbiBtaWxsaXNlY29uZHMgdG9cbiAgICogICAgIHdhaXQgZm9yIHRoZSBjbG9zaW5nIGhhbmRzaGFrZSB0byBmaW5pc2ggYWZ0ZXIgYHdlYnNvY2tldC5jbG9zZSgpYCBpc1xuICAgKiAgICAgY2FsbGVkXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvcHRpb25zLmhhbmRsZVByb3RvY29sc10gQSBob29rIHRvIGhhbmRsZSBwcm90b2NvbHNcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLmhvc3RdIFRoZSBob3N0bmFtZSB3aGVyZSB0byBiaW5kIHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLm1heEJ1ZmZlcmVkQ2h1bmtzPTI2MjE0NF0gVGhlIG1heGltdW0gbnVtYmVyIG9mXG4gICAqICAgICBidWZmZXJlZCBkYXRhIGNodW5rc1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMubWF4RnJhZ21lbnRzPTE2Mzg0XSBUaGUgbWF4aW11bSBudW1iZXIgb2YgbWVzc2FnZVxuICAgKiAgICAgZnJhZ21lbnRzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5tYXhQYXlsb2FkPTEwNDg1NzYwMF0gVGhlIG1heGltdW0gYWxsb3dlZCBtZXNzYWdlXG4gICAqICAgICBzaXplXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMubm9TZXJ2ZXI9ZmFsc2VdIEVuYWJsZSBubyBzZXJ2ZXIgbW9kZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMucGF0aF0gQWNjZXB0IG9ubHkgY29ubmVjdGlvbnMgbWF0Y2hpbmcgdGhpcyBwYXRoXG4gICAqIEBwYXJhbSB7KEJvb2xlYW58T2JqZWN0KX0gW29wdGlvbnMucGVyTWVzc2FnZURlZmxhdGU9ZmFsc2VdIEVuYWJsZS9kaXNhYmxlXG4gICAqICAgICBwZXJtZXNzYWdlLWRlZmxhdGVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBvcnRdIFRoZSBwb3J0IHdoZXJlIHRvIGJpbmQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0geyhodHRwLlNlcnZlcnxodHRwcy5TZXJ2ZXIpfSBbb3B0aW9ucy5zZXJ2ZXJdIEEgcHJlLWNyZWF0ZWQgSFRUUC9TXG4gICAqICAgICBzZXJ2ZXIgdG8gdXNlXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuc2tpcFVURjhWYWxpZGF0aW9uPWZhbHNlXSBTcGVjaWZpZXMgd2hldGhlciBvclxuICAgKiAgICAgbm90IHRvIHNraXAgVVRGLTggdmFsaWRhdGlvbiBmb3IgdGV4dCBhbmQgY2xvc2UgbWVzc2FnZXNcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMudmVyaWZ5Q2xpZW50XSBBIGhvb2sgdG8gcmVqZWN0IGNvbm5lY3Rpb25zXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvcHRpb25zLldlYlNvY2tldD1XZWJTb2NrZXRdIFNwZWNpZmllcyB0aGUgYFdlYlNvY2tldGBcbiAgICogICAgIGNsYXNzIHRvIHVzZS4gSXQgbXVzdCBiZSB0aGUgYFdlYlNvY2tldGAgY2xhc3Mgb3IgY2xhc3MgdGhhdCBleHRlbmRzIGl0XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gQSBsaXN0ZW5lciBmb3IgdGhlIGBsaXN0ZW5pbmdgIGV2ZW50XG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIHN1cGVyKCk7XG5cbiAgICBvcHRpb25zID0ge1xuICAgICAgYWxsb3dTeW5jaHJvbm91c0V2ZW50czogdHJ1ZSxcbiAgICAgIGF1dG9Qb25nOiB0cnVlLFxuICAgICAgbWF4QnVmZmVyZWRDaHVua3M6IDI1NiAqIDEwMjQsXG4gICAgICBtYXhGcmFnbWVudHM6IDE2ICogMTAyNCxcbiAgICAgIG1heFBheWxvYWQ6IDEwMCAqIDEwMjQgKiAxMDI0LFxuICAgICAgc2tpcFVURjhWYWxpZGF0aW9uOiBmYWxzZSxcbiAgICAgIHBlck1lc3NhZ2VEZWZsYXRlOiBmYWxzZSxcbiAgICAgIGhhbmRsZVByb3RvY29sczogbnVsbCxcbiAgICAgIGNsaWVudFRyYWNraW5nOiB0cnVlLFxuICAgICAgY2xvc2VUaW1lb3V0OiBDTE9TRV9USU1FT1VULFxuICAgICAgdmVyaWZ5Q2xpZW50OiBudWxsLFxuICAgICAgbm9TZXJ2ZXI6IGZhbHNlLFxuICAgICAgYmFja2xvZzogbnVsbCwgLy8gdXNlIGRlZmF1bHQgKDUxMSBhcyBpbXBsZW1lbnRlZCBpbiBuZXQuanMpXG4gICAgICBzZXJ2ZXI6IG51bGwsXG4gICAgICBob3N0OiBudWxsLFxuICAgICAgcGF0aDogbnVsbCxcbiAgICAgIHBvcnQ6IG51bGwsXG4gICAgICBXZWJTb2NrZXQsXG4gICAgICAuLi5vcHRpb25zXG4gICAgfTtcblxuICAgIGlmIChcbiAgICAgIChvcHRpb25zLnBvcnQgPT0gbnVsbCAmJiAhb3B0aW9ucy5zZXJ2ZXIgJiYgIW9wdGlvbnMubm9TZXJ2ZXIpIHx8XG4gICAgICAob3B0aW9ucy5wb3J0ICE9IG51bGwgJiYgKG9wdGlvbnMuc2VydmVyIHx8IG9wdGlvbnMubm9TZXJ2ZXIpKSB8fFxuICAgICAgKG9wdGlvbnMuc2VydmVyICYmIG9wdGlvbnMubm9TZXJ2ZXIpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAnT25lIGFuZCBvbmx5IG9uZSBvZiB0aGUgXCJwb3J0XCIsIFwic2VydmVyXCIsIG9yIFwibm9TZXJ2ZXJcIiBvcHRpb25zICcgK1xuICAgICAgICAgICdtdXN0IGJlIHNwZWNpZmllZCdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMucG9ydCAhPSBudWxsKSB7XG4gICAgICB0aGlzLl9zZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcbiAgICAgICAgY29uc3QgYm9keSA9IGh0dHAuU1RBVFVTX0NPREVTWzQyNl07XG5cbiAgICAgICAgcmVzLndyaXRlSGVhZCg0MjYsIHtcbiAgICAgICAgICAnQ29udGVudC1MZW5ndGgnOiBib2R5Lmxlbmd0aCxcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nXG4gICAgICAgIH0pO1xuICAgICAgICByZXMuZW5kKGJvZHkpO1xuICAgICAgfSk7XG4gICAgICB0aGlzLl9zZXJ2ZXIubGlzdGVuKFxuICAgICAgICBvcHRpb25zLnBvcnQsXG4gICAgICAgIG9wdGlvbnMuaG9zdCxcbiAgICAgICAgb3B0aW9ucy5iYWNrbG9nLFxuICAgICAgICBjYWxsYmFja1xuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMuc2VydmVyKSB7XG4gICAgICB0aGlzLl9zZXJ2ZXIgPSBvcHRpb25zLnNlcnZlcjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fc2VydmVyKSB7XG4gICAgICBjb25zdCBlbWl0Q29ubmVjdGlvbiA9IHRoaXMuZW1pdC5iaW5kKHRoaXMsICdjb25uZWN0aW9uJyk7XG5cbiAgICAgIHRoaXMuX3JlbW92ZUxpc3RlbmVycyA9IGFkZExpc3RlbmVycyh0aGlzLl9zZXJ2ZXIsIHtcbiAgICAgICAgbGlzdGVuaW5nOiB0aGlzLmVtaXQuYmluZCh0aGlzLCAnbGlzdGVuaW5nJyksXG4gICAgICAgIGVycm9yOiB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZXJyb3InKSxcbiAgICAgICAgdXBncmFkZTogKHJlcSwgc29ja2V0LCBoZWFkKSA9PiB7XG4gICAgICAgICAgdGhpcy5oYW5kbGVVcGdyYWRlKHJlcSwgc29ja2V0LCBoZWFkLCBlbWl0Q29ubmVjdGlvbik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25zLnBlck1lc3NhZ2VEZWZsYXRlID09PSB0cnVlKSBvcHRpb25zLnBlck1lc3NhZ2VEZWZsYXRlID0ge307XG4gICAgaWYgKG9wdGlvbnMuY2xpZW50VHJhY2tpbmcpIHtcbiAgICAgIHRoaXMuY2xpZW50cyA9IG5ldyBTZXQoKTtcbiAgICAgIHRoaXMuX3Nob3VsZEVtaXRDbG9zZSA9IGZhbHNlO1xuICAgIH1cblxuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgdGhpcy5fc3RhdGUgPSBSVU5OSU5HO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGJvdW5kIGFkZHJlc3MsIHRoZSBhZGRyZXNzIGZhbWlseSBuYW1lLCBhbmQgcG9ydCBvZiB0aGUgc2VydmVyXG4gICAqIGFzIHJlcG9ydGVkIGJ5IHRoZSBvcGVyYXRpbmcgc3lzdGVtIGlmIGxpc3RlbmluZyBvbiBhbiBJUCBzb2NrZXQuXG4gICAqIElmIHRoZSBzZXJ2ZXIgaXMgbGlzdGVuaW5nIG9uIGEgcGlwZSBvciBVTklYIGRvbWFpbiBzb2NrZXQsIHRoZSBuYW1lIGlzXG4gICAqIHJldHVybmVkIGFzIGEgc3RyaW5nLlxuICAgKlxuICAgKiBAcmV0dXJuIHsoT2JqZWN0fFN0cmluZ3xudWxsKX0gVGhlIGFkZHJlc3Mgb2YgdGhlIHNlcnZlclxuICAgKiBAcHVibGljXG4gICAqL1xuICBhZGRyZXNzKCkge1xuICAgIGlmICh0aGlzLm9wdGlvbnMubm9TZXJ2ZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHNlcnZlciBpcyBvcGVyYXRpbmcgaW4gXCJub1NlcnZlclwiIG1vZGUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuX3NlcnZlcikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHRoaXMuX3NlcnZlci5hZGRyZXNzKCk7XG4gIH1cblxuICAvKipcbiAgICogU3RvcCB0aGUgc2VydmVyIGZyb20gYWNjZXB0aW5nIG5ldyBjb25uZWN0aW9ucyBhbmQgZW1pdCB0aGUgYCdjbG9zZSdgIGV2ZW50XG4gICAqIHdoZW4gYWxsIGV4aXN0aW5nIGNvbm5lY3Rpb25zIGFyZSBjbG9zZWQuXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYl0gQSBvbmUtdGltZSBsaXN0ZW5lciBmb3IgdGhlIGAnY2xvc2UnYCBldmVudFxuICAgKiBAcHVibGljXG4gICAqL1xuICBjbG9zZShjYikge1xuICAgIGlmICh0aGlzLl9zdGF0ZSA9PT0gQ0xPU0VEKSB7XG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgdGhpcy5vbmNlKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBjYihuZXcgRXJyb3IoJ1RoZSBzZXJ2ZXIgaXMgbm90IHJ1bm5pbmcnKSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBwcm9jZXNzLm5leHRUaWNrKGVtaXRDbG9zZSwgdGhpcyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNiKSB0aGlzLm9uY2UoJ2Nsb3NlJywgY2IpO1xuXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSBDTE9TSU5HKSByZXR1cm47XG4gICAgdGhpcy5fc3RhdGUgPSBDTE9TSU5HO1xuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5ub1NlcnZlciB8fCB0aGlzLm9wdGlvbnMuc2VydmVyKSB7XG4gICAgICBpZiAodGhpcy5fc2VydmVyKSB7XG4gICAgICAgIHRoaXMuX3JlbW92ZUxpc3RlbmVycygpO1xuICAgICAgICB0aGlzLl9yZW1vdmVMaXN0ZW5lcnMgPSB0aGlzLl9zZXJ2ZXIgPSBudWxsO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5jbGllbnRzKSB7XG4gICAgICAgIGlmICghdGhpcy5jbGllbnRzLnNpemUpIHtcbiAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGVtaXRDbG9zZSwgdGhpcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fc2hvdWxkRW1pdENsb3NlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcHJvY2Vzcy5uZXh0VGljayhlbWl0Q2xvc2UsIHRoaXMpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXI7XG5cbiAgICAgIHRoaXMuX3JlbW92ZUxpc3RlbmVycygpO1xuICAgICAgdGhpcy5fcmVtb3ZlTGlzdGVuZXJzID0gdGhpcy5fc2VydmVyID0gbnVsbDtcblxuICAgICAgLy9cbiAgICAgIC8vIFRoZSBIVFRQL1Mgc2VydmVyIHdhcyBjcmVhdGVkIGludGVybmFsbHkuIENsb3NlIGl0LCBhbmQgcmVseSBvbiBpdHNcbiAgICAgIC8vIGAnY2xvc2UnYCBldmVudC5cbiAgICAgIC8vXG4gICAgICBzZXJ2ZXIuY2xvc2UoKCkgPT4ge1xuICAgICAgICBlbWl0Q2xvc2UodGhpcyk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2VlIGlmIGEgZ2l2ZW4gcmVxdWVzdCBzaG91bGQgYmUgaGFuZGxlZCBieSB0aGlzIHNlcnZlciBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtIHtodHRwLkluY29taW5nTWVzc2FnZX0gcmVxIFJlcXVlc3Qgb2JqZWN0IHRvIGluc3BlY3RcbiAgICogQHJldHVybiB7Qm9vbGVhbn0gYHRydWVgIGlmIHRoZSByZXF1ZXN0IGlzIHZhbGlkLCBlbHNlIGBmYWxzZWBcbiAgICogQHB1YmxpY1xuICAgKi9cbiAgc2hvdWxkSGFuZGxlKHJlcSkge1xuICAgIGlmICh0aGlzLm9wdGlvbnMucGF0aCkge1xuICAgICAgY29uc3QgaW5kZXggPSByZXEudXJsLmluZGV4T2YoJz8nKTtcbiAgICAgIGNvbnN0IHBhdGhuYW1lID0gaW5kZXggIT09IC0xID8gcmVxLnVybC5zbGljZSgwLCBpbmRleCkgOiByZXEudXJsO1xuXG4gICAgICBpZiAocGF0aG5hbWUgIT09IHRoaXMub3B0aW9ucy5wYXRoKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGEgSFRUUCBVcGdyYWRlIHJlcXVlc3QuXG4gICAqXG4gICAqIEBwYXJhbSB7aHR0cC5JbmNvbWluZ01lc3NhZ2V9IHJlcSBUaGUgcmVxdWVzdCBvYmplY3RcbiAgICogQHBhcmFtIHtEdXBsZXh9IHNvY2tldCBUaGUgbmV0d29yayBzb2NrZXQgYmV0d2VlbiB0aGUgc2VydmVyIGFuZCBjbGllbnRcbiAgICogQHBhcmFtIHtCdWZmZXJ9IGhlYWQgVGhlIGZpcnN0IHBhY2tldCBvZiB0aGUgdXBncmFkZWQgc3RyZWFtXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIENhbGxiYWNrXG4gICAqIEBwdWJsaWNcbiAgICovXG4gIGhhbmRsZVVwZ3JhZGUocmVxLCBzb2NrZXQsIGhlYWQsIGNiKSB7XG4gICAgc29ja2V0Lm9uKCdlcnJvcicsIHNvY2tldE9uRXJyb3IpO1xuXG4gICAgY29uc3Qga2V5ID0gcmVxLmhlYWRlcnNbJ3NlYy13ZWJzb2NrZXQta2V5J107XG4gICAgY29uc3QgdXBncmFkZSA9IHJlcS5oZWFkZXJzLnVwZ3JhZGU7XG4gICAgY29uc3QgdmVyc2lvbiA9ICtyZXEuaGVhZGVyc1snc2VjLXdlYnNvY2tldC12ZXJzaW9uJ107XG5cbiAgICBpZiAocmVxLm1ldGhvZCAhPT0gJ0dFVCcpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSAnSW52YWxpZCBIVFRQIG1ldGhvZCc7XG4gICAgICBhYm9ydEhhbmRzaGFrZU9yRW1pdHdzQ2xpZW50RXJyb3IodGhpcywgcmVxLCBzb2NrZXQsIDQwNSwgbWVzc2FnZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHVwZ3JhZGUgPT09IHVuZGVmaW5lZCB8fCB1cGdyYWRlLnRvTG93ZXJDYXNlKCkgIT09ICd3ZWJzb2NrZXQnKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gJ0ludmFsaWQgVXBncmFkZSBoZWFkZXInO1xuICAgICAgYWJvcnRIYW5kc2hha2VPckVtaXR3c0NsaWVudEVycm9yKHRoaXMsIHJlcSwgc29ja2V0LCA0MDAsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChrZXkgPT09IHVuZGVmaW5lZCB8fCAha2V5UmVnZXgudGVzdChrZXkpKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gJ01pc3Npbmcgb3IgaW52YWxpZCBTZWMtV2ViU29ja2V0LUtleSBoZWFkZXInO1xuICAgICAgYWJvcnRIYW5kc2hha2VPckVtaXR3c0NsaWVudEVycm9yKHRoaXMsIHJlcSwgc29ja2V0LCA0MDAsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh2ZXJzaW9uICE9PSAxMyAmJiB2ZXJzaW9uICE9PSA4KSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gJ01pc3Npbmcgb3IgaW52YWxpZCBTZWMtV2ViU29ja2V0LVZlcnNpb24gaGVhZGVyJztcbiAgICAgIGFib3J0SGFuZHNoYWtlT3JFbWl0d3NDbGllbnRFcnJvcih0aGlzLCByZXEsIHNvY2tldCwgNDAwLCBtZXNzYWdlLCB7XG4gICAgICAgICdTZWMtV2ViU29ja2V0LVZlcnNpb24nOiAnMTMsIDgnXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc2hvdWxkSGFuZGxlKHJlcSkpIHtcbiAgICAgIGFib3J0SGFuZHNoYWtlKHNvY2tldCwgNDAwKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzZWNXZWJTb2NrZXRQcm90b2NvbCA9IHJlcS5oZWFkZXJzWydzZWMtd2Vic29ja2V0LXByb3RvY29sJ107XG4gICAgbGV0IHByb3RvY29scyA9IG5ldyBTZXQoKTtcblxuICAgIGlmIChzZWNXZWJTb2NrZXRQcm90b2NvbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBwcm90b2NvbHMgPSBzdWJwcm90b2NvbC5wYXJzZShzZWNXZWJTb2NrZXRQcm90b2NvbCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9ICdJbnZhbGlkIFNlYy1XZWJTb2NrZXQtUHJvdG9jb2wgaGVhZGVyJztcbiAgICAgICAgYWJvcnRIYW5kc2hha2VPckVtaXR3c0NsaWVudEVycm9yKHRoaXMsIHJlcSwgc29ja2V0LCA0MDAsIG1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc2VjV2ViU29ja2V0RXh0ZW5zaW9ucyA9IHJlcS5oZWFkZXJzWydzZWMtd2Vic29ja2V0LWV4dGVuc2lvbnMnXTtcbiAgICBjb25zdCBleHRlbnNpb25zID0ge307XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLm9wdGlvbnMucGVyTWVzc2FnZURlZmxhdGUgJiZcbiAgICAgIHNlY1dlYlNvY2tldEV4dGVuc2lvbnMgIT09IHVuZGVmaW5lZFxuICAgICkge1xuICAgICAgY29uc3QgcGVyTWVzc2FnZURlZmxhdGUgPSBuZXcgUGVyTWVzc2FnZURlZmxhdGUoe1xuICAgICAgICAuLi50aGlzLm9wdGlvbnMucGVyTWVzc2FnZURlZmxhdGUsXG4gICAgICAgIGlzU2VydmVyOiB0cnVlLFxuICAgICAgICBtYXhQYXlsb2FkOiB0aGlzLm9wdGlvbnMubWF4UGF5bG9hZFxuICAgICAgfSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG9mZmVycyA9IGV4dGVuc2lvbi5wYXJzZShzZWNXZWJTb2NrZXRFeHRlbnNpb25zKTtcblxuICAgICAgICBpZiAob2ZmZXJzW1Blck1lc3NhZ2VEZWZsYXRlLmV4dGVuc2lvbk5hbWVdKSB7XG4gICAgICAgICAgcGVyTWVzc2FnZURlZmxhdGUuYWNjZXB0KG9mZmVyc1tQZXJNZXNzYWdlRGVmbGF0ZS5leHRlbnNpb25OYW1lXSk7XG4gICAgICAgICAgZXh0ZW5zaW9uc1tQZXJNZXNzYWdlRGVmbGF0ZS5leHRlbnNpb25OYW1lXSA9IHBlck1lc3NhZ2VEZWZsYXRlO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9XG4gICAgICAgICAgJ0ludmFsaWQgb3IgdW5hY2NlcHRhYmxlIFNlYy1XZWJTb2NrZXQtRXh0ZW5zaW9ucyBoZWFkZXInO1xuICAgICAgICBhYm9ydEhhbmRzaGFrZU9yRW1pdHdzQ2xpZW50RXJyb3IodGhpcywgcmVxLCBzb2NrZXQsIDQwMCwgbWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL1xuICAgIC8vIE9wdGlvbmFsbHkgY2FsbCBleHRlcm5hbCBjbGllbnQgdmVyaWZpY2F0aW9uIGhhbmRsZXIuXG4gICAgLy9cbiAgICBpZiAodGhpcy5vcHRpb25zLnZlcmlmeUNsaWVudCkge1xuICAgICAgY29uc3QgaW5mbyA9IHtcbiAgICAgICAgb3JpZ2luOlxuICAgICAgICAgIHJlcS5oZWFkZXJzW2Ake3ZlcnNpb24gPT09IDggPyAnc2VjLXdlYnNvY2tldC1vcmlnaW4nIDogJ29yaWdpbid9YF0sXG4gICAgICAgIHNlY3VyZTogISEocmVxLnNvY2tldC5hdXRob3JpemVkIHx8IHJlcS5zb2NrZXQuZW5jcnlwdGVkKSxcbiAgICAgICAgcmVxXG4gICAgICB9O1xuXG4gICAgICBpZiAodGhpcy5vcHRpb25zLnZlcmlmeUNsaWVudC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLnZlcmlmeUNsaWVudChpbmZvLCAodmVyaWZpZWQsIGNvZGUsIG1lc3NhZ2UsIGhlYWRlcnMpID0+IHtcbiAgICAgICAgICBpZiAoIXZlcmlmaWVkKSB7XG4gICAgICAgICAgICByZXR1cm4gYWJvcnRIYW5kc2hha2Uoc29ja2V0LCBjb2RlIHx8IDQwMSwgbWVzc2FnZSwgaGVhZGVycyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5jb21wbGV0ZVVwZ3JhZGUoXG4gICAgICAgICAgICBleHRlbnNpb25zLFxuICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgcHJvdG9jb2xzLFxuICAgICAgICAgICAgcmVxLFxuICAgICAgICAgICAgc29ja2V0LFxuICAgICAgICAgICAgaGVhZCxcbiAgICAgICAgICAgIGNiXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLm9wdGlvbnMudmVyaWZ5Q2xpZW50KGluZm8pKSByZXR1cm4gYWJvcnRIYW5kc2hha2Uoc29ja2V0LCA0MDEpO1xuICAgIH1cblxuICAgIHRoaXMuY29tcGxldGVVcGdyYWRlKGV4dGVuc2lvbnMsIGtleSwgcHJvdG9jb2xzLCByZXEsIHNvY2tldCwgaGVhZCwgY2IpO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZ3JhZGUgdGhlIGNvbm5lY3Rpb24gdG8gV2ViU29ja2V0LlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gZXh0ZW5zaW9ucyBUaGUgYWNjZXB0ZWQgZXh0ZW5zaW9uc1xuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5IFRoZSB2YWx1ZSBvZiB0aGUgYFNlYy1XZWJTb2NrZXQtS2V5YCBoZWFkZXJcbiAgICogQHBhcmFtIHtTZXR9IHByb3RvY29scyBUaGUgc3VicHJvdG9jb2xzXG4gICAqIEBwYXJhbSB7aHR0cC5JbmNvbWluZ01lc3NhZ2V9IHJlcSBUaGUgcmVxdWVzdCBvYmplY3RcbiAgICogQHBhcmFtIHtEdXBsZXh9IHNvY2tldCBUaGUgbmV0d29yayBzb2NrZXQgYmV0d2VlbiB0aGUgc2VydmVyIGFuZCBjbGllbnRcbiAgICogQHBhcmFtIHtCdWZmZXJ9IGhlYWQgVGhlIGZpcnN0IHBhY2tldCBvZiB0aGUgdXBncmFkZWQgc3RyZWFtXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIENhbGxiYWNrXG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiBjYWxsZWQgbW9yZSB0aGFuIG9uY2Ugd2l0aCB0aGUgc2FtZSBzb2NrZXRcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGNvbXBsZXRlVXBncmFkZShleHRlbnNpb25zLCBrZXksIHByb3RvY29scywgcmVxLCBzb2NrZXQsIGhlYWQsIGNiKSB7XG4gICAgLy9cbiAgICAvLyBEZXN0cm95IHRoZSBzb2NrZXQgaWYgdGhlIGNsaWVudCBoYXMgYWxyZWFkeSBzZW50IGEgRklOIHBhY2tldC5cbiAgICAvL1xuICAgIGlmICghc29ja2V0LnJlYWRhYmxlIHx8ICFzb2NrZXQud3JpdGFibGUpIHJldHVybiBzb2NrZXQuZGVzdHJveSgpO1xuXG4gICAgaWYgKHNvY2tldFtrV2ViU29ja2V0XSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnc2VydmVyLmhhbmRsZVVwZ3JhZGUoKSB3YXMgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIHdpdGggdGhlIHNhbWUgJyArXG4gICAgICAgICAgJ3NvY2tldCwgcG9zc2libHkgZHVlIHRvIGEgbWlzY29uZmlndXJhdGlvbidcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3N0YXRlID4gUlVOTklORykgcmV0dXJuIGFib3J0SGFuZHNoYWtlKHNvY2tldCwgNTAzKTtcblxuICAgIGNvbnN0IGRpZ2VzdCA9IGNyZWF0ZUhhc2goJ3NoYTEnKVxuICAgICAgLnVwZGF0ZShrZXkgKyBHVUlEKVxuICAgICAgLmRpZ2VzdCgnYmFzZTY0Jyk7XG5cbiAgICBjb25zdCBoZWFkZXJzID0gW1xuICAgICAgJ0hUVFAvMS4xIDEwMSBTd2l0Y2hpbmcgUHJvdG9jb2xzJyxcbiAgICAgICdVcGdyYWRlOiB3ZWJzb2NrZXQnLFxuICAgICAgJ0Nvbm5lY3Rpb246IFVwZ3JhZGUnLFxuICAgICAgYFNlYy1XZWJTb2NrZXQtQWNjZXB0OiAke2RpZ2VzdH1gXG4gICAgXTtcblxuICAgIGNvbnN0IHdzID0gbmV3IHRoaXMub3B0aW9ucy5XZWJTb2NrZXQobnVsbCwgdW5kZWZpbmVkLCB0aGlzLm9wdGlvbnMpO1xuXG4gICAgaWYgKHByb3RvY29scy5zaXplKSB7XG4gICAgICAvL1xuICAgICAgLy8gT3B0aW9uYWxseSBjYWxsIGV4dGVybmFsIHByb3RvY29sIHNlbGVjdGlvbiBoYW5kbGVyLlxuICAgICAgLy9cbiAgICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5vcHRpb25zLmhhbmRsZVByb3RvY29sc1xuICAgICAgICA/IHRoaXMub3B0aW9ucy5oYW5kbGVQcm90b2NvbHMocHJvdG9jb2xzLCByZXEpXG4gICAgICAgIDogcHJvdG9jb2xzLnZhbHVlcygpLm5leHQoKS52YWx1ZTtcblxuICAgICAgaWYgKHByb3RvY29sKSB7XG4gICAgICAgIGhlYWRlcnMucHVzaChgU2VjLVdlYlNvY2tldC1Qcm90b2NvbDogJHtwcm90b2NvbH1gKTtcbiAgICAgICAgd3MuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4dGVuc2lvbnNbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV0pIHtcbiAgICAgIGNvbnN0IHBhcmFtcyA9IGV4dGVuc2lvbnNbUGVyTWVzc2FnZURlZmxhdGUuZXh0ZW5zaW9uTmFtZV0ucGFyYW1zO1xuICAgICAgY29uc3QgdmFsdWUgPSBleHRlbnNpb24uZm9ybWF0KHtcbiAgICAgICAgW1Blck1lc3NhZ2VEZWZsYXRlLmV4dGVuc2lvbk5hbWVdOiBbcGFyYW1zXVxuICAgICAgfSk7XG4gICAgICBoZWFkZXJzLnB1c2goYFNlYy1XZWJTb2NrZXQtRXh0ZW5zaW9uczogJHt2YWx1ZX1gKTtcbiAgICAgIHdzLl9leHRlbnNpb25zID0gZXh0ZW5zaW9ucztcbiAgICB9XG5cbiAgICAvL1xuICAgIC8vIEFsbG93IGV4dGVybmFsIG1vZGlmaWNhdGlvbi9pbnNwZWN0aW9uIG9mIGhhbmRzaGFrZSBoZWFkZXJzLlxuICAgIC8vXG4gICAgdGhpcy5lbWl0KCdoZWFkZXJzJywgaGVhZGVycywgcmVxKTtcblxuICAgIHNvY2tldC53cml0ZShoZWFkZXJzLmNvbmNhdCgnXFxyXFxuJykuam9pbignXFxyXFxuJykpO1xuICAgIHNvY2tldC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBzb2NrZXRPbkVycm9yKTtcblxuICAgIHdzLnNldFNvY2tldChzb2NrZXQsIGhlYWQsIHtcbiAgICAgIGFsbG93U3luY2hyb25vdXNFdmVudHM6IHRoaXMub3B0aW9ucy5hbGxvd1N5bmNocm9ub3VzRXZlbnRzLFxuICAgICAgbWF4QnVmZmVyZWRDaHVua3M6IHRoaXMub3B0aW9ucy5tYXhCdWZmZXJlZENodW5rcyxcbiAgICAgIG1heEZyYWdtZW50czogdGhpcy5vcHRpb25zLm1heEZyYWdtZW50cyxcbiAgICAgIG1heFBheWxvYWQ6IHRoaXMub3B0aW9ucy5tYXhQYXlsb2FkLFxuICAgICAgc2tpcFVURjhWYWxpZGF0aW9uOiB0aGlzLm9wdGlvbnMuc2tpcFVURjhWYWxpZGF0aW9uXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5jbGllbnRzKSB7XG4gICAgICB0aGlzLmNsaWVudHMuYWRkKHdzKTtcbiAgICAgIHdzLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZSh3cyk7XG5cbiAgICAgICAgaWYgKHRoaXMuX3Nob3VsZEVtaXRDbG9zZSAmJiAhdGhpcy5jbGllbnRzLnNpemUpIHtcbiAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGVtaXRDbG9zZSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNiKHdzLCByZXEpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gV2ViU29ja2V0U2VydmVyO1xuXG4vKipcbiAqIEFkZCBldmVudCBsaXN0ZW5lcnMgb24gYW4gYEV2ZW50RW1pdHRlcmAgdXNpbmcgYSBtYXAgb2YgPGV2ZW50LCBsaXN0ZW5lcj5cbiAqIHBhaXJzLlxuICpcbiAqIEBwYXJhbSB7RXZlbnRFbWl0dGVyfSBzZXJ2ZXIgVGhlIGV2ZW50IGVtaXR0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0LjxTdHJpbmcsIEZ1bmN0aW9uPn0gbWFwIFRoZSBsaXN0ZW5lcnMgdG8gYWRkXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gQSBmdW5jdGlvbiB0aGF0IHdpbGwgcmVtb3ZlIHRoZSBhZGRlZCBsaXN0ZW5lcnMgd2hlblxuICogICAgIGNhbGxlZFxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gYWRkTGlzdGVuZXJzKHNlcnZlciwgbWFwKSB7XG4gIGZvciAoY29uc3QgZXZlbnQgb2YgT2JqZWN0LmtleXMobWFwKSkgc2VydmVyLm9uKGV2ZW50LCBtYXBbZXZlbnRdKTtcblxuICByZXR1cm4gZnVuY3Rpb24gcmVtb3ZlTGlzdGVuZXJzKCkge1xuICAgIGZvciAoY29uc3QgZXZlbnQgb2YgT2JqZWN0LmtleXMobWFwKSkge1xuICAgICAgc2VydmVyLnJlbW92ZUxpc3RlbmVyKGV2ZW50LCBtYXBbZXZlbnRdKTtcbiAgICB9XG4gIH07XG59XG5cbi8qKlxuICogRW1pdCBhIGAnY2xvc2UnYCBldmVudCBvbiBhbiBgRXZlbnRFbWl0dGVyYC5cbiAqXG4gKiBAcGFyYW0ge0V2ZW50RW1pdHRlcn0gc2VydmVyIFRoZSBldmVudCBlbWl0dGVyXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBlbWl0Q2xvc2Uoc2VydmVyKSB7XG4gIHNlcnZlci5fc3RhdGUgPSBDTE9TRUQ7XG4gIHNlcnZlci5lbWl0KCdjbG9zZScpO1xufVxuXG4vKipcbiAqIEhhbmRsZSBzb2NrZXQgZXJyb3JzLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHNvY2tldE9uRXJyb3IoKSB7XG4gIHRoaXMuZGVzdHJveSgpO1xufVxuXG4vKipcbiAqIENsb3NlIHRoZSBjb25uZWN0aW9uIHdoZW4gcHJlY29uZGl0aW9ucyBhcmUgbm90IGZ1bGZpbGxlZC5cbiAqXG4gKiBAcGFyYW0ge0R1cGxleH0gc29ja2V0IFRoZSBzb2NrZXQgb2YgdGhlIHVwZ3JhZGUgcmVxdWVzdFxuICogQHBhcmFtIHtOdW1iZXJ9IGNvZGUgVGhlIEhUVFAgcmVzcG9uc2Ugc3RhdHVzIGNvZGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBbbWVzc2FnZV0gVGhlIEhUVFAgcmVzcG9uc2UgYm9keVxuICogQHBhcmFtIHtPYmplY3R9IFtoZWFkZXJzXSBBZGRpdGlvbmFsIEhUVFAgcmVzcG9uc2UgaGVhZGVyc1xuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gYWJvcnRIYW5kc2hha2Uoc29ja2V0LCBjb2RlLCBtZXNzYWdlLCBoZWFkZXJzKSB7XG4gIC8vXG4gIC8vIFRoZSBzb2NrZXQgaXMgd3JpdGFibGUgdW5sZXNzIHRoZSB1c2VyIGRlc3Ryb3llZCBvciBlbmRlZCBpdCBiZWZvcmUgY2FsbGluZ1xuICAvLyBgc2VydmVyLmhhbmRsZVVwZ3JhZGUoKWAgb3IgaW4gdGhlIGB2ZXJpZnlDbGllbnRgIGZ1bmN0aW9uLCB3aGljaCBpcyBhIHVzZXJcbiAgLy8gZXJyb3IuIEhhbmRsaW5nIHRoaXMgZG9lcyBub3QgbWFrZSBtdWNoIHNlbnNlIGFzIHRoZSB3b3JzdCB0aGF0IGNhbiBoYXBwZW5cbiAgLy8gaXMgdGhhdCBzb21lIG9mIHRoZSBkYXRhIHdyaXR0ZW4gYnkgdGhlIHVzZXIgbWlnaHQgYmUgZGlzY2FyZGVkIGR1ZSB0byB0aGVcbiAgLy8gY2FsbCB0byBgc29ja2V0LmVuZCgpYCBiZWxvdywgd2hpY2ggdHJpZ2dlcnMgYW4gYCdlcnJvcidgIGV2ZW50IHRoYXQgaW5cbiAgLy8gdHVybiBjYXVzZXMgdGhlIHNvY2tldCB0byBiZSBkZXN0cm95ZWQuXG4gIC8vXG4gIG1lc3NhZ2UgPSBtZXNzYWdlIHx8IGh0dHAuU1RBVFVTX0NPREVTW2NvZGVdO1xuICBoZWFkZXJzID0ge1xuICAgIENvbm5lY3Rpb246ICdjbG9zZScsXG4gICAgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L2h0bWwnLFxuICAgICdDb250ZW50LUxlbmd0aCc6IEJ1ZmZlci5ieXRlTGVuZ3RoKG1lc3NhZ2UpLFxuICAgIC4uLmhlYWRlcnNcbiAgfTtcblxuICBzb2NrZXQub25jZSgnZmluaXNoJywgc29ja2V0LmRlc3Ryb3kpO1xuXG4gIHNvY2tldC5lbmQoXG4gICAgYEhUVFAvMS4xICR7Y29kZX0gJHtodHRwLlNUQVRVU19DT0RFU1tjb2RlXX1cXHJcXG5gICtcbiAgICAgIE9iamVjdC5rZXlzKGhlYWRlcnMpXG4gICAgICAgIC5tYXAoKGgpID0+IGAke2h9OiAke2hlYWRlcnNbaF19YClcbiAgICAgICAgLmpvaW4oJ1xcclxcbicpICtcbiAgICAgICdcXHJcXG5cXHJcXG4nICtcbiAgICAgIG1lc3NhZ2VcbiAgKTtcbn1cblxuLyoqXG4gKiBFbWl0IGEgYCd3c0NsaWVudEVycm9yJ2AgZXZlbnQgb24gYSBgV2ViU29ja2V0U2VydmVyYCBpZiB0aGVyZSBpcyBhdCBsZWFzdFxuICogb25lIGxpc3RlbmVyIGZvciBpdCwgb3RoZXJ3aXNlIGNhbGwgYGFib3J0SGFuZHNoYWtlKClgLlxuICpcbiAqIEBwYXJhbSB7V2ViU29ja2V0U2VydmVyfSBzZXJ2ZXIgVGhlIFdlYlNvY2tldCBzZXJ2ZXJcbiAqIEBwYXJhbSB7aHR0cC5JbmNvbWluZ01lc3NhZ2V9IHJlcSBUaGUgcmVxdWVzdCBvYmplY3RcbiAqIEBwYXJhbSB7RHVwbGV4fSBzb2NrZXQgVGhlIHNvY2tldCBvZiB0aGUgdXBncmFkZSByZXF1ZXN0XG4gKiBAcGFyYW0ge051bWJlcn0gY29kZSBUaGUgSFRUUCByZXNwb25zZSBzdGF0dXMgY29kZVxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIEhUVFAgcmVzcG9uc2UgYm9keVxuICogQHBhcmFtIHtPYmplY3R9IFtoZWFkZXJzXSBUaGUgSFRUUCByZXNwb25zZSBoZWFkZXJzXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBhYm9ydEhhbmRzaGFrZU9yRW1pdHdzQ2xpZW50RXJyb3IoXG4gIHNlcnZlcixcbiAgcmVxLFxuICBzb2NrZXQsXG4gIGNvZGUsXG4gIG1lc3NhZ2UsXG4gIGhlYWRlcnNcbikge1xuICBpZiAoc2VydmVyLmxpc3RlbmVyQ291bnQoJ3dzQ2xpZW50RXJyb3InKSkge1xuICAgIGNvbnN0IGVyciA9IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShlcnIsIGFib3J0SGFuZHNoYWtlT3JFbWl0d3NDbGllbnRFcnJvcik7XG5cbiAgICBzZXJ2ZXIuZW1pdCgnd3NDbGllbnRFcnJvcicsIGVyciwgc29ja2V0LCByZXEpO1xuICB9IGVsc2Uge1xuICAgIGFib3J0SGFuZHNoYWtlKHNvY2tldCwgY29kZSwgbWVzc2FnZSwgaGVhZGVycyk7XG4gIH1cbn1cbiIsICIoZnVuY3Rpb24gKGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIC8vIE5vZGUvQ29tbW9uSlNcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgLy8gQU1EXG4gICAgICAgIGRlZmluZShmYWN0b3J5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHdpdGggc3VwcG9ydCBmb3Igd2ViIHdvcmtlcnMpXG4gICAgICAgIHZhciBnbG9iO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBnbG9iID0gd2luZG93O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBnbG9iID0gc2VsZjtcbiAgICAgICAgfVxuXG4gICAgICAgIGdsb2IuU3BhcmtNRDUgPSBmYWN0b3J5KCk7XG4gICAgfVxufShmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvKlxuICAgICAqIEZhc3Rlc3QgbWQ1IGltcGxlbWVudGF0aW9uIGFyb3VuZCAoSktNIG1kNSkuXG4gICAgICogQ3JlZGl0czogSm9zZXBoIE15ZXJzXG4gICAgICpcbiAgICAgKiBAc2VlIGh0dHA6Ly93d3cubXllcnNkYWlseS5vcmcvam9zZXBoL2phdmFzY3JpcHQvbWQ1LXRleHQuaHRtbFxuICAgICAqIEBzZWUgaHR0cDovL2pzcGVyZi5jb20vbWQ1LXNob290b3V0LzdcbiAgICAgKi9cblxuICAgIC8qIHRoaXMgZnVuY3Rpb24gaXMgbXVjaCBmYXN0ZXIsXG4gICAgICBzbyBpZiBwb3NzaWJsZSB3ZSB1c2UgaXQuIFNvbWUgSUVzXG4gICAgICBhcmUgdGhlIG9ubHkgb25lcyBJIGtub3cgb2YgdGhhdFxuICAgICAgbmVlZCB0aGUgaWRpb3RpYyBzZWNvbmQgZnVuY3Rpb24sXG4gICAgICBnZW5lcmF0ZWQgYnkgYW4gaWYgY2xhdXNlLiAgKi9cbiAgICB2YXIgYWRkMzIgPSBmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICByZXR1cm4gKGEgKyBiKSAmIDB4RkZGRkZGRkY7XG4gICAgfSxcbiAgICAgICAgaGV4X2NociA9IFsnMCcsICcxJywgJzInLCAnMycsICc0JywgJzUnLCAnNicsICc3JywgJzgnLCAnOScsICdhJywgJ2InLCAnYycsICdkJywgJ2UnLCAnZiddO1xuXG5cbiAgICBmdW5jdGlvbiBjbW4ocSwgYSwgYiwgeCwgcywgdCkge1xuICAgICAgICBhID0gYWRkMzIoYWRkMzIoYSwgcSksIGFkZDMyKHgsIHQpKTtcbiAgICAgICAgcmV0dXJuIGFkZDMyKChhIDw8IHMpIHwgKGEgPj4+ICgzMiAtIHMpKSwgYik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWQ1Y3ljbGUoeCwgaykge1xuICAgICAgICB2YXIgYSA9IHhbMF0sXG4gICAgICAgICAgICBiID0geFsxXSxcbiAgICAgICAgICAgIGMgPSB4WzJdLFxuICAgICAgICAgICAgZCA9IHhbM107XG5cbiAgICAgICAgYSArPSAoYiAmIGMgfCB+YiAmIGQpICsga1swXSAtIDY4MDg3NjkzNiB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNyB8IGEgPj4+IDI1KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhICYgYiB8IH5hICYgYykgKyBrWzFdIC0gMzg5NTY0NTg2IHwgMDtcbiAgICAgICAgZCAgPSAoZCA8PCAxMiB8IGQgPj4+IDIwKSArIGEgfCAwO1xuICAgICAgICBjICs9IChkICYgYSB8IH5kICYgYikgKyBrWzJdICsgNjA2MTA1ODE5IHwgMDtcbiAgICAgICAgYyAgPSAoYyA8PCAxNyB8IGMgPj4+IDE1KSArIGQgfCAwO1xuICAgICAgICBiICs9IChjICYgZCB8IH5jICYgYSkgKyBrWzNdIC0gMTA0NDUyNTMzMCB8IDA7XG4gICAgICAgIGIgID0gKGIgPDwgMjIgfCBiID4+PiAxMCkgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYiAmIGMgfCB+YiAmIGQpICsga1s0XSAtIDE3NjQxODg5NyB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNyB8IGEgPj4+IDI1KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhICYgYiB8IH5hICYgYykgKyBrWzVdICsgMTIwMDA4MDQyNiB8IDA7XG4gICAgICAgIGQgID0gKGQgPDwgMTIgfCBkID4+PiAyMCkgKyBhIHwgMDtcbiAgICAgICAgYyArPSAoZCAmIGEgfCB+ZCAmIGIpICsga1s2XSAtIDE0NzMyMzEzNDEgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE3IHwgYyA+Pj4gMTUpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgJiBkIHwgfmMgJiBhKSArIGtbN10gLSA0NTcwNTk4MyB8IDA7XG4gICAgICAgIGIgID0gKGIgPDwgMjIgfCBiID4+PiAxMCkgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYiAmIGMgfCB+YiAmIGQpICsga1s4XSArIDE3NzAwMzU0MTYgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDcgfCBhID4+PiAyNSkgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYSAmIGIgfCB+YSAmIGMpICsga1s5XSAtIDE5NTg0MTQ0MTcgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDEyIHwgZCA+Pj4gMjApICsgYSB8IDA7XG4gICAgICAgIGMgKz0gKGQgJiBhIHwgfmQgJiBiKSArIGtbMTBdIC0gNDIwNjMgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE3IHwgYyA+Pj4gMTUpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgJiBkIHwgfmMgJiBhKSArIGtbMTFdIC0gMTk5MDQwNDE2MiB8IDA7XG4gICAgICAgIGIgID0gKGIgPDwgMjIgfCBiID4+PiAxMCkgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYiAmIGMgfCB+YiAmIGQpICsga1sxMl0gKyAxODA0NjAzNjgyIHwgMDtcbiAgICAgICAgYSAgPSAoYSA8PCA3IHwgYSA+Pj4gMjUpICsgYiB8IDA7XG4gICAgICAgIGQgKz0gKGEgJiBiIHwgfmEgJiBjKSArIGtbMTNdIC0gNDAzNDExMDEgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDEyIHwgZCA+Pj4gMjApICsgYSB8IDA7XG4gICAgICAgIGMgKz0gKGQgJiBhIHwgfmQgJiBiKSArIGtbMTRdIC0gMTUwMjAwMjI5MCB8IDA7XG4gICAgICAgIGMgID0gKGMgPDwgMTcgfCBjID4+PiAxNSkgKyBkIHwgMDtcbiAgICAgICAgYiArPSAoYyAmIGQgfCB+YyAmIGEpICsga1sxNV0gKyAxMjM2NTM1MzI5IHwgMDtcbiAgICAgICAgYiAgPSAoYiA8PCAyMiB8IGIgPj4+IDEwKSArIGMgfCAwO1xuXG4gICAgICAgIGEgKz0gKGIgJiBkIHwgYyAmIH5kKSArIGtbMV0gLSAxNjU3OTY1MTAgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDUgfCBhID4+PiAyNykgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYSAmIGMgfCBiICYgfmMpICsga1s2XSAtIDEwNjk1MDE2MzIgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDkgfCBkID4+PiAyMykgKyBhIHwgMDtcbiAgICAgICAgYyArPSAoZCAmIGIgfCBhICYgfmIpICsga1sxMV0gKyA2NDM3MTc3MTMgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE0IHwgYyA+Pj4gMTgpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgJiBhIHwgZCAmIH5hKSArIGtbMF0gLSAzNzM4OTczMDIgfCAwO1xuICAgICAgICBiICA9IChiIDw8IDIwIHwgYiA+Pj4gMTIpICsgYyB8IDA7XG4gICAgICAgIGEgKz0gKGIgJiBkIHwgYyAmIH5kKSArIGtbNV0gLSA3MDE1NTg2OTEgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDUgfCBhID4+PiAyNykgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYSAmIGMgfCBiICYgfmMpICsga1sxMF0gKyAzODAxNjA4MyB8IDA7XG4gICAgICAgIGQgID0gKGQgPDwgOSB8IGQgPj4+IDIzKSArIGEgfCAwO1xuICAgICAgICBjICs9IChkICYgYiB8IGEgJiB+YikgKyBrWzE1XSAtIDY2MDQ3ODMzNSB8IDA7XG4gICAgICAgIGMgID0gKGMgPDwgMTQgfCBjID4+PiAxOCkgKyBkIHwgMDtcbiAgICAgICAgYiArPSAoYyAmIGEgfCBkICYgfmEpICsga1s0XSAtIDQwNTUzNzg0OCB8IDA7XG4gICAgICAgIGIgID0gKGIgPDwgMjAgfCBiID4+PiAxMikgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYiAmIGQgfCBjICYgfmQpICsga1s5XSArIDU2ODQ0NjQzOCB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNSB8IGEgPj4+IDI3KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhICYgYyB8IGIgJiB+YykgKyBrWzE0XSAtIDEwMTk4MDM2OTAgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDkgfCBkID4+PiAyMykgKyBhIHwgMDtcbiAgICAgICAgYyArPSAoZCAmIGIgfCBhICYgfmIpICsga1szXSAtIDE4NzM2Mzk2MSB8IDA7XG4gICAgICAgIGMgID0gKGMgPDwgMTQgfCBjID4+PiAxOCkgKyBkIHwgMDtcbiAgICAgICAgYiArPSAoYyAmIGEgfCBkICYgfmEpICsga1s4XSArIDExNjM1MzE1MDEgfCAwO1xuICAgICAgICBiICA9IChiIDw8IDIwIHwgYiA+Pj4gMTIpICsgYyB8IDA7XG4gICAgICAgIGEgKz0gKGIgJiBkIHwgYyAmIH5kKSArIGtbMTNdIC0gMTQ0NDY4MTQ2NyB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNSB8IGEgPj4+IDI3KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhICYgYyB8IGIgJiB+YykgKyBrWzJdIC0gNTE0MDM3ODQgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDkgfCBkID4+PiAyMykgKyBhIHwgMDtcbiAgICAgICAgYyArPSAoZCAmIGIgfCBhICYgfmIpICsga1s3XSArIDE3MzUzMjg0NzMgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE0IHwgYyA+Pj4gMTgpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgJiBhIHwgZCAmIH5hKSArIGtbMTJdIC0gMTkyNjYwNzczNCB8IDA7XG4gICAgICAgIGIgID0gKGIgPDwgMjAgfCBiID4+PiAxMikgKyBjIHwgMDtcblxuICAgICAgICBhICs9IChiIF4gYyBeIGQpICsga1s1XSAtIDM3ODU1OCB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNCB8IGEgPj4+IDI4KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhIF4gYiBeIGMpICsga1s4XSAtIDIwMjI1NzQ0NjMgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDExIHwgZCA+Pj4gMjEpICsgYSB8IDA7XG4gICAgICAgIGMgKz0gKGQgXiBhIF4gYikgKyBrWzExXSArIDE4MzkwMzA1NjIgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE2IHwgYyA+Pj4gMTYpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgXiBkIF4gYSkgKyBrWzE0XSAtIDM1MzA5NTU2IHwgMDtcbiAgICAgICAgYiAgPSAoYiA8PCAyMyB8IGIgPj4+IDkpICsgYyB8IDA7XG4gICAgICAgIGEgKz0gKGIgXiBjIF4gZCkgKyBrWzFdIC0gMTUzMDk5MjA2MCB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNCB8IGEgPj4+IDI4KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhIF4gYiBeIGMpICsga1s0XSArIDEyNzI4OTMzNTMgfCAwO1xuICAgICAgICBkICA9IChkIDw8IDExIHwgZCA+Pj4gMjEpICsgYSB8IDA7XG4gICAgICAgIGMgKz0gKGQgXiBhIF4gYikgKyBrWzddIC0gMTU1NDk3NjMyIHwgMDtcbiAgICAgICAgYyAgPSAoYyA8PCAxNiB8IGMgPj4+IDE2KSArIGQgfCAwO1xuICAgICAgICBiICs9IChjIF4gZCBeIGEpICsga1sxMF0gLSAxMDk0NzMwNjQwIHwgMDtcbiAgICAgICAgYiAgPSAoYiA8PCAyMyB8IGIgPj4+IDkpICsgYyB8IDA7XG4gICAgICAgIGEgKz0gKGIgXiBjIF4gZCkgKyBrWzEzXSArIDY4MTI3OTE3NCB8IDA7XG4gICAgICAgIGEgID0gKGEgPDwgNCB8IGEgPj4+IDI4KSArIGIgfCAwO1xuICAgICAgICBkICs9IChhIF4gYiBeIGMpICsga1swXSAtIDM1ODUzNzIyMiB8IDA7XG4gICAgICAgIGQgID0gKGQgPDwgMTEgfCBkID4+PiAyMSkgKyBhIHwgMDtcbiAgICAgICAgYyArPSAoZCBeIGEgXiBiKSArIGtbM10gLSA3MjI1MjE5NzkgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE2IHwgYyA+Pj4gMTYpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgXiBkIF4gYSkgKyBrWzZdICsgNzYwMjkxODkgfCAwO1xuICAgICAgICBiICA9IChiIDw8IDIzIHwgYiA+Pj4gOSkgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYiBeIGMgXiBkKSArIGtbOV0gLSA2NDAzNjQ0ODcgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDQgfCBhID4+PiAyOCkgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYSBeIGIgXiBjKSArIGtbMTJdIC0gNDIxODE1ODM1IHwgMDtcbiAgICAgICAgZCAgPSAoZCA8PCAxMSB8IGQgPj4+IDIxKSArIGEgfCAwO1xuICAgICAgICBjICs9IChkIF4gYSBeIGIpICsga1sxNV0gKyA1MzA3NDI1MjAgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE2IHwgYyA+Pj4gMTYpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGMgXiBkIF4gYSkgKyBrWzJdIC0gOTk1MzM4NjUxIHwgMDtcbiAgICAgICAgYiAgPSAoYiA8PCAyMyB8IGIgPj4+IDkpICsgYyB8IDA7XG5cbiAgICAgICAgYSArPSAoYyBeIChiIHwgfmQpKSArIGtbMF0gLSAxOTg2MzA4NDQgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDYgfCBhID4+PiAyNikgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYiBeIChhIHwgfmMpKSArIGtbN10gKyAxMTI2ODkxNDE1IHwgMDtcbiAgICAgICAgZCAgPSAoZCA8PCAxMCB8IGQgPj4+IDIyKSArIGEgfCAwO1xuICAgICAgICBjICs9IChhIF4gKGQgfCB+YikpICsga1sxNF0gLSAxNDE2MzU0OTA1IHwgMDtcbiAgICAgICAgYyAgPSAoYyA8PCAxNSB8IGMgPj4+IDE3KSArIGQgfCAwO1xuICAgICAgICBiICs9IChkIF4gKGMgfCB+YSkpICsga1s1XSAtIDU3NDM0MDU1IHwgMDtcbiAgICAgICAgYiAgPSAoYiA8PCAyMSB8YiA+Pj4gMTEpICsgYyB8IDA7XG4gICAgICAgIGEgKz0gKGMgXiAoYiB8IH5kKSkgKyBrWzEyXSArIDE3MDA0ODU1NzEgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDYgfCBhID4+PiAyNikgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYiBeIChhIHwgfmMpKSArIGtbM10gLSAxODk0OTg2NjA2IHwgMDtcbiAgICAgICAgZCAgPSAoZCA8PCAxMCB8IGQgPj4+IDIyKSArIGEgfCAwO1xuICAgICAgICBjICs9IChhIF4gKGQgfCB+YikpICsga1sxMF0gLSAxMDUxNTIzIHwgMDtcbiAgICAgICAgYyAgPSAoYyA8PCAxNSB8IGMgPj4+IDE3KSArIGQgfCAwO1xuICAgICAgICBiICs9IChkIF4gKGMgfCB+YSkpICsga1sxXSAtIDIwNTQ5MjI3OTkgfCAwO1xuICAgICAgICBiICA9IChiIDw8IDIxIHxiID4+PiAxMSkgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYyBeIChiIHwgfmQpKSArIGtbOF0gKyAxODczMzEzMzU5IHwgMDtcbiAgICAgICAgYSAgPSAoYSA8PCA2IHwgYSA+Pj4gMjYpICsgYiB8IDA7XG4gICAgICAgIGQgKz0gKGIgXiAoYSB8IH5jKSkgKyBrWzE1XSAtIDMwNjExNzQ0IHwgMDtcbiAgICAgICAgZCAgPSAoZCA8PCAxMCB8IGQgPj4+IDIyKSArIGEgfCAwO1xuICAgICAgICBjICs9IChhIF4gKGQgfCB+YikpICsga1s2XSAtIDE1NjAxOTgzODAgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE1IHwgYyA+Pj4gMTcpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGQgXiAoYyB8IH5hKSkgKyBrWzEzXSArIDEzMDkxNTE2NDkgfCAwO1xuICAgICAgICBiICA9IChiIDw8IDIxIHxiID4+PiAxMSkgKyBjIHwgMDtcbiAgICAgICAgYSArPSAoYyBeIChiIHwgfmQpKSArIGtbNF0gLSAxNDU1MjMwNzAgfCAwO1xuICAgICAgICBhICA9IChhIDw8IDYgfCBhID4+PiAyNikgKyBiIHwgMDtcbiAgICAgICAgZCArPSAoYiBeIChhIHwgfmMpKSArIGtbMTFdIC0gMTEyMDIxMDM3OSB8IDA7XG4gICAgICAgIGQgID0gKGQgPDwgMTAgfCBkID4+PiAyMikgKyBhIHwgMDtcbiAgICAgICAgYyArPSAoYSBeIChkIHwgfmIpKSArIGtbMl0gKyA3MTg3ODcyNTkgfCAwO1xuICAgICAgICBjICA9IChjIDw8IDE1IHwgYyA+Pj4gMTcpICsgZCB8IDA7XG4gICAgICAgIGIgKz0gKGQgXiAoYyB8IH5hKSkgKyBrWzldIC0gMzQzNDg1NTUxIHwgMDtcbiAgICAgICAgYiAgPSAoYiA8PCAyMSB8IGIgPj4+IDExKSArIGMgfCAwO1xuXG4gICAgICAgIHhbMF0gPSBhICsgeFswXSB8IDA7XG4gICAgICAgIHhbMV0gPSBiICsgeFsxXSB8IDA7XG4gICAgICAgIHhbMl0gPSBjICsgeFsyXSB8IDA7XG4gICAgICAgIHhbM10gPSBkICsgeFszXSB8IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWQ1YmxrKHMpIHtcbiAgICAgICAgdmFyIG1kNWJsa3MgPSBbXSxcbiAgICAgICAgICAgIGk7IC8qIEFuZHkgS2luZyBzYWlkIGRvIGl0IHRoaXMgd2F5LiAqL1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2NDsgaSArPSA0KSB7XG4gICAgICAgICAgICBtZDVibGtzW2kgPj4gMl0gPSBzLmNoYXJDb2RlQXQoaSkgKyAocy5jaGFyQ29kZUF0KGkgKyAxKSA8PCA4KSArIChzLmNoYXJDb2RlQXQoaSArIDIpIDw8IDE2KSArIChzLmNoYXJDb2RlQXQoaSArIDMpIDw8IDI0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWQ1YmxrcztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtZDVibGtfYXJyYXkoYSkge1xuICAgICAgICB2YXIgbWQ1YmxrcyA9IFtdLFxuICAgICAgICAgICAgaTsgLyogQW5keSBLaW5nIHNhaWQgZG8gaXQgdGhpcyB3YXkuICovXG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY0OyBpICs9IDQpIHtcbiAgICAgICAgICAgIG1kNWJsa3NbaSA+PiAyXSA9IGFbaV0gKyAoYVtpICsgMV0gPDwgOCkgKyAoYVtpICsgMl0gPDwgMTYpICsgKGFbaSArIDNdIDw8IDI0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWQ1YmxrcztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtZDUxKHMpIHtcbiAgICAgICAgdmFyIG4gPSBzLmxlbmd0aCxcbiAgICAgICAgICAgIHN0YXRlID0gWzE3MzI1ODQxOTMsIC0yNzE3MzM4NzksIC0xNzMyNTg0MTk0LCAyNzE3MzM4NzhdLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIGxlbmd0aCxcbiAgICAgICAgICAgIHRhaWwsXG4gICAgICAgICAgICB0bXAsXG4gICAgICAgICAgICBsbyxcbiAgICAgICAgICAgIGhpO1xuXG4gICAgICAgIGZvciAoaSA9IDY0OyBpIDw9IG47IGkgKz0gNjQpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHN0YXRlLCBtZDVibGsocy5zdWJzdHJpbmcoaSAtIDY0LCBpKSkpO1xuICAgICAgICB9XG4gICAgICAgIHMgPSBzLnN1YnN0cmluZyhpIC0gNjQpO1xuICAgICAgICBsZW5ndGggPSBzLmxlbmd0aDtcbiAgICAgICAgdGFpbCA9IFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB0YWlsW2kgPj4gMl0gfD0gcy5jaGFyQ29kZUF0KGkpIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICB9XG4gICAgICAgIHRhaWxbaSA+PiAyXSB8PSAweDgwIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICBpZiAoaSA+IDU1KSB7XG4gICAgICAgICAgICBtZDVjeWNsZShzdGF0ZSwgdGFpbCk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgMTY7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgIHRhaWxbaV0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQmV3YXJlIHRoYXQgdGhlIGZpbmFsIGxlbmd0aCBtaWdodCBub3QgZml0IGluIDMyIGJpdHMgc28gd2UgdGFrZSBjYXJlIG9mIHRoYXRcbiAgICAgICAgdG1wID0gbiAqIDg7XG4gICAgICAgIHRtcCA9IHRtcC50b1N0cmluZygxNikubWF0Y2goLyguKj8pKC57MCw4fSkkLyk7XG4gICAgICAgIGxvID0gcGFyc2VJbnQodG1wWzJdLCAxNik7XG4gICAgICAgIGhpID0gcGFyc2VJbnQodG1wWzFdLCAxNikgfHwgMDtcblxuICAgICAgICB0YWlsWzE0XSA9IGxvO1xuICAgICAgICB0YWlsWzE1XSA9IGhpO1xuXG4gICAgICAgIG1kNWN5Y2xlKHN0YXRlLCB0YWlsKTtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1kNTFfYXJyYXkoYSkge1xuICAgICAgICB2YXIgbiA9IGEubGVuZ3RoLFxuICAgICAgICAgICAgc3RhdGUgPSBbMTczMjU4NDE5MywgLTI3MTczMzg3OSwgLTE3MzI1ODQxOTQsIDI3MTczMzg3OF0sXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgbGVuZ3RoLFxuICAgICAgICAgICAgdGFpbCxcbiAgICAgICAgICAgIHRtcCxcbiAgICAgICAgICAgIGxvLFxuICAgICAgICAgICAgaGk7XG5cbiAgICAgICAgZm9yIChpID0gNjQ7IGkgPD0gbjsgaSArPSA2NCkge1xuICAgICAgICAgICAgbWQ1Y3ljbGUoc3RhdGUsIG1kNWJsa19hcnJheShhLnN1YmFycmF5KGkgLSA2NCwgaSkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5vdCBzdXJlIGlmIGl0IGlzIGEgYnVnLCBob3dldmVyIElFMTAgd2lsbCBhbHdheXMgcHJvZHVjZSBhIHN1YiBhcnJheSBvZiBsZW5ndGggMVxuICAgICAgICAvLyBjb250YWluaW5nIHRoZSBsYXN0IGVsZW1lbnQgb2YgdGhlIHBhcmVudCBhcnJheSBpZiB0aGUgc3ViIGFycmF5IHNwZWNpZmllZCBzdGFydHNcbiAgICAgICAgLy8gYmV5b25kIHRoZSBsZW5ndGggb2YgdGhlIHBhcmVudCBhcnJheSAtIHdlaXJkLlxuICAgICAgICAvLyBodHRwczovL2Nvbm5lY3QubWljcm9zb2Z0LmNvbS9JRS9mZWVkYmFjay9kZXRhaWxzLzc3MTQ1Mi90eXBlZC1hcnJheS1zdWJhcnJheS1pc3N1ZVxuICAgICAgICBhID0gKGkgLSA2NCkgPCBuID8gYS5zdWJhcnJheShpIC0gNjQpIDogbmV3IFVpbnQ4QXJyYXkoMCk7XG5cbiAgICAgICAgbGVuZ3RoID0gYS5sZW5ndGg7XG4gICAgICAgIHRhaWwgPSBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF07XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgdGFpbFtpID4+IDJdIHw9IGFbaV0gPDwgKChpICUgNCkgPDwgMyk7XG4gICAgICAgIH1cblxuICAgICAgICB0YWlsW2kgPj4gMl0gfD0gMHg4MCA8PCAoKGkgJSA0KSA8PCAzKTtcbiAgICAgICAgaWYgKGkgPiA1NSkge1xuICAgICAgICAgICAgbWQ1Y3ljbGUoc3RhdGUsIHRhaWwpO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDE2OyBpICs9IDEpIHtcbiAgICAgICAgICAgICAgICB0YWlsW2ldID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJld2FyZSB0aGF0IHRoZSBmaW5hbCBsZW5ndGggbWlnaHQgbm90IGZpdCBpbiAzMiBiaXRzIHNvIHdlIHRha2UgY2FyZSBvZiB0aGF0XG4gICAgICAgIHRtcCA9IG4gKiA4O1xuICAgICAgICB0bXAgPSB0bXAudG9TdHJpbmcoMTYpLm1hdGNoKC8oLio/KSguezAsOH0pJC8pO1xuICAgICAgICBsbyA9IHBhcnNlSW50KHRtcFsyXSwgMTYpO1xuICAgICAgICBoaSA9IHBhcnNlSW50KHRtcFsxXSwgMTYpIHx8IDA7XG5cbiAgICAgICAgdGFpbFsxNF0gPSBsbztcbiAgICAgICAgdGFpbFsxNV0gPSBoaTtcblxuICAgICAgICBtZDVjeWNsZShzdGF0ZSwgdGFpbCk7XG5cbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJoZXgobikge1xuICAgICAgICB2YXIgcyA9ICcnLFxuICAgICAgICAgICAgajtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IDQ7IGogKz0gMSkge1xuICAgICAgICAgICAgcyArPSBoZXhfY2hyWyhuID4+IChqICogOCArIDQpKSAmIDB4MEZdICsgaGV4X2NoclsobiA+PiAoaiAqIDgpKSAmIDB4MEZdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhleCh4KSB7XG4gICAgICAgIHZhciBpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgeC5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgeFtpXSA9IHJoZXgoeFtpXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHguam9pbignJyk7XG4gICAgfVxuXG4gICAgLy8gSW4gc29tZSBjYXNlcyB0aGUgZmFzdCBhZGQzMiBmdW5jdGlvbiBjYW5ub3QgYmUgdXNlZC4uXG4gICAgaWYgKGhleChtZDUxKCdoZWxsbycpKSAhPT0gJzVkNDE0MDJhYmM0YjJhNzZiOTcxOWQ5MTEwMTdjNTkyJykge1xuICAgICAgICBhZGQzMiA9IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgICAgICB2YXIgbHN3ID0gKHggJiAweEZGRkYpICsgKHkgJiAweEZGRkYpLFxuICAgICAgICAgICAgICAgIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xuICAgICAgICAgICAgcmV0dXJuIChtc3cgPDwgMTYpIHwgKGxzdyAmIDB4RkZGRik7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBBcnJheUJ1ZmZlciBzbGljZSBwb2x5ZmlsbC5cbiAgICAgKlxuICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL3R0YXViZXJ0L25vZGUtYXJyYXlidWZmZXItc2xpY2VcbiAgICAgKi9cblxuICAgIGlmICh0eXBlb2YgQXJyYXlCdWZmZXIgIT09ICd1bmRlZmluZWQnICYmICFBcnJheUJ1ZmZlci5wcm90b3R5cGUuc2xpY2UpIHtcbiAgICAgICAgKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNsYW1wKHZhbCwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdmFsID0gKHZhbCB8IDApIHx8IDA7XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgodmFsICsgbGVuZ3RoLCAwKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5taW4odmFsLCBsZW5ndGgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBBcnJheUJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoZnJvbSwgdG8pIHtcbiAgICAgICAgICAgICAgICB2YXIgbGVuZ3RoID0gdGhpcy5ieXRlTGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBiZWdpbiA9IGNsYW1wKGZyb20sIGxlbmd0aCksXG4gICAgICAgICAgICAgICAgICAgIGVuZCA9IGxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbnVtLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEFycmF5LFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VBcnJheTtcblxuICAgICAgICAgICAgICAgIGlmICh0byAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGVuZCA9IGNsYW1wKHRvLCBsZW5ndGgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChiZWdpbiA+IGVuZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKDApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG51bSA9IGVuZCAtIGJlZ2luO1xuICAgICAgICAgICAgICAgIHRhcmdldCA9IG5ldyBBcnJheUJ1ZmZlcihudW0pO1xuICAgICAgICAgICAgICAgIHRhcmdldEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkodGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgIHNvdXJjZUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkodGhpcywgYmVnaW4sIG51bSk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0QXJyYXkuc2V0KHNvdXJjZUFycmF5KTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KSgpO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogSGVscGVycy5cbiAgICAgKi9cblxuICAgIGZ1bmN0aW9uIHRvVXRmOChzdHIpIHtcbiAgICAgICAgaWYgKC9bXFx1MDA4MC1cXHVGRkZGXS8udGVzdChzdHIpKSB7XG4gICAgICAgICAgICBzdHIgPSB1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoc3RyKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc3RyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHV0ZjhTdHIyQXJyYXlCdWZmZXIoc3RyLCByZXR1cm5VSW50OEFycmF5KSB7XG4gICAgICAgIHZhciBsZW5ndGggPSBzdHIubGVuZ3RoLFxuICAgICAgICAgICBidWZmID0gbmV3IEFycmF5QnVmZmVyKGxlbmd0aCksXG4gICAgICAgICAgIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZmYpLFxuICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgYXJyW2ldID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmV0dXJuVUludDhBcnJheSA/IGFyciA6IGJ1ZmY7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXJyYXlCdWZmZXIyVXRmOFN0cihidWZmKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIG5ldyBVaW50OEFycmF5KGJ1ZmYpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb25jYXRlbmF0ZUFycmF5QnVmZmVycyhmaXJzdCwgc2Vjb25kLCByZXR1cm5VSW50OEFycmF5KSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgVWludDhBcnJheShmaXJzdC5ieXRlTGVuZ3RoICsgc2Vjb25kLmJ5dGVMZW5ndGgpO1xuXG4gICAgICAgIHJlc3VsdC5zZXQobmV3IFVpbnQ4QXJyYXkoZmlyc3QpKTtcbiAgICAgICAgcmVzdWx0LnNldChuZXcgVWludDhBcnJheShzZWNvbmQpLCBmaXJzdC5ieXRlTGVuZ3RoKTtcblxuICAgICAgICByZXR1cm4gcmV0dXJuVUludDhBcnJheSA/IHJlc3VsdCA6IHJlc3VsdC5idWZmZXI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGV4VG9CaW5hcnlTdHJpbmcoaGV4KSB7XG4gICAgICAgIHZhciBieXRlcyA9IFtdLFxuICAgICAgICAgICAgbGVuZ3RoID0gaGV4Lmxlbmd0aCxcbiAgICAgICAgICAgIHg7XG5cbiAgICAgICAgZm9yICh4ID0gMDsgeCA8IGxlbmd0aCAtIDE7IHggKz0gMikge1xuICAgICAgICAgICAgYnl0ZXMucHVzaChwYXJzZUludChoZXguc3Vic3RyKHgsIDIpLCAxNikpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkoU3RyaW5nLCBieXRlcyk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBTcGFya01ENSBPT1AgaW1wbGVtZW50YXRpb24uXG4gICAgICpcbiAgICAgKiBVc2UgdGhpcyBjbGFzcyB0byBwZXJmb3JtIGFuIGluY3JlbWVudGFsIG1kNSwgb3RoZXJ3aXNlIHVzZSB0aGVcbiAgICAgKiBzdGF0aWMgbWV0aG9kcyBpbnN0ZWFkLlxuICAgICAqL1xuXG4gICAgZnVuY3Rpb24gU3BhcmtNRDUoKSB7XG4gICAgICAgIC8vIGNhbGwgcmVzZXQgdG8gaW5pdCB0aGUgaW5zdGFuY2VcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFwcGVuZHMgYSBzdHJpbmcuXG4gICAgICogQSBjb252ZXJzaW9uIHdpbGwgYmUgYXBwbGllZCBpZiBhbiB1dGY4IHN0cmluZyBpcyBkZXRlY3RlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBiZSBhcHBlbmRlZFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3BhcmtNRDV9IFRoZSBpbnN0YW5jZSBpdHNlbGZcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24gKHN0cikge1xuICAgICAgICAvLyBDb252ZXJ0cyB0aGUgc3RyaW5nIHRvIHV0ZjggYnl0ZXMgaWYgbmVjZXNzYXJ5XG4gICAgICAgIC8vIFRoZW4gYXBwZW5kIGFzIGJpbmFyeVxuICAgICAgICB0aGlzLmFwcGVuZEJpbmFyeSh0b1V0Zjgoc3RyKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEFwcGVuZHMgYSBiaW5hcnkgc3RyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNvbnRlbnRzIFRoZSBiaW5hcnkgc3RyaW5nIHRvIGJlIGFwcGVuZGVkXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTcGFya01ENX0gVGhlIGluc3RhbmNlIGl0c2VsZlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5hcHBlbmRCaW5hcnkgPSBmdW5jdGlvbiAoY29udGVudHMpIHtcbiAgICAgICAgdGhpcy5fYnVmZiArPSBjb250ZW50cztcbiAgICAgICAgdGhpcy5fbGVuZ3RoICs9IGNvbnRlbnRzLmxlbmd0aDtcblxuICAgICAgICB2YXIgbGVuZ3RoID0gdGhpcy5fYnVmZi5sZW5ndGgsXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoaSA9IDY0OyBpIDw9IGxlbmd0aDsgaSArPSA2NCkge1xuICAgICAgICAgICAgbWQ1Y3ljbGUodGhpcy5faGFzaCwgbWQ1YmxrKHRoaXMuX2J1ZmYuc3Vic3RyaW5nKGkgLSA2NCwgaSkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2J1ZmYgPSB0aGlzLl9idWZmLnN1YnN0cmluZyhpIC0gNjQpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBGaW5pc2hlcyB0aGUgaW5jcmVtZW50YWwgY29tcHV0YXRpb24sIHJlc2V0aW5nIHRoZSBpbnRlcm5hbCBzdGF0ZSBhbmRcbiAgICAgKiByZXR1cm5pbmcgdGhlIHJlc3VsdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmF3IFRydWUgdG8gZ2V0IHRoZSByYXcgc3RyaW5nLCBmYWxzZSB0byBnZXQgdGhlIGhleCBzdHJpbmdcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbiAocmF3KSB7XG4gICAgICAgIHZhciBidWZmID0gdGhpcy5fYnVmZixcbiAgICAgICAgICAgIGxlbmd0aCA9IGJ1ZmYubGVuZ3RoLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHRhaWwgPSBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF0sXG4gICAgICAgICAgICByZXQ7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB0YWlsW2kgPj4gMl0gfD0gYnVmZi5jaGFyQ29kZUF0KGkpIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZmluaXNoKHRhaWwsIGxlbmd0aCk7XG4gICAgICAgIHJldCA9IGhleCh0aGlzLl9oYXNoKTtcblxuICAgICAgICBpZiAocmF3KSB7XG4gICAgICAgICAgICByZXQgPSBoZXhUb0JpbmFyeVN0cmluZyhyZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZXNldCgpO1xuXG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJlc2V0cyB0aGUgaW50ZXJuYWwgc3RhdGUgb2YgdGhlIGNvbXB1dGF0aW9uLlxuICAgICAqXG4gICAgICogQHJldHVybiB7U3BhcmtNRDV9IFRoZSBpbnN0YW5jZSBpdHNlbGZcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2J1ZmYgPSAnJztcbiAgICAgICAgdGhpcy5fbGVuZ3RoID0gMDtcbiAgICAgICAgdGhpcy5faGFzaCA9IFsxNzMyNTg0MTkzLCAtMjcxNzMzODc5LCAtMTczMjU4NDE5NCwgMjcxNzMzODc4XTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgaW50ZXJuYWwgc3RhdGUgb2YgdGhlIGNvbXB1dGF0aW9uLlxuICAgICAqXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgc3RhdGVcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuZ2V0U3RhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBidWZmOiB0aGlzLl9idWZmLFxuICAgICAgICAgICAgbGVuZ3RoOiB0aGlzLl9sZW5ndGgsXG4gICAgICAgICAgICBoYXNoOiB0aGlzLl9oYXNoLnNsaWNlKClcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgaW50ZXJuYWwgc3RhdGUgb2YgdGhlIGNvbXB1dGF0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlIFRoZSBzdGF0ZVxuICAgICAqXG4gICAgICogQHJldHVybiB7U3BhcmtNRDV9IFRoZSBpbnN0YW5jZSBpdHNlbGZcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuc2V0U3RhdGUgPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgdGhpcy5fYnVmZiA9IHN0YXRlLmJ1ZmY7XG4gICAgICAgIHRoaXMuX2xlbmd0aCA9IHN0YXRlLmxlbmd0aDtcbiAgICAgICAgdGhpcy5faGFzaCA9IHN0YXRlLmhhc2g7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJlbGVhc2VzIG1lbW9yeSB1c2VkIGJ5IHRoZSBpbmNyZW1lbnRhbCBidWZmZXIgYW5kIG90aGVyIGFkZGl0aW9uYWxcbiAgICAgKiByZXNvdXJjZXMuIElmIHlvdSBwbGFuIHRvIHVzZSB0aGUgaW5zdGFuY2UgYWdhaW4sIHVzZSByZXNldCBpbnN0ZWFkLlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBkZWxldGUgdGhpcy5faGFzaDtcbiAgICAgICAgZGVsZXRlIHRoaXMuX2J1ZmY7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9sZW5ndGg7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEZpbmlzaCB0aGUgZmluYWwgY2FsY3VsYXRpb24gYmFzZWQgb24gdGhlIHRhaWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fSAgdGFpbCAgIFRoZSB0YWlsICh3aWxsIGJlIG1vZGlmaWVkKVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsZW5ndGggVGhlIGxlbmd0aCBvZiB0aGUgcmVtYWluaW5nIGJ1ZmZlclxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5fZmluaXNoID0gZnVuY3Rpb24gKHRhaWwsIGxlbmd0aCkge1xuICAgICAgICB2YXIgaSA9IGxlbmd0aCxcbiAgICAgICAgICAgIHRtcCxcbiAgICAgICAgICAgIGxvLFxuICAgICAgICAgICAgaGk7XG5cbiAgICAgICAgdGFpbFtpID4+IDJdIHw9IDB4ODAgPDwgKChpICUgNCkgPDwgMyk7XG4gICAgICAgIGlmIChpID4gNTUpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHRoaXMuX2hhc2gsIHRhaWwpO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDE2OyBpICs9IDEpIHtcbiAgICAgICAgICAgICAgICB0YWlsW2ldID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERvIHRoZSBmaW5hbCBjb21wdXRhdGlvbiBiYXNlZCBvbiB0aGUgdGFpbCBhbmQgbGVuZ3RoXG4gICAgICAgIC8vIEJld2FyZSB0aGF0IHRoZSBmaW5hbCBsZW5ndGggbWF5IG5vdCBmaXQgaW4gMzIgYml0cyBzbyB3ZSB0YWtlIGNhcmUgb2YgdGhhdFxuICAgICAgICB0bXAgPSB0aGlzLl9sZW5ndGggKiA4O1xuICAgICAgICB0bXAgPSB0bXAudG9TdHJpbmcoMTYpLm1hdGNoKC8oLio/KSguezAsOH0pJC8pO1xuICAgICAgICBsbyA9IHBhcnNlSW50KHRtcFsyXSwgMTYpO1xuICAgICAgICBoaSA9IHBhcnNlSW50KHRtcFsxXSwgMTYpIHx8IDA7XG5cbiAgICAgICAgdGFpbFsxNF0gPSBsbztcbiAgICAgICAgdGFpbFsxNV0gPSBoaTtcbiAgICAgICAgbWQ1Y3ljbGUodGhpcy5faGFzaCwgdGFpbCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIHRoZSBtZDUgaGFzaCBvbiBhIHN0cmluZy5cbiAgICAgKiBBIGNvbnZlcnNpb24gd2lsbCBiZSBhcHBsaWVkIGlmIHV0Zjggc3RyaW5nIGlzIGRldGVjdGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9ICBzdHIgVGhlIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3Jhd10gVHJ1ZSB0byBnZXQgdGhlIHJhdyBzdHJpbmcsIGZhbHNlIHRvIGdldCB0aGUgaGV4IHN0cmluZ1xuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgcmVzdWx0XG4gICAgICovXG4gICAgU3BhcmtNRDUuaGFzaCA9IGZ1bmN0aW9uIChzdHIsIHJhdykge1xuICAgICAgICAvLyBDb252ZXJ0cyB0aGUgc3RyaW5nIHRvIHV0ZjggYnl0ZXMgaWYgbmVjZXNzYXJ5XG4gICAgICAgIC8vIFRoZW4gY29tcHV0ZSBpdCB1c2luZyB0aGUgYmluYXJ5IGZ1bmN0aW9uXG4gICAgICAgIHJldHVybiBTcGFya01ENS5oYXNoQmluYXJ5KHRvVXRmOChzdHIpLCByYXcpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyB0aGUgbWQ1IGhhc2ggb24gYSBiaW5hcnkgc3RyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9ICBjb250ZW50IFRoZSBiaW5hcnkgc3RyaW5nXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBbcmF3XSAgICAgVHJ1ZSB0byBnZXQgdGhlIHJhdyBzdHJpbmcsIGZhbHNlIHRvIGdldCB0aGUgaGV4IHN0cmluZ1xuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgcmVzdWx0XG4gICAgICovXG4gICAgU3BhcmtNRDUuaGFzaEJpbmFyeSA9IGZ1bmN0aW9uIChjb250ZW50LCByYXcpIHtcbiAgICAgICAgdmFyIGhhc2ggPSBtZDUxKGNvbnRlbnQpLFxuICAgICAgICAgICAgcmV0ID0gaGV4KGhhc2gpO1xuXG4gICAgICAgIHJldHVybiByYXcgPyBoZXhUb0JpbmFyeVN0cmluZyhyZXQpIDogcmV0O1xuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8qKlxuICAgICAqIFNwYXJrTUQ1IE9PUCBpbXBsZW1lbnRhdGlvbiBmb3IgYXJyYXkgYnVmZmVycy5cbiAgICAgKlxuICAgICAqIFVzZSB0aGlzIGNsYXNzIHRvIHBlcmZvcm0gYW4gaW5jcmVtZW50YWwgbWQ1IE9OTFkgZm9yIGFycmF5IGJ1ZmZlcnMuXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGNhbGwgcmVzZXQgdG8gaW5pdCB0aGUgaW5zdGFuY2VcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmRzIGFuIGFycmF5IGJ1ZmZlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFyciBUaGUgYXJyYXkgdG8gYmUgYXBwZW5kZWRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1NwYXJrTUQ1LkFycmF5QnVmZmVyfSBUaGUgaW5zdGFuY2UgaXRzZWxmXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgICAgICAgdmFyIGJ1ZmYgPSBjb25jYXRlbmF0ZUFycmF5QnVmZmVycyh0aGlzLl9idWZmLmJ1ZmZlciwgYXJyLCB0cnVlKSxcbiAgICAgICAgICAgIGxlbmd0aCA9IGJ1ZmYubGVuZ3RoLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICB0aGlzLl9sZW5ndGggKz0gYXJyLmJ5dGVMZW5ndGg7XG5cbiAgICAgICAgZm9yIChpID0gNjQ7IGkgPD0gbGVuZ3RoOyBpICs9IDY0KSB7XG4gICAgICAgICAgICBtZDVjeWNsZSh0aGlzLl9oYXNoLCBtZDVibGtfYXJyYXkoYnVmZi5zdWJhcnJheShpIC0gNjQsIGkpKSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9idWZmID0gKGkgLSA2NCkgPCBsZW5ndGggPyBuZXcgVWludDhBcnJheShidWZmLmJ1ZmZlci5zbGljZShpIC0gNjQpKSA6IG5ldyBVaW50OEFycmF5KDApO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBGaW5pc2hlcyB0aGUgaW5jcmVtZW50YWwgY29tcHV0YXRpb24sIHJlc2V0aW5nIHRoZSBpbnRlcm5hbCBzdGF0ZSBhbmRcbiAgICAgKiByZXR1cm5pbmcgdGhlIHJlc3VsdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmF3IFRydWUgdG8gZ2V0IHRoZSByYXcgc3RyaW5nLCBmYWxzZSB0byBnZXQgdGhlIGhleCBzdHJpbmdcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbiAocmF3KSB7XG4gICAgICAgIHZhciBidWZmID0gdGhpcy5fYnVmZixcbiAgICAgICAgICAgIGxlbmd0aCA9IGJ1ZmYubGVuZ3RoLFxuICAgICAgICAgICAgdGFpbCA9IFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXSxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICByZXQ7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB0YWlsW2kgPj4gMl0gfD0gYnVmZltpXSA8PCAoKGkgJSA0KSA8PCAzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2ZpbmlzaCh0YWlsLCBsZW5ndGgpO1xuICAgICAgICByZXQgPSBoZXgodGhpcy5faGFzaCk7XG5cbiAgICAgICAgaWYgKHJhdykge1xuICAgICAgICAgICAgcmV0ID0gaGV4VG9CaW5hcnlTdHJpbmcocmV0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucmVzZXQoKTtcblxuICAgICAgICByZXR1cm4gcmV0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZXNldHMgdGhlIGludGVybmFsIHN0YXRlIG9mIHRoZSBjb21wdXRhdGlvbi5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1NwYXJrTUQ1LkFycmF5QnVmZmVyfSBUaGUgaW5zdGFuY2UgaXRzZWxmXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLl9idWZmID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgICAgIHRoaXMuX2xlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuX2hhc2ggPSBbMTczMjU4NDE5MywgLTI3MTczMzg3OSwgLTE3MzI1ODQxOTQsIDI3MTczMzg3OF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGludGVybmFsIHN0YXRlIG9mIHRoZSBjb21wdXRhdGlvbi5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIHN0YXRlXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLmdldFN0YXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc3RhdGUgPSBTcGFya01ENS5wcm90b3R5cGUuZ2V0U3RhdGUuY2FsbCh0aGlzKTtcblxuICAgICAgICAvLyBDb252ZXJ0IGJ1ZmZlciB0byBhIHN0cmluZ1xuICAgICAgICBzdGF0ZS5idWZmID0gYXJyYXlCdWZmZXIyVXRmOFN0cihzdGF0ZS5idWZmKTtcblxuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGludGVybmFsIHN0YXRlIG9mIHRoZSBjb21wdXRhdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZSBUaGUgc3RhdGVcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1NwYXJrTUQ1LkFycmF5QnVmZmVyfSBUaGUgaW5zdGFuY2UgaXRzZWxmXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLnNldFN0YXRlID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIC8vIENvbnZlcnQgc3RyaW5nIHRvIGJ1ZmZlclxuICAgICAgICBzdGF0ZS5idWZmID0gdXRmOFN0cjJBcnJheUJ1ZmZlcihzdGF0ZS5idWZmLCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gU3BhcmtNRDUucHJvdG90eXBlLnNldFN0YXRlLmNhbGwodGhpcywgc3RhdGUpO1xuICAgIH07XG5cbiAgICBTcGFya01ENS5BcnJheUJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IFNwYXJrTUQ1LnByb3RvdHlwZS5kZXN0cm95O1xuXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLl9maW5pc2ggPSBTcGFya01ENS5wcm90b3R5cGUuX2ZpbmlzaDtcblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIHRoZSBtZDUgaGFzaCBvbiBhbiBhcnJheSBidWZmZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfSBhcnIgVGhlIGFycmF5IGJ1ZmZlclxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gICAgIFtyYXddIFRydWUgdG8gZ2V0IHRoZSByYXcgc3RyaW5nLCBmYWxzZSB0byBnZXQgdGhlIGhleCBvbmVcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLmhhc2ggPSBmdW5jdGlvbiAoYXJyLCByYXcpIHtcbiAgICAgICAgdmFyIGhhc2ggPSBtZDUxX2FycmF5KG5ldyBVaW50OEFycmF5KGFycikpLFxuICAgICAgICAgICAgcmV0ID0gaGV4KGhhc2gpO1xuXG4gICAgICAgIHJldHVybiByYXcgPyBoZXhUb0JpbmFyeVN0cmluZyhyZXQpIDogcmV0O1xuICAgIH07XG5cbiAgICByZXR1cm4gU3BhcmtNRDU7XG59KSk7XG4iLCAiLyoqXHJcbiAqIFx1OTAxQVx1NzUyOFx1N0M3Qlx1NTc4Qlx1NTMxNlx1NEU4Qlx1NEVGNlx1NTNEMVx1NUMwNFx1NTY2OFx1RkYwOFx1NEY5QiB1c2VjYXNlcyAvIGFkYXB0ZXJzIFx1NTE4NVx1OTBFOFx1NEY3Rlx1NzUyOFx1RkYwOVx1MzAwMlxyXG4gKiBcdTk4ODZcdTU3REZcdTVDNDJcdTk2RjZcdTRGOURcdThENTZcdUZGMUFcdThGRDlcdTY2MkZcdTRFMDBcdTRFMkFcdTgxRUFcdTU0MkJcdTc2ODRcdTdFQUYgVFMgXHU1REU1XHU1MTc3XHUzMDAyXHJcbiAqL1xyXG5pbXBvcnQgdHlwZSB7IExpc3RlbmVyIH0gZnJvbSAnLi9ldmVudHMnXHJcblxyXG5leHBvcnQgY2xhc3MgVHlwZWRFbWl0dGVyPEV2ZW50cyBleHRlbmRzIHsgW0sgaW4ga2V5b2YgRXZlbnRzXTogTGlzdGVuZXIgfT4ge1xyXG4gIHByaXZhdGUgbGlzdGVuZXJzID0gbmV3IE1hcDxrZXlvZiBFdmVudHMsIFNldDxMaXN0ZW5lcj4+KClcclxuXHJcbiAgb248SyBleHRlbmRzIGtleW9mIEV2ZW50cz4oZXZlbnQ6IEssIGxpc3RlbmVyOiBFdmVudHNbS10pOiAoKSA9PiB2b2lkIHtcclxuICAgIGxldCBzZXQgPSB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnQpXHJcbiAgICBpZiAoIXNldCkge1xyXG4gICAgICBzZXQgPSBuZXcgU2V0KClcclxuICAgICAgdGhpcy5saXN0ZW5lcnMuc2V0KGV2ZW50LCBzZXQpXHJcbiAgICB9XHJcbiAgICBzZXQuYWRkKGxpc3RlbmVyKVxyXG4gICAgcmV0dXJuICgpID0+IHRoaXMub2ZmKGV2ZW50LCBsaXN0ZW5lcilcclxuICB9XHJcblxyXG4gIG9mZjxLIGV4dGVuZHMga2V5b2YgRXZlbnRzPihldmVudDogSywgbGlzdGVuZXI6IEV2ZW50c1tLXSk6IHZvaWQge1xyXG4gICAgdGhpcy5saXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZGVsZXRlKGxpc3RlbmVyKVxyXG4gIH1cclxuXHJcbiAgcHJvdGVjdGVkIGVtaXQ8SyBleHRlbmRzIGtleW9mIEV2ZW50cz4oZXZlbnQ6IEssIC4uLmFyZ3M6IFBhcmFtZXRlcnM8RXZlbnRzW0tdPik6IHZvaWQge1xyXG4gICAgY29uc3Qgc2V0ID0gdGhpcy5saXN0ZW5lcnMuZ2V0KGV2ZW50KVxyXG4gICAgaWYgKCFzZXQpIHJldHVyblxyXG4gICAgZm9yIChjb25zdCBsIG9mIFsuLi5zZXRdKSB7XHJcbiAgICAgIDsobCBhcyBMaXN0ZW5lcikoLi4uYXJncylcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByb3RlY3RlZCByZW1vdmVBbGwoKTogdm9pZCB7XHJcbiAgICB0aGlzLmxpc3RlbmVycy5jbGVhcigpXHJcbiAgfVxyXG59XHJcbiIsICIvKipcclxuICogXHU2NTg3XHU0RUY2XHU2MjY5XHU1QzU1XHU1NDBEIFx1MjE5MiBCb29rRm9ybWF0XHVGRjA4XHU5ODg2XHU1N0RGXHU4QkNEXHU2QzQ3XHU2NjIwXHU1QzA0XHVGRjBDXHU3RUFGXHU1MUZEXHU2NTcwXHVGRjA5XHUzMDAyXHJcbiAqIFx1NEY5RFx1NjM2RVx1RkYxQWNsaWVudC9kb2NzL0NPTlRSQUNUUy5tZCBcdTAwQTcyIEJvb2tGb3JtYXRcdTMwMDJcclxuICpcclxuICogXHU0RTNBXHU0RUMwXHU0RTQ4XHU2NTNFXHU1NzI4XHU5ODg2XHU1N0RGXHU1QzQyXHVGRjFBXHU1QkZDXHU1MTY1XHU3NTI4XHU0RjhCXHVGRjA4SW1wb3J0UXVldWVcdUZGMDlcdTk3MDBcdTg5ODFcdTVCODNcdUZGMENcdTgwMENcdTc1MjhcdTRGOEJcdTRFMERcdTVGOTdcdTRGOURcdThENTYgVUkgXHU1QzQyXHU1REU1XHU1MTc3XHJcbiAqIFx1RkYwOFx1NkI2NFx1NTI0RFx1NTcyOCBgcmVuZGVyZXIvc3JjL2ZlYXR1cmVzL3V0aWwudHNgXHVGRjBDXHU5NjhGXHU1QkZDXHU1MTY1XHU3RjE2XHU2MzkyXHU0RTBCXHU2Qzg5XHU1MjMwIGNvcmUgXHU0RTAwXHU4RDc3XHU2NDJDXHU4RkM3XHU2NzY1XHVGRjA5XHUzMDAyXHJcbiAqL1xyXG5pbXBvcnQgdHlwZSB7IEJvb2tGb3JtYXQgfSBmcm9tICcuL3R5cGVzJ1xyXG5cclxuY29uc3QgRVhUX1RPX0ZPUk1BVDogUmVjb3JkPHN0cmluZywgQm9va0Zvcm1hdD4gPSB7XHJcbiAgZXB1YjogJ0VQVUInLFxyXG4gIHBkZjogJ1BERicsXHJcbiAgbW9iaTogJ01PQkknLFxyXG4gIGF6dzM6ICdBWlczJyxcclxuICBhenc6ICdBWlcnLFxyXG4gIHR4dDogJ1RYVCcsXHJcbiAgbWQ6ICdNRCcsXHJcbiAgZmIyOiAnRkIyJyxcclxuICBkb2N4OiAnRE9DWCcsXHJcbiAgaHRtbDogJ0hUTUwnLFxyXG4gIG1odG1sOiAnTUhUTUwnLFxyXG4gIHhtbDogJ1hNTCcsXHJcbiAgY2J6OiAnQ0JaJyxcclxuICBjYnI6ICdDQlInLFxyXG4gIGNidDogJ0NCVCcsXHJcbiAgY2I3OiAnQ0I3J1xyXG59XHJcblxyXG4vKiogXHU1M0Q2XHU2MjY5XHU1QzU1XHU1NDBEIFx1MjE5MiBCb29rRm9ybWF0XHVGRjFCXHU2NzJBXHU3N0U1XHU2MjY5XHU1QzU1XHU1NDBEXHU1NkRFXHU5MDAwIFRYVFx1RkYwOFx1OEMwM1x1NzUyOFx1NjVCOVx1OEQxRlx1OEQyM1x1OEZDN1x1NkVFNFx1RkYwQ1x1ODlDMSBJQm9va1BpY2tlci5saXN0RWJvb2tzXHVGRjA5ICovXHJcbmV4cG9ydCBmdW5jdGlvbiBleHRUb0Zvcm1hdChuYW1lOiBzdHJpbmcpOiBCb29rRm9ybWF0IHtcclxuICBjb25zdCBleHQgPSBuYW1lLnNwbGl0KCcuJykucG9wKCk/LnRvTG93ZXJDYXNlKCkgPz8gJydcclxuICByZXR1cm4gRVhUX1RPX0ZPUk1BVFtleHRdID8/ICdUWFQnXHJcbn1cclxuXHJcbi8qKiBcdTUzRDZcdThERUZcdTVGODRcdTY3MkJcdTZCQjVcdUZGMDhcdThERThcdTVFNzNcdTUzRjBcdTUyMDZcdTk2OTRcdTdCMjZcdUZGMDlcdTIwMTRcdTIwMTRcdTVCRkNcdTUxNjVcdTc1MjhcdTRGOEJcdTc1MjhcdTVCODNcdTc1MUZcdTYyMTBcdTY2M0VcdTc5M0FcdTU0MEQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGJhc2VuYW1lKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHBhdGguc3BsaXQoL1tcXFxcL10vKS5wb3AoKSA/PyBwYXRoXHJcbn1cclxuIiwgIi8qKlxyXG4gKiBCb29rTG9jYXRpb24gXHU4QkVEXHU0RTQ5XHU2ODA3XHU1MUM2IFx1MjAxNFx1MjAxNCBcdTVCOUFcdTRGNERcdTdDRkJcdTdFREZcdTc2ODRcdTU1MkZcdTRFMDBcdTY3NDNcdTVBMDFcdTVCOUVcdTczQjBcdUZGMDhcdTdFQUZcdTUxRkRcdTY1NzBcdUZGMENcdTk2RjZcdTRGOURcdThENTZcdTk2RjZcdTUyNkZcdTRGNUNcdTc1MjhcdUZGMDlcdTMwMDJcclxuICogXHU1OTUxXHU3RUE2XHVGRjFBY2xpZW50L2RvY3MvQ09OVFJBQ1RTLm1kIFx1MDBBNzIuMVx1RkYxQlx1NUI1N1x1NkJCNVx1OTAwNlx1NTQxMVx1NEY5RFx1NjM2RVx1RkYxQWNsaWVudC9kb2NzL0tPT0tJVC5tZCBcdTAwQTc2XHUzMDAyXHJcbiAqXHJcbiAqIFx1NEUzQVx1NEVDMFx1NEU0OFx1NUI1OFx1NTcyOFx1RkYxQVx1NEY0RFx1N0Y2RVx1NEUwRFx1NTNFQVx1NjYyRlx1N0IxNFx1OEJCMFx1OTcwMFx1ODk4MSBcdTIwMTRcdTIwMTQgXHU2MjNGXHU5NUY0XHU1NDBDXHU2QjY1XHU1NkRFXHU4REYzXHUzMDAxXHU4RkRCXHU1RUE2XHU2NzYxXHUzMDAxbGFzdExvY2F0aW9uIFx1NjA2Mlx1NTkwRFx1MzAwMVxyXG4gKiBcdTVDMDZcdTY3NjVcdTc2ODQgVFRTL1x1OERGM1x1OEY2Q1x1NUYxNVx1NzUyOC9cdTZENEJcdThCRDVcdTY1QURcdThBMDBcdTkwRkRcdTg5ODFcIlx1NkJENFx1OEY4My9cdTVGNTJcdTRFMDAvXHU2MzkyXHU1RThGXHU0RjREXHU3RjZFXCJcdTMwMDJcclxuICogXHU4OUM0XHU1MjE5XHVGRjFBXHUzMDEwXHU0RUZCXHU0RjU1XHU3RUM0XHU0RUY2XHU0RTBEXHU1Rjk3XHU4MUVBXHU4ODRDXHU2QkQ0XHU4RjgzXHU2MjE2XHU4OUUzXHU5MUNBIEJvb2tMb2NhdGlvbiBcdTVCNTdcdTZCQjVcdTMwMTFcdUZGMENcdTRFMDBcdTVGOEJcdThENzBcdTY3MkNcdTZBMjFcdTU3NTdcdTUzOUZcdThCRUQgXHUyMDE0XHUyMDE0XHJcbiAqIFwiXHU1NEVBXHU0RTJBXHU1QjU3XHU2QkI1XHU2NjJGXHU0RTNCXHU5NTJFXHUzMDAxXHU1NEVBXHU0RTJBXHU2NjJGXHU1MTVDXHU1RTk1XCJcdTUzRUFcdTUxNDFcdThCQjhcdThGRDlcdTRFMDBcdTU5MDRcdTVCOUFcdTRFNDlcdTMwMDJcclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IEJvb2tGb3JtYXQsIEJvb2tMb2NhdGlvbiB9IGZyb20gJy4vdHlwZXMnXHJcblxyXG4vKiogXHU1QjU3XHU2QkI1XHU0RTA5XHU3RUE3XHU4OUQyXHU4MjcyXHVGRjA4XHU4QkVEXHU0RTQ5XHVGRjBDXHU0RTBEXHU2NUIwXHU1ODlFXHU1QjU3XHU2QkI1XHVGRjA5XHVGRjFBXHJcbiAqICAtIGtleSAgICBcdTRFM0JcdTk1MkVcdUZGMDhcdTY4M0NcdTVGMEZcdTc2RjhcdTUxNzNcdUZGMENcdTdDQkVcdTc4NkVcdTU2REVcdThERjNcdTdCMkNcdTRFMDBcdTRGOURcdTYzNkVcdUZGMENcdTg5QzEgbG9jYXRpb25LZXlcdUZGMDlcclxuICogIC0gaGludCAgIFx1OTFDRFx1NUI5QVx1NEY0RFx1NTE1Q1x1NUU5NVx1RkYwOFx1NEUzQlx1OTUyRVx1NTZFMFx1NzI0OFx1NjcyQy9cdTdFRDNcdTY3ODRcdTVERUVcdTVGMDJcdTU5MzFcdTY1NDhcdTY1RjZcdTRGN0ZcdTc1MjhcdUZGMDlcdUZGMUF0ZXh0IC8gY2hhcHRlckhyZWYgLyBjaGFwdGVyVGl0bGVcclxuICogIC0gZGlzcGxheSBcdTRFQzVcdTVDNTVcdTc5M0FcdTRFMEVcdTdDOTdcdTdDOTJcdTVFQTZcdTU0MENcdTZCNjVcdUZGMENcdTMwMTBcdTRFMERcdTVGOTdcdTMwMTFcdTRGNUNcdTRFM0FcdTdDQkVcdTc4NkVcdTk1MUFcdTVCOUFcdTRGOURcdTYzNkVcdUZGMUFwZXJjZW50YWdlIC8gY2hhcHRlclRpdGxlXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIFx1OTZGNlx1NEY0RFx1N0Y2RVx1RkYwOFx1NjcyQVx1NkUzMlx1NjdEMy9cdTY3MkFcdTVCRkNcdTgyMkFcdTY1RjYgZ2V0UG9zaXRpb24oKSBcdTc2ODRcdThGRDRcdTU2REVcdUZGMDlcdTUyMjRcdTVCOUFcdTMwMDJcclxuICogXHUyNkEwIFx1NTIyNFx1NjM2RVx1NUZDNVx1OTg3Qlx1NTQyQiBjaGFwdGVySHJlZlx1RkYxQWtvb2tpdCBcdTc2ODRcIlx1NjcyQVx1NkUzMlx1NjdEM1wiXHU2NjJGXHU3QTdBXHU1QkY5XHU4QzYxXHVGRjA4Y2hhcHRlckhyZWYgXHU0RTNBXHU3QTdBXHU0RTMyXHVGRjA5XHVGRjBDXHJcbiAqICAgXHU4MDBDKipcdTk5OTZcdTdBRTBcdTk5OTZcdTU3NTdcdTY2MkZcdTY3MDlcdTY1NDhcdTRGNERcdTdGNkUqKlx1RkYwOGNoYXB0ZXJEb2NJbmRleD0wXHUzMDAxY291bnQ9MFx1RkYwQ1x1NEY0NiBjaGFwdGVySHJlZiBcdTVERjJcdTVDMzFcdTdFRUFcdUZGMDlcdTMwMDJcclxuICogICBcdTY1RTlcdTY3MUZcdTcyNDhcdTY3MkNcdTUzRUFcdTc3MEJcdTY1NzBcdTUwM0NcdTk1MkUgXHUyMTkyIFx1NjI4QVwiXHU3QjJDXHU0RTAwXHU5ODc1XCJcdThCRUZcdTUyMjRcdTRFM0FcdTk2RjZcdTRGNERcdTdGNkVcdUZGMENjb21wYXJlTG9jYXRpb24gXHU4RkQ0XHU1NkRFIG51bGxcdTMwMDFcclxuICogICBhbmNob3JTdHJlbmd0aCBcdThGRDRcdTU2REUgbm9uZVx1RkYwOFx1N0IxNFx1OEJCMC9cdTU0MENcdTZCNjVcdTU2REVcdThERjNcdTRGMUFcdTYyRDJcdTdFRERcdTU2REVcdThERjNcdTUyMzBcdTRFNjZcdTc2ODRcdTVGMDBcdTU5MzRcdUZGMDlcdTMwMDJcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpc1plcm9Mb2NhdGlvbihsb2M6IEJvb2tMb2NhdGlvbiB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcclxuICBpZiAoIWxvYykgcmV0dXJuIHRydWVcclxuICByZXR1cm4gKFxyXG4gICAgdG9Ob25OZWdhdGl2ZUludChsb2MuY2hhcHRlckRvY0luZGV4KSA9PT0gMCAmJlxyXG4gICAgdG9Ob25OZWdhdGl2ZUludChsb2MuY291bnQpID09PSAwICYmXHJcbiAgICB0b05vbk5lZ2F0aXZlSW50KGxvYy5wYWdlKSA9PT0gMCAmJlxyXG4gICAgIWxvYy50ZXh0ICYmXHJcbiAgICAhbG9jLmNoYXB0ZXJIcmVmXHJcbiAgKVxyXG59XHJcblxyXG4vKiogXHU0RjREXHU3RjZFXHU4RjkzXHU1MTY1XHVGRjA4XHU1QkJEXHU1QkI5XHU1RjYyXHU2MDAxXHVGRjA5XHVGRjFBXHU1MTQxXHU4QkI4IGtvb2tpdCBcdTkwNTdcdTc1NTlcdTc2ODQgc3RyaW5nIFx1NjU3MFx1NTAzQyAvIG51bGwgLyBcdTdGM0FcdTVCNTdcdTZCQjUgKi9cclxuZXhwb3J0IHR5cGUgTG9jYXRpb25JbnB1dCA9IFBhcnRpYWw8e1xyXG4gIFtLIGluIGtleW9mIEJvb2tMb2NhdGlvbl06IEJvb2tMb2NhdGlvbltLXSB8IHN0cmluZyB8IG51bGxcclxufT5cclxuXHJcbi8qKlxyXG4gKiBcdTVGNTJcdTRFMDBcdUZGMUFcdTVCQjlcdTk1MTkga29va2l0IFx1OTA1N1x1NzU1OVx1NzY4NCBzdHJpbmcgXHU2NTcwXHU1MDNDIC8gXHU3RjNBXHU1QjU3XHU2QkI1IC8gXHU4RDhBXHU3NTRDXHVGRjA4XHU1Mzg2XHU1M0YyIGxpYnJhcnkuanNvbiBcdTY1NzBcdTYzNkVcdTUxN0NcdTVCQjlcdUZGMDlcdTMwMDJcclxuICogXHU2MjQwXHU2NzA5XHU0RjREXHU3RjZFXHU4RkRCXHU1MTY1XHU1N0RGXHU1QzQyXHVGRjA4XHU5MDAyXHU5MTREXHU1NjY4XHU0RUE3XHU1MUZBXHUzMDAxXHU2MzAxXHU0RTQ1XHU1MzE2XHU4QkZCXHU1NkRFXHUzMDAxXHU3RjUxXHU3RURDXHU4RjdEXHU4Mzc3XHVGRjA5XHU1NDBFXHU1RTk0XHU1MTQ4XHU4RkM3XHU4RkQ5XHU5MUNDXHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplTG9jYXRpb24ocmF3PzogTG9jYXRpb25JbnB1dCB8IG51bGwpOiBCb29rTG9jYXRpb24ge1xyXG4gIHJldHVybiB7XHJcbiAgICBjaGFwdGVyRG9jSW5kZXg6IHRvTm9uTmVnYXRpdmVJbnQocmF3Py5jaGFwdGVyRG9jSW5kZXgpLFxyXG4gICAgY2hhcHRlckhyZWY6IHJhdz8uY2hhcHRlckhyZWYgPz8gJycsXHJcbiAgICBjb3VudDogdG9Ob25OZWdhdGl2ZUludChyYXc/LmNvdW50KSxcclxuICAgIHBhZ2U6IHRvTm9uTmVnYXRpdmVJbnQocmF3Py5wYWdlKSxcclxuICAgIHBlcmNlbnRhZ2U6IGNsYW1wMDEoTnVtYmVyKHJhdz8ucGVyY2VudGFnZSkgfHwgMCksXHJcbiAgICB0ZXh0OiByYXc/LnRleHQgPz8gJycsXHJcbiAgICBjaGFwdGVyVGl0bGU6IHJhdz8uY2hhcHRlclRpdGxlID8/IHVuZGVmaW5lZFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFx1NEUzQlx1OTUyRVx1RkYwOGxvY2F0aW9uS2V5XHVGRjA5XHUyMDE0XHUyMDE0IFx1NjgzQ1x1NUYwRlx1NzZGOFx1NTE3M1x1NzY4NFwiXHU1NDBDXHU0RTAwXHU0RjREXHU3RjZFXCJcdTUyMjRcdTVCOUFcdTRGOURcdTYzNkVcdUZGMUFcclxuICogLSBQREZcdUZGMUFwYWdlXHVGRjA4a29va2l0IFx1NkJDRlx1OTg3NVx1NEUwMFx1NEUyQSBzZWN0aW9uXHVGRjBDXHU0RTBEXHU0RjlEXHU4RDU2IE9DUlx1RkYwQ1x1OERFOFx1N0FFRlx1NTkyOVx1NzEzNlx1N0EzM1x1NUI5QVx1RkYwQ1x1ODlDMSBLT09LSVQubWQgXHUwMEE3OC4xL1x1MDBBNzguMlx1RkYwOVxyXG4gKiAtIFx1NjU4N1x1NUI1N1x1N0M3Qlx1RkYwOEVQVUIvTU9CSS9BWlczL1RYVC9cdTIwMjZcdUZGMDlcdUZGMUFjaGFwdGVyRG9jSW5kZXggKyBjb3VudFx1RkYwOFx1NTNFRlx1ODlDMVx1NkVEQVx1NTJBOFx1NTc1N1x1NUU4Rlx1NTNGN1x1RkYwOVxyXG4gKiBcdThGRDRcdTU2REVcdTVGNjJcdTU5ODIgXCJwZGY6cDNcIiAvIFwidHh0OmM1LjEyXCIgXHU3Njg0XHU4OUM0XHU4MzAzXHU1MzE2XHU5NTJFXHU1QjU3XHU3QjI2XHU0RTMyXHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbG9jYXRpb25LZXkobG9jOiBCb29rTG9jYXRpb24sIGZvcm1hdDogQm9va0Zvcm1hdCk6IHN0cmluZyB7XHJcbiAgY29uc3QgbiA9IG5vcm1hbGl6ZUxvY2F0aW9uKGxvYylcclxuICByZXR1cm4gZm9ybWF0ID09PSAnUERGJ1xyXG4gICAgPyBgcGRmOnAke24ucGFnZX1gXHJcbiAgICA6IGB0ZXh0OmMke24uY2hhcHRlckRvY0luZGV4fS4ke24uY291bnR9YFxyXG59XHJcblxyXG4vKiogXHU1NDBDXHU0RTAwXHU0RjREXHU3RjZFXHU1MjI0XHU1QjlBXHVGRjA4XHU0RTNCXHU5NTJFXHU3NkY4XHU3QjQ5XHVGRjA5XHUzMDAyXHU4REU4XHU2ODNDXHU1RjBGL1x1OERFOFx1NEU2Nlx1NkJENFx1OEY4M1x1NjVFMFx1NjEwRlx1NEU0OVx1RkYwQ1x1OEMwM1x1NzUyOFx1NjVCOVx1NEZERFx1OEJDMVx1NTQwQ1x1NEU2Nlx1NTQwQ1x1NzI0OFx1NjcyQ1x1MzAwMiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FtZUxvY2F0aW9uKGE6IEJvb2tMb2NhdGlvbiwgYjogQm9va0xvY2F0aW9uLCBmb3JtYXQ6IEJvb2tGb3JtYXQpOiBib29sZWFuIHtcclxuICByZXR1cm4gbG9jYXRpb25LZXkoYSwgZm9ybWF0KSA9PT0gbG9jYXRpb25LZXkoYiwgZm9ybWF0KVxyXG59XHJcblxyXG4vKipcclxuICogXHU2MzkyXHU1RThGXHVGRjA4XHU1NDBDXHU0RTY2XHU1NDBDXHU3MjQ4XHU2NzJDXHU1MTg1XHU3Njg0XHU1MTQ4XHU1NDBFXHVGRjA5XHVGRjFBUERGIFx1NjMwOSBwYWdlXHVGRjFCXHU2NTg3XHU1QjU3XHU3QzdCXHU2MzA5IGNoYXB0ZXJEb2NJbmRleCBcdTIxOTIgY291bnRcdTMwMDJcclxuICogcGVyY2VudGFnZSBcdTRGRERcdTc1NTlcdTRFMDBcdTRGNERcdTVDMEZcdTY1NzBcdTdDQkVcdTVFQTZcdTVERUVcdTVGMDJcdTU5MjdcdUZGMENcdTRFMERcdTUzQzJcdTRFMEVcdTZCRDRcdThGODNcdUZGMDhkaXNwbGF5IFx1ODlEMlx1ODI3Mlx1RkYwOVx1MzAwMlxyXG4gKiBcdThGRDRcdTU2REUgbnVsbCA9IFx1NEUwRFx1NTNFRlx1NkJENFx1RkYwOFx1NEVGQlx1NEUwMFx1NEUzQVx1OTZGNlx1NEY0RFx1N0Y2RVx1RkYwOVx1MzAwMlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBhcmVMb2NhdGlvbihcclxuICBhOiBCb29rTG9jYXRpb24sXHJcbiAgYjogQm9va0xvY2F0aW9uLFxyXG4gIGZvcm1hdDogQm9va0Zvcm1hdFxyXG4pOiAtMSB8IDAgfCAxIHwgbnVsbCB7XHJcbiAgY29uc3QgbmEgPSBub3JtYWxpemVMb2NhdGlvbihhKVxyXG4gIGNvbnN0IG5iID0gbm9ybWFsaXplTG9jYXRpb24oYilcclxuICBpZiAoaXNaZXJvTG9jYXRpb24obmEpIHx8IGlzWmVyb0xvY2F0aW9uKG5iKSkgcmV0dXJuIG51bGxcclxuICBpZiAoZm9ybWF0ID09PSAnUERGJykgcmV0dXJuIHNpZ24obmEucGFnZSAtIG5iLnBhZ2UpXHJcbiAgY29uc3QgZGEgPSBuYS5jaGFwdGVyRG9jSW5kZXggLSBuYi5jaGFwdGVyRG9jSW5kZXhcclxuICBpZiAoZGEgIT09IDApIHJldHVybiBzaWduKGRhKVxyXG4gIHJldHVybiBzaWduKG5hLmNvdW50IC0gbmIuY291bnQpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdTk1MUFcdTcwQjlcdTVGM0FcdTVFQTYgXHUyMDE0XHUyMDE0IFx1OEJFNVx1NEY0RFx1N0Y2RVx1NEZFMVx1NjA2Rlx1NjYyRlx1NTQyNlx1OERCM1x1NTkxRlwiXHU3Q0JFXHU3ODZFXHU1NkRFXHU4REYzXCJcdUZGMDhcdTdCMTRcdThCQjAvXHU2MDYyXHU1OTBEL1x1NTQwQ1x1NkI2NVx1NTZERVx1OERGM1x1OTAwOVx1OERFRlx1NzUyOFx1RkYwOVx1RkYxQVxyXG4gKiAtIHN0cm9uZ1x1RkYxQVx1NEUzQlx1OTUyRVx1OUY1MFx1NTkwN1x1RkYwOFBERiBcdTY3MDlcdTk4NzVcdTc4MDFcdUZGMUJcdTY1ODdcdTVCNTdcdTdDN0IgY2hhcHRlckRvY0luZGV4K2NvdW50IFx1OTBGRCA+MFx1RkYwOVxyXG4gKiAtIHdlYWsgIFx1RkYxQVx1NTNFQVx1NjcwOVx1N0M5N1x1N0M5Mlx1NUVBNlx1RkYwOHBlcmNlbnRhZ2UgLyBcdTdFQUYgY2hhcHRlckRvY0luZGV4XHVGRjA5XHUyMDE0XHUyMDE0XHU1M0VBXHU4MEZEXHU1NkRFXHU4REYzXHU1MjMwXHU1OTI3XHU2OTgyXHU0RjREXHU3RjZFXHJcbiAqIC0gbm9uZSAgXHVGRjFBXHU5NkY2XHU0RjREXHU3RjZFXHJcbiAqIFx1N0NCRVx1Nzg2RVx1NTZERVx1NjYzRVx1NEVDRFx1NEVFNSBOb3RlLnJhbmdlXHVGRjA4XHU1RjE1XHU2NENFXHU1RThGXHU1MjE3XHU1MzE2XHVGRjA5XHU0RTNBXHU1MUM2XHVGRjBDbG9jYXRpb24gXHU1M0VBXHU2NjJGXHU1QjgzXHU3Njg0XHU3Qzk3XHU5NTFBXHU3MEI5XHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYW5jaG9yU3RyZW5ndGgobG9jOiBCb29rTG9jYXRpb24sIGZvcm1hdDogQm9va0Zvcm1hdCk6ICdzdHJvbmcnIHwgJ3dlYWsnIHwgJ25vbmUnIHtcclxuICBjb25zdCBuID0gbm9ybWFsaXplTG9jYXRpb24obG9jKVxyXG4gIGlmIChpc1plcm9Mb2NhdGlvbihuKSkgcmV0dXJuICdub25lJ1xyXG4gIGlmIChmb3JtYXQgPT09ICdQREYnKSByZXR1cm4gbi5wYWdlID4gMCA/ICdzdHJvbmcnIDogJ3dlYWsnXHJcbiAgcmV0dXJuIG4uY2hhcHRlckRvY0luZGV4ID4gMCAmJiBuLmNvdW50ID4gMCA/ICdzdHJvbmcnIDogJ3dlYWsnXHJcbn1cclxuXHJcbi8qKiBcdTY1RTVcdTVGRDcvXHU4QzAzXHU4QkQ1XHU3NTI4XHU3Njg0XHU1M0VGXHU4QkZCXHU1RjYyXHU1RjBGXHVGRjA4Y2hcdTAwQjdcdTU3NTcvXHU5ODc1IFx1MDBCNyBcdTc2N0VcdTUyMDZcdTZCRDQgXHUwMEI3IFx1NjU4N1x1NjcyQ1x1NjNEMFx1NzkzQVx1RkYwOSAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVMb2NhdGlvbihsb2M6IEJvb2tMb2NhdGlvbiwgZm9ybWF0OiBCb29rRm9ybWF0KTogc3RyaW5nIHtcclxuICBjb25zdCBuID0gbm9ybWFsaXplTG9jYXRpb24obG9jKVxyXG4gIGNvbnN0IHdoZXJlID1cclxuICAgIGZvcm1hdCA9PT0gJ1BERidcclxuICAgICAgPyBgcCR7bi5wYWdlfWBcclxuICAgICAgOiBgYyR7bi5jaGFwdGVyRG9jSW5kZXh9XHUwMEI3JHtuLmNvdW50fSR7bi5jaGFwdGVyVGl0bGUgPyBgKCR7bi5jaGFwdGVyVGl0bGV9KWAgOiAnJ31gXHJcbiAgY29uc3QgaGludCA9IG4udGV4dCA/IGAgXCIke24udGV4dC5zbGljZSgwLCAyNCl9XHUyMDI2XCJgIDogJydcclxuICByZXR1cm4gYCR7d2hlcmV9ICR7KG4ucGVyY2VudGFnZSAqIDEwMCkudG9GaXhlZCgxKX0lJHtoaW50fWBcclxufVxyXG5cclxuZnVuY3Rpb24gdG9Ob25OZWdhdGl2ZUludCh2OiB1bmtub3duKTogbnVtYmVyIHtcclxuICBjb25zdCBuID0gTWF0aC5mbG9vcihOdW1iZXIodikpXHJcbiAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShuKSAmJiBuID4gMCA/IG4gOiAwXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsYW1wMDEodjogbnVtYmVyKTogbnVtYmVyIHtcclxuICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHYpID8gTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgdikpIDogMFxyXG59XHJcblxyXG5mdW5jdGlvbiBzaWduKHY6IG51bWJlcik6IC0xIHwgMCB8IDEge1xyXG4gIHJldHVybiB2IDwgMCA/IC0xIDogdiA+IDAgPyAxIDogMFxyXG59XHJcbiIsICIvKipcclxuICogXHU2MjNGXHU5NUY0XHU1MzRGXHU4QkFFXHU4QkNEXHU2QzQ3XHVGRjA4XHU5ODg2XHU1N0RGXHU1QzQyXHVGRjBDXHU3RUFGXHU1MUZEXHU2NTcwXHVGRjBDXHU5NkY2XHU0RjlEXHU4RDU2XHVGRjA5XHUyMDE0XHUyMDE0ICoqXHU1NTJGXHU0RTAwXHU4OUUzXHU5MUNBXHU1OTA0KipcdTMwMDJcclxuICogXHU0RjlEXHU2MzZFXHVGRjFBYHNlcnZlci9kb2NzL0FQSS5tZGBcdTMwMENcdTU0MENcdTZCNjVcdTUzNEZcdThCQUVcdTRFMEVcdThGNkNcdTUzRDFcdTg5QzRcdTgzMDNcdTMwMERcdTMwMENXZWJTb2NrZXRcdTMwMERcdTMwMENcdThCQTRcdThCQzFcdTMwMERcdTRFMEUgYGNsaWVudC9kb2NzL0NPTlRSQUNUUy5tZGAgXHUwMEE3NC4yL1x1MDBBNzUuMVx1MzAwMlxyXG4gKlxyXG4gKiBcdTRFM0FcdTRFQzBcdTRFNDhcdTg5ODFcdTRFMTNcdTk1RThcdTRFMDBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMDhSdWxlIG9mIFRocmVlXHVGRjBDMjAyNi0wOS0xNyBcdTYyM0ZcdTk1RjRcdTgwNEFcdTU5MjlcdTVCQTRcdTg0M0RcdTU3MzBcdTY1RjZcdTdBQ0JcdUZGMDlcdUZGMUFcclxuICogXHU0RkUxXHU1QzAxIHR5cGUgXHU1QjU3XHU3QjI2XHU0RTMyXHUzMDAxXHU1OTMxXHU4RDI1IHJlYXNvbiBcdTc2ODRcdTUyMjRcdTVCOUFcdTMwMDFcdTY2MzVcdTc5RjBcdTk1N0ZcdTVFQTZcdTdFQTZcdTY3NUZcdTMwMDFcdTYyM0ZcdTk1RjQgV1MgXHU3Njg0XHU2M0UxXHU2MjRCXHU1NzMwXHU1NzQwXHUzMDAxXHU4MDRBXHU1OTI5XHU1Mzg2XHU1M0YyXHU3Njg0XHU4REVGXHU1Rjg0XHU0RTBFXHU1NDA4XHU1RTc2XHJcbiAqIFx1NkI2NFx1NTI0RFx1NjU2M1x1ODQzRFx1NTcyOCBgUm9vbVNlc3Npb25gIFx1NzY4NCBzd2l0Y2gtY2FzZVx1MzAwMWB3c05ldEFkYXB0ZXJgIFx1NEUwRSBVSSBcdTkxQ0NcdUZGMEMqKlx1NTQwNFx1NTkwNFx1ODFFQVx1ODg0Q1x1ODlFM1x1OTFDQSoqXHUzMDAyXHJcbiAqIFx1NTQwRVx1Njc5Q1x1NURGMlx1N0VDRlx1NTFGQVx1NzNCMFx1OEZDN1x1NEUwMFx1NkIyMVx1RkYxQVx1NjcwRFx1NTJBMVx1NTY2OFx1NUI5RVx1OTY0NVx1NEUwQlx1NTNEMVx1NzY4NFx1NjYyRiBgXCJyb29tIG5vdCBmb3VuZFwiYFx1RkYwOFx1N0E3QVx1NjgzQ1x1NTIwNlx1OEJDRFx1RkYwOVx1RkYwQ1x1ODAwQ1x1NUJBMlx1NjIzN1x1N0FFRlx1NjMwOVxyXG4gKiBgXCJyb29tLW5vdC1mb3VuZFwiYCBcdTdDQkVcdTc4NkVcdTUzMzlcdTkxNEQgXHUyMTkyICoqXCJcdTRFNjZcdTRFMERcdTUzMzlcdTkxNERcIlx1ODhBQlx1OTc1OVx1OUVEOFx1OTY0RFx1N0VBN1x1NjIxMCBzZXJ2ZXItZXJyb3IqKlx1RkYwQ1x1NEUyNFx1NEZBN1x1OTBGRFx1NkNBMVx1NjJBNVx1OTUxOVx1MzAwMlxyXG4gKiBcdTRFOEVcdTY2MkZcdUZGMUFcdTUxRTFcdTY2MkZcIlx1NTM0Rlx1OEJBRVx1OTU3Rlx1NEVDMFx1NEU0OFx1NjgzN1wiXHU3Njg0XHU1MjI0XHU2NUFEXHVGRjBDXHU0RTAwXHU1RjhCXHU2NTM2XHU4RkRCXHU2NzJDXHU2NTg3XHU0RUY2XHVGRjA4XHU1M0VGXHU1MzU1XHU2RDRCXHUzMDAxXHU1M0VGXHU1QkY5XHU3MTY3XHU2NzBEXHU1MkExXHU1NjY4XHU2NTg3XHU2NzJDXHU5MDEwXHU2NzYxXHU2ODM4XHVGRjA5XHUzMDAyXHJcbiAqL1xyXG5pbXBvcnQgdHlwZSB7IENoYXRNZXNzYWdlLCBSb29tTWVtYmVyIH0gZnJvbSAnLi90eXBlcydcclxuXHJcbi8qKlxyXG4gKiBcdTRGRTFcdTVDMDEgdHlwZSBcdTVFMzhcdTkxQ0ZcdUZGMDhgc2VydmVyL2RvY3MvQVBJLm1kYFx1MzAwQ1x1NkQ4OFx1NjA2Rlx1N0M3Qlx1NTc4Qlx1NkUwNVx1NTM1NVx1MzAwRFx1RkYwOVx1MzAwMlxyXG4gKiBcdTI2QTAgXHU2NTM5XHU4RkQ5XHU5MUNDID0gXHU2NTM5XHU1MzRGXHU4QkFFIFx1MjE5MiBcdTU5NTFcdTdFQTZcdTUxNDhcdTg4NENcdUZGMDhcdTU0MEMgY29tbWl0IFx1NjUzOSBgc2VydmVyL2RvY3MvQVBJLm1kYCArIGBjbGllbnQvZG9jcy9DT05UUkFDVFMubWRgXHVGRjA5XHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgUk9PTV9NU0cgPSB7XHJcbiAgLyoqIGNsaWVudCBcdTIxOTIgc2VydmVyXHVGRjFBXHU1MkEwXHU1MTY1XHU2MjNGXHU5NUY0XHVGRjA4XHU0RTBBXHU2MkE1XHU2MzA3XHU3RUI5XHU2ODA3XHU1QjlBXHVGRjA5ICovXHJcbiAgam9pbjogJ3Jvb20uam9pbicsXHJcbiAgLyoqIHNlcnZlciBcdTIxOTIgY2xpZW50XHVGRjFBXHU1MkEwXHU1MTY1XHU3RUQzXHU2NzlDXHVGRjA4b2sgLyByZWFzb24gLyBlZGl0aW9uIC8gbWVtYmVycyBcdTUxNjhcdTkxQ0ZcdTVGRUJcdTcxNjdcdUZGMDkgKi9cclxuICBqb2luQWNrOiAncm9vbS5qb2luLWFjaycsXHJcbiAgLyoqIGNsaWVudCBcdTIxOTIgc2VydmVyXHVGRjFBXHU0RjREXHU3RjZFXHU0RTBBXHU2MkE1XHVGRjA4XHU1M0VBXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXHVGRjBDXHU0RTBEXHU4RjZDXHU1M0QxXHU3RkZCXHU5ODc1XHU1MkE4XHU0RjVDXHVGRjA5ICovXHJcbiAgbG9jYXRpb246ICdyb29tLmxvY2F0aW9uJyxcclxuICAvKiogc2VydmVyIFx1MjE5MiBcdTYyM0ZcdTk1RjRcdTUxNzZcdTRFRDZcdTRFQkFcdUZGMUFcdTYyMTBcdTU0NThcdTUxNjhcdTkxQ0ZcdTVGRUJcdTcxNjdcdUZGMDhcdTU0MkJcdTZCQ0ZcdTRFQkFcdTRGNERcdTdGNkVcdUZGMDkgKi9cclxuICBwcmVzZW5jZTogJ3Jvb20ucHJlc2VuY2UnLFxyXG4gIC8qKiBjbGllbnQgXHUyMTkyIHNlcnZlclx1RkYxQVx1NTNEMVx1OTAwMVx1ODA0QVx1NTkyOSAqL1xyXG4gIGNoYXQ6ICdyb29tLmNoYXQnLFxyXG4gIC8qKiBzZXJ2ZXIgXHUyMTkyIFx1NjIzRlx1OTVGNCoqXHU1MTY4XHU5MEU4KipcdTYyMTBcdTU0NThcdUZGMDhcdTU0MkJcdTUzRDFcdTkwMDFcdTgwMDVcdUZGMDlcdUZGMUFcdTgwNEFcdTU5MjlcdTVFN0ZcdTY0QURcdUZGMDhzZXJ2ZXIgXHU2NzQzXHU1QTAxXHU1NkRFXHU2MjY3XHVGRjA5ICovXHJcbiAgbWVzc2FnZTogJ3Jvb20ubWVzc2FnZScsXHJcbiAgLyoqIHNlcnZlciBcdTIxOTIgY2xpZW50XHVGRjFBXHU3Q0ZCXHU3RURGXHU2RDg4XHU2MDZGXHVGRjA4XHU1REYyXHU1QjlBXHU0RTQ5XHU2NzJBXHU1M0QxXHU5MDAxXHVGRjA5ICovXHJcbiAgc3lzdGVtOiAncm9vbS5zeXN0ZW0nLFxyXG4gIC8qKiBzZXJ2ZXIgXHUyMTkyIGNsaWVudFx1RkYxQVx1NEU2Nlx1N0M0RFx1NEUwRFx1NTMzOVx1OTE0RFx1RkYwOFx1NURGMlx1NUI5QVx1NEU0OVx1NjcyQVx1NTNEMVx1OTAwMVx1RkYwQ1x1NUY1M1x1NTI0RFx1OEQ3MCBqb2luLWFjayBcdTc2ODQgcmVhc29uXHVGRjA5ICovXHJcbiAgYm9va01pc21hdGNoOiAncm9vbS5ib29rLW1pc21hdGNoJ1xyXG59IGFzIGNvbnN0XHJcblxyXG4vKipcclxuICogXHU1QkEyXHU2MjM3XHU3QUVGKipcdTVGNTJcdTRFMDBcdTU0MEUqKlx1NzY4NFx1NTJBMFx1NTE2NVx1NTkzMVx1OEQyNVx1NTM5Rlx1NTZFMFx1RkYwOFVJIFx1NTNFQVx1OEJBNFx1OEZEOVx1NEU5NFx1NEUyQVx1RkYwOVx1MzAwMlxyXG4gKiBgc3VwZXJzZWRlZGAgXHU0RTBEXHU2NjJGXHU2NzBEXHU1MkExXHU1NjY4XHU3Njg0XHU1OTMxXHU4RDI1XHVGRjFBXHU2NjJGKipcdTVFNzZcdTUzRDEgam9pbiBcdTc2ODRcdTg0M0RcdThEMjVcdTY1QjkqKlx1RkYwOFx1NUJBMVx1OEJBMSBDLTJcdUZGMDlcdTIwMTRcdTIwMTQgXHU3NTI4XHU2MjM3XHU1RkVCXHU5MDFGXHU4RkRFXHU3MEI5XHU0RTI0XHU0RTJBXHU2MjNGXHU5NUY0XHU2NUY2XHVGRjBDXHJcbiAqIFx1NjVFN1x1NzY4NFx1OTBBM1x1NkIyMSBqb2luIFx1NTcyOCBhd2FpdCBcdTYwNjJcdTU5MERcdTU0MEVcdTUzRDFcdTczQjBcdTVERjJcdTY3MDlcdTY2RjRcdTY1QjBcdTc2ODQgam9pbiBcdTU3MjhcdThGREJcdTg4NENcdUZGMENcdTdBQ0JcdTUzNzNcdTRGNUNcdTVFOUZcdTgxRUFcdTVERjFcdTMwMDJVSSBcdTVFOTQqKlx1OTc1OVx1OUVEOCoqXHU1OTA0XHU3NDA2XHJcbiAqIFx1RkYwOFx1NEUwRFx1NjYzRVx1NzkzQVx1OTUxOVx1OEJFRiBcdTIwMTRcdTIwMTQgXHU3NTI4XHU2MjM3XHU4OTgxXHU3Njg0XHU2NjJGXHU2NUIwXHU2MjNGXHU5NUY0XHVGRjBDXHU2NUU3XHU2MjNGXHU5NUY0XHU1OTMxXHU4RDI1XHU0RTBFXHU1NDI2XHU2NUUwXHU1MTczXHU3RDI3XHU4OTgxXHVGRjA5XHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgdHlwZSBKb2luRmFpbHVyZVJlYXNvbiA9XHJcbiAgfCAnYm9vay1taXNtYXRjaCdcclxuICB8ICdyb29tLW5vdC1mb3VuZCdcclxuICB8ICdyb29tLWZ1bGwnXHJcbiAgfCAnc2VydmVyLWVycm9yJ1xyXG4gIHwgJ3N1cGVyc2VkZWQnXHJcblxyXG4vKipcclxuICogXHU2NzBEXHU1MkExXHU3QUVGXHU1MTQxXHU4QkI4XHU3Njg0XHU2NzAwXHU1OTI3XHU2NjM1XHU3OUYwXHU5NTdGXHU1RUE2XHVGRjA4XHU2MzA5XCJcdTVCNTdcIlx1OEJBMVx1RkYwQ3J1bmUgXHU2NTcwXHVGRjA5XHUzMDAyXHJcbiAqIFx1Njc0M1x1NUEwMSA9IGBzZXJ2ZXIvaW50ZXJuYWwvdHJhbnNwb3J0L3dzLmdvYCBcdTc2ODQgYG1heE5pY2tMZW4gPSAxMmBcdUZGMDhgQVBJLm1kYFx1MzAwQ1x1NzUyOFx1NjIzN1x1MzAwRFx1RkYxQVx1NjYzNVx1NzlGMCBcdTIyNjQxMiBcdTVCNTdcdUZGMENcclxuICogKipcdThEODVcdTk1N0ZcdTc2RjRcdTYzQTVcdTYyRDJcdTdFRERcdThGREVcdTYzQTUqKlx1RkYwOVx1MzAwMlx1NUJBMlx1NjIzN1x1N0FFRlx1NUZDNVx1OTg3Qlx1NTE0OFx1ODFFQVx1NjdFNSBcdTIwMTRcdTIwMTQgXHU1NDI2XHU1MjE5XHU4RDg1XHU5NTdGXHU2NjM1XHU3OUYwXHU3Njg0XHU4ODY4XHU3M0IwXHU2NjJGXCJcdThGREVcdTYzQTVcdTg4QUJcdTY3MERcdTUyQTFcdTU2NjhcdTk3NTlcdTlFRDhcdTUxNzNcdTYzODlcIlx1RkYwQ1xyXG4gKiBcdTc1MjhcdTYyMzdcdTc3MEJcdTUyMzBcdTc2ODRcdTY2MkZcdTk2OEZcdTY3M0FcdTY1QURcdTdFQkZcdUZGMENcdTgwMENcdTRFMERcdTY2MkZcIlx1NjYzNVx1NzlGMFx1NTkyQVx1OTU3RlwiXHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgTUFYX05JQ0tfTEVOID0gMTJcclxuXHJcbi8qKiBcdTY2MzVcdTc5RjBcdTY2MkZcdTU0MjZcdTU0MDhcdTZDRDVcdUZGMDhcdTk3NUVcdTdBN0EgKyBcdTIyNjQxMiBcdTVCNTdcdUZGMUJcdTYzMDkgcnVuZSBcdThCQTFcdUZGMENcdTRFMEVcdTY3MERcdTUyQTFcdTU2NjhcdTU0MENcdTRFMDBcdTUzRTNcdTVGODRcdUZGMDkgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWROaWNrKG5pY2s6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gIGNvbnN0IG4gPSAobmljayA/PyAnJykudHJpbSgpXHJcbiAgcmV0dXJuIG4ubGVuZ3RoID4gMCAmJiBBcnJheS5mcm9tKG4pLmxlbmd0aCA8PSBNQVhfTklDS19MRU5cclxufVxyXG5cclxuLyoqXHJcbiAqIFx1NUY1Mlx1NEUwMFx1NjcwRFx1NTJBMVx1N0FFRlx1NEUwQlx1NTNEMVx1NzY4NCBgam9pbi1hY2sucmVhc29uYFx1MzAwMlxyXG4gKlxyXG4gKiBcdTI2QTAgKipcdTUzODZcdTUzRjJcdTUwNEZcdTVERUVcdTRFMEVcdTczQjBcdTcyQjZcdUZGMDgyMDI2LTEwLTI0IHNlcnZlciB2MC4yLjEgXHU1QkY5XHU5RjUwXHVGRjA5KipcdUZGMUFcdTY3MERcdTUyQTFcdTU2NjhcdTZCNjRcdTUyNERcdTVCOUVcdTk2NDVcdTUzRDFcdTc2ODRcdTY2MkZcclxuICogYHJvb20uRXJyTm90Rm91bmQgPSBcInJvb20gbm90IGZvdW5kXCJgIFx1N0I0OVx1N0E3QVx1NjgzQ1x1NTIwNlx1OEJDRFx1NEUzMlx1RkYwOGBpbnRlcm5hbC9yb29tL21hbmFnZXIuZ29gXHVGRjA5XHVGRjBDXHU4MDBDXHU2NTg3XHU2ODYzXHU1MTk5XHU4RkRFXHU1QjU3XHU3QjI2XHJcbiAqIFx1MjAxNFx1MjAxNCBcdTdDQkVcdTc4NkVcdTUzMzlcdTkxNERcdTY2RkVcdTYyOEFcIlx1NEU2Nlx1NEUwRFx1NTMzOVx1OTE0RFwiXHU5NzU5XHU5RUQ4XHU5NjREXHU3RUE3XHU2MjEwIHNlcnZlci1lcnJvclx1MzAwMioqc2VydmVyIFx1NEZBN1x1NURGMlx1NjUzOVx1NEUzQVx1OEZERVx1NUI1N1x1N0IyNlx1RkYwOFx1NTQxMVx1NjU4N1x1Njg2M1x1NzcwQlx1OUY1MFx1RkYwOSoqXHVGRjFCXHJcbiAqIFx1NjcyQ1x1NTFGRFx1NjU3MFx1NzY4NFx1N0E3QVx1NjgzQy9cdTRFMEJcdTUyMTJcdTdFQkYvXHU1OTI3XHU1QzBGXHU1MTk5XHU1QkI5XHU5NTE5KipcdTRGRERcdTc1NTkqKlx1RkYwOFx1NUJGOVx1NjVFN1x1NjcwRFx1NTJBMVx1NTY2OFx1OTBFOFx1N0Y3MiAvIFx1NEYyMFx1OEY5M1x1NUM0Mlx1NTY2QVx1NThGMFx1OTBGRFx1NjcwOVx1OTdFN1x1NjAyN1x1RkYwOVx1RkYwQ1x1NjcyQVx1NzdFNVx1NEUzMlx1NUY1MiBgc2VydmVyLWVycm9yYFx1MzAwMlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUpvaW5SZWFzb24ocmVhc29uOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsKTogSm9pbkZhaWx1cmVSZWFzb24ge1xyXG4gIGNvbnN0IHIgPSAocmVhc29uID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXFxzX10rL2csICctJylcclxuICBzd2l0Y2ggKHIpIHtcclxuICAgIGNhc2UgJ2Jvb2stbWlzbWF0Y2gnOlxyXG4gICAgICByZXR1cm4gJ2Jvb2stbWlzbWF0Y2gnXHJcbiAgICBjYXNlICdyb29tLW5vdC1mb3VuZCc6XHJcbiAgICAgIHJldHVybiAncm9vbS1ub3QtZm91bmQnXHJcbiAgICBjYXNlICdyb29tLWZ1bGwnOlxyXG4gICAgICByZXR1cm4gJ3Jvb20tZnVsbCdcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIHJldHVybiAnc2VydmVyLWVycm9yJ1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFx1NjIzRlx1OTVGNCBXZWJTb2NrZXQgXHU2M0UxXHU2MjRCXHU1NzMwXHU1NzQwXHVGRjFBYHdzKHMpOi8vaG9zdDpwb3J0L3dzP3Jvb209PGlkPiZuaWNrPTxuYW1lPmBcdTMwMDJcclxuICpcclxuICogXHUyNkEwICoqXHU4RkQ5XHU2NjJGXCJcdTYzMDlcdTYyM0ZcdTk1RjRcdTVFRkFcdThGREVcIlx1NzY4NFx1NEY5RFx1NjM2RSoqXHVGRjA4YEFQSS5tZGBcdTMwMENXZWJTb2NrZXQgXHUyMDE0XHUyMDE0IEdFVCAvd3M/cm9vbT08aWQ+Jm5pY2s9PG5hbWU+XHUzMDBEXHVGRjA5XHVGRjFBXHJcbiAqIFx1NjcwRFx1NTJBMVx1NTY2OFx1NTcyOCoqXHU2M0UxXHU2MjRCXHU2NUY2KipcdTVDMzFcdTUzRDYgYHJvb21gIFx1NEUwRSBgbmlja2BcdUZGMENcdTdGM0FcdTRFRkJcdTRFMDBcdTYyMTZcdTY2MzVcdTc5RjBcdThEODVcdTk1N0YgXHUyMTkyIFx1NzZGNFx1NjNBNVx1NTE3M1x1OEZERVx1NjNBNVx1RkYwOGB0cmFuc3BvcnQvd3MuZ29gXHVGRjA5XHUzMDAyXHJcbiAqIFx1NjI0MFx1NEVFNVx1NkI2M1x1Nzg2RVx1NzY4NFx1NkEyMVx1NTc4Qlx1NjYyRlwiXHU4RkRCXHU2MjNGXHU5NUY0XHU2MjREXHU1RUZBXHU4RkRFXHUzMDAxXHU3OUJCXHU1RjAwXHU1QzMxXHU2NUFEXHU1RjAwXCJcdUZGMENcdTgwMENcdTRFMERcdTY2MkZcIlx1NTE0OFx1OEZERVx1NEUwMFx1Njc2MVx1OTAxQVx1NzUyOFx1OEZERVx1NjNBNVx1MzAwMVx1NTE4RFx1NTNEMSByb29tLmpvaW5cIlxyXG4gKiBcdTIwMTRcdTIwMTQgXHU1NDBFXHU4MDA1XHU1NzI4XHU2NzBEXHU1MkExXHU1NjY4XHU0RTBBXHU2ODM5XHU2NzJDXHU4RDcwXHU0RTBEXHU1MjMwIGByb29tLmpvaW5gXHVGRjA4XHU4RkRFXHU2M0E1XHU1REYyXHU1MTczXHVGRjA5XHUzMDAyXHU2M0UxXHU2MjRCXHU0RTRCXHU1NDBFXHU2MjREXHU1M0QxIGByb29tLmpvaW5gIFx1NTA1QVx1NjMwN1x1N0VCOVx1NjgwN1x1NUI5QVx1MzAwMlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUm9vbVdzVXJsKHNlcnZlclVybDogc3RyaW5nLCByb29tSWQ6IHN0cmluZywgbmljazogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCB1ID0gbmV3IFVSTChzZXJ2ZXJVcmwpXHJcbiAgdS5wcm90b2NvbCA9IHUucHJvdG9jb2wgPT09ICdodHRwczonID8gJ3dzczonIDogJ3dzOidcclxuICB1LnBhdGhuYW1lID0gJy93cydcclxuICB1LnNlYXJjaCA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoeyByb29tOiByb29tSWQsIG5pY2sgfSkudG9TdHJpbmcoKVxyXG4gIHJldHVybiB1LnRvU3RyaW5nKClcclxufVxyXG5cclxuLyoqIFx1ODA0QVx1NTkyOVx1NTM4Nlx1NTNGMlx1Njc2MVx1NjU3MFx1RkYxQWBBUEkubWRgIFx1ODlDNFx1NUI5QVx1OUVEOFx1OEJBNCA1MFx1MzAwMVx1NEUwQVx1OTY1MCA1MDBcdUZGMDhcdThEOEFcdTc1NEMgXHUyMTkyIDQwMFx1RkYwQ1x1NjU0NVx1OEZEOVx1OTFDQ1x1NTE0OFx1NTkzOVx1NTNENlx1RkYwOSAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBDaGF0SGlzdG9yeUxpbWl0KGxpbWl0PzogbnVtYmVyKTogbnVtYmVyIHtcclxuICBpZiAobGltaXQgPT0gbnVsbCB8fCAhTnVtYmVyLmlzRmluaXRlKGxpbWl0KSkgcmV0dXJuIDUwXHJcbiAgcmV0dXJuIE1hdGgubWluKDUwMCwgTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihsaW1pdCkpKVxyXG59XHJcblxyXG4vKipcclxuICogXHU4MDRBXHU1OTI5XHU1Mzg2XHU1M0YyXHU4REVGXHU1Rjg0XHVGRjFBYEdFVCAvcm9vbXMve3Jvb21JRH0vbWVzc2FnZXM/YWZ0ZXI9PGlkPiZsaW1pdD08bj5gXHJcbiAqIFx1RkYwOFx1OEZGRFx1NTJBMFx1NjVFNVx1NUZEN1x1NkEyMVx1NTc4Qlx1RkYxQWBhZnRlcmAgPSBcdTUzRUFcdTUzRDYgaWQgXHU2NkY0XHU1OTI3XHU3Njg0XHU2RDg4XHU2MDZGXHVGRjBDMC9cdTdGM0FcdTc3MDEgPSBcdTRFQ0VcdTU5MzRcdUZGMDlcdTMwMDJcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBidWlsZENoYXRIaXN0b3J5UGF0aChcclxuICByb29tSWQ6IHN0cmluZyxcclxuICBvcHRzPzogeyBhZnRlcj86IG51bWJlcjsgbGltaXQ/OiBudW1iZXIgfVxyXG4pOiBzdHJpbmcge1xyXG4gIGNvbnN0IHEgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKClcclxuICBpZiAob3B0cz8uYWZ0ZXIgIT0gbnVsbCAmJiBvcHRzLmFmdGVyID4gMCkgcS5zZXQoJ2FmdGVyJywgU3RyaW5nKE1hdGguZmxvb3Iob3B0cy5hZnRlcikpKVxyXG4gIHEuc2V0KCdsaW1pdCcsIFN0cmluZyhjbGFtcENoYXRIaXN0b3J5TGltaXQob3B0cz8ubGltaXQpKSlcclxuICByZXR1cm4gYC9yb29tcy8ke2VuY29kZVVSSUNvbXBvbmVudChyb29tSWQpfS9tZXNzYWdlcz8ke3EudG9TdHJpbmcoKX1gXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdTgwNEFcdTU5MjlcdTZEODhcdTYwNkZcdTU0MDhcdTVFNzZcdUZGMDhcdTUzODZcdTUzRjIgKyBcdTVCOUVcdTY1RjZcdTVFN0ZcdTY0QURcdUZGMDlcdUZGMUEqKlx1NjMwOSBpZCBcdTUzQkJcdTkxQ0RcdTMwMDFcdTUzNDdcdTVFOEYqKlx1MzAwMlxyXG4gKlxyXG4gKiBcdTRFM0FcdTRFQzBcdTRFNDhcdTVGQzVcdTk4N0JcdTUzQkJcdTkxQ0RcdUZGMUFgcm9vbS5tZXNzYWdlYCBcdTVFN0ZcdTY0QUQqKlx1NTQyQlx1NTNEMVx1OTAwMVx1ODAwNSoqXHVGRjA4c2VydmVyIFx1Njc0M1x1NUEwMVx1NTZERVx1NjI2N1x1RkYwOVx1RkYwQ1x1ODAwQ1x1NTM4Nlx1NTNGMlx1OEQ3MCBSRVNUIFx1NjJDOVx1NTNENiBcdTIwMTRcdTIwMTRcclxuICogXHU2NUFEXHU3RUJGXHU5MUNEXHU4RkRFXHU1NDBFXHU3Njg0XCJcdTU4OUVcdTkxQ0ZcdTg4NjVcdTYyQzlcdUZGMDhhZnRlcj1cdTY3MDBcdTU0MEVcdTRFMDBcdTY3NjEgaWRcdUZGMDlcIlx1NEUwRVx1NUU3Rlx1NjRBRFx1NTNFRlx1ODBGRFx1NEVBNFx1OTUxOVx1RkYwQ1x1NTQwQ1x1NEUwMCBpZCBcdTRGMUFcdTRFQ0VcdTRFMjRcdTY3NjFcdThERUZcdThGREJcdTY3NjVcdUZGMUJcclxuICogXHU3NkY0XHU2M0E1IGNvbmNhdCBcdTRGMUFcdTUxRkFcdTczQjBcdTkxQ0RcdTU5MERcdTY3NjFcdTc2RUVcdUZGMDhcdTRFMTRcdTk4N0FcdTVFOEZcdTRGMUFcdTRFNzFcdUZGMDlcdTMwMDJpZCBcdTY2MkYgc2VydmVyIFx1NTIwNlx1OTE0RFx1NzY4NFx1OEZGRFx1NTJBMFx1NUU4Rlx1NTNGN1x1RkYwQ1x1NTkyOVx1NzEzNlx1NTNFRlx1NjM5Mlx1NUU4Rlx1MzAwMlxyXG4gKiBcdTk3NUVcdTY1NzBcdTdFQzQvXHU5NzVFXHU2NTcwXHU1QjU3IGlkIFx1NzY4NFx1ODEwRlx1NjU3MFx1NjM2RVx1NzZGNFx1NjNBNVx1NEUyMlx1NUYwM1x1RkYwOFx1NEYyMFx1OEY5M1x1NUM0Mlx1NTNFQVx1NEZERFx1OEJDMVx1NjYyRiBKU09OXHVGRjBDXHU0RTBEXHU0RkREXHU4QkMxXHU1RjYyXHU3MkI2XHVGRjA5XHUzMDAyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VDaGF0TWVzc2FnZXMoXHJcbiAgcHJldjogcmVhZG9ubHkgQ2hhdE1lc3NhZ2VbXSxcclxuICBpbmNvbWluZzogQ2hhdE1lc3NhZ2UgfCByZWFkb25seSBDaGF0TWVzc2FnZVtdXHJcbik6IENoYXRNZXNzYWdlW10ge1xyXG4gIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KGluY29taW5nKSA/IGluY29taW5nIDogW2luY29taW5nXVxyXG4gIGNvbnN0IGJ5SWQgPSBuZXcgTWFwPG51bWJlciwgQ2hhdE1lc3NhZ2U+KClcclxuICBmb3IgKGNvbnN0IG0gb2YgcHJldikgaWYgKGlzQ2hhdE1lc3NhZ2UobSkpIGJ5SWQuc2V0KG0uaWQsIG0pXHJcbiAgZm9yIChjb25zdCBtIG9mIGxpc3QpIGlmIChpc0NoYXRNZXNzYWdlKG0pKSBieUlkLnNldChtLmlkLCBtKVxyXG4gIHJldHVybiBbLi4uYnlJZC52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpXHJcbn1cclxuXHJcbi8qKiBcdTVGNjJcdTcyQjZcdTVCODhcdTUzNkJcdUZGMUFcdTgwNEFcdTU5MjlcdTZEODhcdTYwNkZcdTc2ODRcdTY3MDBcdTVDMEZcdTUzRUZcdTRGRTFcdTVCNTdcdTZCQjVcdUZGMDhzZXJ2ZXIgXHU3Njg0IHBheWxvYWQgXHU1M0VBXHU0RkREXHU4QkMxXHU2NjJGIEpTT05cdUZGMDlcdTMwMDJcclxuICogIGBjcmVhdGVkQXRgIFx1NEUwMFx1NUU3Nlx1ODk4MVx1NkM0Mlx1RkYwOFx1NUJBMVx1OEJBMSBDLTVcdUZGMDlcdUZGMUFcdTVDNTVcdTc5M0FcdTVDNDJcdUZGMDhDaGF0UGFuZWwuZm9ybWF0VGltZVx1RkYwOVx1NzZGNFx1NjNBNVx1NjJGRlx1NUI4M1x1N0I5NyBISDpNTVx1RkYwQ1xyXG4gKiAgXHU3RjNBXHU0RTg2XHU0RjFBXHU2RTMyXHU2N0QzXHU2MjEwIGBOYU46TmFOYCBcdTIwMTRcdTIwMTQgXHU1NzI4XHU1Qjg4XHU1MzZCXHU5MUNDXHU2MkU2XHU2Mzg5XHVGRjBDXHU4MTBGXHU2NTcwXHU2MzZFXHU0RTBEXHU4RkRCIFVJXHUzMDAyICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRNZXNzYWdlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgQ2hhdE1lc3NhZ2Uge1xyXG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlXHJcbiAgY29uc3QgbSA9IHZhbHVlIGFzIFBhcnRpYWw8Q2hhdE1lc3NhZ2U+XHJcbiAgcmV0dXJuIChcclxuICAgIHR5cGVvZiBtLmlkID09PSAnbnVtYmVyJyAmJlxyXG4gICAgTnVtYmVyLmlzRmluaXRlKG0uaWQpICYmXHJcbiAgICB0eXBlb2YgbS50ZXh0ID09PSAnc3RyaW5nJyAmJlxyXG4gICAgdHlwZW9mIG0uY3JlYXRlZEF0ID09PSAnbnVtYmVyJyAmJlxyXG4gICAgTnVtYmVyLmlzRmluaXRlKG0uY3JlYXRlZEF0KVxyXG4gIClcclxufVxyXG5cclxuLyoqXHJcbiAqIHJvb20ucHJlc2VuY2UgXHU4RjdEXHU4Mzc3XHU1RjUyXHU0RTAwXHVGRjA4djAuNC44XHVGRjA5XHVGRjFBYHsgbWVtYmVyczogWy4uLl0gfWBcdUZGMDhcdTU5NTFcdTdFQTZcdTVGNjJcdTcyQjZcdUZGMDlcdTYyMTYqKlx1ODhGOFx1NjU3MFx1N0VDNCoqXHVGRjA4djAuMi4xIFx1NTI0RFxyXG4gKiBzZXJ2ZXIgXHU1QjlFXHU5NjQ1XHU1M0QxXHU3Njg0XHU1RjYyXHU3MkI2IFx1MjAxNFx1MjAxNCBcdTRFMjRcdTRGQTdcIlx1NTQwNFx1ODFFQVx1ODFFQVx1NkQzRFwiXHU1QkZDXHU4MUY0XHU3NzFGXHU1QkEyXHU2MjM3XHU3QUVGXHU2MjEwXHU1NDU4XHU1RkVCXHU3MTY3XHU2MDUyXHU3QTdBXHVGRjBDXHU4NzAyXHU3RkE0XHU5OTk2XHU4REQxXHU2MjkzXHU1MUZBXHVGRjA5XHUzMDAyXHJcbiAqIFx1NTk1MVx1N0VBNlx1NURGMlx1NUI5QVx1NEUzQVx1NTMwNVx1ODhDNVx1NUY2Mlx1NzJCNlx1RkYxQlx1OEZEOVx1OTFDQ1x1NUJGOVx1NEUyNFx1NzlDRFx1OTBGRFx1OEJBNFx1RkYwOFx1NTQwQyBub3JtYWxpemVKb2luUmVhc29uIFx1NzY4NFx1NUJCOVx1OTUxOVx1NTRGMlx1NUI2Nlx1RkYwOVx1RkYwQ1x1ODEwRlx1Njc2MVx1NzZFRVx1NzUyOFxyXG4gKiBgaXNDaGF0TWVzc2FnZWAgXHU1NDBDXHU2NUNGXHU3Njg0XHU1RjYyXHU3MkI2XHU3RUFBXHU1RjhCXHU2MkU2XHU1NzI4XHU5ODg2XHU1N0RGXHU1QzQyXHUzMDAyICovXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVQcmVzZW5jZU1lbWJlcnMocGF5bG9hZDogdW5rbm93bik6IFJvb21NZW1iZXJbXSB7XHJcbiAgY29uc3QgcmF3OiB1bmtub3duID1cclxuICAgIEFycmF5LmlzQXJyYXkocGF5bG9hZCkgPyBwYXlsb2FkIDogKHBheWxvYWQgYXMgeyBtZW1iZXJzPzogdW5rbm93biB9IHwgbnVsbCk/Lm1lbWJlcnNcclxuICBpZiAoIUFycmF5LmlzQXJyYXkocmF3KSkgcmV0dXJuIFtdXHJcbiAgcmV0dXJuIHJhdy5maWx0ZXIoXHJcbiAgICAobSk6IG0gaXMgUm9vbU1lbWJlciA9PlxyXG4gICAgICAhIW0gJiZcclxuICAgICAgdHlwZW9mIG0gPT09ICdvYmplY3QnICYmXHJcbiAgICAgIHR5cGVvZiAobSBhcyBSb29tTWVtYmVyKS5pZCA9PT0gJ3N0cmluZycgJiZcclxuICAgICAgdHlwZW9mIChtIGFzIFJvb21NZW1iZXIpLm5pY2tOYW1lID09PSAnc3RyaW5nJ1xyXG4gIClcclxufVxyXG4iLCAiLyoqXHJcbiAqIElSb29tU2Vzc2lvbiBcdTIwMTRcdTIwMTQgXHU2MjNGXHU5NUY0XHU0RjFBXHU4QkREXHVGRjA4XHU1NDBDXHU2QjY1XHU0RTFBXHU1MkExXHU5MDNCXHU4RjkxXHU2NzJDXHU0RjUzXHVGRjBDXHU3NTI4XHU0RjhCXHU1QzQyXHVGRjA5XHUzMDAyXHJcbiAqIFx1NEY5RFx1NjM2RVx1RkYxQWNsaWVudC9kb2NzL0NPTlRSQUNUUy5tZCBcdTAwQTc1LjEgKyBzZXJ2ZXIvZG9jcy9BUEkubWRcdTMwMENcdTU0MENcdTZCNjVcdTUzNEZcdThCQUVcdTRFMEVcdThGNkNcdTUzRDFcdTg5QzRcdTgzMDNcdTMwMERcdTMwMENXZWJTb2NrZXRcdTMwMERcdTMwMDJcclxuICogXHU3RjE2XHU2MzkyXHVGRjFBSU5ldFNlcnZpY2VcdUZGMDhcdTRGMjBcdThGOTNcdUZGMDkrIElSZW5kZXJTZXJ2aWNlXHVGRjA4XHU2RTMyXHU2N0QzXHU0RjREXHU3RjZFXHU0RThCXHU0RUY2XHVGRjA5KyBJQm9va0lkZW50aXR5U2VydmljZVx1RkYwOFx1NjgwN1x1NUI5QVx1NjgyMVx1OUE4Q1x1RkYwOVx1MzAwMlxyXG4gKiBcdTUxNzNcdTk1MkVcdThCRURcdTRFNDlcdUZGMUFcclxuICogLSBcdTcyQjZcdTYwMDFcdThGNkNcdTUzRDFcdTgwMENcdTk3NUVcdTY0Q0RcdTRGNUNcdThGNkNcdTUzRDFcdUZGMUFcdTUzRUFcdTU0MENcdTZCNjUgQm9va0xvY2F0aW9uIFx1NEUwRVx1ODA0QVx1NTkyOVx1RkYxQlx1N0ZGQlx1OTg3NS9cdTZFREFcdTUyQThcdTY0Q0RcdTRGNUNcdTRFMERcdThGNkNcdTUzRDFcdTMwMDJcclxuICogLSBwcmVzZW5jZSBcdTUxNjhcdTkxQ0ZcdTVGRUJcdTcxNjdcdTVFN0ZcdTY0QURcdTMwMDFcdTUzRDFcdTkwMDFcdTgwMDVcdTk2NjRcdTU5MTZcdUZGMUJjaGF0IFx1NUU3Rlx1NjRBRFx1NTQyQlx1NTNEMVx1OTAwMVx1ODAwNVx1RkYwOHNlcnZlciBcdTY3NDNcdTVBMDFcdTU2REVcdTYyNjdcdUZGMDlcdTMwMDJcclxuICogLSBcdTRGNERcdTdGNkVcdTRFMEFcdTYyQTVcdTgyODJcdTZENDFcdTY2MkYgY2xpZW50IFx1ODA0Q1x1OEQyM1x1MzAwMlxyXG4gKlxyXG4gKiBcdTI2QTAgKip2MC40LjNcdUZGMUFcdThGREVcdTYzQTVcdTZBMjFcdTU3OEJcdTY1MzlcdTYyMTBcIlx1NjMwOVx1NjIzRlx1OTVGNFx1NUVGQVx1OEZERVwiKipcdUZGMDhcdTUzOUZcdTY3NjVcdTY2MkZcdTRFMDBcdTY3NjFcdTkwMUFcdTc1MjhcdThGREVcdTYzQTUgKyByb29tLmpvaW5cdUZGMDlcdTIwMTRcdTIwMTQgXHU2NzBEXHU1MkExXHU1NjY4IFdTIFx1NjNFMVx1NjI0Qlx1NUMzMVx1ODk4MVx1NkM0MlxyXG4gKiBgP3Jvb209Jm5pY2s9YFx1RkYwOGB0cmFuc3BvcnQvd3MuZ29gXHVGRjFBXHU3RjNBXHU0RUZCXHU0RTAwXHU2MjE2XHU2NjM1XHU3OUYwXHU4RDg1XHU5NTdGIFx1MjE5MiBcdTc2RjRcdTYzQTVcdTUxNzNcdThGREVcdTYzQTVcdUZGMDlcdTMwMDJcdTU2RTBcdTZCNjRcdUZGMUFcclxuICogLSBgam9pblJvb21gID0gYG5ldC5vcGVuUm9vbShyb29tSWQpYFx1RkYwOFx1NjNFMVx1NjI0Qlx1RkYwOVx1MjE5MiBcdTUzRDEgYHJvb20uam9pbmBcdUZGMDhcdTYzMDdcdTdFQjlcdTY4MDdcdTVCOUFcdUZGMDlcdTIxOTIgXHU3QjQ5IGpvaW4tYWNrXHVGRjFCXHJcbiAqIC0gYGxlYXZlUm9vbWAgPSBgbmV0LmNsb3NlUm9vbSgpYFx1RkYwOCoqXHU4MDRBXHU1OTI5XHU3Njg0XHU3NTFGXHU1NDdEXHU1NDY4XHU2NzFGXHU1RjUyXHU1QzVFXHU0RThFXHU2MjNGXHU5NUY0KipcdUZGMUFcdTc5QkJcdTVGMDBcdTUzNzNcdTY1QURcdTVGMDBcdTMwMDFcdTUzODZcdTUzRjJcdTc1NTlcdTU3MjhcdTY3MERcdTUyQTFcdTU2NjhcdUZGMDlcdUZGMUJcclxuICogLSBcdTY1QURcdTdFQkZcdTkxQ0RcdThGREVcdTU0MEVcdTY3MERcdTUyQTFcdTU2NjhcdTRGQTdcdTY2MkYqKlx1NTE2OFx1NjVCMFx1OEZERVx1NjNBNSoqXHVGRjA4XHU2MjEwXHU1NDU4L1x1OEJBMlx1OTYwNVx1OTBGRFx1NjYyRlx1NzdBQ1x1NjAwMVx1NzY4NFx1RkYwOVx1MjE5MiBcdTVGQzVcdTk4N0IqKlx1OTFDRFx1NTNEMSByb29tLmpvaW4qKlx1RkYwQ1xyXG4gKiAgIFx1NUU3NiBgYWZ0ZXI9PFx1NjcwMFx1NTQwRVx1NEUwMFx1Njc2MSBpZD5gIFx1NTg5RVx1OTFDRlx1ODg2NVx1NjJDOVx1NjVBRFx1N0VCRlx1NjcxRlx1OTVGNFx1NzY4NFx1ODA0QVx1NTkyOVx1MzAwMlxyXG4gKi9cclxuaW1wb3J0IHR5cGUgeyBJTmV0U2VydmljZSB9IGZyb20gJ0Bjb3JlL3BvcnRzL25ldCdcclxuaW1wb3J0IHR5cGUgeyBJUmVuZGVyU2VydmljZSB9IGZyb20gJ0Bjb3JlL3BvcnRzL3JlbmRlcidcclxuaW1wb3J0IHR5cGUgeyBJQm9va0lkZW50aXR5U2VydmljZSB9IGZyb20gJ0Bjb3JlL3BvcnRzL2lkZW50aXR5J1xyXG5pbXBvcnQgeyBUeXBlZEVtaXR0ZXIgfSBmcm9tICdAY29yZS9wb3J0cy9lbWl0dGVyJ1xyXG5pbXBvcnQgeyBleHRUb0Zvcm1hdCB9IGZyb20gJ0Bjb3JlL2RvbWFpbi9mb3JtYXQnXHJcbmltcG9ydCB7IG5vcm1hbGl6ZUxvY2F0aW9uLCBzYW1lTG9jYXRpb24gfSBmcm9tICdAY29yZS9kb21haW4vbG9jYXRpb24nXHJcbmltcG9ydCB7XHJcbiAgUk9PTV9NU0csXHJcbiAgYnVpbGRDaGF0SGlzdG9yeVBhdGgsXHJcbiAgaXNDaGF0TWVzc2FnZSxcclxuICBub3JtYWxpemVKb2luUmVhc29uLFxyXG4gIG5vcm1hbGl6ZVByZXNlbmNlTWVtYmVycyxcclxuICB0eXBlIEpvaW5GYWlsdXJlUmVhc29uXHJcbn0gZnJvbSAnQGNvcmUvZG9tYWluL3Byb3RvY29sJ1xyXG5pbXBvcnQgdHlwZSB7XHJcbiAgQm9va0Zvcm1hdCxcclxuICBCb29rRmluZ2VycHJpbnQsXHJcbiAgQm9va0xvY2F0aW9uLFxyXG4gIEJvb2tSZWNvcmQsXHJcbiAgQ2hhdE1lc3NhZ2UsXHJcbiAgQ29ubmVjdGlvblN0YXRlLFxyXG4gIEpvaW5BY2ssXHJcbiAgSm9pblJlc3VsdCxcclxuICBNZXNzYWdlRW52ZWxvcGUsXHJcbiAgUm9vbUluZm8sXHJcbiAgUm9vbU1lbWJlcixcclxuICBSb29tU3RhdGUsXHJcbiAgU3lzdGVtTWVzc2FnZVxyXG59IGZyb20gJ0Bjb3JlL2RvbWFpbi90eXBlcydcclxuXHJcbmV4cG9ydCB0eXBlIHsgSm9pbkZhaWx1cmVSZWFzb24sIEpvaW5SZXN1bHQgfVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBSb29tU2Vzc2lvbkV2ZW50cyB7XHJcbiAgJ2xvY2F0aW9uLXVwZGF0ZWQnOiAobG9jYXRpb246IEJvb2tMb2NhdGlvbiwgZnJvbTogUm9vbU1lbWJlcikgPT4gdm9pZFxyXG4gICdwcmVzZW5jZS11cGRhdGVkJzogKG1lbWJlcnM6IFJvb21NZW1iZXJbXSkgPT4gdm9pZFxyXG4gIC8qKiBcdTgwNEFcdTU5MjlcdTVFN0ZcdTY0QURcdUZGMDhcdTU0MkJcdTgxRUFcdTVERjFcdTUzRDFcdTc2ODQgPSBzZXJ2ZXIgXHU1NkRFXHU2MjY3XHVGRjA5XHUzMDAyXHU2RDg4XHU4RDM5XHU4MDA1XHU2MzA5IGlkIFx1NTQwOFx1NUU3Nlx1RkYwOFx1ODlDMSBgcHJvdG9jb2wubWVyZ2VDaGF0TWVzc2FnZXNgXHVGRjA5ICovXHJcbiAgJ2NoYXQtbWVzc2FnZSc6IChtc2c6IENoYXRNZXNzYWdlKSA9PiB2b2lkXHJcbiAgLyoqXHJcbiAgICogdjAuNC4zXHVGRjFBXHU4MDRBXHU1OTI5XHU1Mzg2XHU1M0YyXHVGRjA4XHU1MkEwXHU1MTY1XHU2MjNGXHU5NUY0XHU2NUY2XHU3Njg0XHU1MTY4XHU5MUNGIC8gXHU5MUNEXHU4RkRFXHU1NDBFXHU3Njg0XHU1ODlFXHU5MUNGXHVGRjA5XHUyMDE0XHUyMDE0IFx1NEUwRVx1NUU3Rlx1NjRBRFx1NTIwNlx1NUYwMFx1NjYyRlx1NTZFMFx1NEUzQSoqXHU2NzY1XHU2RTkwXHU0RTBEXHU1NDBDKipcdUZGMUFcclxuICAgKiBcdTUzODZcdTUzRjJcdTY3NjVcdTgxRUEgYEdFVCAvcm9vbXMve3Jvb21JRH0vbWVzc2FnZXNgXHVGRjA4XHU4RkZEXHU1MkEwXHU2NUU1XHU1RkQ3XHVGRjA5XHVGRjBDXHU1RTdGXHU2NEFEXHU2NzY1XHU4MUVBIGByb29tLm1lc3NhZ2VgXHUzMDAyXHJcbiAgICogXHU0RTI0XHU4MDA1XHU0RjFBXHU3RUQ5XHU1NDBDXHU0RTAwIGlkXHVGRjA4XHU5MUNEXHU4RkRFXHU4ODY1XHU2MkM5XHU0RTBFXHU1RTdGXHU2NEFEXHU0RUE0XHU5NTE5XHVGRjA5XHUyMTkyIFx1NkQ4OFx1OEQzOVx1ODAwNVx1NEUwMFx1NUY4Qlx1OEQ3MCBgbWVyZ2VDaGF0TWVzc2FnZXNgIFx1NTNCQlx1OTFDRFx1NjM5Mlx1NUU4Rlx1MzAwMlxyXG4gICAqL1xyXG4gICdjaGF0LWhpc3RvcnknOiAobWVzc2FnZXM6IENoYXRNZXNzYWdlW10pID0+IHZvaWRcclxuICAnc3lzdGVtLW1lc3NhZ2UnOiAobXNnOiBTeXN0ZW1NZXNzYWdlKSA9PiB2b2lkXHJcbiAgLyoqIGBmYWlsZWRgXHVGRjA4djAuNC44XHVGRjA5PSBcdTY1QURcdTdFQkZcdTkxQ0RcdThGREVcdTgwMTdcdTVDM0RcdUZGMUFcdTRGMUFcdThCRERcdTUzNzNcdTVDMDZcdTgxRUFcdTUyQThcdTU5MERcdTRGNERcdUZGMDhcdTgxRUFcdTUyQTggbGVhdmVSb29tICsgc3lzdGVtLW1lc3NhZ2UgXHU1NDRBXHU3N0U1XHVGRjA5ICovXHJcbiAgJ2Nvbm5lY3Rpb24tY2hhbmdlZCc6IChzdGF0ZTogQ29ubmVjdGlvblN0YXRlKSA9PiB2b2lkXHJcbiAgJ2Jvb2stbWlzbWF0Y2gnOiAoZGV0YWlsOiB7IGxvY2FsOiBCb29rUmVjb3JkWydmaW5nZXJwcmludCddOyByb29tOiBCb29rUmVjb3JkWydmaW5nZXJwcmludCddIH0pID0+IHZvaWRcclxufVxyXG5cclxuLyoqIFx1NEY0RFx1N0Y2RVx1NEUwQVx1NjJBNVx1ODI4Mlx1NkQ0MVx1N0E5N1x1NTNFM1x1RkYwOG1zXHVGRjA5XHUyMDE0XHUyMDE0XHU1RTdGXHU2NEFEXHU5ODkxXHU3Mzg3XHU4MjgyXHU2RDQxXHU2NjJGIGNsaWVudCBcdTgwNENcdThEMjMgKi9cclxuY29uc3QgTE9DQVRJT05fVEhST1RUTEVfTVMgPSAzMDBcclxuLyoqIGpvaW4gXHU3QjQ5XHU1Rjg1IGpvaW4tYWNrIFx1NzY4NFx1OEQ4NVx1NjVGNlx1RkYwOFRPRE8gUDJcdTMwMENqb2luIFx1NjNFMVx1NjI0Qlx1NjVFMFx1OEQ4NVx1NjVGNlx1MzAwRFx1RkYwOVx1MjAxNFx1MjAxNFx1OEQ4NVx1NjVGNlx1NUY1MiBgc2VydmVyLWVycm9yYFx1RkYwQ1x1NEUwRFx1NjMwMlx1NkI3QiAqL1xyXG5jb25zdCBKT0lOX1RJTUVPVVRfTVMgPSAxMDAwMFxyXG4vKiogXHU4MDRBXHU1OTI5XHU1Mzg2XHU1M0YyXHU2QkNGXHU5ODc1XHU2NzYxXHU2NTcwXHVGRjA4XHU2NzBEXHU1MkExXHU1NjY4XHU0RTBBXHU5NjUwIDUwMFx1MzAwMVx1OUVEOFx1OEJBNCA1MFx1RkYxQlx1NTJBMFx1NTE2NVx1NjIzRlx1OTVGNFx1NjVGNlx1NjJDOVx1NjcwMFx1OEZEMVx1NEUwMFx1OTg3NVx1RkYwOSAqL1xyXG5jb25zdCBDSEFUX0hJU1RPUllfTElNSVQgPSA1MFxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJUm9vbVNlc3Npb24ge1xyXG4gIG9uKGV2ZW50OiAnbG9jYXRpb24tdXBkYXRlZCcsIGxpc3RlbmVyOiBSb29tU2Vzc2lvbkV2ZW50c1snbG9jYXRpb24tdXBkYXRlZCddKTogKCkgPT4gdm9pZFxyXG4gIG9uKGV2ZW50OiAncHJlc2VuY2UtdXBkYXRlZCcsIGxpc3RlbmVyOiBSb29tU2Vzc2lvbkV2ZW50c1sncHJlc2VuY2UtdXBkYXRlZCddKTogKCkgPT4gdm9pZFxyXG4gIG9uKGV2ZW50OiAnY2hhdC1tZXNzYWdlJywgbGlzdGVuZXI6IFJvb21TZXNzaW9uRXZlbnRzWydjaGF0LW1lc3NhZ2UnXSk6ICgpID0+IHZvaWRcclxuICBvbihldmVudDogJ2NoYXQtaGlzdG9yeScsIGxpc3RlbmVyOiBSb29tU2Vzc2lvbkV2ZW50c1snY2hhdC1oaXN0b3J5J10pOiAoKSA9PiB2b2lkXHJcbiAgb24oZXZlbnQ6ICdzeXN0ZW0tbWVzc2FnZScsIGxpc3RlbmVyOiBSb29tU2Vzc2lvbkV2ZW50c1snc3lzdGVtLW1lc3NhZ2UnXSk6ICgpID0+IHZvaWRcclxuICBvbihldmVudDogJ2Nvbm5lY3Rpb24tY2hhbmdlZCcsIGxpc3RlbmVyOiBSb29tU2Vzc2lvbkV2ZW50c1snY29ubmVjdGlvbi1jaGFuZ2VkJ10pOiAoKSA9PiB2b2lkXHJcbiAgb24oZXZlbnQ6ICdib29rLW1pc21hdGNoJywgbGlzdGVuZXI6IFJvb21TZXNzaW9uRXZlbnRzWydib29rLW1pc21hdGNoJ10pOiAoKSA9PiB2b2lkXHJcblxyXG4gIC8qKiBcdTUyQTBcdTUxNjVcdTYyM0ZcdTk1RjRcdTVFNzZcdTVCOENcdTYyMTBcdTY4MDdcdTVCOUFcdUZGMUFcdTYzMDlcdTYyM0ZcdTk1RjRcdTVFRkFcdThGREVcdUZGMDhcdTYzRTFcdTYyNEJcdTVFMjYgcm9vbStuaWNrXHVGRjA5XHUyMTkyIFx1NEUwQVx1NjJBNVx1NjcyQ1x1NTczMFx1NjMwN1x1N0VCOSBcdTIxOTIgXHU5MDFBXHU4RkM3XHU1MjE5XHU4QkEyXHU5NjA1XHU2MjNGXHU5NUY0XHU3MkI2XHU2MDAxXHUzMDAyXHJcbiAgICogIHYwLjQuM1x1RkYxQWBib29rYCBcdTUxNDFcdThCQjggYG51bGxgID0gKipcdTY1RTBcdTRFNjZcdTYyMTBcdTU0NTgqKlx1RkYwOFx1NjcwRFx1NTJBMVx1NTY2OFx1NjYwRVx1Nzg2RVx1NjUyRlx1NjMwMVx1RkYxQWBmaW5nZXJwcmludDogbnVsbGAgXHU1M0VGXHU1MkEwXHU1MTY1XHU1RTc2XHU2MkZGXHU1NkRFIGVkaXRpb25cclxuICAgKiAgXHU0RjlCXHU0RTBCXHU4RjdEXHVGRjBDXHU4OUMxIGBBUEkubWRgXHUzMDBDcm9vbS5qb2luXHUzMDBEXHVGRjA5XHUyMDE0XHUyMDE0IFx1NzUyOFx1NEY4Qlx1NUM0Mlx1ODg2NVx1OUY1MFx1OEZEOVx1NEUyQVx1ODBGRFx1NTI5Qlx1RkYxQlVJIFx1NTE2NVx1NTNFM1x1NUY4NVx1NUI5QVx1MzAwMlxyXG4gICAqICB2MC40LjBcdUZGMUFgbGFzdExvY2F0aW9uYCBcdTc1MzFcdThDMDNcdTc1MjhcdTY1QjlcdTdFRDlcdUZGMDhcdTUzOUZcdTY3NjVcdTRFQ0UgYGJvb2subGFzdExvY2F0aW9uYCBcdThCRkIgXHUyMDE0XHUyMDE0IFx1OTYwNVx1OEJGQlx1NzJCNlx1NjAwMVx1NURGMlx1NjJDNlx1NTIzMCBgUmVhZGluZ1N0YXRlYFx1RkYwOVx1MzAwMiAqL1xyXG4gIGpvaW5Sb29tKHJvb21JZDogc3RyaW5nLCBib29rOiBCb29rUmVjb3JkIHwgbnVsbCwgbGFzdExvY2F0aW9uPzogQm9va0xvY2F0aW9uIHwgbnVsbCk6IFByb21pc2U8Sm9pblJlc3VsdD5cclxuICBsZWF2ZVJvb20oKTogUHJvbWlzZTx2b2lkPlxyXG4gIC8qKiBcdTYyNEJcdTUyQThcdTVFN0ZcdTY0QURcdTVGNTNcdTUyNERcdTRGNERcdTdGNkVcdUZGMDhcdTkwMUFcdTVFMzhcdTRFMERcdTk3MDBcdTg5ODFcdUZGMUFcdTdGRkJcdTk4NzVcdTc1MzFcdTUxODVcdTkwRThcdTc2RDFcdTU0MkMgcmVuZGVyIFx1ODFFQVx1NTJBOFx1NUU3Rlx1NjRBRFx1RkYwOSAqL1xyXG4gIGVtaXRMb2NhdGlvbihsb2NhdGlvbj86IEJvb2tMb2NhdGlvbik6IFByb21pc2U8dm9pZD5cclxuICAvKiogXHU1M0QxXHU5MDAxXHU4MDRBXHU1OTI5XHU2RDg4XHU2MDZGXHVGRjFBc2VydmVyIFx1ODQzRFx1NUU5M1x1NTQwRVx1NUU3Rlx1NjRBRCByb29tLm1lc3NhZ2UgXHU1NkRFXHU2MjY3XHVGRjA4XHU1NDJCXHU1M0QxXHU5MDAxXHU4MDA1XHVGRjA5XHVGRjFCXHU1Mzg2XHU1M0YyXHU3RUNGIFJFU1QgXHU2MkM5XHU1M0Q2ICovXHJcbiAgc2VuZENoYXQodGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPlxyXG4gIC8qKiB2MC40LjNcdUZGMUFcdTYyQzlcdTUzRDZcdTgwNEFcdTU5MjlcdTUzODZcdTUzRjJcdUZGMDhgR0VUIC9yb29tcy97cm9vbUlEfS9tZXNzYWdlcz9hZnRlcj0mbGltaXQ9YFx1RkYwQ1x1OEZGRFx1NTJBMFx1NjVFNVx1NUZEN1x1RkYwOVxyXG4gICAqICBcdTIwMTRcdTIwMTQgXHU1MkEwXHU1MTY1XHU2MjNGXHU5NUY0XHU4MUVBXHU1MkE4XHU2MkM5XHU2NzAwXHU4RkQxXHU0RTAwXHU5ODc1XHVGRjFCYGFmdGVyYCBcdTc1MjhcdTRFOEVcdTkxQ0RcdThGREVcdTU0MEVcdTU4OUVcdTkxQ0ZcdTg4NjVcdTYyQzkgKi9cclxuICBsaXN0TWVzc2FnZXMocm9vbUlkOiBzdHJpbmcsIG9wdHM/OiB7IGFmdGVyPzogbnVtYmVyOyBsaW1pdD86IG51bWJlciB9KTogUHJvbWlzZTxDaGF0TWVzc2FnZVtdPlxyXG4gIGdldFJvb21TdGF0ZSgpOiBSb29tU3RhdGUgfCBudWxsXHJcbiAgZ2V0TXlNZW1iZXJJZCgpOiBzdHJpbmcgfCBudWxsXHJcblxyXG4gIC8qKlxyXG4gICAqIHYwLjIuMSBcdTYyNjlcdTVDNTVcdUZGMUFcdTUyMUJcdTVFRkFcdTYyM0ZcdTk1RjRcdTVFNzZcdTZDRThcdTUxOEMgd29yay9lZGl0aW9uXHVGRjA4UE9TVCAvcm9vbXNcdUZGMDlcdTMwMDJcclxuICAgKiBcdTUzNEZcdThCQUVcdTU2RkFcdTVCOUEgY29udGVudC1oYXNoLXYxXHVGRjA4ZWRpdGlvbiBcdTUxODVcdTVCQjlcdTYzMDdcdTdFQjlcdUZGMDlcdTIwMTRcdTIwMTRzZXJ2ZXIgXHU1M0VBXHU3NjdCXHU4QkIwXHU0RTBEXHU5MUNEXHU3Qjk3XHUzMDAyXHJcbiAgICovXHJcbiAgY3JlYXRlUm9vbShib29rOiBCb29rUmVjb3JkLCBvd25lcjogc3RyaW5nKTogUHJvbWlzZTx7IHJvb21JZDogc3RyaW5nOyBlZGl0aW9uSWQ6IG51bWJlciB9PlxyXG4gIC8qKiB2MC4yLjEgXHU2MjY5XHU1QzU1XHVGRjFBXHU0RTBBXHU0RjIwXHU3NTM1XHU1QjUwXHU3MjQ4XHU1MjZGXHU2NzJDXHVGRjA4UE9TVCAvYm9va3Mve2VkaXRpb25JRH0vZmlsZVx1RkYwQ1x1NUU0Mlx1N0I0OVx1NTNCQlx1OTFDRFx1RkYwQ1x1NTIwNlx1NTNEMVx1NkU5MFx1RkYwOSAqL1xyXG4gIHVwbG9hZEJvb2tDb3B5KGVkaXRpb25JZDogbnVtYmVyLCBidWZmZXI6IEFycmF5QnVmZmVyKTogUHJvbWlzZTx2b2lkPlxyXG4gIC8qKlxyXG4gICAqIHYwLjQuOFx1RkYxQVx1NEUwQlx1OEY3RFx1NzUzNVx1NUI1MFx1NzI0OFx1NTI2Rlx1NjcyQ1x1RkYwOEdFVCAvYm9va3Mve2VkaXRpb25JRH0vZmlsZSBcdTIxOTIgQXJyYXlCdWZmZXJcdUZGMDlcdTMwMDJcclxuICAgKiBcdTY1RTBcdTRFNjZcdTYyMTBcdTU0NThcdTc2ODRcdTgzQjdcdTUzRDZcdThERUZcdTVGODRcdUZGMDhcdTY3MERcdTUyQTFcdTU2NjggYGxvY2FsQ29weSA9IDFgIFx1NjVGNlx1NTNFRlx1NzUyOFx1RkYxQjQwNCA9IFx1NTI2Rlx1NjcyQ1x1NjcyQVx1NEUwQVx1NEYyMFx1RkYwQ1x1OEMwM1x1NzUyOFx1NjVCOVx1NjNEMFx1NzkzQVx1RkYwOVx1MzAwMlxyXG4gICAqIFx1NUI1N1x1ODI4Mlx1NTZERVx1Njc2NVx1NTQwRVx1NzUzMVx1OEMwM1x1NzUyOFx1NjVCOVx1ODQzRFx1NzZEOFx1RkYwOGBwaWNrZXIuc2F2ZUJvb2tDb3B5YFx1RkYwOVx1MjE5MiBcdTVCRkNcdTUxNjVcdUZGMDhgYm9va3MuaW1wb3J0Qm9va2BcdUZGMDlcdTIxOTIgXHU2MjUzXHU1RjAwXHUzMDAyXHJcbiAgICovXHJcbiAgZG93bmxvYWRCb29rQ29weShlZGl0aW9uSWQ6IG51bWJlcik6IFByb21pc2U8QXJyYXlCdWZmZXI+XHJcbiAgLyoqIHYwLjIuMSBcdTYyNjlcdTVDNTVcdUZGMUFcdTYyM0ZcdTk1RjRcdTUzRDFcdTczQjBcdUZGMDhHRVQgL3Jvb21zXHVGRjBDXHU1M0VGXHU2MzA5IGVkaXRpb24gXHU2MjdFXHU2MjNGXHVGRjA5ICovXHJcbiAgbGlzdFJvb21zKGVkaXRpb25JZD86IG51bWJlcik6IFByb21pc2U8Um9vbUluZm9bXT5cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFJvb21TZXNzaW9uIGV4dGVuZHMgVHlwZWRFbWl0dGVyPFJvb21TZXNzaW9uRXZlbnRzPiBpbXBsZW1lbnRzIElSb29tU2Vzc2lvbiB7XHJcbiAgcHJpdmF0ZSBuZXQ6IElOZXRTZXJ2aWNlXHJcbiAgcHJpdmF0ZSByZW5kZXI6IElSZW5kZXJTZXJ2aWNlXHJcbiAgcHJpdmF0ZSBpZGVudGl0eTogSUJvb2tJZGVudGl0eVNlcnZpY2VcclxuXHJcbiAgcHJpdmF0ZSBzdGF0ZTogUm9vbVN0YXRlIHwgbnVsbCA9IG51bGxcclxuICBwcml2YXRlIG15SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsXHJcblxyXG4gIC8qKiBcdTVGNTNcdTUyNERcdTYyM0ZcdTk1RjRcdUZGMDhcdTRFMEUgbmV0IFx1NEZBN1x1NzY4NFx1NjIzRlx1OTVGNFx1OEZERVx1NjNBNVx1NTQwQ1x1NzUxRlx1NTQ3RFx1NTQ2OFx1NjcxRlx1RkYwOSAqL1xyXG4gIHByaXZhdGUgcm9vbUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbFxyXG4gIC8qKiBcdTVERjJcdTUyQTBcdTUxNjVcdTYyM0ZcdTk1RjRcdTdFRDFcdTVCOUFcdTc2ODRcdTRFNjZcdUZGMDhcdTY4M0NcdTVGMEZcdTc1MjhcdTRFOEUgcHJlc2VuY2UgZGlmZiBcdTkwMDlcdTRGNERcdTdGNkUga2V5XHVGRjFCXHU2MzA3XHU3RUI5XHU3NTI4XHU0RThFXHU2NUFEXHU3RUJGXHU5MUNEXHU4RkRFXHU1NDBFXHU5MUNEXHU1M0QxIHJvb20uam9pblx1RkYwOSAqL1xyXG4gIHByaXZhdGUgam9pbmVkQm9vazogQm9va1JlY29yZCB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBqb2luZWRGb3JtYXQ6IEJvb2tGb3JtYXQgfCBudWxsID0gbnVsbFxyXG4gIC8qKlxyXG4gICAqIFx1NjIzRlx1OTVGNFx1NjgwN1x1NUI5QVx1NjMwN1x1N0VCOVx1RkYwOFx1NUJBMVx1OEJBMSBCLTJcdUZGMDlcdUZGMUFcdTVFMjZcdTRFNjZcdTUyQTBcdTUxNjUgPSBcdTY3MkNcdTRFNjZcdTYzMDdcdTdFQjlcdUZGMUJcdTY1RTBcdTRFNjZcdTUyQTBcdTUxNjUgPSBqb2luLWFjayBcdTc2ODQgZWRpdGlvbiBcdTYzMDdcdTdFQjlcdTMwMDJcclxuICAgKiBgbG9jYXRpb24tY2hhbmdlZGAgXHU2NjJGXHU2RTMyXHU2N0QzXHU3QUVGXHU1M0UzXHU3Njg0XHU1MTY4XHU1QzQwXHU0RThCXHU0RUY2IFx1MjAxNFx1MjAxNCBcdTRFMEFcdTYyQTVcdTUyNERcdTVGQzVcdTk4N0JcdTY4MjFcdTlBOENcIlx1NUY1M1x1NTI0RFx1NjI1M1x1NUYwMFx1NzY4NFx1NEU2NiBcdTIyNjEgXHU2MjNGXHU5NUY0XHU3Njg0XHU0RTY2XCJcdUZGMENcclxuICAgKiBcdTUyMjRcdTYzNkVcdTRFMEVcdTY3MERcdTUyQTFcdTU2NjhcdTY4MDdcdTVCOUFcdTU0MENcdTUzRTNcdTVGODRcdUZGMDhgaWRlbnRpdHkudmVyaWZ5YFx1RkYxQWFsZ29yaXRobStoYXNoK3NpemUgXHU1MTY4XHU3QjQ5XHVGRjA5XHUzMDAyXHJcbiAgICovXHJcbiAgcHJpdmF0ZSByb29tRmluZ2VycHJpbnQ6IEJvb2tGaW5nZXJwcmludCB8IG51bGwgPSBudWxsXHJcbiAgLyoqIFx1NjYyRlx1NTQyNlx1NURGMlx1NTcyOFx1NjcyQ1x1NjIzRlx1OTVGNFx1NUI4Q1x1NjIxMFx1NjgwN1x1NUI5QVx1RkYwOGpvaW4tYWNrIG9rXHVGRjA5XHUyMDE0XHUyMDE0IFx1OTFDRFx1OEZERVx1NTQwRVx1NjM2RVx1NkI2NFx1NTFCM1x1NUI5QVx1ODk4MVx1NEUwRFx1ODk4MVx1OTFDRFx1NTNEMSBqb2luICovXHJcbiAgcHJpdmF0ZSBqb2luZWQgPSBmYWxzZVxyXG4gIC8qKiBcdTU0MDRcdTYyMTBcdTU0NThcdTc2ODRcdTY3MDBcdThGRDFcdTRFMDBcdTZCMjFcdTRGNERcdTdGNkVcdTU3RkFcdTdFQkZcdUZGMDhzZXJ2ZXIgXHU3NTI4IHByZXNlbmNlIFx1NTE2OFx1OTFDRlx1NUZFQlx1NzE2N1x1NjNBOFx1NEY0RFx1N0Y2RSBcdTIxOTIgXHU2NzJDXHU0RkE3IGRpZmYgXHU2MjREIGVtaXQgbG9jYXRpb24tdXBkYXRlZFx1RkYwOSAqL1xyXG4gIHByaXZhdGUgbWVtYmVyTG9jcyA9IG5ldyBNYXA8c3RyaW5nLCBCb29rTG9jYXRpb24+KClcclxuICAvKiogXHU1REYyXHU2NTM2XHU1MjMwXHU3Njg0XHU2NzAwXHU1NDBFXHU0RTAwXHU2NzYxXHU4MDRBXHU1OTI5IGlkXHVGRjA4XHU5MUNEXHU4RkRFXHU1NDBFIGBhZnRlcj1gIFx1NTg5RVx1OTFDRlx1ODg2NVx1NjJDOVx1NzY4NFx1OTUxQVx1RkYwOSAqL1xyXG4gIHByaXZhdGUgbGFzdENoYXRJZCA9IDBcclxuXHJcbiAgLyoqIFx1NzUxRlx1NTQ3RFx1NTQ2OFx1NjcxRlx1OEJBMlx1OTYwNVx1RkYxQVx1Njc4NFx1OTAyMFx1NjcxRlx1RkYwOG5ldFx1RkYwOVx1NUUzOFx1OUE3Qlx1RkYwQ1x1OTY4Rlx1NUI5RVx1NEY4Qlx1OTUwMFx1NkJDMVx1RkYxQmpvaW5Sb29tIFx1NjcxRlx1RkYwOHJlbmRlclx1RkYwOVx1OTY4RiBsZWF2ZVJvb20gXHU4OUUzXHU3RUQxICovXHJcbiAgcHJpdmF0ZSBuZXRVbnN1YnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW11cclxuICBwcml2YXRlIGpvaW5VbnN1YnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW11cclxuICAvKipcclxuICAgKiBqb2luIFx1N0I0OVx1NUY4NVx1NjlGRFx1RkYwOHYwLjQuMyBcdTRGRUUgVE9ETyBQMlx1MzAwQ1x1NTM1NVx1NjlGRFx1ODk4Nlx1NzZENlx1NUYwRlx1OEQ0Qlx1NTAzQ1x1MzAwRFx1RkYwOVx1RkYxQSoqXHU1MzU1XHU2OUZEICsgXHU0RUUzXHU2QjIxKiogXHUyMDE0XHUyMDE0XHJcbiAgICogXHU1RTc2XHU1M0QxIGpvaW4gXHU2NUY2XHU2NUU3XHU3Njg0XHU5MEEzXHU2QjIxXHU3QUNCXHU1MzczXHU0RUU1IGBzZXJ2ZXItZXJyb3JgIFx1N0VEM1x1Njc1Rlx1RkYwOFx1ODAwQ1x1NEUwRFx1NjYyRlx1ODhBQlx1ODk4Nlx1NzZENlx1NTQwRVx1NkMzOFx1NEU0NVx1NjMwMlx1OEQ3N1x1RkYwOVx1RkYwQ1x1NTNFQVx1NjcwOVx1NjcwMFx1NjVCMFx1NEUwMFx1NkIyMVx1N0I0OSBhY2tcdTMwMDJcclxuICAgKi9cclxuICBwcml2YXRlIHBlbmRpbmdKb2luOiB7IGdlbjogbnVtYmVyOyByZXNvbHZlOiAoYWNrOiBKb2luQWNrIHwgbnVsbCkgPT4gdm9pZCB9IHwgbnVsbCA9IG51bGxcclxuICBwcml2YXRlIGpvaW5HZW4gPSAwXHJcbiAgcHJpdmF0ZSBqb2luVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGxcclxuICAvKiogam9pblJvb20gXHU4QzAzXHU3NTI4XHU0RUUzXHU2QjIxXHVGRjA4XHU1QkExXHU4QkExIEMtMlx1RkYwOVx1RkYxQVx1NTkyN1x1NTM4NVx1NUZFQlx1OTAxRlx1OEZERVx1NzBCOVx1NEUyNFx1NEUyQVx1NjIzRlx1OTVGNCA9IFx1NUU3Nlx1NTNEMSBqb2luIFx1MjAxNFx1MjAxNCBcdTY1RTdcdTc2ODRcdTkwQTNcdTZCMjFcdTU3MjhcdTZCQ0ZcdTRFMkFcclxuICAgKiAgYXdhaXQgXHU2MDYyXHU1OTBEXHU3MEI5XHU0RjVDXHU1RTlGXHU4MUVBXHU1REYxXHVGRjA4XHU4RkQ0XHU1NkRFIGBzdXBlcnNlZGVkYFx1RkYwOVx1RkYwQ1x1NEUwRFx1NUY5N1x1NTE4RFx1NzhCMFx1NTE3MVx1NEVBQlx1NzJCNlx1NjAwMVx1NjIxNlx1ODlFNlx1NTNEMVx1NTkzMVx1OEQyNVx1NkUwNVx1NzQwNlx1OERFRlx1NUY4NFx1MzAwMiAqL1xyXG4gIHByaXZhdGUgam9pbkNhbGxHZW4gPSAwXHJcbiAgcHJpdmF0ZSBsYXN0U2VudEF0ID0gMFxyXG4gIHByaXZhdGUgcGVuZGluZ0VtaXQ6IEJvb2tMb2NhdGlvbiB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBlbWl0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGxcclxuXHJcbiAgY29uc3RydWN0b3IobmV0OiBJTmV0U2VydmljZSwgcmVuZGVyOiBJUmVuZGVyU2VydmljZSwgaWRlbnRpdHk6IElCb29rSWRlbnRpdHlTZXJ2aWNlKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICB0aGlzLm5ldCA9IG5ldFxyXG4gICAgdGhpcy5yZW5kZXIgPSByZW5kZXJcclxuICAgIHRoaXMuaWRlbnRpdHkgPSBpZGVudGl0eVxyXG4gICAgdGhpcy5uZXRVbnN1YnMucHVzaChcclxuICAgICAgbmV0Lm9uKCdtZXNzYWdlJywgKGVudikgPT4gdGhpcy5oYW5kbGVFbnZlbG9wZShlbnYpKSxcclxuICAgICAgbmV0Lm9uKCdjb25uZWN0aW9uLWNoYW5nZWQnLCAocykgPT4ge1xyXG4gICAgICAgIHRoaXMuZW1pdCgnY29ubmVjdGlvbi1jaGFuZ2VkJywgcylcclxuICAgICAgICAvLyBcdTY1QURcdTdFQkZcdTkxQ0RcdThGREVcdUZGMUFcdTY3MERcdTUyQTFcdTU2NjhcdTRGQTdcdTVERjJcdTY2MkZcdTUxNjhcdTY1QjBcdThGREVcdTYzQTUgXHUyMTkyIFx1OTFDRFx1NTNEMSBqb2luXHVGRjA4XHU1NDI2XHU1MjE5XHU2NjJGXCJcdTU3MjhcdTYyM0ZcdTk1RjRcdTkxQ0NcdTUzNzRcdTRFMERcdTY2MkZcdTYyMTBcdTU0NThcIlx1NzY4NFx1NUU3RFx1NzA3NVx1RkYwOVx1MzAwMlxyXG4gICAgICAgIC8vIFx1NjVFMFx1NEU2Nlx1NjIxMFx1NTQ1OFx1RkYwOGpvaW5lZEJvb2sgPSBudWxsXHVGRjA5XHU1NDBDXHU2ODM3XHU4OTgxXHU5MUNEXHU1MTY1IFx1MjAxNFx1MjAxNCBcdTVCQTFcdThCQTEgQS0xIFx1NjQ1OFx1OTY2NFx1NUI4OFx1NTM2Qlx1NjVGNlx1NEUwMFx1NUU3Nlx1NUJGOVx1OUY1MFxyXG4gICAgICAgIGlmIChzID09PSAnY29ubmVjdGVkJyAmJiB0aGlzLmpvaW5lZCAmJiB0aGlzLnJvb21JZCkge1xyXG4gICAgICAgICAgdm9pZCB0aGlzLnJlam9pbigpXHJcbiAgICAgICAgfSBlbHNlIGlmIChzID09PSAnZmFpbGVkJyAmJiB0aGlzLmpvaW5lZCkge1xyXG4gICAgICAgICAgLy8gXHU1QkExXHU4QkExIEItNFx1RkYxQVx1OTFDRFx1OEZERVx1ODAxN1x1NUMzRCA9IFx1NEYxQVx1OEJERFx1NkNBMVx1NjcwOVx1NTFGQVx1NTNFM1x1NEU4Nlx1RkYwOFx1NjcwRFx1NTJBMVx1NTY2OFx1NEUwRFx1NTE4RFx1NTNFRlx1OEZCRVx1RkYwOVx1MjAxNFx1MjAxNCBcdTgxRUFcdTUyQThcdTU5MERcdTRGNERcdTU2REVcdTU5MjdcdTUzODVcdTVFNzZcdTU0NEFcdTc3RTVcdUZGMENcclxuICAgICAgICAgIC8vIFx1ODAwQ1x1NEUwRFx1NjYyRlx1NzU1OVx1Nzc0MFwiVUkgXHU2NjNFXHU3OTNBXHU2NzJBXHU4RkRFXHU2M0E1XHUzMDAxXHU0RjFBXHU4QkREXHU0RUNEIGpvaW5lZFwiXHU3Njg0XHU1MzRBXHU2QjdCXHU2MDAxXHUzMDAyXHU1M0VGXHU5ODg0XHU2NzFGXHU0RjE4XHU0RThFXHU2Qzg5XHU5RUQ4XHUzMDAyXHJcbiAgICAgICAgICB2b2lkIHRoaXMubGVhdmVSb29tKCkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnc3lzdGVtLW1lc3NhZ2UnLCB7XHJcbiAgICAgICAgICAgICAgdHlwZTogJ2Vycm9yJyxcclxuICAgICAgICAgICAgICB0ZXh0OiAnXHU5MUNEXHU5MDIzXHU1OTFBXHU2QjIxXHU1OTMxXHU2NTU3XHVGRjBDXHU1REYyXHU5NkUyXHU5NThCXHU2MjNGXHU5NTkzXHVGRjA4XHU2QUEyXHU2N0U1XHU3REIyXHU4REVGXHU1RjhDXHU1M0VGXHU5MUNEXHU2NUIwXHU5MDMyXHU1MTY1XHVGRjA5J1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBhc3luYyBqb2luUm9vbShcclxuICAgIHJvb21JZDogc3RyaW5nLFxyXG4gICAgYm9vazogQm9va1JlY29yZCB8IG51bGwsXHJcbiAgICBsYXN0TG9jYXRpb24/OiBCb29rTG9jYXRpb24gfCBudWxsXHJcbiAgKTogUHJvbWlzZTxKb2luUmVzdWx0PiB7XHJcbiAgICAvLyBcdTVCQTFcdThCQTEgQy0yXHVGRjFBXHU1RTc2XHU1M0QxIGpvaW4gXHU3Njg0XHU0RUUzXHU2QjIxXHU1Qjg4XHU1MzZCIFx1MjAxNFx1MjAxNCBcdTY1RTdcdThDMDNcdTc1MjhcdTU3MjhcdTZCQ0ZcdTRFMkEgYXdhaXQgXHU2MDYyXHU1OTBEXHU3MEI5XHU4MUVBXHU2OEMwXHVGRjBDXHU4NDNEXHU4RDI1XHU2NUI5XHU3QUNCXHU1MzczXHU0RjVDXHU1RTlGXHUzMDAyXHJcbiAgICAvLyBcdTgyRTVcdTRFMERcdTUwNUFcdUZGMENcdTg0M0RcdThEMjVcdTY1QjlcdTc2ODRcdTU5MzFcdThEMjVcdTZFMDVcdTc0MDZcdUZGMDhjbG9zZVJvb20vcmVzZXRKb2luU3RhdGVcdUZGMDlcdTRGMUFcdTc4MzhcdTYzODlcdTgwRENcdTY1QjlcdTc2ODRcdTRGMUFcdThCRERcdTMwMDJcclxuICAgIGNvbnN0IGdlbiA9ICsrdGhpcy5qb2luQ2FsbEdlblxyXG4gICAgY29uc3Qgc3VwZXJzZWRlZCA9ICgpOiBKb2luUmVzdWx0ID0+ICh7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3VwZXJzZWRlZCcgfSlcclxuICAgIGlmICh0aGlzLnJvb21JZCkgYXdhaXQgdGhpcy5sZWF2ZVJvb20oKVxyXG4gICAgaWYgKGdlbiAhPT0gdGhpcy5qb2luQ2FsbEdlbikgcmV0dXJuIHN1cGVyc2VkZWQoKVxyXG4gICAgY29uc3QgcmlkID0gcm9vbUlkLnRyaW0oKS50b0xvd2VyQ2FzZSgpXHJcbiAgICBpZiAoIXJpZCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdyb29tLW5vdC1mb3VuZCcgfVxyXG5cclxuICAgIHRoaXMubXlJZCA9IGF3YWl0IHRoaXMubmV0LmdldE1lbWJlcklkKClcclxuICAgIGlmIChnZW4gIT09IHRoaXMuam9pbkNhbGxHZW4pIHJldHVybiBzdXBlcnNlZGVkKClcclxuICAgIHRoaXMuam9pbmVkQm9vayA9IGJvb2tcclxuICAgIC8vIFx1NjVFMFx1NEU2Nlx1NjIxMFx1NTQ1OFx1RkYwOGJvb2sgPSBudWxsXHVGRjA5XHVGRjFBXHU0RjREXHU3RjZFXHU2QkQ0XHU4RjgzXHU3Njg0XHU2ODNDXHU1RjBGXHU5NTJFXHU2NjVBXHU0RTAwXHU2QjY1XHU0RUNFIGpvaW4tYWNrIFx1NzY4NCBlZGl0aW9uIFx1NjI2OVx1NUM1NVx1NTQwRFx1NjNBOFx1NTFGQVx1Njc2NVxyXG4gICAgdGhpcy5qb2luZWRGb3JtYXQgPSBib29rID8gYm9vay5mb3JtYXQgOiBudWxsXHJcbiAgICB0aGlzLnJvb21JZCA9IHJpZFxyXG4gICAgdGhpcy5sYXN0Q2hhdElkID0gMFxyXG5cclxuICAgIC8vIFx1MjQ2MCBcdTYzMDlcdTYyM0ZcdTk1RjRcdTVFRkFcdThGREVcdUZGMDhcdTYzRTFcdTYyNEJcdTVFMjYgcm9vbStuaWNrXHVGRjFCXHU2NzBEXHU1MkExXHU1NjY4XHU4OTgxXHU2QzQyXHVGRjBDXHU4OUMxIHdzTmV0QWRhcHRlciBcdTc2ODRcdTZDRThcdTkxQ0FcdUZGMDlcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMubmV0Lm9wZW5Sb29tKHJpZClcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBpZiAoZ2VuICE9PSB0aGlzLmpvaW5DYWxsR2VuKSByZXR1cm4gc3VwZXJzZWRlZCgpXHJcbiAgICAgIHRoaXMucmVzZXRKb2luU3RhdGUoKVxyXG4gICAgICB0aGlzLmVtaXQoJ3N5c3RlbS1tZXNzYWdlJywge1xyXG4gICAgICAgIHR5cGU6ICdlcnJvcicsXHJcbiAgICAgICAgdGV4dDogYFx1OTAyM1x1NjNBNVx1NjIzRlx1OTU5M1x1NTkzMVx1NjU1N1x1RkYxQSR7KGVyciBhcyBFcnJvcikubWVzc2FnZX1gXHJcbiAgICAgIH0pXHJcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc2VydmVyLWVycm9yJyB9XHJcbiAgICB9XHJcbiAgICBpZiAoZ2VuICE9PSB0aGlzLmpvaW5DYWxsR2VuKSByZXR1cm4gc3VwZXJzZWRlZCgpXHJcblxyXG4gICAgLy8gXHUyNDYxIFx1NjMwN1x1N0VCOVx1NjgwN1x1NUI5QVxyXG4gICAgY29uc3QgYWNrID0gYXdhaXQgdGhpcy5zZW5kSm9pbigpXHJcbiAgICBpZiAoZ2VuICE9PSB0aGlzLmpvaW5DYWxsR2VuKSByZXR1cm4gc3VwZXJzZWRlZCgpXHJcbiAgICBpZiAoIWFjayB8fCAhYWNrLm9rKSB7XHJcbiAgICAgIGNvbnN0IHJlYXNvbiA9IG5vcm1hbGl6ZUpvaW5SZWFzb24oYWNrPy5yZWFzb24pXHJcbiAgICAgIGlmIChyZWFzb24gPT09ICdib29rLW1pc21hdGNoJyAmJiBhY2s/LmVkaXRpb24gJiYgYm9vaykge1xyXG4gICAgICAgIHRoaXMuZW1pdCgnYm9vay1taXNtYXRjaCcsIHtcclxuICAgICAgICAgIGxvY2FsOiBib29rLmZpbmdlcnByaW50LFxyXG4gICAgICAgICAgcm9vbToge1xyXG4gICAgICAgICAgICBhbGdvcml0aG06ICdtZDUtc2FtcGxlMy12MScsXHJcbiAgICAgICAgICAgIGhhc2g6IGFjay5lZGl0aW9uLmhhc2gsXHJcbiAgICAgICAgICAgIHNpemU6IGFjay5lZGl0aW9uLnNpemVcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICAgIGF3YWl0IHRoaXMubmV0LmNsb3NlUm9vbSgpXHJcbiAgICAgIHRoaXMucmVzZXRKb2luU3RhdGUoKVxyXG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbiB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gXHUyNDYyIFx1NjIxMFx1NTI5Rlx1RkYxQVx1NzY3Qlx1OEJCMFx1NjIxMFx1NTQ1OFx1NUU3Nlx1NjNBNVx1NEUwQSByZW5kZXIgXHU0RjREXHU3RjZFXHU0RThCXHU0RUY2XHJcbiAgICBjb25zdCBtZW1iZXJzID0gKGFjay5tZW1iZXJzID8/IFtdKS5tYXAoKG0pID0+IHRoaXMuZGVjb3JhdGVNZShtKSlcclxuICAgIC8vIFx1NjVFMFx1NEU2Nlx1NjIxMFx1NTQ1OFx1RkYxQVx1NEY0RFx1N0Y2RVx1NkJENFx1OEY4M1x1NzY4NFx1NjgzQ1x1NUYwRlx1OTUyRVx1NEVDRVx1NjIzRlx1OTVGNFx1N0VEMVx1NUI5QVx1NzY4NCBlZGl0aW9uIFx1NjI2OVx1NUM1NVx1NTQwRFx1NjNBOFx1RkYwOFx1NTQyNlx1NTIxOSBwcmVzZW5jZSBkaWZmIFx1NjU3NFx1Njc2MVx1NEUwRFx1NURFNVx1NEY1Q1x1RkYwQ1xyXG4gICAgLy8gXHU4OUMxIGRlcml2ZVJlbW90ZUxvY2F0aW9ucyBcdTc2ODQgYCF0aGlzLmpvaW5lZEZvcm1hdGAgXHU2NUU5XHU5MDAwXHVGRjA5XHJcbiAgICBpZiAoIXRoaXMuam9pbmVkRm9ybWF0ICYmIGFjay5lZGl0aW9uPy5leHQpIHRoaXMuam9pbmVkRm9ybWF0ID0gZXh0VG9Gb3JtYXQoYHguJHthY2suZWRpdGlvbi5leHR9YClcclxuICAgIC8vIFx1NUJBMVx1OEJBMSBCLTJcdUZGMUFcdTY4MDdcdTVCOUFcdTYzMDdcdTdFQjkgXHUyMDE0XHUyMDE0IFx1NUUyNlx1NEU2NiA9IFx1NjcyQ1x1NEU2Nlx1NjMwN1x1N0VCOVx1RkYxQlx1NjVFMFx1NEU2NiA9IFx1NjcwRFx1NTJBMVx1NTY2OFx1NTQ0QVx1NzdFNVx1NzY4NCBlZGl0aW9uIFx1NjMwN1x1N0VCOVxyXG4gICAgLy9cdUZGMDhcdTY1RTBcdTRFNjZcdTYyMTBcdTU0NThcdTRFMEJcdThGN0RcdTUyNkZcdTY3MkNcdTVCRkNcdTUxNjVcdTU0MEVcdTYyNTNcdTVGMDBcdTc2ODRcdTVDMzFcdTY2MkZcdTU0MENcdTUxODVcdTVCQjlcdTY1ODdcdTRFRjZcdUZGMENcdTYzMDdcdTdFQjlcdTZCRDRcdTVCRjlcdTU5MjlcdTcxMzZcdTYyMTBcdTdBQ0JcdUZGMDlcclxuICAgIHRoaXMucm9vbUZpbmdlcnByaW50ID0gYm9va1xyXG4gICAgICA/IGJvb2suZmluZ2VycHJpbnRcclxuICAgICAgOiBhY2suZWRpdGlvblxyXG4gICAgICAgID8ge1xyXG4gICAgICAgICAgICBhbGdvcml0aG06IChhY2suZWRpdGlvbi5oYXNoQWxnbyBhcyBCb29rRmluZ2VycHJpbnRbJ2FsZ29yaXRobSddKSA/PyAnbWQ1LXNhbXBsZTMtdjEnLFxyXG4gICAgICAgICAgICBoYXNoOiBhY2suZWRpdGlvbi5oYXNoLFxyXG4gICAgICAgICAgICBzaXplOiBhY2suZWRpdGlvbi5zaXplXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgOiBudWxsXHJcbiAgICB0aGlzLnN0YXRlID0ge1xyXG4gICAgICByb29tSWQ6IGFjay5yb29tSWQgPz8gcmlkLFxyXG4gICAgICBib29rSWQ6IGFjay5lZGl0aW9uID8gU3RyaW5nKGFjay5lZGl0aW9uLmlkKSA6IHVuZGVmaW5lZCxcclxuICAgICAgZWRpdGlvbjogYWNrLmVkaXRpb24sXHJcbiAgICAgIG1lbWJlcnMsXHJcbiAgICAgIGN1cnJlbnRMb2NhdGlvbjogbGFzdExvY2F0aW9uID8/IG51bGxcclxuICAgIH1cclxuICAgIHRoaXMuam9pbmVkID0gdHJ1ZVxyXG4gICAgdGhpcy5zZWVkTWVtYmVyTG9jcyhtZW1iZXJzKVxyXG4gICAgdGhpcy5qb2luVW5zdWJzLnB1c2godGhpcy5yZW5kZXIub24oJ2xvY2F0aW9uLWNoYW5nZWQnLCAobG9jKSA9PiB0aGlzLm9uUmVuZGVyTG9jYXRpb24obG9jKSkpXHJcbiAgICB0aGlzLmVtaXQoJ3ByZXNlbmNlLXVwZGF0ZWQnLCBtZW1iZXJzKVxyXG4gICAgLy8gXHUyNDYzIFx1ODA0QVx1NTkyOVx1NTM4Nlx1NTNGMlx1RkYwOFx1OEZGRFx1NTJBMFx1NjVFNVx1NUZEN1x1NkEyMVx1NTc4Qlx1RkYxQlx1NTM4Nlx1NTNGMlx1NzUxRlx1NTQ3RFx1NTQ2OFx1NjcxRlx1NEUwRVx1NjIzRlx1OTVGNFx1NEUwMFx1ODFGNFx1RkYwOVx1MzAwMlxyXG4gICAgLy8gaXNDdXJyZW50XHVGRjFBXHU0RTBBXHU0RTAwXHU0RjFBXHU4QkREXHU5MDU3XHU3NTU5XHU3Njg0XHU1Mzg2XHU1M0YyXHU4QkY3XHU2QzQyXHU1NkRFXHU2NzY1XHU2NUY2XHU0RTBEXHU1MThEXHU1MTY1XHU4RDI2XHVGRjA4ZW1pdCBcdTRFMEUgbGFzdENoYXRJZCBcdTkwRkRcdTRFMERcdTc4QjBcdUZGMDlcclxuICAgIGF3YWl0IHRoaXMubG9hZEhpc3RvcnkoMCwgKCkgPT4gZ2VuID09PSB0aGlzLmpvaW5DYWxsR2VuKVxyXG4gICAgaWYgKGdlbiAhPT0gdGhpcy5qb2luQ2FsbEdlbikgcmV0dXJuIHN1cGVyc2VkZWQoKVxyXG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHJvb206IHRoaXMuc3RhdGUgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgbGVhdmVSb29tKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgLy8gXHU1M0VBXHU4OUUzXHU3RUQxIGpvaW5Sb29tIFx1NjcxRlx1OEJBMlx1OTYwNVx1RkYwOHJlbmRlciBsb2NhdGlvbi1jaGFuZ2VkXHVGRjA5XHVGRjFCbmV0IFx1OEJBMlx1OTYwNVx1NUM1RVx1Njc4NFx1OTAyMFx1NjcxRlx1NzUxRlx1NTQ3RFx1NTQ2OFx1NjcxRlx1RkYwQ1x1OTY4Rlx1NUI5RVx1NEY4Qlx1NUI1OFx1NkQzQlxyXG4gICAgdGhpcy5qb2luVW5zdWJzLmZvckVhY2goKHUpID0+IHUoKSlcclxuICAgIHRoaXMuam9pblVuc3VicyA9IFtdXHJcbiAgICBpZiAodGhpcy5lbWl0VGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmVtaXRUaW1lcilcclxuICAgIHRoaXMuZW1pdFRpbWVyID0gbnVsbFxyXG4gICAgLy8gXHU1QkExXHU4QkExIEMtNVx1RkYxQVx1ODI4Mlx1NkQ0MVx1N0E5N1x1NTNFM1x1NTE4NVx1NjcyQVx1NTNEMVx1NTFGQVx1NzY4NFx1NEY0RFx1N0Y2RVx1NEUwMFx1NUU3Nlx1NEY1Q1x1NUU5RiBcdTIwMTRcdTIwMTQgXHU0RTBEXHU2RTA1XHU3Njg0XHU4QkREXHU5MUNEXHU4RkRCXHU2MjNGXHU5NUY0XHU0RjFBXHU2MjhBXHU0RTBBXHU0RTAwXHU0RjFBXHU4QkREXHU3Njg0XHU2NUU3XHU0RjREXHU3RjZFXHU1RTI2XHU1MUZBXHU1M0JCXHJcbiAgICB0aGlzLnBlbmRpbmdFbWl0ID0gbnVsbFxyXG4gICAgdGhpcy5jbGVhclBlbmRpbmdKb2luKClcclxuICAgIHRoaXMucmVzZXRKb2luU3RhdGUoKVxyXG4gICAgLy8gXHU2M0UxXHU2MjRCXHU1MzczXHU2MjNGXHU5NUY0XHVGRjFBXHU3OUJCXHU1RjAwID0gXHU2NUFEXHU1RjAwXHU4RkRFXHU2M0E1XHVGRjA4XHU4MDRBXHU1OTI5L1x1NEY0RFx1N0Y2RVx1NTQwQ1x1NkI2NVx1OTY4Rlx1NjIzRlx1OTVGNFx1N0VEM1x1Njc1Rlx1RkYxQlx1NTM4Nlx1NTNGMlx1NzU1OVx1NTcyOFx1NjcwRFx1NTJBMVx1NTY2OFx1RkYwQ1x1OTY4Rlx1NjIzRlx1OTVGNFx1N0VBN1x1ODA1NFx1NkUwNVx1NzQwNlx1RkYwOVxyXG4gICAgYXdhaXQgdGhpcy5uZXQuY2xvc2VSb29tKClcclxuICB9XHJcblxyXG4gIGFzeW5jIGVtaXRMb2NhdGlvbihsb2NhdGlvbj86IEJvb2tMb2NhdGlvbik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgLy8gXHU2MjRCXHU1MkE4XHU4REVGXHU1Rjg0XHU0RTBFXHU4MUVBXHU1MkE4XHU4REVGXHU1Rjg0XHU1NDBDXHU0RTAwXHU1MUZBXHU1M0UzXHUzMDAxXHU1NDBDXHU0RTAwXHU2ODIxXHU5QThDXHVGRjA4XHU1QkExXHU4QkExIEItMiAvIFRPRE9cdTMwMENlbWl0TG9jYXRpb24gXHU3RUQ1XHU4RkM3XHU4MjgyXHU2RDQxXHUzMDBEXHVGRjA5XHJcbiAgICBpZiAoIXRoaXMuaXNPcGVuQm9va1RoZVJvb21zQm9vaygpKSByZXR1cm5cclxuICAgIGNvbnN0IGxvYyA9IGxvY2F0aW9uID8/IHRoaXMucmVuZGVyLmdldFBvc2l0aW9uKClcclxuICAgIHRoaXMudGhyb3R0bGVTZW5kKGxvYylcclxuICB9XHJcblxyXG4gIGFzeW5jIHNlbmRDaGF0KHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgdHJpbW1lZCA9IHRleHQudHJpbSgpXHJcbiAgICBpZiAoIXRyaW1tZWQpIHJldHVyblxyXG4gICAgaWYgKCF0aGlzLmpvaW5lZCkgdGhyb3cgbmV3IEVycm9yKCdcdTVDMUFcdTY3MkFcdTUyQTBcdTUxNjVcdTYyM0ZcdTk1OTMnKVxyXG4gICAgYXdhaXQgdGhpcy5uZXQuc2VuZCh7IHR5cGU6IFJPT01fTVNHLmNoYXQsIHBheWxvYWQ6IHsgdGV4dDogdHJpbW1lZCB9IH0pXHJcbiAgfVxyXG5cclxuICBhc3luYyBsaXN0TWVzc2FnZXMocm9vbUlkOiBzdHJpbmcsIG9wdHM/OiB7IGFmdGVyPzogbnVtYmVyOyBsaW1pdD86IG51bWJlciB9KTogUHJvbWlzZTxDaGF0TWVzc2FnZVtdPiB7XHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLm5ldC5yZXF1ZXN0PHsgbWVzc2FnZXM/OiBDaGF0TWVzc2FnZVtdIH0+KHtcclxuICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgcGF0aDogYnVpbGRDaGF0SGlzdG9yeVBhdGgocm9vbUlkLCBvcHRzKVxyXG4gICAgfSlcclxuICAgIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYFx1NjJDOVx1NTNENlx1ODA0QVx1NTkyOVx1NkI3N1x1NTNGMlx1NTkzMVx1NjU1N1x1RkYxQSR7SlNPTi5zdHJpbmdpZnkocmVzLmRhdGEpfWApXHJcbiAgICBjb25zdCBsaXN0ID0gcmVzLmRhdGE/Lm1lc3NhZ2VzXHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobGlzdCkpIHJldHVybiBbXVxyXG4gICAgcmV0dXJuIGxpc3QuZmlsdGVyKGlzQ2hhdE1lc3NhZ2UpLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKVxyXG4gIH1cclxuXHJcbiAgZ2V0Um9vbVN0YXRlKCk6IFJvb21TdGF0ZSB8IG51bGwge1xyXG4gICAgcmV0dXJuIHRoaXMuc3RhdGVcclxuICB9XHJcblxyXG4gIGdldE15TWVtYmVySWQoKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gdGhpcy5teUlkXHJcbiAgfVxyXG5cclxuICBhc3luYyBjcmVhdGVSb29tKGJvb2s6IEJvb2tSZWNvcmQsIG93bmVyOiBzdHJpbmcpOiBQcm9taXNlPHsgcm9vbUlkOiBzdHJpbmc7IGVkaXRpb25JZDogbnVtYmVyIH0+IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMubmV0LnJlcXVlc3Q8eyByb29tSWQ6IHN0cmluZzsgZWRpdGlvbklkOiBudW1iZXIgfT4oe1xyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgcGF0aDogJy9yb29tcycsXHJcbiAgICAgIGJvZHk6IHtcclxuICAgICAgICBvd25lcixcclxuICAgICAgICBib29rOiB7XHJcbiAgICAgICAgICBwcm90b2NvbDogJ2NvbnRlbnQtaGFzaC12MScsXHJcbiAgICAgICAgICBjb2RlOiBib29rLmZpbmdlcnByaW50Lmhhc2gsXHJcbiAgICAgICAgICB0aXRsZTogYm9vay5tZXRhZGF0YS50aXRsZSxcclxuICAgICAgICAgIGV4dDogYm9vay5mb3JtYXQudG9Mb3dlckNhc2UoKSxcclxuICAgICAgICAgIGhhc2hBbGdvOiBib29rLmZpbmdlcnByaW50LmFsZ29yaXRobSxcclxuICAgICAgICAgIGhhc2g6IGJvb2suZmluZ2VycHJpbnQuaGFzaCxcclxuICAgICAgICAgIHNpemU6IGJvb2suZmluZ2VycHJpbnQuc2l6ZVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYFx1NTIxQlx1NUVGQVx1NjIzRlx1OTVGNFx1NTkzMVx1OEQyNTogJHtKU09OLnN0cmluZ2lmeShyZXMuZGF0YSl9YClcclxuICAgIHJldHVybiByZXMuZGF0YVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgdXBsb2FkQm9va0NvcHkoZWRpdGlvbklkOiBudW1iZXIsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMubmV0LnJlcXVlc3Q8dW5rbm93bj4oe1xyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgcGF0aDogYC9ib29rcy8ke2VkaXRpb25JZH0vZmlsZWAsXHJcbiAgICAgIGJvZHk6IGJ1ZmZlcixcclxuICAgICAgcmF3Qm9keTogdHJ1ZSxcclxuICAgICAgcmVzcG9uc2VUeXBlOiAndGV4dCdcclxuICAgIH0pXHJcbiAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBcdTRFMEFcdTRGMjBcdTUyNkZcdTY3MkNcdTU5MzFcdThEMjU6ICR7SlNPTi5zdHJpbmdpZnkocmVzLmRhdGEpfWApXHJcbiAgfVxyXG5cclxuICBhc3luYyBkb3dubG9hZEJvb2tDb3B5KGVkaXRpb25JZDogbnVtYmVyKTogUHJvbWlzZTxBcnJheUJ1ZmZlcj4ge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5uZXQucmVxdWVzdDxBcnJheUJ1ZmZlcj4oe1xyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBwYXRoOiBgL2Jvb2tzLyR7ZWRpdGlvbklkfS9maWxlYCxcclxuICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInXHJcbiAgICB9KVxyXG4gICAgaWYgKCFyZXMub2spIHtcclxuICAgICAgY29uc3QgZGV0YWlsID0gdHlwZW9mIHJlcy5kYXRhID09PSAnc3RyaW5nJyB8fCByZXMuZGF0YSA9PSBudWxsID8gU3RyaW5nKHJlcy5kYXRhID8/ICcnKSA6IEpTT04uc3RyaW5naWZ5KHJlcy5kYXRhKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFx1NEUwQlx1OEY3RFx1NTI2Rlx1NjcyQ1x1NTkzMVx1OEQyNVx1RkYwOEhUVFAgJHtyZXMuc3RhdHVzfVx1RkYwOSR7ZGV0YWlsID8gYFx1RkYxQSR7ZGV0YWlsLnNsaWNlKDAsIDEyMCl9YCA6ICcnfWApXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzLmRhdGFcclxuICB9XHJcblxyXG4gIGFzeW5jIGxpc3RSb29tcyhlZGl0aW9uSWQ/OiBudW1iZXIpOiBQcm9taXNlPFJvb21JbmZvW10+IHtcclxuICAgIGNvbnN0IHEgPSBlZGl0aW9uSWQgIT0gbnVsbCA/IGA/ZWRpdGlvbj0ke2VkaXRpb25JZH1gIDogJydcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMubmV0LnJlcXVlc3Q8eyByb29tczogUm9vbUluZm9bXSB9Pih7XHJcbiAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIHBhdGg6IGAvcm9vbXMke3F9YFxyXG4gICAgfSlcclxuICAgIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYFx1NjJDOVx1NTNENlx1NjIzRlx1OTVGNFx1NTIxN1x1ODg2OFx1NTkzMVx1OEQyNTogJHtKU09OLnN0cmluZ2lmeShyZXMuZGF0YSl9YClcclxuICAgIHJldHVybiByZXMuZGF0YS5yb29tc1xyXG4gIH1cclxuXHJcbiAgLyoqIFx1NTNEMSByb29tLmpvaW4gXHU1RTc2XHU3QjQ5IGpvaW4tYWNrXHVGRjA4XHU1RTI2XHU4RDg1XHU2NUY2ICsgXHU1MzU1XHU2OUZEXHU0RUUzXHU2QjIxXHVGRjBDXHU4OUMxIHBlbmRpbmdKb2luIFx1NkNFOFx1OTFDQVx1RkYwOSAqL1xyXG4gIHByaXZhdGUgYXN5bmMgc2VuZEpvaW4oKTogUHJvbWlzZTxKb2luQWNrIHwgbnVsbD4ge1xyXG4gICAgY29uc3QgZ2VuID0gKyt0aGlzLmpvaW5HZW5cclxuICAgIHRoaXMuY2xlYXJQZW5kaW5nSm9pbigpXHJcbiAgICBjb25zdCB3YWl0ID0gbmV3IFByb21pc2U8Sm9pbkFjayB8IG51bGw+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgIHRoaXMucGVuZGluZ0pvaW4gPSB7IGdlbiwgcmVzb2x2ZSB9XHJcbiAgICAgIHRoaXMuam9pblRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ0pvaW4/LmdlbiA9PT0gZ2VuKSB7XHJcbiAgICAgICAgICB0aGlzLnBlbmRpbmdKb2luID0gbnVsbFxyXG4gICAgICAgICAgdGhpcy5qb2luVGltZXIgPSBudWxsXHJcbiAgICAgICAgICByZXNvbHZlKG51bGwpXHJcbiAgICAgICAgfVxyXG4gICAgICB9LCBKT0lOX1RJTUVPVVRfTVMpXHJcbiAgICB9KVxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5uZXQuc2VuZCh7XHJcbiAgICAgICAgdHlwZTogUk9PTV9NU0cuam9pbixcclxuICAgICAgICAvLyBcdTY1RTBcdTRFNjZcdTYyMTBcdTU0NThcdUZGMDhqb2luZWRCb29rID0gbnVsbFx1RkYwOT0gZmluZ2VycHJpbnQ6IG51bGwgXHUyMDE0XHUyMDE0IFx1NjcwRFx1NTJBMVx1NTY2OFx1NTE0MVx1OEJCOFx1NTJBMFx1NTE2NVx1NUU3Nlx1OEZENFx1NTZERSBlZGl0aW9uXHJcbiAgICAgICAgLy8gXHU0RjlCXHU0RTBCXHU4RjdEXHVGRjA4QVBJLm1kXHUzMDBDcm9vbS5qb2luXHUzMDBEXHVGRjFCQ09OVFJBQ1RTIHYwLjQuNFx1RkYwOVx1MzAwMlx1MjZBMCBcdTVCQTFcdThCQTEgQS0xXHVGRjFBXHU2QjY0XHU1MjREXHU3Njg0IGAham9pbmVkQm9va2BcclxuICAgICAgICAvLyBcdTVCODhcdTUzNkJcdThCQTlcIlx1NUUyNiBudWxsIFx1NjMwN1x1N0VCOVx1NzY4NCByb29tLmpvaW5cIlx1NkMzOFx1OEZEQ1x1NTNEMVx1NEUwRFx1NTFGQVx1NTNCQlx1RkYwQ1x1NEUwRVx1NTk1MVx1N0VBNlx1ODBDQ1x1NzlCQlx1NzY4NFx1NkI3Qlx1NEVFM1x1NzgwMVx1RkYwQzIwMjYtMTAtMDMgXHU2NDU4XHU5NjY0XHUzMDAyXHJcbiAgICAgICAgcGF5bG9hZDogeyBmaW5nZXJwcmludDogdGhpcy5qb2luZWRCb29rPy5maW5nZXJwcmludCA/PyBudWxsIH1cclxuICAgICAgfSlcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICB0aGlzLmNsZWFyUGVuZGluZ0pvaW4oKVxyXG4gICAgICB0aGlzLmVtaXQoJ3N5c3RlbS1tZXNzYWdlJywgeyB0eXBlOiAnZXJyb3InLCB0ZXh0OiBgXHU3NjdDXHU5MDAxXHU1MkEwXHU1MTY1XHU4QUNCXHU2QzQyXHU1OTMxXHU2NTU3XHVGRjFBJHsoZXJyIGFzIEVycm9yKS5tZXNzYWdlfWAgfSlcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICAgIHJldHVybiB3YWl0XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNsZWFyUGVuZGluZ0pvaW4oKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5qb2luVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmpvaW5UaW1lcilcclxuICAgIHRoaXMuam9pblRpbWVyID0gbnVsbFxyXG4gICAgaWYgKHRoaXMucGVuZGluZ0pvaW4pIHtcclxuICAgICAgLy8gXHU2NUU3XHU3Njg0XHU5MEEzXHU2QjIxXHU3QjQ5XHU0RTBEXHU1MjMwIGFjayBcdTRFODZcdUZGMUFcdTdBQ0JcdTUzNzNcdTdFRDNcdTY3NUZcdUZGMDhcdTRFMERcdThCQTlcdThDMDNcdTc1MjhcdTY1QjlcdTZDMzhcdTRFNDVcdTYzMDJcdThENzcgXHUyMDE0XHUyMDE0IFx1NEZFRSBUT0RPIFAyXHUzMDBDXHU1MzU1XHU2OUZEXHU4OTg2XHU3NkQ2XHU1RjBGXHU4RDRCXHU1MDNDXHUzMDBEXHVGRjA5XHJcbiAgICAgIHRoaXMucGVuZGluZ0pvaW4ucmVzb2x2ZShudWxsKVxyXG4gICAgICB0aGlzLnBlbmRpbmdKb2luID0gbnVsbFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZXNldEpvaW5TdGF0ZSgpOiB2b2lkIHtcclxuICAgIHRoaXMuc3RhdGUgPSBudWxsXHJcbiAgICB0aGlzLm15SWQgPSBudWxsXHJcbiAgICB0aGlzLnJvb21JZCA9IG51bGxcclxuICAgIHRoaXMuam9pbmVkID0gZmFsc2VcclxuICAgIHRoaXMuam9pbmVkQm9vayA9IG51bGxcclxuICAgIHRoaXMuam9pbmVkRm9ybWF0ID0gbnVsbFxyXG4gICAgdGhpcy5yb29tRmluZ2VycHJpbnQgPSBudWxsXHJcbiAgICB0aGlzLm1lbWJlckxvY3MuY2xlYXIoKVxyXG4gIH1cclxuXHJcbiAgLyoqIFx1NjVBRFx1N0VCRlx1OTFDRFx1OEZERVx1NTQwRVx1OTFDRFx1NTNEMSBqb2luXHVGRjA4XHU2NzBEXHU1MkExXHU1NjY4XHU0RkE3XHU2MjEwXHU1NDU4XHU4ODY4XHU1REYyXHU5NjhGXHU2NUU3XHU4RkRFXHU2M0E1XHU2RDg4XHU1OTMxXHVGRjA5XHVGRjFCXHU2NUUwXHU0RTY2XHU2MjEwXHU1NDU4XHU1NDBDXHU2ODM3XHU4OTgxXHU5MUNEXHU1MTY1XHVGRjA4XHU1QkExXHU4QkExIEEtMVx1RkYwOSAqL1xyXG4gIHByaXZhdGUgYXN5bmMgcmVqb2luKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKCF0aGlzLnJvb21JZCkgcmV0dXJuXHJcbiAgICBjb25zdCBhY2sgPSBhd2FpdCB0aGlzLnNlbmRKb2luKClcclxuICAgIGNvbnN0IHJlYXNvbiA9IG5vcm1hbGl6ZUpvaW5SZWFzb24oYWNrPy5yZWFzb24pXHJcbiAgICBpZiAoIWFjayB8fCAhYWNrLm9rKSB7XHJcbiAgICAgIHRoaXMuZW1pdCgnc3lzdGVtLW1lc3NhZ2UnLCB7XHJcbiAgICAgICAgdHlwZTogJ2Vycm9yJyxcclxuICAgICAgICB0ZXh0OiBgXHU5MUNEXHU5MDIzXHU1RjhDXHU5MUNEXHU2NUIwXHU1MkEwXHU1MTY1XHU1OTMxXHU2NTU3XHVGRjFBJHtyZWFzb259YFxyXG4gICAgICB9KVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IG1lbWJlcnMgPSAoYWNrLm1lbWJlcnMgPz8gW10pLm1hcCgobSkgPT4gdGhpcy5kZWNvcmF0ZU1lKG0pKVxyXG4gICAgdGhpcy5zdGF0ZSA9IHRoaXMuc3RhdGUgPyB7IC4uLnRoaXMuc3RhdGUsIG1lbWJlcnMgfSA6IG51bGxcclxuICAgIHRoaXMuam9pbmVkID0gdHJ1ZVxyXG4gICAgdGhpcy5zZWVkTWVtYmVyTG9jcyhtZW1iZXJzKVxyXG4gICAgdGhpcy5lbWl0KCdwcmVzZW5jZS11cGRhdGVkJywgbWVtYmVycylcclxuICAgIC8vIFx1NjVBRFx1N0VCRlx1NjcxRlx1OTVGNFx1NzY4NFx1ODA0QVx1NTkyOVx1RkYxQVx1NjMwOVx1NjcwMFx1NTQwRVx1NEUwMFx1Njc2MSBpZCBcdTU4OUVcdTkxQ0ZcdTg4NjVcdTYyQzlcdUZGMDhcdTVFN0ZcdTY0QURcdTRFMEVcdTg4NjVcdTYyQzlcdTRFQTRcdTk1MTlcdTc1MzFcdTZEODhcdThEMzlcdTgwMDVcdTUzQkJcdTkxQ0RcdUZGMDlcclxuICAgIGF3YWl0IHRoaXMubG9hZEhpc3RvcnkodGhpcy5sYXN0Q2hhdElkKVxyXG4gIH1cclxuXHJcbiAgLyoqIFx1NjJDOVx1ODA0QVx1NTkyOVx1NTM4Nlx1NTNGMlx1RkYxQWFmdGVyPTAgPSBcdTUyQTBcdTUxNjVcdTY1RjZcdTc2ODRcdTY3MDBcdThGRDFcdTRFMDBcdTk4NzVcdUZGMUJhZnRlcj1sYXN0Q2hhdElkID0gXHU5MUNEXHU4RkRFXHU1ODlFXHU5MUNGXHUzMDAyXHJcbiAgICogIGlzQ3VycmVudFx1RkYwOFx1NUJBMVx1OEJBMSBDLTJcdUZGMDlcdUZGMUFcdTVFNzZcdTUzRDEgam9pbiBcdTg0M0RcdThEMjVcdTY1QjlcdTc2ODRcdTU3MjhcdTkwMTRcdThCRjdcdTZDNDJcdTU2REVcdTY3NjVcdTY1RjZcdTRFMERcdTUxNjVcdThEMjZcdUZGMDhsYXN0Q2hhdElkIFx1NjYyRlx1NjVCMFx1NEYxQVx1OEJERFx1NzY4NFx1ODg2NVx1NjJDOVx1OTUxQVx1RkYwQ1xyXG4gICAqICBcdTY1RTdcdTRGMUFcdThCRERcdTc2ODRcdTUzODZcdTUzRjJcdTRFNUZcdTRFMERcdTgwRkQgZW1pdCBcdThGREJcdTY1QjBcdTRGMUFcdThCRERcdTc2ODRcdTUxNzFcdTRFQUJcdTYwMDFcdUZGMDlcdTMwMDIgKi9cclxuICBwcml2YXRlIGFzeW5jIGxvYWRIaXN0b3J5KGFmdGVyID0gMCwgaXNDdXJyZW50PzogKCkgPT4gYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKCF0aGlzLnJvb21JZCkgcmV0dXJuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtc2dzID0gYXdhaXQgdGhpcy5saXN0TWVzc2FnZXModGhpcy5yb29tSWQsIHsgYWZ0ZXIsIGxpbWl0OiBDSEFUX0hJU1RPUllfTElNSVQgfSlcclxuICAgICAgaWYgKGlzQ3VycmVudCAmJiAhaXNDdXJyZW50KCkpIHJldHVyblxyXG4gICAgICBpZiAobXNncy5sZW5ndGggPT09IDApIHJldHVyblxyXG4gICAgICB0aGlzLmxhc3RDaGF0SWQgPSBNYXRoLm1heCh0aGlzLmxhc3RDaGF0SWQsIC4uLm1zZ3MubWFwKChtKSA9PiBtLmlkKSlcclxuICAgICAgdGhpcy5lbWl0KCdjaGF0LWhpc3RvcnknLCBtc2dzKVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGlmIChpc0N1cnJlbnQgJiYgIWlzQ3VycmVudCgpKSByZXR1cm5cclxuICAgICAgdGhpcy5lbWl0KCdzeXN0ZW0tbWVzc2FnZScsIHsgdHlwZTogJ2Vycm9yJywgdGV4dDogYFx1NjJDOVx1NTNENlx1ODA0QVx1NTkyOVx1NkI3N1x1NTNGMlx1NTkzMVx1NjU1N1x1RkYxQSR7KGVyciBhcyBFcnJvcikubWVzc2FnZX1gIH0pXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRlY29yYXRlTWUobTogUm9vbU1lbWJlcik6IFJvb21NZW1iZXIge1xyXG4gICAgLy8gXHU3RjUxXHU3RURDXHU4RjdEXHU4Mzc3XHVGRjA4am9pbi1hY2sgLyBwcmVzZW5jZVx1RkYwOVx1OEZEQlx1NTE2NVx1NTdERlx1NUM0Mlx1NTE0OFx1NUY1Mlx1NEUwMFx1NEY0RFx1N0Y2RVx1RkYxQlx1NjVFMFx1NEY0RFx1N0Y2RVx1NjIxMFx1NTQ1OFx1NEZERFx1NjMwMVx1N0YzQVx1NzcwMVxyXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG0ubG9jYXRpb24gPyB7IC4uLm0sIGxvY2F0aW9uOiBub3JtYWxpemVMb2NhdGlvbihtLmxvY2F0aW9uKSB9IDogbVxyXG4gICAgcmV0dXJuIHRoaXMubXlJZCA/IHsgLi4ubm9ybWFsaXplZCwgaXNNZTogbm9ybWFsaXplZC5pZCA9PT0gdGhpcy5teUlkIH0gOiBub3JtYWxpemVkXHJcbiAgfVxyXG5cclxuICAvKiogam9pbi1hY2sgbWVtYmVycyBcdTRGNUNcdTRFM0EgcHJlc2VuY2UgZGlmZiBcdTU3RkFcdTdFQkZcdUZGMUFcdThCQjBcdTVGNTVcdTU0MDRcdTYyMTBcdTU0NThcdTVGNTJcdTRFMDBcdTUzMTZcdTRGNERcdTdGNkUgKi9cclxuICBwcml2YXRlIHNlZWRNZW1iZXJMb2NzKG1lbWJlcnM6IFJvb21NZW1iZXJbXSk6IHZvaWQge1xyXG4gICAgdGhpcy5tZW1iZXJMb2NzLmNsZWFyKClcclxuICAgIGZvciAoY29uc3QgbSBvZiBtZW1iZXJzKSB7XHJcbiAgICAgIGlmIChtLmxvY2F0aW9uKSB0aGlzLm1lbWJlckxvY3Muc2V0KG0uaWQsIG5vcm1hbGl6ZUxvY2F0aW9uKG0ubG9jYXRpb24pKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogXHU4RkRDXHU3QUVGXHU0RjREXHU3RjZFXHU2RDNFXHU3NTFGXHVGRjA4djAuMi40IFx1NEZFRVx1NTkwRFwibG9jYXRpb24tdXBkYXRlZCBcdTZCN0JcdTdBRUZcdTUzRTNcIlx1RkYwOVx1RkYxQVxyXG4gICAqIHNlcnZlciBcdTRFMERcdTUzNTVcdTcyRUNcdTRFMEJcdTUzRDEgcm9vbS5sb2NhdGlvbiBcdTRGRTFcdTVDMDFcdUZGMENcdTgwMENcdTY2MkZcdTVFN0ZcdTY0QUQgcm9vbS5wcmVzZW5jZSBcdTUxNjhcdTkxQ0ZcdTVGRUJcdTcxNjdcdUZGMDhcdTU0MkJcdTZCQ0ZcdTRFQkFcdTRGNERcdTdGNkVcdUZGMDlcdTMwMDJcclxuICAgKiBcdTY3MkNcdTRGQTdcdTRFRTUgam9pbi1hY2sgXHU0RTNBXHU1N0ZBXHU3RUJGXHUzMDAxXHU5MDEwXHU2QjIxIHByZXNlbmNlIFx1NUZFQlx1NzE2NyBkaWZmXHVGRjFBXHU2N0QwXHU2MjEwXHU1NDU4XHU0RjREXHU3RjZFXHU1M0Q4XHU1MzE2XHU2MjREIGVtaXQgbG9jYXRpb24tdXBkYXRlZFx1MzAwMlxyXG4gICAqIFx1NEY0RFx1N0Y2RVx1NEUwMFx1NUY4Qlx1NTE0OFx1NUY1Mlx1NEUwMFx1MzAwMVx1NkJENFx1OEY4M1x1OEQ3MCBzYW1lTG9jYXRpb25cdUZGMDhcdTVCOUFcdTRGNERcdTdDRkJcdTdFREZcdTdFQUFcdTVGOEJcdUZGMUFcdTRFMERcdTgxRUFcdTg4NENcdTg5RTNcdTkxQ0FcdTVCNTdcdTZCQjVcdUZGMDlcdTMwMDJcclxuICAgKi9cclxuICBwcml2YXRlIGRlcml2ZVJlbW90ZUxvY2F0aW9ucyhtZW1iZXJzOiBSb29tTWVtYmVyW10pOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5qb2luZWRGb3JtYXQpIHJldHVyblxyXG4gICAgZm9yIChjb25zdCBtIG9mIG1lbWJlcnMpIHtcclxuICAgICAgaWYgKG0uaXNNZSB8fCAhbS5sb2NhdGlvbikgY29udGludWVcclxuICAgICAgY29uc3QgbG9jID0gbm9ybWFsaXplTG9jYXRpb24obS5sb2NhdGlvbilcclxuICAgICAgY29uc3QgcHJldiA9IHRoaXMubWVtYmVyTG9jcy5nZXQobS5pZClcclxuICAgICAgaWYgKCFwcmV2IHx8ICFzYW1lTG9jYXRpb24ocHJldiwgbG9jLCB0aGlzLmpvaW5lZEZvcm1hdCkpIHtcclxuICAgICAgICB0aGlzLm1lbWJlckxvY3Muc2V0KG0uaWQsIGxvYylcclxuICAgICAgICB0aGlzLmVtaXQoJ2xvY2F0aW9uLXVwZGF0ZWQnLCBsb2MsIG0pXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHByZXNlbmNlIFx1NjYyRlx1NTE2OFx1OTFDRlx1NUZFQlx1NzE2N1x1RkYxQVx1NEUwRFx1NTcyOFx1NTE3Nlx1NEUyRFx1NzY4NFx1NjVFN1x1NjIxMFx1NTQ1OFx1NURGMlx1NzlCQlx1NUYwMCBcdTIxOTIgXHU2RTA1XHU1MUZBXHU1N0ZBXHU3RUJGXHJcbiAgICBjb25zdCBsaXZlID0gbmV3IFNldChtZW1iZXJzLm1hcCgobSkgPT4gbS5pZCkpXHJcbiAgICBmb3IgKGNvbnN0IGlkIG9mIHRoaXMubWVtYmVyTG9jcy5rZXlzKCkpIHtcclxuICAgICAgaWYgKCFsaXZlLmhhcyhpZCkpIHRoaXMubWVtYmVyTG9jcy5kZWxldGUoaWQpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZUVudmVsb3BlKGVudjogTWVzc2FnZUVudmVsb3BlKTogdm9pZCB7XHJcbiAgICBzd2l0Y2ggKGVudi50eXBlKSB7XHJcbiAgICAgIGNhc2UgUk9PTV9NU0cuam9pbkFjazoge1xyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdKb2luKSB7XHJcbiAgICAgICAgICBjb25zdCBwZW5kaW5nID0gdGhpcy5wZW5kaW5nSm9pblxyXG4gICAgICAgICAgdGhpcy5wZW5kaW5nSm9pbiA9IG51bGxcclxuICAgICAgICAgIGlmICh0aGlzLmpvaW5UaW1lcikge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5qb2luVGltZXIpXHJcbiAgICAgICAgICAgIHRoaXMuam9pblRpbWVyID0gbnVsbFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcGVuZGluZy5yZXNvbHZlKGVudi5wYXlsb2FkIGFzIEpvaW5BY2spXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuICAgICAgY2FzZSBST09NX01TRy5wcmVzZW5jZToge1xyXG4gICAgICAgIC8vIFx1OEY3RFx1ODM3N1x1NUY2Mlx1NzJCNlx1NUY1Mlx1NEUwMFx1RkYwOHYwLjQuOFx1RkYwOVx1RkYxQVx1NTk1MVx1N0VBNiA9IHttZW1iZXJzOlsuLi5dfVx1RkYxQlx1NTE3Q1x1NUJCOSBzZXJ2ZXIgdjAuMi4xIFx1NTI0RFx1NzY4NFx1ODhGOFx1NjU3MFx1N0VDNFxyXG4gICAgICAgIC8vIFx1RkYwOFx1NEUyNFx1NEZBN1wiXHU1NDA0XHU4MUVBXHU4MUVBXHU2RDNEXCJcdTVCRkNcdTgxRjRcdTc3MUZcdTVCQTJcdTYyMzdcdTdBRUZcdTYyMTBcdTU0NThcdTVGRUJcdTcxNjdcdTYwNTJcdTdBN0EgXHUyMDE0XHUyMDE0IFx1ODcwMlx1N0ZBNFx1OTk5Nlx1OEREMVx1NjI5M1x1NTFGQVx1RkYwQ1x1ODlDMSBwcm90b2NvbC50c1x1RkYwOVxyXG4gICAgICAgIGNvbnN0IG1lbWJlcnMgPSBub3JtYWxpemVQcmVzZW5jZU1lbWJlcnMoZW52LnBheWxvYWQpLm1hcCgobSkgPT4gdGhpcy5kZWNvcmF0ZU1lKG0pKVxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlKSB0aGlzLnN0YXRlID0geyAuLi50aGlzLnN0YXRlLCBtZW1iZXJzIH1cclxuICAgICAgICB0aGlzLmVtaXQoJ3ByZXNlbmNlLXVwZGF0ZWQnLCBtZW1iZXJzKVxyXG4gICAgICAgIHRoaXMuZGVyaXZlUmVtb3RlTG9jYXRpb25zKG1lbWJlcnMpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFJPT01fTVNHLm1lc3NhZ2U6IHtcclxuICAgICAgICBjb25zdCBtc2cgPSBlbnYucGF5bG9hZFxyXG4gICAgICAgIGlmICghaXNDaGF0TWVzc2FnZShtc2cpKSBicmVha1xyXG4gICAgICAgIGlmIChtc2cuaWQgPiB0aGlzLmxhc3RDaGF0SWQpIHRoaXMubGFzdENoYXRJZCA9IG1zZy5pZFxyXG4gICAgICAgIHRoaXMuZW1pdCgnY2hhdC1tZXNzYWdlJywgbXNnKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuICAgICAgY2FzZSBST09NX01TRy5zeXN0ZW06IHtcclxuICAgICAgICB0aGlzLmVtaXQoJ3N5c3RlbS1tZXNzYWdlJywgZW52LnBheWxvYWQgYXMgU3lzdGVtTWVzc2FnZSlcclxuICAgICAgICBicmVha1xyXG4gICAgICB9XHJcbiAgICAgIGNhc2UgUk9PTV9NU0cuYm9va01pc21hdGNoOiB7XHJcbiAgICAgICAgY29uc3QgcCA9IGVudi5wYXlsb2FkIGFzIHsgbG9jYWw/OiBCb29rUmVjb3JkWydmaW5nZXJwcmludCddOyByb29tPzogQm9va1JlY29yZFsnZmluZ2VycHJpbnQnXSB9XHJcbiAgICAgICAgaWYgKHAubG9jYWwgJiYgcC5yb29tKSB0aGlzLmVtaXQoJ2Jvb2stbWlzbWF0Y2gnLCB7IGxvY2FsOiBwLmxvY2FsLCByb29tOiBwLnJvb20gfSlcclxuICAgICAgICBicmVha1xyXG4gICAgICB9XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYnJlYWtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFx1NUJBMVx1OEJBMSBCLTJcdUZGMUFgbG9jYXRpb24tY2hhbmdlZGAgXHU2NjJGXHU2RTMyXHU2N0QzXHU3QUVGXHU1M0UzXHU3Njg0XHU1MTY4XHU1QzQwXHU0RThCXHU0RUY2XHVGRjBDXHU1NzI4IEEgXHU0RTY2XHU3Njg0XHU2MjNGXHU5NUY0XHU5MUNDXHU2MjUzXHU1RjAwIEIgXHU0RTY2XHU0RjFBXHU2MjhBXHJcbiAgICogQiBcdTc2ODRcdTRGNERcdTdGNkVcdTVFN0ZcdTY0QURcdThGREIgQSBcdTYyM0ZcdTMwMDJcdTRFMEFcdTYyQTVcdTUyNERcdTY4MjFcdTlBOENcIlx1NUY1M1x1NTI0RFx1NjI1M1x1NUYwMFx1NzY4NFx1NEU2NiBcdTIyNjEgXHU2MjNGXHU5NUY0XHU2ODA3XHU1QjlBXHU3Njg0XHU5MEEzXHU2NzJDXCJcdUZGMDhcdTYzMDdcdTdFQjlcdTUzRTNcdTVGODRcdTRFMEVcdTY3MERcdTUyQTFcdTU2NjhcdTRFMDBcdTgxRjRcdUZGMDlcdTMwMDJcclxuICAgKiBcdTZFMzJcdTY3RDNcdTY3MkFcdTYyNTNcdTVGMDBcdTRFRkJcdTRGNTVcdTRFNjZcdUZGMDhcdTRFNjZcdThGRDhcdTZDQTFcdTVGMDAvXHU1REYyXHU1MTczXHVGRjA5XHU2NUY2XHU1NDBDXHU2ODM3XHU0RTBEXHU0RTBBXHU2MkE1IFx1MjAxNFx1MjAxNCBcdTZDQTFcdTY3MDlcdTUzRUZcdTlBOENcdThCQzFcdTc2ODRcdTVGNTJcdTVDNUVcdTMwMDJcclxuICAgKi9cclxuICBwcml2YXRlIGlzT3BlbkJvb2tUaGVSb29tc0Jvb2soKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoIXRoaXMucm9vbUZpbmdlcnByaW50KSByZXR1cm4gZmFsc2VcclxuICAgIGNvbnN0IG9wZW4gPSB0aGlzLnJlbmRlci5nZXRPcGVuQm9vaygpXHJcbiAgICBpZiAoIW9wZW4pIHJldHVybiBmYWxzZVxyXG4gICAgcmV0dXJuIHRoaXMuaWRlbnRpdHkudmVyaWZ5KG9wZW4uZmluZ2VycHJpbnQsIHRoaXMucm9vbUZpbmdlcnByaW50KVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBvblJlbmRlckxvY2F0aW9uKGxvYzogQm9va0xvY2F0aW9uKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMuc3RhdGUpIHJldHVyblxyXG4gICAgaWYgKCF0aGlzLmlzT3BlbkJvb2tUaGVSb29tc0Jvb2soKSkgcmV0dXJuXHJcbiAgICB0aGlzLnN0YXRlID0geyAuLi50aGlzLnN0YXRlLCBjdXJyZW50TG9jYXRpb246IGxvYyB9XHJcbiAgICB0aGlzLnRocm90dGxlU2VuZChsb2MpXHJcbiAgfVxyXG5cclxuICAvKiogXHU4MjgyXHU2RDQxXHVGRjFBMzAwbXMgXHU3QTk3XHU1M0UzXHU1MTg1XHU2NzAwXHU1OTFBXHU1M0QxXHU0RTAwXHU2QjIxXHVGRjBDXHU2NzJCXHU1QzNFXHU4ODY1XHU5RjUwICovXHJcbiAgcHJpdmF0ZSB0aHJvdHRsZVNlbmQobG9jOiBCb29rTG9jYXRpb24pOiB2b2lkIHtcclxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KClcclxuICAgIGNvbnN0IHNpbmNlID0gbm93IC0gdGhpcy5sYXN0U2VudEF0XHJcbiAgICBpZiAoc2luY2UgPj0gTE9DQVRJT05fVEhST1RUTEVfTVMpIHtcclxuICAgICAgdGhpcy5sYXN0U2VudEF0ID0gbm93XHJcbiAgICAgIHZvaWQgdGhpcy5uZXQuc2VuZCh7IHR5cGU6IFJPT01fTVNHLmxvY2F0aW9uLCBwYXlsb2FkOiB7IGxvY2F0aW9uOiBsb2MgfSB9KS5jYXRjaCgoKSA9PiB7XHJcbiAgICAgICAgLy8gXHU2NUFEXHU3RUJGXHU2NzFGXHU5NUY0XHU3Njg0XHU0RjREXHU3RjZFXHU0RTBBXHU2MkE1XHU1OTMxXHU4RDI1XHU2NUUwXHU5NzAwXHU1MTkyXHU2Q0UxXHVGRjA4XHU5MUNEXHU4RkRFXHU1NDBFXHU3NTMxXHU0RTBCXHU0RTAwXHU2QjIxXHU0RjREXHU3RjZFXHU0RThCXHU0RUY2XHU4ODY1XHU5RjUwXHVGRjA5XHJcbiAgICAgIH0pXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnBlbmRpbmdFbWl0ID0gbG9jXHJcbiAgICAgIGlmICh0aGlzLmVtaXRUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuZW1pdFRpbWVyKVxyXG4gICAgICB0aGlzLmVtaXRUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZW1pdFRpbWVyID0gbnVsbFxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdFbWl0KSB7XHJcbiAgICAgICAgICB0aGlzLmxhc3RTZW50QXQgPSBEYXRlLm5vdygpXHJcbiAgICAgICAgICB2b2lkIHRoaXMubmV0XHJcbiAgICAgICAgICAgIC5zZW5kKHsgdHlwZTogUk9PTV9NU0cubG9jYXRpb24sIHBheWxvYWQ6IHsgbG9jYXRpb246IHRoaXMucGVuZGluZ0VtaXQgfSB9KVxyXG4gICAgICAgICAgICAuY2F0Y2goKCkgPT4ge30pXHJcbiAgICAgICAgICB0aGlzLnBlbmRpbmdFbWl0ID0gbnVsbFxyXG4gICAgICAgIH1cclxuICAgICAgfSwgTE9DQVRJT05fVEhST1RUTEVfTVMgLSBzaW5jZSlcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCBjcmVhdGVXZWJTb2NrZXRTdHJlYW0gZnJvbSAnLi9saWIvc3RyZWFtLmpzJztcbmltcG9ydCBleHRlbnNpb24gZnJvbSAnLi9saWIvZXh0ZW5zaW9uLmpzJztcbmltcG9ydCBQZXJNZXNzYWdlRGVmbGF0ZSBmcm9tICcuL2xpYi9wZXJtZXNzYWdlLWRlZmxhdGUuanMnO1xuaW1wb3J0IFJlY2VpdmVyIGZyb20gJy4vbGliL3JlY2VpdmVyLmpzJztcbmltcG9ydCBTZW5kZXIgZnJvbSAnLi9saWIvc2VuZGVyLmpzJztcbmltcG9ydCBzdWJwcm90b2NvbCBmcm9tICcuL2xpYi9zdWJwcm90b2NvbC5qcyc7XG5pbXBvcnQgV2ViU29ja2V0IGZyb20gJy4vbGliL3dlYnNvY2tldC5qcyc7XG5pbXBvcnQgV2ViU29ja2V0U2VydmVyIGZyb20gJy4vbGliL3dlYnNvY2tldC1zZXJ2ZXIuanMnO1xuXG5leHBvcnQge1xuICBjcmVhdGVXZWJTb2NrZXRTdHJlYW0sXG4gIGV4dGVuc2lvbixcbiAgUGVyTWVzc2FnZURlZmxhdGUsXG4gIFJlY2VpdmVyLFxuICBTZW5kZXIsXG4gIHN1YnByb3RvY29sLFxuICBXZWJTb2NrZXQsXG4gIFdlYlNvY2tldFNlcnZlclxufTtcblxuZXhwb3J0IGRlZmF1bHQgV2ViU29ja2V0O1xuIiwgIi8qKlxyXG4gKiBJTmV0U2VydmljZSBcdTkwMDJcdTkxNERcdTU2NjhcdUZGMDhcdTRFM0JcdThGREJcdTdBMEJcdTRGQTdcdUZGMENcdTc3MUZcdTVCOUVcdTVCOUVcdTczQjBcdUZGMDlcdTIwMTRcdTIwMTQgV1NcdUZGMDh3cyBcdTUzMDVcdUZGMENcdTYzRTFcdTYyNEJcdTVFMjYgdG9rZW4gXHU1M0NDXHU5NUY4XHU1OTM0XHVGRjA5KyBSRVNUXHVGRjA4ZmV0Y2hcdUZGMDlcdTMwMDJcclxuICogXHU2RTMyXHU2N0QzXHU4RkRCXHU3QTBCXHU5MDFBXHU4RkM3IElQQyBcdTY4NjVcdUZGMDhjb3JlL2FkYXB0ZXJzL25ldC9pcGNOZXRBZGFwdGVyXHVGRjA5XHU4QzAzXHU3NTI4XHU2NzJDXHU1QjlFXHU3M0IwXHUzMDAyXHJcbiAqIFx1NEY5RFx1NjM2RVx1RkYxQXNlcnZlci9kb2NzL0FQSS5tZFx1RkYwOFx1OEJBNFx1OEJDMSAvIFJFU1QgLyBXZWJTb2NrZXQgLyBcdTU0MENcdTZCNjVcdTUzNEZcdThCQUVcdUZGMDlcdTMwMDJcclxuICpcclxuICogXHUyNkEwICoqdjAuNC4zXHVGRjFBXHU4RkRFXHU2M0E1XHU2QTIxXHU1NzhCXHU2NTM5XHU2MjEwXCJcdTYzMDlcdTYyM0ZcdTk1RjRcdTVFRkFcdThGREVcIioqXHVGRjA4XHU1MzlGXHU2NzY1XHU2NjJGXHU0RTAwXHU2NzYxXHU5MDFBXHU3NTI4XHU4RkRFXHU2M0E1ICsgcm9vbS5qb2luXHVGRjA5XHUyMDE0XHUyMDE0IFx1NjcwRFx1NTJBMVx1NTY2OFx1NTcyOFxyXG4gKiAqKldTIFx1NjNFMVx1NjI0Qlx1NjVGNioqXHU1QzMxXHU1M0Q2IGByb29tYCBcdTRFMEUgYG5pY2tgXHVGRjA4YHRyYW5zcG9ydC93cy5nb2BcdUZGMUFcdTdGM0FcdTRFRkJcdTRFMDBcdTYyMTZcdTY2MzVcdTc5RjBcdThEODVcdTk1N0YgXHUyMTkyIFx1NzZGNFx1NjNBNVx1NTE3M1x1OEZERVx1NjNBNVx1RkYwOVx1RkYwQ1xyXG4gKiBcdTYyNDBcdTRFRTVcdTY1RTdcdTZBMjFcdTU3OEJcdTU3MjhcdTY3MERcdTUyQTFcdTU2NjhcdTRFMEFcdTY4MzlcdTY3MkNcdThENzBcdTRFMERcdTUyMzAgYHJvb20uam9pbmBcdUZGMDhcdThGREVcdTYzQTVcdTVERjJcdTg4QUJcdTUxNzNcdUZGMDlcdUZGMENcdTg4NjhcdTczQjBcdTRFM0FcIlx1OEZERVx1NEUwQVx1NTNDOFx1N0FDQlx1NTIzQlx1OTFDRFx1OEZERVwiXHUzMDAyXHJcbiAqIFx1NzNCMFx1NTcyOFx1NzY4NFx1NTIwNlx1NURFNVx1RkYxQVxyXG4gKiAtIGBjb25uZWN0KGNvbmZpZylgID0gXHU1RUZBXHU3QUNCKipcdTRGMUFcdThCREQqKlx1RkYxQVx1NzUzM1x1OEJGNy9cdTU5MERcdTc1MjhcdTYyMTBcdTU0NTggdG9rZW5cdUZGMDhSRVNUIGBQT1NUIC9hdXRoL3Rva2VuYFx1RkYwOVx1RkYwQ1x1NEUwRFx1NUYwMCBXU1x1RkYxQlxyXG4gKiAtIGBvcGVuUm9vbShyb29tSWQpYCA9IFx1NjMwOVx1NjIzRlx1OTVGNFx1NUYwMCBXU1x1RkYwOFx1NjNFMVx1NjI0Qlx1NUUyNiBgP3Jvb209Jm5pY2s9YFx1RkYwOVx1RkYxQlxyXG4gKiAtIGBjbG9zZVJvb20oKWAgPSBcdTUxNzNcdTYyM0ZcdTk1RjQgV1NcdUZGMDhcdTc5QkJcdTVGMDBcdTYyM0ZcdTk1RjRcdTUzNzNcdTY1QURcdTVGMDAgXHUyMDE0XHUyMDE0IFx1ODA0QVx1NTkyOVx1NzY4NFx1NzUxRlx1NTQ3RFx1NTQ2OFx1NjcxRlx1NUY1Mlx1NUM1RVx1NEU4RVx1NjIzRlx1OTVGNFx1RkYwOVx1RkYxQlxyXG4gKiAtIGByZXF1ZXN0KClgID0gUkVTVFx1RkYwQ1x1NEYxQVx1OEJERFx1NUVGQVx1N0FDQlx1NTQwRVx1NTM3M1x1NTNFRlx1NzUyOFx1RkYwOFx1NTkyN1x1NTM4NS9cdTVFRkFcdTYyM0YvXHU4MDRBXHU1OTI5XHU1Mzg2XHU1M0YyXHU5MEZEXHU0RTBEXHU5NzAwXHU4OTgxIFdTXHVGRjA5XHUzMDAyXHJcbiAqL1xyXG5pbXBvcnQgV2ViU29ja2V0IGZyb20gJ3dzJ1xyXG5pbXBvcnQgeyBUeXBlZEVtaXR0ZXIgfSBmcm9tICdAY29yZS9wb3J0cy9lbWl0dGVyJ1xyXG5pbXBvcnQgdHlwZSB7IE5ldFNlcnZpY2VFdmVudHMsIEh0dHBSZXF1ZXN0T3B0aW9ucywgSHR0cFJlc3VsdCB9IGZyb20gJ0Bjb3JlL3BvcnRzL25ldCdcclxuaW1wb3J0IHsgYnVpbGRSb29tV3NVcmwsIGlzVmFsaWROaWNrLCBNQVhfTklDS19MRU4gfSBmcm9tICdAY29yZS9kb21haW4vcHJvdG9jb2wnXHJcbmltcG9ydCB0eXBlIHsgQ29ubmVjdGlvblN0YXRlLCBNZXNzYWdlRW52ZWxvcGUsIE5ldENvbmZpZywgVG9rZW5SZXNwb25zZSB9IGZyb20gJ0Bjb3JlL2RvbWFpbi90eXBlcydcclxuXHJcbmNvbnN0IFJFQ09OTkVDVF9ERUxBWV9NUyA9IDIwMDBcclxuY29uc3QgTUFYX1JFQ09OTkVDVF9BVFRFTVBUUyA9IDVcclxuLyoqIFJFU1QgXHU4RDg1XHU2NUY2XHVGRjA4VE9ETyBQMlx1MzAwQ1JFU1QgXHU2NUUwXHU4RDg1XHU2NUY2XHUzMDBEXHVGRjA5XHVGRjFBXHU2NzBEXHU1MkExXHU1NjY4XHU2MzAyXHU2QjdCXHU2NUY2XHU2MzA5XHU5NEFFXHU0RTBEXHU4MEZEXHU2QzM4XHU0RTQ1XHU1MzYxXHU0RjRGICovXHJcbmNvbnN0IFJFU1RfVElNRU9VVF9NUyA9IDE1MDAwXHJcbi8qKiBXUyBcdTYzRTFcdTYyNEJcdThEODVcdTY1RjZcdUZGMDhcdTVCQTFcdThCQTEgQS0yXHVGRjA5XHVGRjFBb3BlblJvb20gXHU1MTY4XHU3QTBCXHU2QjY0XHU1MjREXHU2NUUwXHU4RDg1XHU2NUY2XHU1MTVDXHU1RTk1ICovXHJcbmNvbnN0IE9QRU5fVElNRU9VVF9NUyA9IDE1MDAwXHJcblxyXG5leHBvcnQgY2xhc3MgV3NOZXRBZGFwdGVyIGV4dGVuZHMgVHlwZWRFbWl0dGVyPE5ldFNlcnZpY2VFdmVudHM+IHtcclxuICBwcml2YXRlIGNvbmZpZzogTmV0Q29uZmlnIHwgbnVsbCA9IG51bGxcclxuICBwcml2YXRlIG1lbWJlclRva2VuOiBzdHJpbmcgfCBudWxsID0gbnVsbFxyXG4gIC8qKiBcdTVGNTNcdTUyNERcdTYyM0ZcdTk1RjRcdUZGMDhgb3BlblJvb21gIFx1NjIxMFx1NTI5Rlx1NjVGNlx1N0Y2RVx1RkYwQ2BjbG9zZVJvb21gIFx1NkUwNVx1RkYwOVx1MjAxNFx1MjAxNCBcdTkxQ0RcdThGREVcdTY1RjZcdTc1MjhcdTVCODNcdTkxQ0RcdTVFRkFcdTU0MENcdTRFMDBcdTY3NjFcdTYzRTFcdTYyNEJcdTU3MzBcdTU3NDAgKi9cclxuICBwcml2YXRlIHJvb21JZDogc3RyaW5nIHwgbnVsbCA9IG51bGxcclxuICBwcml2YXRlIHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbFxyXG4gIC8qKiBcdTU3MjhcdTkwMTRcdTYzRTFcdTYyNEJcdUZGMDhcdTVCQTFcdThCQTEgQS0yXHVGRjA5XHVGRjFBdGVhcmRvd24vaW52YWxpZGF0ZSBcdTRGNUNcdTVFOUYgc29ja2V0IFx1NjVGNlx1NUZDNVx1OTg3QiByZWplY3QgXHU1QjgzXHVGRjBDXHU1NDI2XHU1MjE5XHU4QzAzXHU3NTI4XHU5NEZFXHU2QzM4XHU0RTQ1XHU2MzAyXHU4RDc3ICovXHJcbiAgcHJpdmF0ZSBwZW5kaW5nT3BlbjogeyB3czogV2ViU29ja2V0OyByZWplY3Q6IChlcnI6IEVycm9yKSA9PiB2b2lkIH0gfCBudWxsID0gbnVsbFxyXG4gIHByaXZhdGUgZXhwbGljaXRseUNsb3NlZCA9IGZhbHNlXHJcbiAgcHJpdmF0ZSByZWNvbm5lY3RBdHRlbXB0cyA9IDBcclxuICBwcml2YXRlIHJlY29ubmVjdFRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsXHJcbiAgLyoqIFx1NUJBMVx1OEJBMSBDLTRcdUZGMUFcdTY3MDBcdThGRDFcdTRFMDBcdTZCMjFcdTVFN0ZcdTY0QURcdTc2ODRcdThGREVcdTYzQTVcdTcyQjZcdTYwMDEgXHUyMDE0XHUyMDE0IFx1NzJCNlx1NjAwMVx1NjcyQVx1NTNEOFx1NEUwRFx1OTFDRFx1NTkwRFx1NUU3Rlx1NjRBRFx1RkYwOGNsb3NlUm9vbS9jb25uZWN0IFx1N0I0OVx1OERFRlx1NUY4NFx1NzY4NFx1NTE5N1x1NEY1OVx1NEU4Qlx1NEVGNlx1NjYyRlx1NTY2QVx1NThGMFx1RkYwOSAqL1xyXG4gIHByaXZhdGUgbGFzdFN0YXRlOiBDb25uZWN0aW9uU3RhdGUgfCBudWxsID0gbnVsbFxyXG5cclxuICBwcml2YXRlIGdldCBiYXNlVXJsKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5jb25maWc/LnNlcnZlclVybCA/PyAnJ1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXQgYWNjZXNzVG9rZW4oKTogc3RyaW5nIHtcclxuICAgIHJldHVybiB0aGlzLmNvbmZpZz8uYWNjZXNzVG9rZW4gPz8gJydcclxuICB9XHJcblxyXG4gIC8qKiBcdTVFRkFcdTdBQ0JcdTRGMUFcdThCRERcdUZGMUFcdTUzRUFcdTc1MzNcdThCRjcvXHU1OTBEXHU3NTI4XHU2MjEwXHU1NDU4IHRva2VuXHVGRjA4XHU0RTBEXHU1RUZBIFdTXHVGRjA5ICovXHJcbiAgYXN5bmMgY29ubmVjdChjb25maWc6IE5ldENvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgLy8gXHU5MUNEXHU1OTBEIGNvbm5lY3RcdUZGMUFcdTUxNDhcdTYyOEFcdTRFMEFcdTRFMDBcdTY3NjFcdTYyM0ZcdTk1RjRcdThGREVcdTYzQTVcdTZFMDVcdTVFNzJcdTUxQzBcdUZGMDhcdTU0MjZcdTUyMTlcdTYzNjJcdTY3MERcdTUyQTFcdTU2NjhcdTRGMUFcdTc1NTlcdTRFMEJcdTY1RTcgc29ja2V0XHVGRjA5XHJcbiAgICBhd2FpdCB0aGlzLmNsb3NlUm9vbSgpXHJcbiAgICAvLyBcdTY1QjBcdTRGMUFcdThCRERcdTc2ODRcdTcyQjZcdTYwMDFcdTUzRjJcdTZFMDVcdTk2RjZcdUZGMUFcdTRFMEFcdTRFMDBcdTY3NjFcdThGREVcdTYzQTVcdTc2ODRcdTcyQjZcdTYwMDFcdTRFMERcdTdFQTZcdTY3NUZcdThGRDlcdTRFMDBcdTY3NjFcdTc2ODRcdTk5OTZcdTZCMjFcdTVFN0ZcdTY0QURcclxuICAgIHRoaXMubGFzdFN0YXRlID0gbnVsbFxyXG4gICAgdGhpcy5jb25maWcgPSBjb25maWdcclxuICAgIC8qKlxyXG4gICAgICogZGV2LW9ubHkgKipcdTUzQ0NcdTVGMDBcdTgwNTRcdThDMDMqKlx1RkYwODIwMjYtMDktMTdcdUZGMDlcdUZGMUFcdTY3MERcdTUyQTFcdTU2NjhcdTYzMDkgSVAgXHU3QjdFXHU1M0QxXHU2MjEwXHU1NDU4IHRva2VuXHVGRjA4XHU1NDBDXHU0RTAwIElQIDcgXHU1OTI5XHU1MTg1XHU1OTBEXHU3NTI4XHU1NDBDXHU0RTAwXHU2MjhBXHVGRjA5XHVGRjBDXHJcbiAgICAgKiBcdTgwMENcIlx1NTQwQ1x1NEUwMCB0b2tlbiBcdTc2ODRcdTY1QjBcdThGREVcdTYzQTVcdTRGMUFcdThFMjJcdTYzODlcdTY1RTdcdThGREVcdTYzQTVcIlx1RkYwOFx1NTM1NVx1OEJCRVx1NTkwN1x1NzY3Qlx1NUY1NVx1RkYwOVx1MjE5MiAqKlx1NTQwQ1x1NjczQVx1NEUyNFx1NEUyQSBjbGllbnQgXHU0RjFBXHU0RTkyXHU3NkY4XHU4RTIyKipcdTMwMDJcclxuICAgICAqIGBUVVJFQURfREVWX01FTUJFUl9UT0tFTmAgXHU4QkE5XHU3QjJDXHU0RThDXHU0RTJBXHU1QjlFXHU0RjhCXHU2NjNFXHU1RjBGXHU3NTI4XHU1M0U2XHU0RTAwXHU0RTJBIHRva2VuXHVGRjA4XHU2ODNDXHU1RjBGXHU1NDBDXHU2NzBEXHU1MkExXHU3QUVGXHVGRjFBNyBcdTRGNERcdTVCNTdcdTZCQ0RcdTY1NzBcdTVCNTdcdUZGMDlcdTMwMDJcclxuICAgICAqIFx1OEZEOVx1NjYyRlx1NjcwRFx1NTJBMVx1NTY2OFx1NURGMlx1NzY3Qlx1OEJCMFx1NzY4NCBOQVQgXHU5NjUwXHU1MjM2XHVGRjA4YEFQSS5tZGBcdTMwMENOQVQgXHU5NjUwXHU1MjM2XHVGRjA4XHU1REYyXHU3N0U1XHU2M0E1XHU1M0Q3XHVGRjA5XHUzMDBEXHVGRjA5XHU1NzI4XHU1RjAwXHU1M0QxXHU2NzFGXHU3Njg0XHU3RUQ1XHU4ODRDXHU2MjRCXHU2QkI1IFx1MjAxNFx1MjAxNCBcdTRFMERcdThGREJcdTRFQTdcdTU0QzEgVUlcdTMwMDJcclxuICAgICAqL1xyXG4gICAgY29uc3QgZGV2VG9rZW4gPSBwcm9jZXNzLmVudlsnVFVSRUFEX0RFVl9NRU1CRVJfVE9LRU4nXVxyXG4gICAgaWYgKGRldlRva2VuKSB7XHJcbiAgICAgIHRoaXMubWVtYmVyVG9rZW4gPSBkZXZUb2tlblxyXG4gICAgfSBlbHNlIGlmIChjb25maWcubWVtYmVyVG9rZW4pIHtcclxuICAgICAgdGhpcy5tZW1iZXJUb2tlbiA9IGNvbmZpZy5tZW1iZXJUb2tlblxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5tZW1iZXJUb2tlbiA9IGF3YWl0IHRoaXMuZW5zdXJlTWVtYmVyVG9rZW4oKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgb3BlblJvb20ocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICghdGhpcy5jb25maWcpIHRocm93IG5ldyBFcnJvcignXHU1QzFBXHU2NzJBXHU1RUZBXHU3QUNCXHU0RjFBXHU4QkREXHVGRjA4XHU1MTQ4IGNvbm5lY3RcdUZGMDknKVxyXG4gICAgY29uc3Qgcm9vbSA9IHJvb21JZC50cmltKCkudG9Mb3dlckNhc2UoKVxyXG4gICAgaWYgKCFyb29tKSB0aHJvdyBuZXcgRXJyb3IoJ1x1NjIzRlx1OTVGNFx1NTNGN1x1NEUzQVx1N0E3QScpXHJcbiAgICAvLyBcdTY2MzVcdTc5RjBcdTY2MkYqKlx1NjNFMVx1NjI0Qlx1NTNDMlx1NjU3MCoqXHVGRjFBXHU2NzBEXHU1MkExXHU1NjY4XHU4RDg1XHU5NTdGXHU3NkY0XHU2M0E1XHU1MTczXHU4RkRFXHU2M0E1XHVGRjBDXHU1NzI4XHU4RkQ5XHU5MUNDXHU1MTQ4XHU1MjI0XHVGRjBDXHU3RUQ5XHU1MUZBXHU1M0VGXHU4OUUzXHU5MUNBXHU3Njg0XHU5NTE5XHU4QkVGXHJcbiAgICBjb25zdCBuaWNrID0gKHRoaXMuY29uZmlnLm5pY2tOYW1lID8/ICcnKS50cmltKClcclxuICAgIGlmICghaXNWYWxpZE5pY2sobmljaykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdTY2MzVcdTc5RjBcdTk3MDBcdTRFM0EgMX4ke01BWF9OSUNLX0xFTn0gXHU0RTJBXHU1QjU3XHVGRjA4XHU1RjUzXHU1MjREICR7QXJyYXkuZnJvbShuaWNrKS5sZW5ndGh9IFx1NEUyQVx1RkYwOWApXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5yb29tSWQgPT09IHJvb20gJiYgdGhpcy53cyAmJiB0aGlzLndzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm5cclxuICAgIC8vIFx1NjM2Mlx1NjIzRi9cdTkxQ0RcdTUxNjVcdUZGMUFcdTUxNDhcdTZFMDVcdTYzODlcdTY1RTdcdThGREVcdTYzQTVcdTRFMEVcdTkxQ0RcdThGREVcdThCQTFcdTY1RjZcdTU2NjhcdUZGMDhcdTRFMERcdTUxOERcdTY3MDlcIlx1NTNDQ1x1OEZERVx1NjNBNSAvIFx1OTFDRFx1OEZERVx1OThDRVx1NjZCNFwiXHVGRjBDVE9ETyBQMlx1RkYwOVxyXG4gICAgdGhpcy50ZWFyZG93blNvY2tldCgpXHJcbiAgICB0aGlzLnJvb21JZCA9IHJvb21cclxuICAgIHRoaXMucmVjb25uZWN0QXR0ZW1wdHMgPSAwXHJcbiAgICB0aGlzLmV4cGxpY2l0bHlDbG9zZWQgPSBmYWxzZVxyXG4gICAgYXdhaXQgdGhpcy5vcGVuU29ja2V0KClcclxuICB9XHJcblxyXG4gIGFzeW5jIGNsb3NlUm9vbSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRoaXMuZXhwbGljaXRseUNsb3NlZCA9IHRydWVcclxuICAgIHRoaXMucm9vbUlkID0gbnVsbFxyXG4gICAgdGhpcy50ZWFyZG93blNvY2tldCgpXHJcbiAgICB0aGlzLmVtaXRTdGF0ZSgnZGlzY29ubmVjdGVkJylcclxuICB9XHJcblxyXG4gIGFzeW5jIGRpc2Nvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhd2FpdCB0aGlzLmNsb3NlUm9vbSgpXHJcbiAgICB0aGlzLmNvbmZpZyA9IG51bGxcclxuICAgIHRoaXMubWVtYmVyVG9rZW4gPSBudWxsXHJcbiAgfVxyXG5cclxuICBhc3luYyBzZW5kKGVudmVsb3BlOiBNZXNzYWdlRW52ZWxvcGUpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICghdGhpcy53cyB8fCB0aGlzLndzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignXHU2NzJBXHU4RkRFXHU2M0E1XHVGRjA4V2ViU29ja2V0IFx1NjcyQVx1NjI1M1x1NUYwMFx1RkYwOScpXHJcbiAgICB9XHJcbiAgICB0aGlzLndzLnNlbmQoSlNPTi5zdHJpbmdpZnkoZW52ZWxvcGUpKVxyXG4gIH1cclxuXHJcbiAgLyoqIHYwLjQuOVx1RkYxQVx1NUJGOVx1OUY1MFx1N0FFRlx1NTNFM1x1N0I3RVx1NTQwRFx1RkYwOElOZXRTZXJ2aWNlIFx1NThGMFx1NjYwRSBQcm9taXNlIFx1MjAxNFx1MjAxNCBcdTZCNjRcdTUyNERcdTU0MENcdTZCNjVcdThGRDRcdTU2REVcdUZGMENcdTY3M0FcdTU2NjhcdTRFQkFcdTc2RjRcdThGREVcdTkwMDJcdTkxNERcdTU2NjhcdTY1RjYgdHlwZWNoZWNrIFx1NjI0RFx1NjZCNFx1OTczMlx1RkYwOSAqL1xyXG4gIGFzeW5jIGdldE1lbWJlcklkKCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xyXG4gICAgcmV0dXJuIHRoaXMubWVtYmVyVG9rZW5cclxuICB9XHJcblxyXG4gIGFzeW5jIHJlcXVlc3Q8VCA9IHVua25vd24+KG9wdGlvbnM6IEh0dHBSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SHR0cFJlc3VsdDxUPj4ge1xyXG4gICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7b3B0aW9ucy5wYXRofWBcclxuICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICdYLVR1cmVhZC1BY2Nlc3MnOiB0aGlzLmFjY2Vzc1Rva2VuXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tZW1iZXJUb2tlbikgaGVhZGVyc1snQXV0aG9yaXphdGlvbiddID0gYEJlYXJlciAke3RoaXMubWVtYmVyVG9rZW59YFxyXG5cclxuICAgIGxldCBib2R5OiBCb2R5SW5pdCB8IHVuZGVmaW5lZFxyXG4gICAgaWYgKG9wdGlvbnMuYm9keSAhPSBudWxsKSB7XHJcbiAgICAgIGlmIChvcHRpb25zLnJhd0JvZHkpIHtcclxuICAgICAgICBib2R5ID0gb3B0aW9ucy5ib2R5IGFzIEFycmF5QnVmZmVyXHJcbiAgICAgICAgaGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJ1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmJvZHkpXHJcbiAgICAgICAgaGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFx1OEQ4NVx1NjVGNlx1NTE1Q1x1NUU5NVx1RkYwOFRPRE8gUDJcdTMwMENSRVNUIFx1NjVFMFx1OEQ4NVx1NjVGNlx1MzAwRFx1RkYwOVx1RkYxQVx1NjcwRFx1NTJBMVx1NTY2OFx1NEUwRFx1NTNFRlx1OEZCRVx1NjVGNiBjcmVhdGUvam9pbi9cdTUyMzdcdTY1QjBcdTRFMERcdTgwRkRcdTZDMzhcdTRFNDVcdTUzNjFcdTRGNEZcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwgeyBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLCBoZWFkZXJzLCBib2R5LCBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoUkVTVF9USU1FT1VUX01TKSB9KVxyXG5cclxuICAgIGxldCBkYXRhOiB1bmtub3duXHJcbiAgICBpZiAocmVzLnN0YXR1cyA9PT0gMjA0KSB7XHJcbiAgICAgIGRhdGEgPSB1bmRlZmluZWRcclxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5yZXNwb25zZVR5cGUgPT09ICdhcnJheWJ1ZmZlcicpIHtcclxuICAgICAgZGF0YSA9IGF3YWl0IHJlcy5hcnJheUJ1ZmZlcigpXHJcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMucmVzcG9uc2VUeXBlID09PSAndGV4dCcpIHtcclxuICAgICAgZGF0YSA9IGF3YWl0IHJlcy50ZXh0KClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIFx1NTE0OFx1NTNENlx1NTM5Rlx1NTlDQlx1NjU4N1x1NjcyQ1x1NTE4RCBwYXJzZVx1RkYxQVx1ODlFM1x1Njc5MFx1NTkzMVx1OEQyNVx1NjVGNlx1OTUxOVx1OEJFRlx1OTFDQ1x1NEZERFx1NzU1OVx1NzcxRlx1NUI5RVx1NTRDRFx1NUU5NFx1RkYwOEhUTUwgXHU5NTE5XHU4QkVGXHU5ODc1L1x1N0Y1MVx1NTE3M1x1NEZFMVx1NjA2Rlx1RkYwOVx1RkYwQ1xyXG4gICAgICAvLyBcdTRFMERcdTUxOERcdTYyOEEgbnVsbCBcdTRGMkFcdTg4QzVcdTYyMTAgVCBcdTVGODBcdTRFMEJcdTRGMjBcdUZGMDhcdTRFMEJcdTZFMzhcdTUzRUFcdTRGMUFcdTc3MEJcdTUyMzBcIlx1NTkzMVx1NjU1N1x1RkYxQW51bGxcIlx1RkYwQ1x1NzcxRlx1NUI5RVx1NTM5Rlx1NTZFMFx1ODhBQlx1NTQxRVx1RkYwOVx1MzAwMlxyXG4gICAgICBjb25zdCByYXcgPSBhd2FpdCByZXMudGV4dCgpXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgZGF0YSA9IHJhdyA9PT0gJycgPyB1bmRlZmluZWQgOiBKU09OLnBhcnNlKHJhdylcclxuICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgYFx1NTRDRFx1NUU5NFx1NEUwRFx1NjYyRiBKU09OXHVGRjA4SFRUUCAke3Jlcy5zdGF0dXN9XHVGRjA5XHVGRjFBJHtyYXcuc2xpY2UoMCwgMjAwKSB8fCAnPFx1N0E3QVx1NTRDRFx1NUU5NFx1NEY1Mz4nfWBcclxuICAgICAgICApXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyBzdGF0dXM6IHJlcy5zdGF0dXMsIG9rOiByZXMub2ssIGRhdGE6IGRhdGEgYXMgVCB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGVuc3VyZU1lbWJlclRva2VuKCk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2F1dGgvdG9rZW5gLCB7XHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7ICdYLVR1cmVhZC1BY2Nlc3MnOiB0aGlzLmFjY2Vzc1Rva2VuIH0sXHJcbiAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dChSRVNUX1RJTUVPVVRfTVMpXHJcbiAgICB9KVxyXG4gICAgaWYgKCFyZXMub2spIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdTdCN0VcdTUzRDFcdTYyMTBcdTU0NTggdG9rZW4gXHU1OTMxXHU4RDI1XHVGRjA4SFRUUCAke3Jlcy5zdGF0dXN9XHVGRjA5XHVGRjFBXHU4QkY3XHU2OEMwXHU2N0U1XHU2NzBEXHU1MkExXHU1NjY4XHU1NzMwXHU1NzQwXHU0RTBFXHU0RThDXHU3RUE3XHU0RUU0XHU3MjRDYClcclxuICAgIH1cclxuICAgIGNvbnN0IGRhdGEgPSAoYXdhaXQgcmVzLmpzb24oKSkgYXMgVG9rZW5SZXNwb25zZVxyXG4gICAgcmV0dXJuIGRhdGEudG9rZW5cclxuICB9XHJcblxyXG4gIC8qKiBcdTZFMDVcdTYzODlcdThGREVcdTYzQTVcdTRFMEVcdTkxQ0RcdThGREVcdThCQTFcdTY1RjZcdTU2NjhcdUZGMDhcdTVFNDJcdTdCNDlcdUZGMUJcdTRFMERcdTZFMDUgcm9vbUlkL2NvbmZpZ1x1RkYwOSAqL1xyXG4gIHByaXZhdGUgdGVhcmRvd25Tb2NrZXQoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5yZWNvbm5lY3RUaW1lcikge1xyXG4gICAgICBjbGVhclRpbWVvdXQodGhpcy5yZWNvbm5lY3RUaW1lcilcclxuICAgICAgdGhpcy5yZWNvbm5lY3RUaW1lciA9IG51bGxcclxuICAgIH1cclxuICAgIGNvbnN0IHdzID0gdGhpcy53c1xyXG4gICAgdGhpcy53cyA9IG51bGxcclxuICAgIC8vIFx1NUJBMVx1OEJBMSBBLTJcdUZGMUFcdTYzRTFcdTYyNEJcdUZGMDhDT05ORUNUSU5HXHVGRjA5XHU0RTJEXHU3Njg0IHNvY2tldCBcdTg4QUIgcmVtb3ZlQWxsTGlzdGVuZXJzIFx1NTQwRVx1NEUwRFx1NEYxQVx1NTE4RFx1NjcwOVx1NEVGQlx1NEY1NVx1NEU4Qlx1NEVGNlx1RkYwQ1xyXG4gICAgLy8gXHU2QjYzXHU1NzI4IGF3YWl0IG9wZW5Tb2NrZXQoKSBcdTc2ODRcdThDMDNcdTc1MjhcdTk0RkVcdTRGMUFcdTZDMzhcdTRFNDVcdTYzMDJcdThENzcgXHUyMTkyIHRlYXJkb3duL2ludmFsaWRhdGUgXHU1RkM1XHU5ODdCXHU0RTNCXHU1MkE4IHJlamVjdFxyXG4gICAgY29uc3QgcGVuZGluZyA9IHRoaXMucGVuZGluZ09wZW5cclxuICAgIHRoaXMucGVuZGluZ09wZW4gPSBudWxsXHJcbiAgICBpZiAod3MpIHtcclxuICAgICAgd3MucmVtb3ZlQWxsTGlzdGVuZXJzKClcclxuICAgICAgdHJ5IHtcclxuICAgICAgICB3cy5jbG9zZSgpXHJcbiAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgIC8vIFx1NTE3M1x1OTVFRFx1NURGMlx1NkI3Qlx1OEZERVx1NjNBNVx1NjVGNlx1NzY4NFx1NUYwMlx1NUUzOFx1NjVFMFx1OTcwMFx1NEUwQVx1NjJBNVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBwZW5kaW5nPy5yZWplY3QobmV3IEVycm9yKCdcdThGREVcdTYzQTVcdTVERjJcdTRGNUNcdTVFOUZcdUZGMDhcdThGREVcdTYzQTVcdTg4QUJcdTUxNzNcdTk1RUQvXHU5MUNEXHU1RUZBXHVGRjA5JykpXHJcbiAgfVxyXG5cclxuICAvKiogXHU0RjVDXHU1RTlGXHU2N0QwXHU2NzYxXHU4RkRFXHU2M0E1XHVGRjFBXHU2NDU4XHU2Mzg5XHU3NkQxXHU1NDJDXHU1RTc2XHU1MTczXHU5NUVEXHVGRjA4XHU1MTc2IGNsb3NlIFx1NEUwRFx1NTE4RFx1ODlFNlx1NTNEMVx1RkYwQ1x1NTZFMFx1NkI2NFx1NEUwRFx1NEYxQVx1N0VFRFx1OEZERVx1RkYwOSAqL1xyXG4gIHByaXZhdGUgaW52YWxpZGF0ZVNvY2tldCh3czogV2ViU29ja2V0KTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy53cyA9PT0gd3MpIHRoaXMud3MgPSBudWxsXHJcbiAgICBjb25zdCBwZW5kaW5nID0gdGhpcy5wZW5kaW5nT3Blbj8ud3MgPT09IHdzID8gdGhpcy5wZW5kaW5nT3BlbiA6IG51bGxcclxuICAgIHRoaXMucGVuZGluZ09wZW4gPSBudWxsXHJcbiAgICB3cy5yZW1vdmVBbGxMaXN0ZW5lcnMoKVxyXG4gICAgdHJ5IHtcclxuICAgICAgd3MuY2xvc2UoKVxyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIC8vIFx1NTE3M1x1OTVFRFx1NURGMlx1NkI3Qlx1OEZERVx1NjNBNVx1NjVGNlx1NzY4NFx1NUYwMlx1NUUzOFx1NjVFMFx1OTcwMFx1NEUwQVx1NjJBNVxyXG4gICAgfVxyXG4gICAgcGVuZGluZz8ucmVqZWN0KG5ldyBFcnJvcignXHU4RkRFXHU2M0E1XHU1REYyXHU0RjVDXHU1RTlGXHVGRjA4XHU4OEFCXHU2NkY0XHU2NUIwXHU3Njg0XHU4RkRFXHU2M0E1XHU1M0Q2XHU0RUUzXHVGRjA5JykpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9wZW5Tb2NrZXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuY29uZmlnIHx8ICF0aGlzLnJvb21JZCkgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IoJ1x1NjVFMFx1OEZERVx1NjNBNVx1OTE0RFx1N0Y2RScpKVxyXG4gICAgICBjb25zdCB1cmwgPSBidWlsZFJvb21Xc1VybCh0aGlzLmNvbmZpZy5zZXJ2ZXJVcmwsIHRoaXMucm9vbUlkLCAodGhpcy5jb25maWcubmlja05hbWUgPz8gJycpLnRyaW0oKSlcclxuICAgICAgY29uc3Qgd3MgPSBuZXcgV2ViU29ja2V0KHVybCwge1xyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdYLVR1cmVhZC1BY2Nlc3MnOiB0aGlzLmFjY2Vzc1Rva2VuLFxyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3RoaXMubWVtYmVyVG9rZW4gPz8gJyd9YFxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgICAgdGhpcy53cyA9IHdzXHJcbiAgICAgIC8vIFx1NUJBMVx1OEJBMSBBLTJcdUZGMUFcdTc2N0JcdThCQjBcdTU3MjhcdTkwMTRcdTYzRTFcdTYyNEJcdUZGMENcdTRGOUIgdGVhcmRvd24vaW52YWxpZGF0ZSBcdTRGNUNcdTVFOUZcdTY1RjYgcmVqZWN0XHVGRjA4XHU1NDI2XHU1MjE5XHU2QzM4XHU0RTBEXHU3RUQzXHU3Qjk3XHVGRjA5XHJcbiAgICAgIHRoaXMucGVuZGluZ09wZW4gPSB7IHdzLCByZWplY3QgfVxyXG4gICAgICAvKiogXHU2NzJDXHU2QjIxXHU4RkRFXHU2M0E1XHU2NjJGXHU1NDI2XHU2M0UxXHU2MjRCXHU2MjEwXHU1MjlGIFx1MjAxNFx1MjAxNCBcdTU5MzFcdThEMjVcdThGQzdcdTc2ODRcdTkwQTNcdTZCMjEqKlx1NEUwRFx1NTQwRVx1NTNGMFx1N0VFRFx1OEZERSoqXHVGRjA4VE9ETyBQMlx1MzAwQ1x1OEQ4QVx1Njc0M1x1NTNEMSBjb25uZWN0ZWRcdTMwMERcdUZGMDkgKi9cclxuICAgICAgbGV0IG9wZW5lZCA9IGZhbHNlXHJcbiAgICAgIC8vIFx1NjNFMVx1NjI0Qlx1OEQ4NVx1NjVGNlx1NTE1Q1x1NUU5NVx1RkYxQW9wZW5Sb29tIFx1NTE2OFx1N0EwQlx1NkI2NFx1NTI0RFx1NjVFMFx1OEQ4NVx1NjVGNlx1RkYwOEpPSU5fVElNRU9VVF9NUyBcdTUzRUFcdTg5ODZcdTc2RDYgc2VuZEpvaW4gXHU0RTRCXHU1NDBFXHU3Njg0XHU3QjQ5XHU1Rjg1XHVGRjA5XHJcbiAgICAgIGNvbnN0IG9wZW5UaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIGlmIChvcGVuZWQpIHJldHVyblxyXG4gICAgICAgIHRoaXMuaW52YWxpZGF0ZVNvY2tldCh3cylcclxuICAgICAgICByZWplY3QobmV3IEVycm9yKGBcdThGREVcdTYzQTVcdThEODVcdTY1RjZcdUZGMDgke09QRU5fVElNRU9VVF9NUyAvIDEwMDB9cyBcdTUxODVcdTYzRTFcdTYyNEJcdTY3MkFcdTVCOENcdTYyMTBcdUZGMDlgKSlcclxuICAgICAgfSwgT1BFTl9USU1FT1VUX01TKVxyXG5cclxuICAgICAgd3Mub24oJ29wZW4nLCAoKSA9PiB7XHJcbiAgICAgICAgb3BlbmVkID0gdHJ1ZVxyXG4gICAgICAgIGNsZWFyVGltZW91dChvcGVuVGltZXIpXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BlbiA9IG51bGxcclxuICAgICAgICB0aGlzLnJlY29ubmVjdEF0dGVtcHRzID0gMFxyXG4gICAgICAgIHRoaXMuZW1pdFN0YXRlKCdjb25uZWN0ZWQnKVxyXG4gICAgICAgIHJlc29sdmUoKVxyXG4gICAgICB9KVxyXG4gICAgICB3cy5vbignbWVzc2FnZScsIChyYXcpID0+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgSlNPTi5wYXJzZShTdHJpbmcocmF3KSkgYXMgTWVzc2FnZUVudmVsb3BlKVxyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgLy8gXHU5NzVFXHU2Q0Q1IEpTT05cdUZGMUFcdTRFMjJcdTVGMDNcdUZGMDhcdTRGMjBcdThGOTNcdTVDNDJcdTUzRUFcdTY0MkNcdThGRDBcdTU0MDhcdTZDRDVcdTRGRTFcdTVDMDFcdUZGMDlcclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICAgIHdzLm9uKCdlcnJvcicsIChlcnIpID0+IHtcclxuICAgICAgICBpZiAob3BlbmVkKSByZXR1cm4gLy8gXHU4RkRFXHU0RTBBXHU0RTRCXHU1NDBFXHU3Njg0XHU5NTE5XHU4QkVGXHU0RUE0XHU3RUQ5IGNsb3NlIFx1OEQ3MFx1OTFDRFx1OEZERVxyXG4gICAgICAgIGNsZWFyVGltZW91dChvcGVuVGltZXIpXHJcbiAgICAgICAgLy8gXHU1MTQ4XHU2NDU4XHU2Mzg5IHBlbmRpbmcgXHU1MThEIGludmFsaWRhdGVcdUZGMUFcdTk1MTlcdThCRUZcdThCRTZcdTYwQzVcdTc1MzFcdThGRDlcdTkxQ0NcdTc2ODQgcmVqZWN0IFx1NUUyNlx1NTFGQVx1RkYwOGludmFsaWRhdGUgXHU3Njg0XHU1MTVDXHU1RTk1IHJlamVjdCBcdTUzRUFcdTU3MjhcdTUxNzZcdTRFRDZcdThERUZcdTVGODRcdUZGMDlcclxuICAgICAgICBpZiAodGhpcy5wZW5kaW5nT3Blbj8ud3MgPT09IHdzKSB0aGlzLnBlbmRpbmdPcGVuID0gbnVsbFxyXG4gICAgICAgIHRoaXMuaW52YWxpZGF0ZVNvY2tldCh3cylcclxuICAgICAgICByZWplY3QoZXJyKVxyXG4gICAgICB9KVxyXG4gICAgICB3cy5vbignY2xvc2UnLCAoKSA9PiB7XHJcbiAgICAgICAgaWYgKHRoaXMud3MgIT09IHdzKSByZXR1cm4gLy8gXHU1REYyXHU0RjVDXHU1RTlGL1x1NURGMlx1NjM2Mlx1NjVCMFx1OEZERVx1NjNBNVx1RkYxQVx1NjVFN1x1OEZERVx1NjNBNVx1NzY4NCBjbG9zZSBcdTRFMERcdTUxOERcdTY3MDlcdTYxMEZcdTRFNDlcclxuICAgICAgICB0aGlzLndzID0gbnVsbFxyXG4gICAgICAgIGlmICh0aGlzLmV4cGxpY2l0bHlDbG9zZWQgfHwgIW9wZW5lZCkge1xyXG4gICAgICAgICAgdGhpcy5lbWl0U3RhdGUoJ2Rpc2Nvbm5lY3RlZCcpXHJcbiAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZVJlY29ubmVjdCgpXHJcbiAgICAgIH0pXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgLyoqIFx1NjVBRFx1N0VCRlx1ODFFQVx1NTJBOFx1OTFDRFx1OEZERVx1RkYwOFx1NTNFQVx1NUJGOVwiXHU2NkZFXHU3RUNGXHU4RkRFXHU0RTBBXHU4RkM3XCJcdTc2ODRcdTYyM0ZcdTk1RjRcdThGREVcdTYzQTVcdUZGMUJcdTYzRTFcdTYyNEJcdTU5MzFcdThEMjUvXHU0RTNCXHU1MkE4XHU1MTczXHU5NUVEXHU0RTBEXHU5MUNEXHU4RkRFXHVGRjA5ICovXHJcbiAgcHJpdmF0ZSBzY2hlZHVsZVJlY29ubmVjdCgpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmV4cGxpY2l0bHlDbG9zZWQgfHwgIXRoaXMucm9vbUlkKSB7XHJcbiAgICAgIHRoaXMuZW1pdFN0YXRlKCdkaXNjb25uZWN0ZWQnKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGlmICh0aGlzLnJlY29ubmVjdEF0dGVtcHRzID49IE1BWF9SRUNPTk5FQ1RfQVRURU1QVFMpIHtcclxuICAgICAgLy8gXHU1QkExXHU4QkExIEItNFx1RkYxQVx1OTFDRFx1OEZERVx1ODAxN1x1NUMzRFx1NEUwRFx1NjYyRlx1NUI4OVx1OTc1OVx1NzY4NCBkaXNjb25uZWN0ZWQgXHUyMDE0XHUyMDE0IFx1NzUyOFx1NEY4Qlx1NUM0Mlx1RkYwOFJvb21TZXNzaW9uXHVGRjA5XHU2MzZFXHU2QjY0XHU4MUVBXHU1MkE4XHU3OUJCXHU1RjAwXHU2MjNGXHU5NUY0XHVGRjBDXHJcbiAgICAgIC8vIFx1N0VEOVx1NTFGQVx1NTNFRlx1OTg4NFx1NjcxRlx1NzY4NFx1N0VDOFx1NzBCOVx1RkYwQ1x1ODAwQ1x1NEUwRFx1NjYyRlwiVUkgXHU2NjNFXHU3OTNBXHU2NzJBXHU4RkRFXHU2M0E1XHU0RjQ2XHU0RjFBXHU4QkREXHU4RkQ4XHU2MzAyXHU1NzI4XHU2MjNGXHU5NUY0XHU5MUNDXCJcdTc2ODRcdTUzNEFcdTZCN0JcdTYwMDFcclxuICAgICAgdGhpcy5lbWl0U3RhdGUoJ2ZhaWxlZCcpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgdGhpcy5lbWl0U3RhdGUoJ3JlY29ubmVjdGluZycpXHJcbiAgICB0aGlzLnJlY29ubmVjdEF0dGVtcHRzKytcclxuICAgIHRoaXMucmVjb25uZWN0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgdGhpcy5yZWNvbm5lY3RUaW1lciA9IG51bGxcclxuICAgICAgaWYgKHRoaXMuZXhwbGljaXRseUNsb3NlZCB8fCAhdGhpcy5yb29tSWQpIHJldHVyblxyXG4gICAgICAvLyBcdTI2QTAgXHU5MUNEXHU4RkRFXHU2MjEwXHU1MjlGID0gXHU2NzBEXHU1MkExXHU1NjY4XHU0RkE3XHU2NjJGXHU0RTAwXHU2NzYxKipcdTUxNjhcdTY1QjBcdThGREVcdTYzQTUqKlx1RkYwOFx1NjIxMFx1NTQ1OC9cdThCQTJcdTk2MDVcdTkwRkRcdTY2MkZcdTc3QUNcdTYwMDFcdTc2ODRcdUZGMDlcdTIxOTIgXHU0RTBBXHU1QzQyXHVGRjA4Um9vbVNlc3Npb25cdUZGMDlcclxuICAgICAgLy8gXHU1RkM1XHU5ODdCXHU5MUNEXHU2NUIwXHU1M0QxIHJvb20uam9pblx1RkYwQ1x1NTQyNlx1NTIxOVx1NEYxQVx1NTNEOFx1NjIxMFwiXHU1NzI4XHU2MjNGXHU5NUY0XHU5MUNDXHU1Mzc0XHU0RTBEXHU2NjJGXHU2MjEwXHU1NDU4XCJcdTc2ODRcdTVFN0RcdTcwNzVcdUZGMDhcdTY1MzZcdTRFMERcdTUyMzAgcHJlc2VuY2UvXHU4MDRBXHU1OTI5XHVGRjA5XHJcbiAgICAgIHRoaXMub3BlblNvY2tldCgpLmNhdGNoKCgpID0+IHRoaXMuc2NoZWR1bGVSZWNvbm5lY3QoKSlcclxuICAgIH0sIFJFQ09OTkVDVF9ERUxBWV9NUylcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZW1pdFN0YXRlKHN0YXRlOiBDb25uZWN0aW9uU3RhdGUpOiB2b2lkIHtcclxuICAgIC8vIFx1NUJBMVx1OEJBMSBDLTRcdUZGMUFcdTcyQjZcdTYwMDFcdTY3MkFcdTUzRDhcdTRFMERcdTVFN0ZcdTY0QUQgXHUyMDE0XHUyMDE0IGNsb3NlUm9vbS9cdTY1QURcdTVGMDBcdTdCNDlcdThERUZcdTVGODRcdTVFMzhcdTU3MjhcdTVERjJcdTY1QURcdTVGMDBcdTY1RjZcdTUxOERcdTUzRDFcdTRFMDBcdTZCMjEgZGlzY29ubmVjdGVkXHVGRjBDXHJcbiAgICAvLyBcdTZEODhcdThEMzlcdTY1QjlcdUZGMDhcdTUxNzFcdTRFQUJcdTYwMDEvVUlcdUZGMDlcdTRFMERcdThCRTVcdTY1MzZcdTUyMzBcdTU0MENcdTcyQjZcdTYwMDFcdTc2ODRcdTkxQ0RcdTU5MERcdTRFOEJcdTRFRjZcclxuICAgIGlmICh0aGlzLmxhc3RTdGF0ZSA9PT0gc3RhdGUpIHJldHVyblxyXG4gICAgdGhpcy5sYXN0U3RhdGUgPSBzdGF0ZVxyXG4gICAgdGhpcy5lbWl0KCdjb25uZWN0aW9uLWNoYW5nZWQnLCBzdGF0ZSlcclxuICB9XHJcbn1cclxuIiwgIi8qKlxyXG4gKiBJQm9va0lkZW50aXR5U2VydmljZSBcdTkwMDJcdTkxNERcdTU2NjhcdUZGMDhcdTc3MUZcdTVCOUVcdTVCOUVcdTczQjBcdUZGMDlcdTMwMDJcclxuICogXHU2MzA3XHU3RUI5XHU3Qjk3XHU2Q0Q1IG1kNS1zYW1wbGUzLXYxXHVGRjFBXHU1OTM0IDY0S0IgKyBcdTRFMkRcdTcwQjkgNjRLQiArIFx1NUMzRSA2NEtCIFx1NEUwOVx1NzBCOVx1OTFDN1x1NjgzN1x1NjJGQ1x1NjNBNVx1NTQwRVx1OEJBMVx1N0I5NyBtZDVcdUZGMDhcdTkxNERcdTU0MDggc2l6ZSBcdTk2MzJcdTc4QjBcdTY0OUVcdUZGMDlcdTMwMDJcclxuICogXHU0RjlEXHU2MzZFXHVGRjFBZG9jcy9BUkNISVRFQ1RVUkUubWQgXHUwMEE3MSArIHNlcnZlci9kb2NzL0FQSS5tZFx1MzAwMlxyXG4gKiBcdTVCOUVcdTczQjBcdUZGMUFzcGFyay1tZDVcdUZGMDhNSVRcdUZGMENcdTY1MkZcdTYzMDEgQXJyYXlCdWZmZXIgXHU1ODlFXHU5MUNGL1x1NjJGQ1x1NjNBNVx1NTRDOFx1NUUwQ1x1RkYwOVx1MzAwMlxyXG4gKi9cclxuaW1wb3J0IFNwYXJrTUQ1IGZyb20gJ3NwYXJrLW1kNSdcclxuaW1wb3J0IHR5cGUgeyBJQm9va0lkZW50aXR5U2VydmljZSB9IGZyb20gJ0Bjb3JlL3BvcnRzL2lkZW50aXR5J1xyXG5pbXBvcnQgdHlwZSB7IEJvb2tGaW5nZXJwcmludCwgQm9va0Zvcm1hdCwgQm9va01ldGFkYXRhIH0gZnJvbSAnQGNvcmUvZG9tYWluL3R5cGVzJ1xyXG5cclxuY29uc3QgU0FNUExFX1NJWkUgPSA2NCAqIDEwMjRcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlU2FtcGxlM01kNShidWZmZXI6IEFycmF5QnVmZmVyKTogeyBoYXNoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHtcclxuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcilcclxuICBjb25zdCBzaXplID0gYnl0ZXMuYnl0ZUxlbmd0aFxyXG5cclxuICBjb25zdCBoZWFkID0gYnl0ZXMuc3ViYXJyYXkoMCwgU0FNUExFX1NJWkUpXHJcbiAgY29uc3QgbWlkU3RhcnQgPSBNYXRoLmZsb29yKHNpemUgLyAyKVxyXG4gIGNvbnN0IG1pZCA9IGJ5dGVzLnN1YmFycmF5KG1pZFN0YXJ0LCBtaWRTdGFydCArIFNBTVBMRV9TSVpFKVxyXG4gIGNvbnN0IHRhaWxTdGFydCA9IE1hdGgubWF4KDAsIHNpemUgLSBTQU1QTEVfU0laRSlcclxuICBjb25zdCB0YWlsID0gYnl0ZXMuc3ViYXJyYXkodGFpbFN0YXJ0KVxyXG5cclxuICBjb25zdCBjb21iaW5lZCA9IG5ldyBVaW50OEFycmF5KGhlYWQuYnl0ZUxlbmd0aCArIG1pZC5ieXRlTGVuZ3RoICsgdGFpbC5ieXRlTGVuZ3RoKVxyXG4gIGNvbWJpbmVkLnNldChoZWFkLCAwKVxyXG4gIGNvbWJpbmVkLnNldChtaWQsIGhlYWQuYnl0ZUxlbmd0aClcclxuICBjb21iaW5lZC5zZXQodGFpbCwgaGVhZC5ieXRlTGVuZ3RoICsgbWlkLmJ5dGVMZW5ndGgpXHJcblxyXG4gIGNvbnN0IGhhc2ggPSBTcGFya01ENS5BcnJheUJ1ZmZlci5oYXNoKGNvbWJpbmVkLmJ1ZmZlciBhcyBBcnJheUJ1ZmZlcilcclxuICByZXR1cm4geyBoYXNoLCBzaXplIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEZpbmdlcnByaW50U2VydmljZSBpbXBsZW1lbnRzIElCb29rSWRlbnRpdHlTZXJ2aWNlIHtcclxuICBjb21wdXRlRmluZ2VycHJpbnQoYnVmZmVyOiBBcnJheUJ1ZmZlcik6IFByb21pc2U8Qm9va0ZpbmdlcnByaW50PiB7XHJcbiAgICBjb25zdCB7IGhhc2gsIHNpemUgfSA9IGNvbXB1dGVTYW1wbGUzTWQ1KGJ1ZmZlcilcclxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBhbGdvcml0aG06ICdtZDUtc2FtcGxlMy12MScsIGhhc2gsIHNpemUgfSlcclxuICB9XHJcblxyXG4gIC8qKiBcdTUxNDNcdTY1NzBcdTYzNkVcdTYzRDBcdTUzRDZcdUZGMUFcdTlBQThcdTY3QjZcdTk2MzZcdTZCQjVcdTRFQ0VcdTY1ODdcdTRFRjZcdTU0MERcdTYzQThcdTVCRkMgdGl0bGVcdUZGMENcdTdFRDNcdTY3ODRcdTUzMTZcdTVCNTdcdTZCQjVcdUZGMDhlcHViL2ZiMlx1RkYwOVx1NTQwRVx1N0VFRFx1NEVBNFx1N0VEOSBrb29raXQgXHU4OUUzXHU2NzkwXHUzMDAyICovXHJcbiAgZXh0cmFjdE1ldGFkYXRhKF9idWZmZXI6IEFycmF5QnVmZmVyLCBfZm9ybWF0OiBCb29rRm9ybWF0LCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPEJvb2tNZXRhZGF0YT4ge1xyXG4gICAgY29uc3QgdGl0bGUgPSBzdHJpcEV4dGVuc2lvbihuYW1lKSB8fCAnXHU2NzJBXHU1NDdEXHU1NDBEJ1xyXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHRpdGxlIH0pXHJcbiAgfVxyXG5cclxuICB2ZXJpZnkobG9jYWw6IEJvb2tGaW5nZXJwcmludCwgcm9vbTogQm9va0ZpbmdlcnByaW50KTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICBsb2NhbC5hbGdvcml0aG0gPT09IHJvb20uYWxnb3JpdGhtICYmXHJcbiAgICAgIGxvY2FsLmhhc2ggPT09IHJvb20uaGFzaCAmJlxyXG4gICAgICBsb2NhbC5zaXplID09PSByb29tLnNpemVcclxuICAgIClcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0cmlwRXh0ZW5zaW9uKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3QgYmFzZSA9IG5hbWUucmVwbGFjZSgvXFxcXC9nLCAnLycpLnNwbGl0KCcvJykucG9wKCkgPz8gbmFtZVxyXG4gIGNvbnN0IGlkeCA9IGJhc2UubGFzdEluZGV4T2YoJy4nKVxyXG4gIHJldHVybiBpZHggPiAwID8gYmFzZS5zbGljZSgwLCBpZHgpIDogYmFzZVxyXG59XHJcbiIsICIvKipcbiAqIHJvb21ib3QgXHUyMDE0XHUyMDE0IFx1ODcwMlx1N0ZBNFx1NjczQVx1NTY2OFx1NEVCQVx1NUJBMlx1NjIzN1x1N0FFRlx1RkYwOFx1N0VBRiBOb2RlXHVGRjBDXHU2NUUwXHU3QTk3XHU1M0UzXHVGRjBDZGV2LW9ubHkgXHU1REU1XHU1MTc3XHVGRjA5XHUzMDAyXG4gKlxuICogXHU1QjgzXHU2NjJGXHU0RUMwXHU0RTQ4XHVGRjFBXHU2MjhBKipcdTc3MUZcdTVCOUVcdTc2ODRcdTY4MzhcdTVGQzNcdTVDNDIqKlx1RkYwOFdzTmV0QWRhcHRlciBcdTRGMjBcdThGOTNcdTkwMDJcdTkxNERcdTU2NjggKyBSb29tU2Vzc2lvbiBcdTU0MENcdTZCNjVcdTc1MjhcdTRGOEIgKyBcdTUzNEZcdThCQUVcdThCQ0RcdTZDNDdcdUZGMDlcbiAqIFx1NTM5Rlx1NjgzN1x1NjQyQ1x1OEZEQlx1NEUwMFx1NEUyQVx1NjVFMFx1NTkzNFx1OEZEQlx1N0EwQlx1RkYwQ1x1NkUzMlx1NjdEM1x1N0FFRlx1NTNFM1x1NjM2Mlx1NjIxMCoqXHU4MTFBXHU2NzJDXHU1MzE2XHU1MDQ3XHU0RUY2KipcdUZGMDhcdTYzMDlcdTgyODJcdTU5NEZcdTU0MTBcdTRGNERcdTdGNkVcdTMwMDFnZXRPcGVuQm9vayBcdThGRDRcdTU2REVcdTRFMEVcdTYyM0ZcdTk1RjRcbiAqIGVkaXRpb24gXHU1NDBDXHU2MzA3XHU3RUI5XHU3Njg0XHU1NDA4XHU2MjEwXHU0RTY2XHVGRjA5XHUyMDE0XHUyMDE0IFx1NkEyMVx1NEVGRlx1NEUwMFx1NEUyQVwiXHU2QjYzXHU1NzI4XHU3RkZCXHU5ODc1L1x1OEJGNFx1OEJERC9cdTc5QkJcdTVGMDBcIlx1NzY4NFx1NzcxRlx1NEVCQVx1NUJBMlx1NjIzN1x1N0FFRlx1MzAwMlxuICogXHU0RjlEXHU2MzZFXHVGRjA4XHU3NTI4XHU2MjM3IDIwMjYtMTAtMjQgXHU3QUNCXHU5ODc5XHVGRjA5XHVGRjFBXHU1QjlFXHU2NzNBXHU0RTBBXHU2MjREXHU4MEZEXHU5QThDXHU3Njg0XHU5NUVFXHU5ODk4XHU1MTQ4XHU1NzI4XHU1MzU1XHU2NzNBXHU4NzAyXHU3RkE0XHU5MUNDXHU3QjVCXHU0RTAwXHU5MDREXHVGRjFCXHU0RUE0XHU0RTkyXHU3NTRDXHU5NzYyXHU2MzA5XCJcdTU5ODJcdTdFQTZcdTVERTVcdTRGNUNcIlx1NTA0N1x1OEJCRVx1MzAwMlxuICpcbiAqIFx1NEUzQVx1NEVDMFx1NEU0OFx1OEZEOVx1NjYyRlx1NUJGOVx1NzY4NFx1NUY2Mlx1NjAwMVx1RkYxQVx1NTQwQ1x1NkI2NVx1OTAzQlx1OEY5MVx1NEUwRVx1N0E5N1x1NTNFM1x1NjcyQ1x1Njc2NVx1NUMzMVx1NjYyRlx1NEUyNFx1NUM0Mlx1RkYwOFx1NTE2RFx1OEZCOVx1NUY2MiBwb3J0c1x1RkYwOVx1MjAxNFx1MjAxNCBcdTY3M0FcdTU2NjhcdTRFQkFcdTUzRUFcdTU5MERcdTc1MjhcdTUyNERcdTRFMDBcdTVDNDJcdUZGMENcbiAqIFx1NkUzMlx1NjdEMy9VSS9JUEMgXHU2ODY1XHU0RTBEXHU4RkRCXHU4NzAyXHU3RkE0XHU3Njg0XHU4OTg2XHU3NkQ2XHU5NzYyXHVGRjA4XHU5MEEzXHU0RTI0XHU1QzQyXHU3Njg0XHU2NzNBXHU2OEIwXHU5QThDXHU4QkMxXHU1RjUyIHJvb20vcm9vbS1wZWVyIFx1NzcxRlx1N0E5N1x1NTNFM1x1NjNBMlx1OTQ4OFx1RkYwQ1x1NjI0Qlx1NjExRlx1NUY1Mlx1NEVCQVx1NzczQ1x1RkYwOVx1MzAwMlxuICpcbiAqIFx1OEY5M1x1NTFGQVx1NTk1MVx1N0VBNlx1RkYwOFx1N0YxNlx1NjM5Mlx1NTY2OCBncmVwIFx1NEY5RFx1NkI2NFx1RkYwOVx1RkYxQVx1NTM1NVx1ODg0Q1x1MzAwMVx1NTI0RFx1N0YwMCBgWzx0YWc+XWBcdUZGMUFcbiAqICAgU1RBVEUgam9pbmVkIHJvb209PGlkPiBtZW1iZXJzPTxuPiAgICAgXHU1MkEwXHU1MTY1XHU2MjEwXHU1MjlGXHVGRjA4am9pbi1hY2sgXHU3Njg0XHU2MjEwXHU1NDU4XHU2NTcwXHVGRjA5XG4gKiAgIFNUQVRFIGxlZnQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTc5QkJcdTVGMDBcdTYyM0ZcdTk1RjRcdTVCOENcdTYyMTBcbiAqICAgRVZUIHByZXNlbmNlIG49PG4+IG5hbWVzPWEsYixjICAgICAgICAgIFx1NjIxMFx1NTQ1OFx1NUZFQlx1NzE2N1xuICogICBFVlQgbG9jYXRpb24tdXBkYXRlZCBmcm9tPTxuaWNrPiBjaD08aT4gcGN0PTxwPiB0PSs8bXM+XG4gKiAgIEVWVCBjaGF0IGZyb209PG5pY2s+IG1pbmU9PDB8MT4gdGV4dD08Li4uPlxuICogICBFVlQgY29ubmVjdGlvbiBzPTxzdGF0ZT5cbiAqICAgU1lTIDx0ZXh0PiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1N0NGQlx1N0VERlx1NkQ4OFx1NjA2Rlx1RkYwOGVycm9yIFx1NEYxQVx1ODhBQlx1N0YxNlx1NjM5Mlx1NTY2OFx1NUY1M1x1NTkzMVx1OEQyNVx1RkYwOVxuICpcbiAqIFx1NzUyOFx1NkNENVx1RkYxQVxuICogICBub2RlIHJvb21ib3QuY2pzIC0tc2VydmVyIGh0dHA6Ly8xMjcuMC4wLjE6MTgyMzQgLS1yb29tIDxpZD4gLS1uaWNrIGJvdDEgLS10b2tlbiBBYWExMTExIFxcXG4gKiAgICAgLS1mbGlwLWV2ZXJ5IDkwMCAtLWNoYXQtZXZlcnkgMTYwMCAtLWxlYXZlLWFmdGVyIDUwMDAgLS1kdXJhdGlvbiA5MDAwXG4gKi9cbmltcG9ydCB7IFJvb21TZXNzaW9uIH0gZnJvbSAnQGNvcmUvdXNlY2FzZXMvUm9vbVNlc3Npb24nXG5pbXBvcnQgeyBXc05ldEFkYXB0ZXIgfSBmcm9tICcuLi8uLi9zcmMvbWFpbi9uZXQvd3NOZXRBZGFwdGVyJ1xuaW1wb3J0IHsgRmluZ2VycHJpbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3JjL2NvcmUvYWRhcHRlcnMvaWRlbnRpdHkvZmluZ2VycHJpbnQnXG5pbXBvcnQgeyBleHRUb0Zvcm1hdCB9IGZyb20gJ0Bjb3JlL2RvbWFpbi9mb3JtYXQnXG5pbXBvcnQgdHlwZSB7XG4gIEJvb2tMb2NhdGlvbixcbiAgQm9va1JlY29yZCxcbiAgQ2hhdE1lc3NhZ2UsXG4gIFJvb21NZW1iZXJcbn0gZnJvbSAnQGNvcmUvZG9tYWluL3R5cGVzJ1xuaW1wb3J0IHR5cGUgeyBJUmVuZGVyU2VydmljZSB9IGZyb20gJ0Bjb3JlL3BvcnRzL3JlbmRlcidcblxuLy8gLS0tLS0tLS0tLSBDTEkgLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBhcmcobmFtZTogc3RyaW5nLCBmYWxsYmFjazogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgaSA9IHByb2Nlc3MuYXJndi5pbmRleE9mKGAtLSR7bmFtZX1gKVxuICByZXR1cm4gaSA+PSAwICYmIHByb2Nlc3MuYXJndltpICsgMV0gIT0gbnVsbCA/IFN0cmluZyhwcm9jZXNzLmFyZ3ZbaSArIDFdKSA6IGZhbGxiYWNrXG59XG5mdW5jdGlvbiBhcmdOdW0obmFtZTogc3RyaW5nLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgdiA9IHBhcnNlSW50KGFyZyhuYW1lLCAnJyksIDEwKVxuICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHYpID8gdiA6IGZhbGxiYWNrXG59XG5jb25zdCBoYXNGbGFnID0gKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4gPT4gcHJvY2Vzcy5hcmd2LmluY2x1ZGVzKGAtLSR7bmFtZX1gKVxuXG5jb25zdCBTRVJWRVIgPSBhcmcoJ3NlcnZlcicsICdodHRwOi8vMTI3LjAuMC4xOjE4MjM0JylcbmNvbnN0IFJPT00gPSBhcmcoJ3Jvb20nLCAnJylcbmNvbnN0IE5JQ0sgPSBhcmcoJ25pY2snLCAnYm90MScpXG5jb25zdCBUT0tFTiA9IGFyZygndG9rZW4nLCAnQWFhMTExMScpXG5jb25zdCBGTElQX0VWRVJZID0gYXJnTnVtKCdmbGlwLWV2ZXJ5JywgMClcbmNvbnN0IENIQVRfRVZFUlkgPSBhcmdOdW0oJ2NoYXQtZXZlcnknLCAwKVxuY29uc3QgTEVBVkVfQUZURVIgPSBhcmdOdW0oJ2xlYXZlLWFmdGVyJywgMClcbmNvbnN0IERVUkFUSU9OID0gYXJnTnVtKCdkdXJhdGlvbicsIDApXG5jb25zdCBUQUcgPSBhcmcoJ3RhZycsIE5JQ0spXG5jb25zdCBRVUlFVCA9IGhhc0ZsYWcoJ3F1aWV0JylcblxuY29uc3QgdDAgPSBEYXRlLm5vdygpXG5jb25zdCBzYXkgPSAobGluZTogc3RyaW5nKTogdm9pZCA9PiB7XG4gIGlmIChRVUlFVCAmJiAhL14oU1RBVEV8RVZUfFNZUykvLnRlc3QobGluZSkpIHJldHVyblxuICBwcm9jZXNzLnN0ZG91dC53cml0ZShgWyR7VEFHfV0gJHtsaW5lfVxcbmApXG59XG5jb25zdCBlbGFwc2VkID0gKCk6IHN0cmluZyA9PiBgKyR7RGF0ZS5ub3coKSAtIHQwfW1zYFxuXG4vLyAtLS0tLS0tLS0tIFx1NTA0N1x1NkUzMlx1NjdEM1x1N0FFRlx1NTNFM1x1RkYwOFx1ODExQVx1NjcyQ1x1NTMxNlx1NEY0RFx1N0Y2RVx1NkU5MFx1RkYwOSAtLS0tLS0tLS0tXG5cbi8qKlxuICogUm9vbVNlc3Npb24gXHU1QjlFXHU5NjQ1XHU3NTI4XHU1MjMwXHU3Njg0XHU2RTMyXHU2N0QzXHU5NzYyXHU1M0VBXHU2NzA5XHU0RTA5XHU0RTJBXHU2MjEwXHU1NDU4XHVGRjFBb24oJ2xvY2F0aW9uLWNoYW5nZWQnKSAvIGdldFBvc2l0aW9uKCkgL1xuICogZ2V0T3BlbkJvb2soKVx1RkYwOEItMiBcdTY4MjFcdTlBOENcdUZGMDlcdTMwMDJcdTUwNDdcdTRFRjZcdTYzMDFcdTY3MDlcdTRFMDBcdTY3MkMqKlx1NTQwOFx1NjIxMFx1NEU2NioqXHVGRjA4XHU2MzA3XHU3RUI5ID0gXHU2MjNGXHU5NUY0IGVkaXRpb25cdUZGMENcdThGREJcdTYyM0ZcdTU0MEVcdTZDRThcdTUxNjVcdUZGMDlcdUZGMENcbiAqIFx1N0ZGQlx1OTg3NSA9IFx1NzZGNFx1NjNBNSBlbWl0IFx1NEUwMFx1NEUyQVx1OTAxMlx1OEZEQlx1NEY0RFx1N0Y2RSBcdTIwMTRcdTIwMTQgXHU0RTBFXHU3NzFGXHU0RUJBXHU3RkZCXHU5ODc1XHU1NzI4XHU1NDBDXHU2QjY1XHU5MDNCXHU4RjkxXHU3NzNDXHU5MUNDXHU0RTBEXHU1M0VGXHU1MzNBXHU1MjA2XHUzMDAyXG4gKi9cbmNsYXNzIEZha2VSZW5kZXIge1xuICBwcml2YXRlIGxpc3RlbmVycyA9IG5ldyBTZXQ8KGxvYzogQm9va0xvY2F0aW9uKSA9PiB2b2lkPigpXG4gIG9wZW5Cb29rOiBCb29rUmVjb3JkIHwgbnVsbCA9IG51bGxcbiAgcHJpdmF0ZSBwb3M6IEJvb2tMb2NhdGlvbiA9IHtcbiAgICBjaGFwdGVyRG9jSW5kZXg6IDAsXG4gICAgY2hhcHRlckhyZWY6ICdzd2FybS0wJyxcbiAgICBjb3VudDogMCxcbiAgICBwYWdlOiAwLFxuICAgIHBlcmNlbnRhZ2U6IDAsXG4gICAgdGV4dDogJ1x1ODcwMlx1N0ZBNFx1NEY0RFx1N0Y2RSAwJyxcbiAgICBjaGFwdGVyVGl0bGU6ICdcdTdCMkMgMSBcdTdBRTAnXG4gIH1cbiAgcHJpdmF0ZSBwYWdlID0gMFxuXG4gIG9uKGV2ZW50OiAnbG9jYXRpb24tY2hhbmdlZCcsIGZuOiAobG9jOiBCb29rTG9jYXRpb24pID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcbiAgICB0aGlzLmxpc3RlbmVycy5hZGQoZm4pXG4gICAgcmV0dXJuICgpID0+IHRoaXMubGlzdGVuZXJzLmRlbGV0ZShmbilcbiAgfVxuICBnZXRQb3NpdGlvbigpOiBCb29rTG9jYXRpb24ge1xuICAgIHJldHVybiB0aGlzLnBvc1xuICB9XG4gIGdldE9wZW5Cb29rKCk6IEJvb2tSZWNvcmQgfCBudWxsIHtcbiAgICByZXR1cm4gdGhpcy5vcGVuQm9va1xuICB9XG4gIC8qKiBcdTZBMjFcdTYyREZcdTdGRkJcdTk4NzVcdUZGMDhyb29tYm90IFx1NzY4NFx1ODI4Mlx1NTk0Rlx1NTY2OFx1OEMwM1x1NzUyOFx1RkYwOSAqL1xuICBmbGlwKCk6IHZvaWQge1xuICAgIHRoaXMucGFnZSArPSAxXG4gICAgdGhpcy5wb3MgPSB7XG4gICAgICBjaGFwdGVyRG9jSW5kZXg6IHRoaXMucGFnZSAlIDEyLFxuICAgICAgY2hhcHRlckhyZWY6IGBzd2FybS0ke3RoaXMucGFnZX1gLFxuICAgICAgY291bnQ6IDAsXG4gICAgICBwYWdlOiB0aGlzLnBhZ2UsXG4gICAgICBwZXJjZW50YWdlOiAodGhpcy5wYWdlICUgMTAwKSAvIDEwMCxcbiAgICAgIHRleHQ6IGBcdTg3MDJcdTdGQTRcdTRGNERcdTdGNkUgJHt0aGlzLnBhZ2V9YCxcbiAgICAgIGNoYXB0ZXJUaXRsZTogYFx1N0IyQyAkeyh0aGlzLnBhZ2UgJSAxMikgKyAxfSBcdTdBRTBgXG4gICAgfVxuICAgIGZvciAoY29uc3QgZm4gb2YgdGhpcy5saXN0ZW5lcnMpIGZuKHRoaXMucG9zKVxuICB9XG4gIHRvUG9ydCgpOiBJUmVuZGVyU2VydmljZSB7XG4gICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBJUmVuZGVyU2VydmljZVxuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gXHU2NzNBXHU1NjY4XHU0RUJBXHU0RTNCXHU0RjUzIC0tLS0tLS0tLS1cblxuYXN5bmMgZnVuY3Rpb24gbWFpbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgbmV0ID0gbmV3IFdzTmV0QWRhcHRlcigpXG4gIGNvbnN0IHJlbmRlciA9IG5ldyBGYWtlUmVuZGVyKClcbiAgY29uc3QgaWRlbnRpdHkgPSBuZXcgRmluZ2VycHJpbnRTZXJ2aWNlKClcbiAgY29uc3Qgcm9vbSA9IG5ldyBSb29tU2Vzc2lvbihuZXQsIHJlbmRlci50b1BvcnQoKSwgaWRlbnRpdHkpXG5cbiAgcm9vbS5vbigncHJlc2VuY2UtdXBkYXRlZCcsIChtZW1iZXJzOiBSb29tTWVtYmVyW10pID0+IHtcbiAgICBzYXkoYEVWVCBwcmVzZW5jZSBuPSR7bWVtYmVycy5sZW5ndGh9IG5hbWVzPSR7bWVtYmVycy5tYXAoKG0pID0+IG0ubmlja05hbWUpLmpvaW4oJywnKX1gKVxuICB9KVxuICByb29tLm9uKCdsb2NhdGlvbi11cGRhdGVkJywgKGxvYzogQm9va0xvY2F0aW9uLCBmcm9tOiBSb29tTWVtYmVyKSA9PiB7XG4gICAgc2F5KFxuICAgICAgYEVWVCBsb2NhdGlvbi11cGRhdGVkIGZyb209JHtmcm9tLm5pY2tOYW1lfSBjaD0ke2xvYy5jaGFwdGVyRG9jSW5kZXh9IHBjdD0ke01hdGgucm91bmQoKGxvYy5wZXJjZW50YWdlID8/IDApICogMTAwKX0gdD0ke2VsYXBzZWQoKX1gXG4gICAgKVxuICB9KVxuICByb29tLm9uKCdjaGF0LW1lc3NhZ2UnLCAobXNnOiBDaGF0TWVzc2FnZSkgPT4ge1xuICAgIHNheShgRVZUIGNoYXQgZnJvbT0ke21zZy5uaWNrfSBtaW5lPSR7bXNnLm1lbWJlciA9PT0gcm9vbS5nZXRNeU1lbWJlcklkKCkgPyAxIDogMH0gdGV4dD0ke21zZy50ZXh0fWApXG4gIH0pXG4gIHJvb20ub24oJ2Nvbm5lY3Rpb24tY2hhbmdlZCcsIChzKSA9PiBzYXkoYEVWVCBjb25uZWN0aW9uIHM9JHtzfWApKVxuICByb29tLm9uKCdzeXN0ZW0tbWVzc2FnZScsIChtKSA9PiBzYXkoYFNZU1ske20udHlwZX1dICR7bS50ZXh0fWApKVxuXG4gIC8vIFx1MjQ2MCBcdTRGMUFcdThCRERcdUZGMDhcdTYyMTBcdTU0NTggdG9rZW4gXHU2NjNFXHU1RjBGXHU3RUQ5XHU1QjlBIFx1MjAxNFx1MjAxNCBcdTU0MENcdTY3M0FcdTU5MUFcdTY3M0FcdTU2NjhcdTRFQkFcdTdFRERcdTRFMERcdTgwRkRcdTRGOURcdThENTZcdTczQUZcdTU4ODNcdTUzRDhcdTkxQ0ZcdUZGMENcdTg5QzEgd3NOZXRBZGFwdGVyIFx1NkNFOFx1OTFDQVx1RkYwOVxuICBhd2FpdCBuZXQuY29ubmVjdCh7IHNlcnZlclVybDogU0VSVkVSLCBhY2Nlc3NUb2tlbjogYXJnKCdhY2Nlc3MnLCAnJyksIG5pY2tOYW1lOiBOSUNLLCBtZW1iZXJUb2tlbjogVE9LRU4gfSlcbiAgc2F5KGBTVEFURSBjb25uZWN0ZWQgc2VydmVyPSR7U0VSVkVSfSB0b2tlbj0ke1RPS0VOfWApXG5cbiAgLy8gXHUyNDYxIFx1NUI5QVx1NjIzRlx1OTVGNFx1RkYxQVx1NjYzRVx1NUYwRlx1N0VEOSBcdTIxOTIgXHU3NTI4XHU1QjgzXHVGRjFCXHU1NDI2XHU1MjE5XHU1M0Q2XHU1OTI3XHU1Mzg1XHU2NzAwXHU2NUIwXHU0RTAwXHU5NUY0XG4gIGxldCByb29tSWQgPSBST09NLnRyaW0oKS50b0xvd2VyQ2FzZSgpXG4gIGlmICghcm9vbUlkKSB7XG4gICAgY29uc3Qgcm9vbXMgPSBhd2FpdCByb29tLmxpc3RSb29tcygpXG4gICAgaWYgKHJvb21zLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IEVycm9yKCdcdTU5MjdcdTUzODVcdTRFM0FcdTdBN0FcdTRFMTRcdTY3MkFcdTdFRDkgLS1yb29tJylcbiAgICByb29tSWQgPSBbLi4ucm9vbXNdLnNvcnQoKGEsIGIpID0+IGIuY3JlYXRlZEF0IC0gYS5jcmVhdGVkQXQpWzBdLnJvb21JZFxuICAgIHNheShgU1RBVEUgcGlja2VkLXJvb20gcm9vbT0ke3Jvb21JZH1gKVxuICB9XG5cbiAgLy8gXHUyNDYyIFx1NjVFMFx1NEU2Nlx1OEZEQlx1NTE2NVx1RkYwOFx1NjczQVx1NTY2OFx1NEVCQVx1NkNBMVx1NjcwOVx1NzcxRlx1NEU2Nlx1RkYwOVx1MjE5MiBcdTc1Mjggam9pbi1hY2sgXHU3Njg0IGVkaXRpb24gXHU5MDIwXHU1NDA4XHU2MjEwXHU0RTY2XHU2Q0U4XHU1MTY1XHU1MDQ3XHU2RTMyXHU2N0QzXHU3QUVGXHU1M0UzXHVGRjFBXG4gIC8vICAgIFx1NjMwN1x1N0VCOVx1NEUwRVx1NjIzRlx1OTVGNCBlZGl0aW9uIFx1NzZGOFx1NTQwQyBcdTIxOTIgQi0yIFx1NjgyMVx1OUE4Q1x1OTAxQVx1OEZDN1x1RkYwQ1x1NEY0RFx1N0Y2RVx1NzE2N1x1NUUzOFx1NEUwQVx1NjJBNVx1RkYwOFx1NzcxRlx1NEVCQVx1NTcyOFx1NTczQVx1NjVGNlx1NEUwRFx1NTNFRlx1NTMzQVx1NTIwNlx1RkYwOVxuICBjb25zdCByZXMgPSBhd2FpdCByb29tLmpvaW5Sb29tKHJvb21JZCwgbnVsbCwgbnVsbClcbiAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcihgXHU1MkEwXHU1MTY1XHU1OTMxXHU4RDI1XHVGRjFBJHtyZXMucmVhc29ufWApXG4gIGNvbnN0IGVkaXRpb24gPSByZXMucm9vbS5lZGl0aW9uXG4gIGlmIChlZGl0aW9uKSB7XG4gICAgcmVuZGVyLm9wZW5Cb29rID0ge1xuICAgICAgaWQ6IGBzd2FybS0ke2VkaXRpb24uaWR9YCxcbiAgICAgIGZpbmdlcnByaW50OiB7XG4gICAgICAgIGFsZ29yaXRobTogKGVkaXRpb24uaGFzaEFsZ28gYXMgJ21kNS1zYW1wbGUzLXYxJykgPz8gJ21kNS1zYW1wbGUzLXYxJyxcbiAgICAgICAgaGFzaDogZWRpdGlvbi5oYXNoLFxuICAgICAgICBzaXplOiBlZGl0aW9uLnNpemVcbiAgICAgIH0sXG4gICAgICBtZXRhZGF0YTogeyB0aXRsZTogYFx1ODcwMlx1N0ZBNFx1NjZGOC0ke2VkaXRpb24uaWR9YCB9LFxuICAgICAgZm9ybWF0OiBleHRUb0Zvcm1hdChgeC4ke2VkaXRpb24uZXh0fWApLFxuICAgICAgZmlsZVBhdGg6ICcnLFxuICAgICAgY3JlYXRlZEF0OiAwXG4gICAgfVxuICB9XG4gIHNheShgU1RBVEUgam9pbmVkIHJvb209JHtyZXMucm9vbS5yb29tSWR9IG1lbWJlcnM9JHtyZXMucm9vbS5tZW1iZXJzLmxlbmd0aH1gKVxuXG4gIC8vIFx1MjQ2MyBcdTg4NENcdTRFM0FcdTgyODJcdTU5NEZcdUZGMDhcdTc3MUZcdTRFQkFcdTgyODJcdTU5NEZcdUZGMENcdTRFMERcdTY2MkZcdTZEMkFcdTZDREIgXHUyMDE0XHUyMDE0IFx1NkQyQVx1NkNEQlx1NjYyRlx1NTNFNlx1NEUwMFx1N0M3Qlx1NkQ0Qlx1OEJENVx1RkYwQ1x1NjcwRFx1NTJBMVx1NTY2OFx1NEZBN1x1NURGMlx1NjcwOVx1NEUxM1x1OTg3OVx1RkYwOVxuICBpZiAoRkxJUF9FVkVSWSA+IDApIHtcbiAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKCgpID0+IHJlbmRlci5mbGlwKCksIEZMSVBfRVZFUlkpXG4gICAgdGltZXJzLnB1c2godGltZXIpXG4gIH1cbiAgbGV0IGNoYXRObyA9IDBcbiAgaWYgKENIQVRfRVZFUlkgPiAwKSB7XG4gICAgY29uc3QgdGltZXIgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICBjaGF0Tm8gKz0gMVxuICAgICAgdm9pZCByb29tLnNlbmRDaGF0KGAke05JQ0t9IFx1NTE5Mlx1NkNFMSAjJHtjaGF0Tm99YCkuY2F0Y2goKGVycjogRXJyb3IpID0+IHNheShgU1lTW2Vycm9yXSBcdTc2N0NcdTkwMDFcdTU5MzFcdTY1NTdcdUZGMUEke2Vyci5tZXNzYWdlfWApKVxuICAgIH0sIENIQVRfRVZFUlkpXG4gICAgdGltZXJzLnB1c2godGltZXIpXG4gIH1cbiAgaWYgKExFQVZFX0FGVEVSID4gMCkge1xuICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB2b2lkIHJvb21cbiAgICAgICAgLmxlYXZlUm9vbSgpXG4gICAgICAgIC50aGVuKCgpID0+IHNheSgnU1RBVEUgbGVmdCcpKVxuICAgICAgICAuY2F0Y2goKGVycjogRXJyb3IpID0+IHNheShgU1lTW2Vycm9yXSBcdTk2RTJcdTk1OEJcdTU5MzFcdTY1NTdcdUZGMUEke2Vyci5tZXNzYWdlfWApKVxuICAgIH0sIExFQVZFX0FGVEVSKVxuICAgIHRpbWVycy5wdXNoKHRpbWVyKVxuICB9XG4gIGlmIChEVVJBVElPTiA+IDApIHtcbiAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2F5KCdTVEFURSBkb25lJylcbiAgICAgIHByb2Nlc3MuZXhpdCgwKVxuICAgIH0sIERVUkFUSU9OKVxuICAgIHRpbWVycy5wdXNoKHRpbWVyKVxuICB9XG59XG5cbmNvbnN0IHRpbWVyczogQXJyYXk8UmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBSZXR1cm5UeXBlPHR5cGVvZiBzZXRJbnRlcnZhbD4+ID0gW11cblxubWFpbigpLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBbJHtUQUd9XSBTVEFURSBmYXRhbCAke2Vyci5tZXNzYWdlfVxcbmApXG4gIHByb2Nlc3MuZXhpdCgxKVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUEscUNBQUFBLFVBQUFDLFNBQUE7QUFBQTtBQUVBLFFBQU0sZUFBZSxDQUFDLGNBQWMsZUFBZSxXQUFXO0FBQzlELFFBQU0sVUFBVSxPQUFPLFNBQVM7QUFFaEMsUUFBSSxRQUFTLGNBQWEsS0FBSyxNQUFNO0FBRXJDLElBQUFBLFFBQU8sVUFBVTtBQUFBLE1BQ2Y7QUFBQSxNQUNBLGVBQWU7QUFBQSxNQUNmLGNBQWMsT0FBTyxNQUFNLENB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TUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUE7QUFBQSxNQUM3QztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBO0FBQUEsTUFDN0M7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQTtBQUFBLE1BQzdDO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUE7QUFBQSxNQUM3QztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBO0FBQUEsTUFDN0M7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQTtBQUFBLE1BQzdDO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFH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LEtBQUssTUFBTSxNQUFNLElBQUk7QUFDaEMsY0FBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUMsSUFBSSxZQUFZO0FBQ3RDLGFBQU0sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJO0FBRS9CLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxZQUFZO0FBQ3pDLGFBQU0sS0FBSyxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQy9CLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxhQUFhO0FBQzFDLGFBQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxJQUFJO0FBQ2hDLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxhQUFhO0FBQzNDLGFBQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxJQUFJO0FBQ2hDLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxXQUFXO0FBQ3hDLGFBQU0sS0FBSyxLQUFJLE1BQU0sTUFBTSxJQUFJO0FBQy9CLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxhQUFhO0FBQzNDLGFBQU0sS0FBSyxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQy9CLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxhQUFhO0FBQzFDLGFBQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxJQUFJO0FBQ2hDLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxVQUFVO0FBQ3hDLGFBQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxJQUFJO0FBQ2hDLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxhQUFhO0FBQzFDLGFBQU0sS0FBSyxLQUFJLE1BQU0sTUFBTSxJQUFJO0FBQy9CLGNBQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxhQUFhO0FBQzFDLGFBQU0sS0FBSyxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQy9CLGNBQU0sS0FB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QUM7QUFDaEIsQ0FBQzsiLAogICJuYW1lcyI6IFsiZXhwb3J0cyIsICJtb2R1bGUiLCAiZXhwb3J0cyIsICJtb2R1bGUiLCAiZXhwb3J0cyIsICJtb2R1bGUiLCAiZXhwb3J0cyIsICJtb2R1bGUiLCAiUGVyTWVzc2FnZURlZmxhdGUiLCAiZGF0YSIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJQZXJNZXNzYWdlRGVmbGF0ZSIsICJSZWNlaXZlciIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJQZXJNZXNzYWdlRGVmbGF0ZSIsICJTZW5kZXIiLCAiZXhwb3J0cyIsICJtb2R1bGUiLCAiZXhwb3J0cyIsICJtb2R1bGUiLCAiZXh0ZW5zaW9uIiwgImV4cG9ydHMiLCAibW9kdWxlIiwgIlVSTCIsICJQZXJNZXNzYWdlRGVmbGF0ZSIsICJSZWNlaXZlciIsICJTZW5kZXIiLCAiV2ViU29ja2V0IiwgImtleSIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJXZWJTb2NrZXQiLCAiY3JlYXRlV2ViU29ja2V0U3RyZWFtIiwgImVyciIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJwcm90b2NvbCIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJleHRlbnNpb24iLCAiUGVyTWVzc2FnZURlZmxhdGUiLCAic3VicHJvdG9jb2wiLCAiV2ViU29ja2V0IiwgIldlYlNvY2tldFNlcnZlciIsICJleHBvcnRzIiwgIm1vZHVsZSIsICJ1bmRlZmluZWQiLCAiaGV4IiwgIlNwYXJrTUQ1IiwgIldlYlNvY2tldCIsICJTcGFya01ENSJdCn0K
