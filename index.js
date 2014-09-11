"use strict";

var crypto = require("crypto");
var through = require("through2");
var gutil = require("gulp-util"),
    PluginError = gutil.PluginError;

var Handlebars = require("handlebars");
var fs = require("fs"),
    path = require("path");

var glob_watcher = require("glob-watcher"),
    glob = require("glob-all");

var PLUGIN_NAME = "gulp-hbs-import";

var golbal_context = {};

/* 默认扩展名 */
var DEFAULT_EXT = ".html";

var cache = {};

/*
 * context: {{Object}}
 * fn: {{Function, optional}}
 */
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
            var ctx = {};
            Handlebars.Utils.extend(ctx, golbal_context[key]);
            ctx.__root__ = golbal_context;

            try {
                return Handlebars.compile(str)(ctx, {});
            } catch (ex) {
                console.warn(ex.message);
                return "";
            }
        }
    });

    return aStream;
}


var watch = (function () {
    var watcher;
    return function (pattern) {
        if (watcher) {
            watcher.add(pattern);
        } else {
            watcher = glob_watcher(pattern);
            watcher.on("change", function (evt) {
                switch (evt.type) {
                    case "added":
                    case "changed":
                        registerPartial(evt.path);
                }
            })
            .on("nomatch", function (evt) {
            });
        }
        return watcher;
    };
}());

var registerPartial = function (file) {
    fs.readFile(file, "utf-8", function (err, data) {
        if (err) {
            console.warn("Could not register the partial: " + file + "!");
            return;
        }
        Handlebars.registerPartial(path.basename(file, path.extname(file)), data);
    });
};


/*
 * register handlebars partical with filename
 */
gulp_hbs_import.registerPartial = function (file, is_watch, base) {
    if ("string" === typeof is_watch && "undefined" === typeof base) {
        base = is_watch;
        is_watch = false;
    }
    if ("string" !== typeof base) {
        base = "widget";
    }
    var filepath = path.join(base, file);

    if (is_watch) {
        watch(filepath);
    }

    registerPartial(filepath);
};

/*
 * register handlebars particals with directory
 * dir {{String}}
 * config {{Object}}
 *   base: {{String}} "widget"
 *   ext {{Array}} ext file
 *   ignore {{Array}} exclude file
 *   is_watch {{Boolean}} watching directory
 */
gulp_hbs_import.registerPartials = function (dir, config) {
    config = Handlebars.Utils.extend({
        base: "widget",
        exts: [".hbs", ".html"],
        ignores: [],
        is_watch: false,
    }, config);

    var files = config.exts.map(function (ext) {
        return path.join(config.base, dir, "*" + ext);
    });

    var ignores = config.ignores.map(function (ignore) {
        return "!" + path.join(config.base, dir, ignore);
    });

    var pattern = files.concat(ignores);

    // watching
    if (config.is_watch) {
        watch(pattern);
    }

    var self = this;
    glob(pattern, function (err, files) {
        if (err) {
            return err;
        }
        files.forEach(function (file) {
            self.registerPartial(file, "");
        });
    });
};

module.exports = gulp_hbs_import;
