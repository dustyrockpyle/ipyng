angular.module('ipyng.codecell', ['ipyng.kernel', 'templates'])
  .directive('ipyCodecell', ['ipyKernel', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      controller: function ($scope) {
        $scope.result = "";
        $scope.input = "";
        $scope.execute = function () {
          ipyKernel.evaluate("testID", $scope.input)
            .then(function (result) {
              $scope.result = result.data["text/plain"];
            });
        };
      }
    };
  }])
;