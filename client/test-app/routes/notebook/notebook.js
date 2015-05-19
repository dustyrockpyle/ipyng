angular.module('test-app.routes.notebook', ['ui.router', 'ipyng', 'test-app.routes.main'])
  .config(notebookState);

function notebookState ($stateProvider) {
  $stateProvider
    .state('notebook', {
      url: '/notebook',
      parent: 'explorer',
      views: {
        body: {
          resolve: {
            kernel: function($ipyKernel) {
              return $ipyKernel.getOrStartKernel('default', 'python');
            },
            fileExplorer: resolveFileExplorer,
            notebook: resolveNotebook
          },
          templateUrl: 'test-notebook-body.tpl.html',
          controller: function(kernel, notebook) {
            this.notebook = notebook;
          },
          controllerAs: 'ctrl'
        }
      }
    });
}

function resolveFileExplorer ($testExplorer) {
  return $testExplorer;
}

function resolveNotebook (fileExplorer, $stateParams) {
  var path = $stateParams.path + '/' + $stateParams.file;
  return fileExplorer.read(path)
    .then(function(result) {
      return JSON.parse(result);
    });
}

