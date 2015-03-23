angular.module('test.routes', ['ui.router', 'ipyng'])
  .config(function($stateProvider, $urlRouterProvider){
    $urlRouterProvider.otherwise('/');
    $stateProvider
      .state('main', {
        url: '/',
        templateUrl: 'test-main.tpl.html',
        resolve: {
          kernel: function(ipyKernel) {
            return ipyKernel.getOrStartKernel('test', 'python');
          }
        },
        controller: function(kernel) {

        }
      })
      .state('debug', {
        url: '/debug',
        templateUrl: 'test-debug.tpl.html',
        resolve: {
          kernel: function(ipyKernel) {
            return ipyKernel.getOrStartKernel('test', 'python');
          }
        },
        controller: function(kernel){

        }
      });
  });