angular.module('test-app.routes', ['ui.router', 'ngMaterial', 'ngMdIcons', 'test-app.routes.main', 'test-app.routes.notebook'])
  .factory('$route', routeFactory)
  .config(function($stateProvider, $urlRouterProvider){
    $urlRouterProvider.otherwise('/explorer//');
    $stateProvider
      .state('main', {
        templateUrl: 'test-main.tpl.html'
      });
  });

function routeFactory($state, _) {
  return {go: go};

  function go(dir, file) {
    if (!file) {
      $state.go('explorer', {path: dir, file: null});
      return;
    }
    if (_.endsWith(file, '.ipynb')) {
      $state.go('notebook', {path: dir, file: file});
    }
  }
}