const gulp = require('gulp');
const path = require('path');

const root = __dirname;
const src = path.join(root, 'webview', '**', '*');
const dest = path.join(root, 'out', 'webview');

function copyWebview() {
	return gulp.src(src, { dot: true })
		.pipe(gulp.dest(dest));
}

exports.copyWebview = copyWebview;

// default for quick testing
exports.default = copyWebview;
