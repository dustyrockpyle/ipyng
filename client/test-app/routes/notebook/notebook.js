angular.module('test-app.routes.notebook', ['ui.router', 'ipyng'])
  .config(notebookState);

function notebookState ($stateProvider) {
  $stateProvider
    .state('notebook', {
      url: '/notebook',
      parent: 'main',
      views: {
        body: {
          resolve: {
            kernel: function($ipyKernel) {
              return $ipyKernel.getOrStartKernel('default', 'python');
            }
          },
          templateUrl: 'test-notebook-body.tpl.html',
          controller: function(kernel) {}
        }
      }
    });
}