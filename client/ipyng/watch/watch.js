angular.module('ipyng.watch', ['ipyng.kernel', 'ng.lodash', 'templates'])
  .directive('watch', function() {
    return {
      templateUrl: 'watch.tpl.html',
      restrict: 'E',
      scope: {
        kernelId: '@',
        expressions: '=?'
      },
      controller: function ($scope, ipyKernel, ipyWatch, _) {
        var watch;
        var unwatch;
        $scope.expressions = $scope.expressions || [];

        $scope.watches = [];
        $scope.$watchCollection('expressions', function(expressions){
          // Delete any empty expressions
          expressions = _.filter(expressions, function(expression){
            return expression;
          });
          if(expressions.length != $scope.expressions.length){
            $scope.expressions = expressions;
            return;
          }

          // For now just destroy and recreate all watches for simplicity.
          _.forEach($scope.watches, function(watch){
            watch.cancel();
          });
          $scope.watches = [];
          _.forEach(expressions, function(expression) {
            $scope.watches.push(ipyWatch.createWatch($scope.kernelId, expression));
            _.last($scope.watches).refresh();
          });
        });

        var newDefault = 'New watch...';
        $scope.newExpression = newDefault;
        $scope.$watch('newExpression', function(expression){
          if(expression == newDefault) return;
          $scope.expressions.push(expression);
          $scope.newExpression = newDefault;
        });

        $scope.selectText = function($event){
          $event.target.select();
        };

        $scope.$on('$destroy', function(){
          _.forEach($scope.watches, function(watch){
            watch.cancel();
          });
        });
      }
    };
  })
;