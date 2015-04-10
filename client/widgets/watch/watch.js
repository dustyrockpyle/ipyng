angular.module('ipy.watch', ['ipyng', 'ng.lodash', 'templates'])
  .directive('ipyWatch', function($ipyWatch, _) {
    return {
      templateUrl: 'ipy-watch.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        expressions: '=?',
        refresh: '=?',
        immutable: '@?'
      },
      link: function (scope, element, attrs, kernel) {
        var watch;
        var ctrl = {};
        scope.ctrl = ctrl;
        ctrl.immutable = _.has(attrs, 'immutable');
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

          // For now just destroy and recreate all watches for simplicity.
          _.forEach(scope.watches, function(watch){
            watch.cancel();
          });
          scope.watches = [];
          _.forEach(expressions, function(expression) {
            scope.watches.push($ipyWatch.createWatch(kernel, expression));
          });

          scope.refresh();
        });

        scope.refresh = function() {
          $ipyWatch.refresh(kernel.id, scope.expressions);
        };

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