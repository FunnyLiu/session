'use strict';

const debug = require('debug')('koa-session');
const ContextSession = require('./lib/context');
const util = require('./lib/util');
const assert = require('assert');
const uuid = require('uuid/v4');
const is = require('is-type-of');

const CONTEXT_SESSION = Symbol('context#contextSession');
const _CONTEXT_SESSION = Symbol('context#_contextSession');

/**
 * Initialize session middleware with `opts`:
 *
 * - `key` session cookie name ["koa:sess"]
 * - all other options are passed as cookie options
 *
 * @param {Object} [opts]
 * @param {Application} app, koa application instance
 * @api public
 */

module.exports = function(opts, app) {
  // session(app[, opts])
  // 兼容两种写法，参数位置调换
  if (opts && typeof opts.use === 'function') {
    [ app, opts ] = [ opts, app ];
  }
  // app required
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('app instance required: `session(opts, app)`');
  }
  // 初始化和校验参数
  opts = formatOpts(opts);
  extendContext(app.context, opts);

  return async function session(ctx, next) {
    const sess = ctx[CONTEXT_SESSION];
    if (sess.store) await sess.initFromExternal();
    try {
      await next();
    } catch (err) {
      throw err;
    } finally {
      if (opts.autoCommit) {
        await sess.commit();
      }
    }
  };
};

/**
 * format and check session options
 * @param  {Object} opts session options
 * @return {Object} new session options
 *
 * @api private
 */
// 对参数进行校验和初始化默认参数
function formatOpts(opts) {
  opts = opts || {};
  // key
  opts.key = opts.key || 'koa:sess';

  // back-compat maxage
  // 判断是否有该key
  if (!('maxAge' in opts)) opts.maxAge = opts.maxage;

  // defaults
  if (opts.overwrite == null) opts.overwrite = true;
  if (opts.httpOnly == null) opts.httpOnly = true;
  if (opts.signed == null) opts.signed = true;
  if (opts.autoCommit == null) opts.autoCommit = true;

  debug('session options %j', opts);

  // setup encoding/decoding
  if (typeof opts.encode !== 'function') {
    opts.encode = util.encode;
  }
  if (typeof opts.decode !== 'function') {
    opts.decode = util.decode;
  }

  const store = opts.store;
  if (store) {
    assert(is.function(store.get), 'store.get must be function');
    assert(is.function(store.set), 'store.set must be function');
    assert(is.function(store.destroy), 'store.destroy must be function');
  }

  const externalKey = opts.externalKey;
  if (externalKey) {
    assert(is.function(externalKey.get), 'externalKey.get must be function');
    assert(is.function(externalKey.set), 'externalKey.set must be function');
  }

  const ContextStore = opts.ContextStore;
  if (ContextStore) {
    assert(is.class(ContextStore), 'ContextStore must be a class');
    assert(is.function(ContextStore.prototype.get), 'ContextStore.prototype.get must be function');
    assert(is.function(ContextStore.prototype.set), 'ContextStore.prototype.set must be function');
    assert(is.function(ContextStore.prototype.destroy), 'ContextStore.prototype.destroy must be function');
  }

  if (!opts.genid) {
    if (opts.prefix) opts.genid = () => `${opts.prefix}${uuid()}`;
    else opts.genid = uuid;
  }

  return opts;
}

/**
 * extend context prototype, add session properties
 *
 * @param  {Object} context koa's context prototype
 * @param  {Object} opts session options
 *
 * @api private
 */

function extendContext(context, opts) {
  //如果发现有该私有变量则不再重复
  if (context.hasOwnProperty(CONTEXT_SESSION)) {
    return;
  }
  //给ctx增加私有属性
  Object.defineProperties(context, {
    [CONTEXT_SESSION]: {
      get() {
        //单例缓存
        if (this[_CONTEXT_SESSION]) return this[_CONTEXT_SESSION];
        //基于lib/context.js
        this[_CONTEXT_SESSION] = new ContextSession(this, opts);
        return this[_CONTEXT_SESSION];
      },
    },
    //ctx.session用来存取操作私有属性CONTEXT_SESSION
    session: {
      get() {
        return this[CONTEXT_SESSION].get();
      },
      set(val) {
        this[CONTEXT_SESSION].set(val);
      },
      configurable: true,
    },
    sessionOptions: {
      get() {
        return this[CONTEXT_SESSION].opts;
      },
    },
  });
}
