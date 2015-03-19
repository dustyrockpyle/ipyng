angular.module('ipyng.codecell', ['ipyng.kernel', 'templates', 'ui.codemirror'])
  .directive('ipyCodecell', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      scope: {
        kernelId: '@',
        execute: '=?',
        input: '=?',
        output: '=?'
      },
      controller: function ($scope) {
        $scope.stream = '';
        $scope.execute = function () {
          $scope.stream = '';
          $scope.output = '';
          $scope.executionCount = '*';
          ipyKernel.execute($scope.kernelId, $scope.input)
            .then(function (result) {
              console.log("execute finished");
              $scope.output = result.text;
              $scope.executionCount = result.execution_count;
              console.log(result);
            }, null,
            function (result){
              $scope.stream += result;
            });
        };
      }
    };
  })
;