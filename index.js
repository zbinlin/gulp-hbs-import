"use strict";

var crypto = require("crypto");
var through = require("through2");
var gutil = require("gulp-util"),
    PluginError = gutil.PluginError;

var Handlebars = require("handlebars");
var fs = require("fs"),
    path = require("path");

var PLUGIN_NAME = "gulp-hbs-import";

var golbal_context = {};

/* 默认扩展名 */
var DEFAULT_EXT = ".html";

var cache = {};

/*
 * {{import [url] [context] [context=] [url=]}}
 */
Handlebars.registerHelper("import", function (url, context, options) {
    var _utils = Handlebars.Utils;

    var hash = null;
    if (1 === arguments.length) {
        options = url;
        hash = options.hash || {};
        url = hash["url"] || hash["uri"];
        context = hash["context"] || hash["ctx"] || golbal_context[path.basename(url, path.extname(url))];
    } else if (2 === arguments.length) {
        options = context;
        hash = options.hash || {};
        context = hash["context"] || hash["ctx"] || golbal_context[path.basename(url, path.extname(url))];
    } else if (2 < arguments.length) {
        var args = [].slice.apply(arguments);
        options = args.pop();
        hash = options.hash || {};
        url = args.shift();
        context = {};
        while (args.length) {
            var ctx = args.shift();
            if ("string" === typeof ctx && golbal_context[ctx]) {
                _utils.extend(context, golbal_context[ctx]);
            } else {
                _utils.extend(context, ctx);
            }
        }
    }

    if (!url) {
        throw new Error("URL not find!");
    }

    if (_utils.isFunction(context)) {
        context = context.apply(this);
    }
    if ("undefined" === typeof context) {
        context = this;
    }
    if ("string" === typeof context && golbal_context[context]) {
        context = _utils.extend({}, golbal_context[context]);
    }

    for (var key in hash) {
        if (hash.hasOwnProperty(key)) {
            var value = hash[key];
            if ("string" === typeof value && golbal_context[value]) {
                value = golbal_context[value];
            }
            context[key] = value;
        }
    }

    /*  如果没有扩展名，则使用默认扩展名 */
    if ("" === path.extname(url)) {
        url += DEFAULT_EXT;
    }

    var data = options.data;

    var file = path.join(data.dirname, url);
    var dirname = path.dirname(file);

    data = _utils.extend(
        Handlebars.createFrame(data || {}),
        {
            dirname: dirname,
            root: context
        }
    );

    try {
        var md5 = crypto.createHash("md5");
        md5.update(file);
        var stat = fs.statSync(file);
        md5.update(stat.mtime.toISOString());
        md5.update(stat.size.toString());
        var key = md5.digest("hex");
        var template;
        if (cache[key]) {
            template = cache[key];
        } else {
            var str = fs.readFileSync(file, "utf-8");
            template = Handlebars.compile(str);
            cache[key] = template;
        }
        return new Handlebars.SafeString(
            template(context, {
                data: data
            })
        );
    } catch (ex) {
        gutil.log(ex);
        return "";
    }
});


function gulp_hbs_import(context, fn) {
    if (null === context || "object" !== typeof context) {
        throw new PluginError(PLUGIN_NAME, "First arguments must be an object!");
    }
    Handlebars.Utils.extend(golbal_context, context);

    if ("function" === typeof fn) {
        fn.apply(this, [Handlebars]);
    }

    var aStream = through.obj(function (file, enc, callback) {
        if (file.isNull()) {
        }

        if (file.isBuffer()) {
            var str = file.contents.toString("utf-8");
            var ret = compile(str, file.path);
            file.contents = new Buffer(ret, "utf-8");
        }

        if (file.isStream()) {
            file.contents.setEncoding("utf-8");
            file.contents = file.contents.pipe((function (aPath) {
                var chunk = "";
                return through({
                    decodeStrings: false
                }, function (str, enc, callback) {
                    chunk += str;
                    return callback();
                }, function (done) {
                    var ret = compile(chunk, aPath);
                    this.push(ret);
                    done(null);
                });
            })(file.path));
        }

        this.push(file);
        return callback();

        function compile(str, aPath) {
            var key = path.basename(aPath, path.extname(aPath));
            var dirname = path.dirname(aPath);
            return Handlebars.compile(str)(golbal_context[key], {
                data: {
                    dirname: dirname
                }
            });
        }
    });

    return aStream;
}


module.exports = gulp_hbs_import;
