angular.module('ipy.codecell', ['ipyng', 'templates', 'ui.codemirror', 'ipy.result-area'])
  .directive('codecell', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        execute: '=?',
        input: '=?',
        result: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        scope.stream = '';
        scope.execute = function () {
          scope.stream = '';
          scope.output = '';
          scope.executionCount = '*';
          kernel.execute(scope.input, function(stdout) { scope.stream += stdout; })
            .then(function (result) {
              scope.result = result;
              scope.executionCount = result.execution_count;
            });
        };
      }
    };
  })
;