angular.module('ipy.watch', ['ipyng', 'ng.lodash', 'templates'])
  .directive('watch', function(ipyWatch, _) {
    return {
      templateUrl: 'watch.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        expressions: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        var watch;
        scope.expressions = scope.expressions || [];
        scope.watches = [];

        scope.$watchCollection('expressions', function(expressions){
          // Delete any empty expressions
          expressions = _.filter(expressions, function(expression){
            return expression;
          });
          if(expressions.length != scope.expressions.length){
            scope.expressions = expressions;
            return;
          }
          console.log(expressions);

          // For now just destroy and recreate all watches for simplicity.
          _.forEach(scope.watches, function(watch){
            watch.cancel();
          });
          scope.watches = [];
          _.forEach(expressions, function(expression) {
            scope.watches.push(ipyWatch.createWatch(kernel, expression));
          });
          ipyWatch.refresh(kernel.id, expressions);
        });

        var newDefault = 'New watch...';
        scope.newExpression = newDefault;
        scope.$watch('newExpression', function(expression){
          if(expression == newDefault) return;
          scope.expressions.push(expression);
          scope.newExpression = newDefault;
        });

        scope.selectText = function($event){
          $event.target.select();
        };

        scope.$on('$destroy', function(){
          _.forEach(scope.watches, function(watch){
            watch.cancel();
          });
        });
      }
    };
  })
;