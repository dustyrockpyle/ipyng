(function(angular){
  'use strict';

  angular.module('ipy.psutil', ['ipyng', 'ng.lodash', 'templates'])
    .directive('ipyPsutil', ipyPsutilDirective)
    .controller('ipyPsutilCtrl', ipyPsutilCtrl);

  function ipyPsutilDirective ($ipyPoll) {
    return {
      templateUrl: 'ipy-psutil.tpl.html',
      restrict: 'E',
      require: ['ipyPsutil', '^kernel'],
      scope: {
        start: '=?',
        stop: '=?'
      },
      link: function (scope, element, attrs, ctrls) {
        ctrls[0].init(ctrls[1]);
      },
      controller: 'ipyPsutilCtrl',
      bindToController: true,
      controllerAs: 'ctrl'
    };
  }

  function ipyPsutilCtrl ($scope, $ipyPoll) {
    var self = this,
      expression = 'psutil.cpu_percent()',
      watch,
      unwatch,
      kernel;

    self.started = false;
    self.cpu_percent = '';
    self.start = start;
    self.stop = stop;
    self.init = init;

    function init (kernel_) {
      kernel = kernel_;
      kernel.executeSilent('import psutil');
      $scope.$on('$destroy', stop);
    }

    function start (){
      if(self.started) return;
      self.started = true;
      watch = $ipyPoll.createPoll(kernel, expression, 1000);
      watch.refresh();
      unwatch = $scope.$watch(watch.getValue, function(result){
        if(result) self.cpu_percent = result.text;
      });
    }

    function stop (){
      if(!self.started) return;
      self.cpu_percent = '';
      self.started = false;
      watch.cancel();
      unwatch();
    }
  }
})(angular);