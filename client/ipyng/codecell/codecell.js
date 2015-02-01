angular.module('ipyng.codecell', ['ipyng.kernel'])
  .directive('ipyCodecell', ['ipyKernel', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      controller: function ($scope) {
        $scope.result = "";
        $scope.input = "";
        $scope.execute = function () {
          ipyKernel.execute("testID", $scope.input)
            .then(function (result) {
              $scope.result = result;
            });
        };
      }
    };
  }])
;