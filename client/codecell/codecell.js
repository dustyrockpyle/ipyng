angular.module('ipy.codecell', ['ipyng', 'templates', 'ui.codemirror', 'ipy.output-area', 'ui.utils'])
  .directive('codecell', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        input: '=?',
        execute: '=?',
        result: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        scope.stream = '';
        scope.execute = function ($event) {
          if($event) $event.preventDefault();
          scope.stream = '';
          scope.execution_count = '*';
          var stdoutHandler = function(stream) {
            scope.stream += stream;
          };
          kernel.execute(scope.input, stdoutHandler)
            .then(function (result) {
              scope.execution_count = result.execution_count;
              scope.result = result;
            })
            .catch(function(error){
              scope.execution_count = error.execution_count;
              scope.error = error;
            });
        };
      }
    };
  })
;