var b = {};

// exact string match
b.lit = function (str) {
	return function (from) {
		if (this.source.substr(from, str.length) === str)
			return {val: str, next: from + str.length};
		this.fail(from, JSON.stringify(str));
		return null;
	};
};

// exact string match (case insensitive)
b.liti = function (str) {
	str = str.toLowerCase();
	return function (from) {
		if (this.source.substr(from, str.length).toLowerCase() === str)
			return {val: str, next: from + str.length};
		this.fail(from, JSON.stringify(str) + "i");
		return null;
	};
};

// sequence
b.seq = function (/* args */) {
	var args = Array.prototype.slice.call(arguments);
	return function (from) {
		var curr = from, self = this, ret = [];
		return args.every(function (arg) {
			var res = arg.bind(self)(curr);
			if (res) { ret.push(res.val); curr = res.next; }
			return res;
		}) && {val: ret, next: curr};
	};
};

// alternatives
b.par = function (/* args */) {
	var args = Array.prototype.slice.call(arguments);
	return function (from) {
		var self = this, ret;
		return args.some(function (arg) {
			var res = arg.bind(self)(from);
			if (res) { ret = res.val; from = res.next; }
			return res;
		}) && {val: ret, next: from};
	};
};

// a*
b.any = function (arg) {
	return function (from) {
		var f = arg.bind(this), res, ret = [];
		while (res = f(from))
			ret.push(res.val), from = res.next;
		return {val: ret, next: from};
	};
};

// empty string
b.eps = function (from) {
	return {val: null, next: from};
};

// one arbitrary character
b.chr = function (from) {
	if (from < this.source.length)
		return {val: this.source[from], next: from + 1};
	this.fail(from, "any char");
	return null;
};

// a+
b.some = function (arg) {
	return b.flat(b.seq(arg, b.any(arg)), function (a, c) {
		return c.unshift(a), c;
	});
};

// a?
b.maybe = function (arg) {
	return b.par(arg, b.eps);
};

// mutual recursion of rules
b.ref = function (rule /*, args */) {
	var args = Array.prototype.slice.call(arguments);
	args.shift();
	return function (from) {
		return rule.apply(null, args).call(this, from);
	};
};

// work with parser's return value
b.apply = function (p, f) {
	return function (from) {
		var res = p.bind(this)(from);
		if (!res) return res;
		res.val = f(res.val);
		return res;
	};
};

// same as `apply`, but array becomes a list of arguments
b.flat = function (p, f) {
	return b.apply(p, function (xs) {
		return f.apply(null, xs);
	});
};

// positive lookahead
b.poscheck = function (parser) {
	return function (from) {
		var res = parser.bind(this)(from);
		return res ? {val: res.val, next: from} : null;
	};
};

// positive lookahead
b.negcheck = function (parser) {
	return function (from) {
		var res = parser.bind(this)(from);
		return res ? null : {val: null, next: from};
	};
};

// get result as parsed string
b.str = function (p) {
	return function (from) {
		var ret = p.bind(this)(from);
		return ret && {val: this.source.substr(from, ret.next - from), next: ret.next};
	};
};

// check if character satisfies criteria
b.satisfy = function (f, message) {
	return function (from) {
		if (from < this.source.length && f(this.source[from]))
			return {val: this.source[from], next: from + 1};
		this.fail(from, message);
		return null;
	};
};

function asc(c) {
	return c.charCodeAt(0);
}

function escape(c) {
	var str = JSON.stringify(c);
	return str.substr(1, str.length - 2);
}

// check for character range
b.range = function (a, d) {
	return b.satisfy(function (c) {
		return asc(a) <= asc(c) && asc(c) <= asc(d);
	}, "[" + escape(a) + "-" + escape(d) + "]");
};

// end of input
b.eof = function (from) {
	if (from >= this.source.length)
		return {val: null, next: from};
	this.fail(from, "end of input");
	return null;
};

// {n}
b.exact = function (arg, n) {
	return function (from) {
		var f = arg.bind(this), ret = [];
		for (var i = 0; i < n; ++i) {
			var res = f(from);
			if (!res) return null;
			ret.push(res.val);
			from = res.next;
		}
		return {val: ret, next: from};
	};
};

// {n,}
b.atleast = function (arg, n) {
	return function (from) {
		var f = arg.bind(this), ret = [];
		for (var i = 0;; ++i) {
			var res = f(from);
			if (!res) return i < n ? null : {val: ret, next: from};
			ret.push(res.val);
			from = res.next;
		}
	};
};

// (n, m)
b.between = function (arg, n, m) {
	return function (from) {
		var f = arg.bind(this), ret = [];
		for (var i = 0; i < m; ++i) {
			var res = f(from);
			if (!res) return i < n ? null : {val: ret, next: from};
			ret.push(res.val);
			from = res.next;
		}
		return {val: ret, next: from};
	};
};

var state_t = function (source) {
	this.source = source;
	this.last = 0;
	this.fails = [];
};
state_t.prototype.fail = function (from, str) {
	if (this.last < from)
		this.fails = {}, this.last = from;
	this.fails[str] = true;
};

// parse given string with given parser
b.parse = function (parser, source) {
	var state = new state_t(source);
	var ret = parser.bind(state)(0);
	if (!ret || ret.next != source.length) {
		var fails = [];
		for (var fail in state.fails) if (state.fails.hasOwnProperty(fail)) fails.push(fail);
		throw "Expected " + fails.join(", ") + " but got " + JSON.stringify(source[state.last]);
	}
	return ret;
};

module.exports = b;