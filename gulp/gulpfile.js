var path = require('path');
var fs = require('fs');
var gulp = require('gulp');
var less = require('gulp-less');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var gutil = require('gulp-util');
var prettify = require('gulp-prettify');
var jshint = require('gulp-jshint');
var watch = require('gulp-watch');
var plumber = require('gulp-plumber');
var nunjucksRender = require('gulp-nunjucks-render');
var print = require('gulp-print');
var lazypipe = require('lazypipe');
var yaml = require('js-yaml');
var createSchema = require('./yaml-schema');
var gs = require('glob-stream');
var templateCache = require('gulp-angular-templatecache');
var _ = require('lodash');
var connect = require('gulp-connect');
var argv = require('yargs').argv;
var through = require('through2');
var batch = require('gulp-batch');
var spawn = require('child_process').spawn;


var fix_slashes = function(filepath){
  return filepath.replace(/\\/g, '/')
};

var formatPath = function (filePath) {
  return fix_slashes(path.resolve(filePath));
};

var glop = function (pattern, cb) {
  var result = [];
  gs.create(pattern)
    .on('data', function(file){
      file.relative = fix_slashes(path.relative(config.server.root, file.path));
      result.push(file);
    }).on('end', function(){
      cb(null, result);
    });
};

var config, root, client, vendor, build, whichConfig, karmaServer;
if(argv.config) {
  whichConfig = formatPath(argv.config);
}
else{
  whichConfig = formatPath('../config.yaml');
}

root = fix_slashes(path.dirname(whichConfig)) + '/';

var schema = createSchema(root);

var makeConfig = function(){
  var configFile = fs.readFileSync(whichConfig, encoding = 'utf-8');
  config = yaml.load(configFile, { schema: schema});
  client = config.paths.client;
  vendor = config.paths.vendor;
  build = config.paths.build;
  var env = nunjucksRender.nunjucks.configure(client);
  env.addFilter('glop', glop, true);
};

var nunjucksContext = {
  _: _
};

var makeContext = function (context) {
  return _.extend({}, nunjucksContext, context);
};

var copy_to_out = function(out_path) {
  return lazypipe()
    .pipe(rename, path.basename(out_path))
    .pipe(gulp.dest, path.dirname(out_path));
};

var lint = lazypipe()
  .pipe(print, function(filepath){
    return "Linting " + formatPath(filepath);
  })
  .pipe(jshint)
  .pipe(jshint.reporter, 'jshint-stylish');

var build_html = function (html_config) {
  return lazypipe()
    .pipe(nunjucksRender, makeContext(html_config))
    .pipe(prettify, {indent_size: 4})
    .pipe(copy_to_out(html_config.dest));
};

var build_less = function (less_config) {
  return lazypipe()
    .pipe(nunjucksRender, makeContext(less_config))
    .pipe(less, less_config)
    .pipe(copy_to_out(less_config.dest));
};

var build_templates = function (tpl_config) {
  return lazypipe()
    .pipe(rename, function(path){
      path.dirname = "";
    })
    .pipe(templateCache, tpl_config)
    .pipe(copy_to_out(tpl_config.dest));
};

var reload = lazypipe()
  .pipe(print, function (filepath) {
    return "Reloading " + formatPath(filepath);
  }).pipe(connect.reload);

var errorPlumber = function(){
  return plumber({
    errorHandler: function (error) {
      gutil.beep();
      console.log(error);
      this.emit('end');
    }});
};


makeConfig();

gulp.task('templates', function(){
  if(config.templates === undefined) return;
  return gulp.src(config.templates.src)
    .pipe(build_templates(config.templates)())
});

gulp.task('html', ['templates', 'less'], function(){
  if(config.html === undefined) return;
  return gulp.src(config.html.src)
    .pipe(build_html(config.html)());
});

gulp.task('less', function(){
  if(config.less === undefined) return;
  return gulp.src(config.less.src)
    .pipe(build_less(config.less)());
});

gulp.task('lint', function(){
  if(config.lint === undefined) return;
  return gulp.src(config.lint.src)
    .pipe(lint());
});

gulp.task('karma', function(){
  if(config.karma === undefined) return;
  config.karma.singleRun = true;
  return spawn('node', [path.join(__dirname, 'karmaBackground.js'), JSON.stringify(config.karma)],
    {stdio: 'inherit'});
});

gulp.task('copy', function(){
  if(config.copy === undefined) return;
  _([config.copy.src, config.copy.dest])
    .zip()
    .map(function(obj){
      console.log(obj[0]);
      console.log(obj[1]);
      gulp.src(obj[0])
        .pipe(gulp.dest(obj[1]))
    });
});

gulp.task('build', ['templates', 'less', 'html', 'lint', 'copy', 'karma']);

gulp.task('watch', ['templates', 'less', 'html', 'copy', 'lint'], function () {
  if(config.server !== undefined) {
    connect.server({
      root: config.server.root,
      livereload: config.server.livereload,
      port: config.server.port,
      middleware: function(connect, opt){
        return [
          function(req, res, next){
            res.setHeader("Access-Control-Allow-Origin", "*");
            next();
          }
        ]
      }
    });
  }

  var watches = [];
  var addWatch = function (src) {
    watches.push(watch(src));
    return watches[watches.length - 1];
  };

  var addBatchWatch = function(src, cb) {
    watches.push(watch(src, batch(cb)));
    return watches[watches.length -1];
  };

  gulp.src(whichConfig)
    .pipe(watch(whichConfig, function (file) {
      if(file.isNull()) return;
      watches.forEach(function (watch) {
        watch.close();
      });
      if(karmaServer !== undefined) karmaServer.kill('SIGTERM');

      watches = [];
      try {
        console.log('Making config, reloading watches.');
        makeConfig();
      } catch (err) {
        console.log("Error while generating gulp configuration.");
        console.log(err);
        this.emit('end');
      }

      if (config.lint !== undefined && config.lint.watch !== undefined) {
        addWatch(config.lint.watch)
          .pipe(errorPlumber())
          .pipe(lint());
      }

      if (config.html !== undefined && config.html.watch !== undefined) {
        addBatchWatch(config.html.watch, function (files) {
          return gulp.src(config.html.src)
            .pipe(errorPlumber())
            .pipe(build_html(config.html)())
            .pipe(reload());
        });
      }

      if (config.less !== undefined && config.less.watch !== undefined) {
        addBatchWatch(config.less.watch, function (files) {
          return gulp.src(config.less.src)
            .pipe(errorPlumber())
            .pipe(build_less(config.less)())
            .pipe(reload());
        });
      }

      if (config.templates !== undefined && config.templates.watch !== undefined) {
        addBatchWatch(config.templates.watch, function (files) {
          return gulp.src(config.templates.src)
            .pipe(errorPlumber())
            .pipe(build_templates(config.templates)())
            .pipe(reload());
        });
      }

      if (config.copy !== undefined){
        _([config.copy.src, config.copy.dest])
          .zip()
          .map(function(obj){
            addWatch(obj[0])
              .pipe(errorPlumber())
              .pipe(gulp.dest(obj[1]))
              .pipe(reload());
          });
      }

      if (config.karma !== undefined){
        karmaServer = spawn('node',
          [path.join(__dirname, 'karmaBackground.js'), JSON.stringify(config.karma)],
          {stdio: 'inherit'}
        );
      }
    }));
});