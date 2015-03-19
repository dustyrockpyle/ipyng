angular.module('ipyng.psutil', ['ipyng.kernel', 'ng.lodash', 'templates'])
  .directive('psutil', function() {
    return {
      templateUrl: 'psutil.tpl.html',
      restrict: 'E',
      scope: {
        kernelId: '@'
      },
      controller: function ($scope, ipyKernel, ipyPoll, _) {
        var expression = 'psutil.cpu_percent()';
        var watch;
        var unwatch;
        $scope.started = false;
        $scope.cpu_percent = '';
        ipyKernel.getKernel($scope.kernelId)
          .then(function(kernel){
            return ipyKernel.execute($scope.kernelId, 'import psutil\n', false, false, true);
          })
          .then(function(result){
            // $scope.start();
          });

        $scope.start = function(){
          if($scope.started) return;
          $scope.started = true;
          watch = ipyPoll.createPoll($scope.kernelId, expression, 1000);
          watch.refresh();
          unwatch = $scope.$watch(watch.getValue, function(result){
            if(result) $scope.cpu_percent = result.text;
          });
        };

        $scope.stop = function(){
          if(!$scope.started) return;
          $scope.cpu_percent = '';
          $scope.started = false;
          watch.cancel();
          unwatch();
        };

        $scope.$on('$destroy', function(){
          if(watch){
            $scope.stop();
          }
        });
      }
    };
  })
;