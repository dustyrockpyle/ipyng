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
          $scope.widget = '' +
            'class Test(object):\n' +
            '  def _repr_html_(self):\n' +
            '    return "<psutil></psutil>"\n' +
            'Test()';
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
      });
  });