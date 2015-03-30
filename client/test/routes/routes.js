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
        controller: function($scope, kernel) {
          $scope.exception = '' +
            'def error_func(x, y, z):\n' +
            '  if (x == 3):\n' +
            '    raise ValueError(x,y,z)\n' +
            '  return error_func(x+1, y+2, z+3)\n' +
            'error_func(1,2,3)';

          $scope.widget = '' +
            'class TestWidget:\n' +
            '  def _repr_html_(self):\n' +
            '    return "<psutil></psutil>"\n' +
            'TestWidget()';

          $scope.cellception = '' +
            'class CodecellCeption:\n' +
            '  def _repr_html_(self):\n' +
            '    return "<codecell></codecell>"\n' +
            'CodecellCeption()';

          $scope.image = '' +
            '%matplotlib inline\n' +
            'from matplotlib import pyplot as plt\n' +
            'plt.plot(range(10), range(10))';
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
      })
      .state('notebook', {
        url: '/notebook',
        templateUrl: 'test-notebook.tpl.html',
        resolve: {
          kernel: function(ipyKernel) {
            return ipyKernel.getOrStartKernel('test', 'python');
          }
        },
        controller: function(kernel){

        }
      });
  });