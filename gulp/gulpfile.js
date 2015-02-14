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
var nunjucks = require('nunjucks');
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
      file.relative = fix_slashes(path.relative(file.base, file.path));
      result.push(file);
    }).on('end', function(){
      cb(null, result);
    });
};

var config, root, client, vendor, build, whichConfig, karmaConfig, karmaServers;
if(argv.config) {
  whichConfig = formatPath(argv.config);
}
else{
  whichConfig = formatPath('../config.yaml');
}

root = fix_slashes(path.dirname(whichConfig)) + '/';

var schema = createSchema(root);


var makeConfig = function(){
  var configFile = fs.readFileSync(whichConfig, 'utf-8');
  config = yaml.load(configFile, { schema: schema});
  client = config.paths.client;
  vendor = config.paths.vendor;
  build = config.paths.build;
  var env = nunjucks.configure(client);
  env.addFilter('glop', glop, true);
  karmaConfig = config.karma || {};
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


gulp.task('watch', function () {
  makeConfig();
  connect.server({
    root: config.paths.build,
    livereload: true,
    port: config.port,
    middleware: function(connect, opt){
      return [
        function(req, res, next){
          res.setHeader("Access-Control-Allow-Origin", "*");
          next();
        }
      ]
    }
  });

  var watches = [];
  var addWatch = function (arg1, arg2, arg3) {
    watches.push(gulp.src(arg1).pipe(watch(arg1, arg2, arg2)));
    return watches[watches.length - 1];
  };
  var addBatchWatch = function(arg1, arg2, arg3) {
    watches.push(gulp.src(arg1).pipe(watch(arg1, batch(arg2))));
    return watches[watches.length -1];
  };
  karmaServers = [];

  gulp.src(whichConfig)
    .pipe(watch(whichConfig, function (file) {
      if(file.isNull()) return;
      watches.forEach(function (watch) {
        watch.close();
      });
      _.forEach(karmaServers, function(server){
        server.kill('SIGTERM');
      });

      watches = [];
      try {
        console.log('Making config, reloading watches.');
        makeConfig();
      } catch (err) {
        console.log("Error while generating gulp configuration.");
        console.log(err);
        this.emit('end');
      }

      addWatch(config.lint)
        .pipe(errorPlumber())
        .pipe(lint());

      _.forEach(config.apps, function (appConfig) {

        if (appConfig.html !== undefined) {
          addBatchWatch(appConfig.html.watch, function (files) {
            return gulp.src(appConfig.html.template)
              .pipe(errorPlumber())
              .pipe(build_html(appConfig.html)())
              .pipe(reload());
          });

          addWatch(appConfig.html.scripts)
            .pipe(errorPlumber())
            .pipe(gulp.dest(build))
            .pipe(reload());
        }

        if (appConfig.less !== undefined) {
          addBatchWatch(appConfig.less.watch, function (files) {
            return gulp.src(appConfig.less.template)
              .pipe(errorPlumber())
              .pipe(build_less(appConfig.less)())
              .pipe(reload());
          });
        }

        if (appConfig.tpl !== undefined) {
          addBatchWatch(appConfig.tpl.src, function (files) {
            return gulp.src(appConfig.tpl.src)
              .pipe(errorPlumber())
              .pipe(rename(function(path){
                path.dirname = "";
              }))
              .pipe(templateCache({standalone: true}))
              .pipe(copy_to_out(appConfig.tpl.dest)())
              .pipe(reload());
          });
        }

        if (appConfig.copy !== undefined){
          _([appConfig.copy.src, appConfig.copy.dest])
            .zip()
            .map(function(obj){
              addWatch(obj[0])
                .pipe(errorPlumber())
                .pipe(gulp.dest(obj[1]))
                .pipe(reload());
            });
        }

        if (appConfig.karma !== undefined){
          _.extend(appConfig.karma, karmaConfig);
          karmaServers.push(spawn('node',
            [path.join(__dirname, 'karmaBackground.js'), JSON.stringify(appConfig.karma)],
            {stdio: 'inherit'}
          ));
        }
      });
    }));
});