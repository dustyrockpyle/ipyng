(function(angular){
  angular.module('test-app.routes.main', ['ui.router', 'ipyng', 'ipy.fileExplorer'])
    .factory('$testExplorer', testExplorerFactory)
    .config(explorerState);

  function explorerState ($stateProvider) {
    $stateProvider
      .state('explorer', {
        url: '/explorer/:path',
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

  function toolbarCtrl (_, curdir, $state) {
    var self = this;
    self.dir_parts = _.compact(curdir.split(/\//g));
    self.breadcrumb = breadcrumb;

    function breadcrumb($index) {
      $state.go('explorer', {path: _.slice(self.dir_parts, 0, $index + 1).join('/') + '/'});
    }
  }

  function bodyCtrl (fileExplorer, _, dir, curdir, $state) {
    var self = this;
    self.icon = icon;
    self.navigate = navigate;
    self.dir = dir;

    function navigate(obj) {
      if (!obj.isfile) $state.go('explorer', {path: curdir + '/' + obj.name});
      else {
        fileExplorer.read(obj.name)
          .then(function (result) {
            console.log(result);
          });
      }
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

  function resolveCurDir (fileExplorer, $stateParams, $state) {
    if(!$stateParams.path) {
      fileExplorer.curdir
        .then(function(curdir){
          $state.go('explorer', {path: curdir});
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