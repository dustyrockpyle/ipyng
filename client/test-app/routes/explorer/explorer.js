(function(angular){
  angular.module('test-app.routes.main', ['ui.router', 'ipyng', 'ipy.fileExplorer'])
    .factory('$testExplorer', testExplorerFactory)
    .config(explorerState);

  function explorerState ($stateProvider) {
    $stateProvider
      .state('explorer', {
        url: '/explorer/:path/:file',
        parent: 'main',
        views: {
          toolbar: {
            templateUrl: 'test-explorer-toolbar.tpl.html',
            resolve: {
              fileExplorer: resolveFileExplorer,
              curdir: resolveCurDir
            },
            controller: toolbarCtrl,
            controllerAs: 'ctrl'
          },
          body: {
            templateUrl: 'test-explorer-body.tpl.html',
            resolve: {
              fileExplorer: resolveFileExplorer,
              curdir: resolveCurDir,
              dir: resolveDir
            },
            controller: bodyCtrl,
            controllerAs: 'ctrl'
          }
        }
      });
  }

  function testExplorerFactory ($ipyKernel, $controller, $q) {
    return $ipyKernel.getOrStartKernel('system', 'python')
      .then(function(kernel){
        return $controller('ipyFileExplorerCtrl', {kernel: kernel});
      })
      .then(function(ctrl) {
        return $q.all([ctrl, ctrl.curdir])
      })
      .then(function(result) {
        return result[0];
      });
  }

  function toolbarCtrl (_, curdir, $route, $stateParams) {
    var self = this;
    self.dir_parts = _.compact(curdir.split(/\//g));
    if($stateParams.file) self.dir_parts.push($stateParams.file);
    self.breadcrumb = breadcrumb;

    function breadcrumb($index) {
      if($index != self.dir_parts.length - 1)
        $route.go(_.slice(self.dir_parts, 0, $index + 1).join('/') + '/');
    }
  }

  function bodyCtrl (_, dir, curdir, $route) {
    var self = this;
    self.icon = icon;
    self.navigate = navigate;
    self.dir = dir;

    function navigate(obj) {
      var path = curdir;
      var file = null;
      if (!obj.isfile) path += '/' + obj.name;
      else file = obj.name;
      $route.go(path, file);
    }

    function icon(obj) {
      if (!obj.isfile) return 'folder';
      if (_.endsWith(obj.name, '.ipynb')) return 'web';
      if (_.endsWith(obj.name, '.py')) return 'gesture';
      return 'insert_drive_file'
    }
  }

  function resolveFileExplorer ($testExplorer) {
    return $testExplorer;
  }

  function resolveCurDir (fileExplorer, $stateParams, $route) {
    if(!$stateParams.path) {
      fileExplorer.curdir
        .then(function(curdir){
          $route.go($stateParams.path);
        });
      return;
    }

    return fileExplorer.navigate($stateParams.path)
      .then(function () {
        return fileExplorer.curdir;
      })
      .then(function(curdir) {
        return curdir.replace(/\\/g, '/');
      });
  }

  function resolveDir (fileExplorer, curdir) {
    return fileExplorer.dir;
  }

})(angular);