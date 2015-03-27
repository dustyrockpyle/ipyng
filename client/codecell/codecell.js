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
          scope.result = null;
          scope.error = null;
          scope.executionCount = '*';
          var stdoutHandler = function(stream) {
            scope.stream += stream;
          };
          kernel.execute(scope.input, stdoutHandler)
            .then(function (result) {
              scope.result = result;
              scope.executionCount = result.execution_count;
            })
            .catch(function(error){
              scope.error = error;
              scope.executionCount = error.execution_count;
            });
        };
      }
    };
  })
;