angular.module('test-app.routes', ['ui.router', 'ngMaterial', 'ngMdIcons', 'test-app.routes.main', 'test-app.routes.notebook'])
  .config(function($stateProvider, $urlRouterProvider){
    $urlRouterProvider.otherwise('/explorer/');
    $stateProvider
      .state('main', {
        templateUrl: 'test-main.tpl.html'
      });
  });