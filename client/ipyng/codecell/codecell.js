angular.module('ipyng.codecell', ['ipyng.kernel', 'templates', 'ui.codemirror'])
  .directive('ipyCodecell', ['ipyKernel', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      controller: function ($scope) {
        $scope.result = null;
        $scope.stream = '';
        $scope.input = "";
        $scope.execute = function () {
          $scope.result = null;
          $scope.stream = '';
          $scope.executionCount = '*';
          ipyKernel.execute("testID", $scope.input)
            .then(function (result) {
              console.log("execute finished");
              $scope.result = result;
              $scope.executionCount = result.execution_count;
              console.log(result);
            }, null,
            function (result){
              $scope.stream += result;
            });
        };
      }
    };
  }])
;