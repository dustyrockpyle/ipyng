angular.module('ipyng.codecell', ['ipyng.kernel', 'templates'])
  .directive('ipyCodecell', ['ipyKernel', function (ipyKernel) {
    return {
      templateUrl: 'codecell.tpl.html',
      restrict: 'E',
      controller: function ($scope) {
        $scope.result = [];
        $scope.input = "";
        $scope.execute = function () {
          $scope.result = [];
          ipyKernel.execute("testID", $scope.input)
            .then(function (result) {
              console.log("execute finished");
              $scope.result.push(result.text);
            }, null,
            function(message){
              console.log(message);
              $scope.result.push(message);
            });
        };
      }
    };
  }])
;