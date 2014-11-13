'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var gutil = require('gulp-util');
var through = require('through2');

// ignore missing file error
function fsOperationFailed(stream, sourceFile, err) {
	if (err) {
		if (err.code !== 'ENOENT') {
			stream.emit('error', new gutil.PluginError('gulp-changed', err, {
				fileName: sourceFile.path
			}));
		}

		stream.push(sourceFile);
	}

	return err;
}

function sha1(buf) {
	return crypto.createHash('sha1').update(buf).digest('hex');
}

function verCompare(a, b) {
    var r = /[^\d]+/, tr = /^[^\d]+|[^\d]+$/g;
    var as = a.replace(tr, ''), bs = b.replace(tr, '');
    var da = as.split(r), db = bs.split(r);
    for(var i=0; i<da.length; i++) {
        if(da[i].length != db[i].length) {
            var ai = parseInt(da[i], 10), bi = parseInt(db[i], 10);
            if( ai != bi )
                return ai < bi;
        } else if(da[i] == db[i]) {
            continue;
        } else {
            return da[i] < db[i];
        }
    }
    return a.toLowerCase() < b.toLowerCase();
}

function targetVerPath(targetPattern) {
    // version number must contained when not a pure path
    var vxp = /\\d|\[/;
    if(!vxp.test(targetPattern)) {
        return targetPattern; // pure path
    }
    var segs = targetPattern.split('/'), fpaths = [];
    for(var i=0, imax=segs.length; i<imax; i++) {
        var seg = segs[i];
        if(seg == '.') {
           continue;
        } else if(seg == '..') {
           fpaths.pop();
        } else {
            if( vxp.test(seg) ) {
                var rxp = new RegExp('^'+seg+'$'), pr = fpaths.length>0 ? fpaths.join('/') +'/' : './';
                var p = fs.readdirSync(pr).filter(function (file) {
                    return rxp.test(file);
                });
                if( p.length == 0 ) {
                    return './' +fpaths.join('/') +'/';
                } else if( p.length > 1 ) {
                    p.sort(verCompare);
                }
                fpaths.push(p[0]);
            } else {
                fpaths.push(seg);
            }
        }
    }
    return './' +fpaths.join('/');
}

// only push through files changed more recently than the destination files
function compareLastModifiedTime(stream, cb, sourceFile, targetPath) {
    targetPath = targetVerPath(targetPath);
	fs.stat(targetPath, function (err, targetStat) {
		if (!fsOperationFailed(stream, sourceFile, err)) {
			if (sourceFile.stat.mtime > targetStat.mtime) {
				stream.push(sourceFile);
			}
		}

		cb();
	});
}

// only push through files with different SHA1 than the destination files
function compareSha1Digest(stream, cb, sourceFile, targetPath) {
    targetPath = targetVerPath(targetPath);
	fs.readFile(targetPath, function (err, targetData) {
		if (!fsOperationFailed(stream, sourceFile, err)) {
			var sourceDigest = sha1(sourceFile.contents);
			var targetDigest = sha1(targetData);

			if (sourceDigest !== targetDigest) {
				stream.push(sourceFile);
			}
		}

		cb();
	});
}

module.exports = function (dest, opts) {
	opts = opts || {};
	opts.cwd = opts.cwd || process.cwd();
	opts.hasChanged = opts.hasChanged || compareLastModifiedTime;

	if (!dest) {
		throw new gutil.PluginError('gulp-changed', '`dest` required');
	}

	return through.obj(function (file, enc, cb) {
		if (file.isNull()) {
			cb(null, file);
			return;
		}

		var newPath = path.resolve(opts.cwd, dest, file.relative);

		if (opts.extension) {
			newPath = gutil.replaceExtension(newPath, opts.extension);
		}

		opts.hasChanged(this, cb, file, newPath);
	});
};

module.exports.compareLastModifiedTime = compareLastModifiedTime;
module.exports.compareSha1Digest = compareSha1Digest;
module.exports.findLatestVer = targetVerPath;