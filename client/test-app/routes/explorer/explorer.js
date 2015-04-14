(function(angular){
  angular.module('test-app.routes.main', ['ui.router', 'ipyng', 'ipy.fileExplorer'])
    .factory('$testExplorer', testExplorerFactory)
    .config(explorerState);

  function explorerState ($stateProvider) {
    $stateProvider
      .state('explorer', {
        url: '/explorer',
        parent: 'main',
        views: {
          toolbar: {
            templateUrl: 'test-explorer-toolbar.tpl.html',
            resolve: {
              fileExplorer: resolveFileExplorer
            },
            controller: toolbarCtrl,
            controllerAs: 'ctrl'
          },
          body: {
            templateUrl: 'test-explorer-body.tpl.html',
            resolve: {
              fileExplorer: resolveFileExplorer
            },
            controller: bodyCtrl,
            controllerAs: 'ctrl'
          }
        }
      });
  }

  function testExplorerFactory ($ipyKernel, $controller) {
    return $ipyKernel.getOrStartKernel('system', 'python')
      .then(function(kernel){
        return $controller('ipyFileExplorerCtrl', {kernel: kernel});
      });
  }

  function toolbarCtrl ($scope, fileExplorer) {
    var self = this;
    self.breadcrumb = breadcrumb;
    self.dir_parts = [];
    $scope.fCtrl = fileExplorer;

    $scope.$watch('fCtrl.curdir', updateDirectory);

    function updateDirectory(curdir) {
      curdir = curdir.replace(/\\/g, '/');
      self.dir_parts = _.compact(curdir.split(/\//g));
    }

    function breadcrumb($index) {
      fileExplorer.navigate(_.slice(self.dir_parts, 0, $index + 1).join('/') + '/');
    }
  }

  function bodyCtrl ($scope, fileExplorer, _) {
    var self = this;
    self.icon = icon;
    self.navigate = navigate;
    $scope.fCtrl = fileExplorer;

    function navigate(obj) {
      if (!obj.isfile) fileExplorer.navigate(obj.name);
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
})(angular);