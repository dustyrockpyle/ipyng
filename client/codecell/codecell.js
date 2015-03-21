angular.module('ipy.codecell', ['ipyng', 'templates', 'ui.codemirror'])
  .directive('codecell', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        execute: '=?',
        input: '=?',
        output: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        scope.stream = '';
        scope.execute = function () {
          scope.stream = '';
          scope.output = '';
          scope.executionCount = '*';
          kernel.execute(scope.input)
            .then(function (result) {
              scope.output = result.text;
              scope.executionCount = result.execution_count;
            }, null,
            function (result){
              scope.stream += result;
            });
        };
      }
    };
  })
;