angular.module('test', ['ng.lodash', 'ipyng'])
  .controller('TestCtrl', function($scope, _, ipyKernel){
    ipyKernel.startKernel('test');
  });