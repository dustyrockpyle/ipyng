angular.module('test.routes', ['ui.router', 'ipyng', 'ipy.fileExplorer'])
  .config(function($stateProvider, $urlRouterProvider){
    $urlRouterProvider.otherwise('/');
    $stateProvider
      .state('debug', {
        url: '/debug',
        templateUrl: 'test-debug.tpl.html',
        resolve: {
          kernel: function($ipyKernel) {
            return $ipyKernel.getOrStartKernel('test', 'python');
          }
        },
        controller: function(kernel){

        }
      })
      .state('notebook', {
        url: '/notebook',
        templateUrl: 'test-notebook.tpl.html',
        resolve: {
          kernel: function($ipyKernel) {
            return $ipyKernel.getOrStartKernel('test', 'python');
          }
        },
        controller: function(kernel){

        }
      })
      .state('main', {
        url: '/',
        templateUrl: 'test-main.tpl.html',
        resolve: {
          kernel: function($ipyKernel) {
            return $ipyKernel.getOrStartKernel('file', 'python');
          }
        },
        controller: 'ipyFileExplorerCtrl',
        controllerAs: 'ctrl'
      })
      .state('dir', {
        parent: 'main',
        url: ':path'
      })
  });