angular.module('ipy.psutil', ['ipyng', 'ng.lodash', 'templates'])
  .directive('ipyPsutil', function($ipyPoll) {
    return {
      templateUrl: 'ipy-psutil.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        start: '=?',
        stop: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        var expression = 'psutil.cpu_percent()';
        var watch;
        var unwatch;
        scope.started = false;
        scope.cpu_percent = '';
        kernel.executeSilent('import psutil');
        scope.start = function(){
          if(scope.started) return;
          scope.started = true;
          watch = $ipyPoll.createPoll(kernel, expression, 1000);
          watch.refresh();
          unwatch = scope.$watch(watch.getValue, function(result){
            if(result) scope.cpu_percent = result.text;
          });
        };

        scope.stop = function(){
          if(!scope.started) return;
          scope.cpu_percent = '';
          scope.started = false;
          watch.cancel();
          unwatch();
        };

        scope.$on('$destroy', function(){
          if(watch){
            scope.stop();
          }
        });
      }
    };
  })
;