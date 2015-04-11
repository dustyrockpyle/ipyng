(function(angular){
  'use strict';

  angular.module('ipy.watch', ['ipyng', 'ng.lodash', 'templates'])
    .directive('ipyWatch', ipyWatchDirective)
    .controller('ipyWatchCtrl', ipyWatchCtrl);

  function ipyWatchDirective ($ipyWatch, _) {
    return {
      templateUrl: 'ipy-watch.tpl.html',
      restrict: 'E',
      require: ['ipyWatch', '^kernel'],
      scope: {
        expressions: '=?',
        refresh: '=?',
        immutable: '@?'
      },
      link: function (scope, element, attrs, ctrls) {
        ctrls[0].init(ctrls[1]);
      },
      controller: 'ipyWatchCtrl',
      bindToController: true,
      controllerAs: 'ctrl'
    };
  }

  function ipyWatchCtrl ($scope, $attrs, $ipyWatch, _) {
    var self = this,
      watch,
      kernel,
      newDefault = 'New watch...';

    self.immutable = _.has($attrs, 'immutable');
    self.expressions = self.expressions || [];
    self.watches = [];
    self.refresh = refresh;
    self.init = init;

    $scope.selectText = selectText;

    function init (kernel_) {
      kernel = kernel_;
      self.newExpression = newDefault;
      $scope.$watchCollection('ctrl.expressions', updateExpressions);
      $scope.$watch('ctrl.newExpression', addExpression);
      $scope.$on('$destroy', cancelWatches);
    }

    function updateExpressions (newExpressions, oldExpressions) {
      // Delete any empty expressions
      newExpressions = _.without(newExpressions, '');
      self.expressions = newExpressions;

      if(!_.isEqual(newExpressions, oldExpressions)) {
        cancelWatches();
        self.watches = _.map(newExpressions, _.partial($ipyWatch.createWatch, kernel));
        refresh();
      }
    }

    function addExpression (expression) {
      if(expression == newDefault) return;
      self.expressions.push(expression);
      self.newExpression = newDefault;
    }

    function refresh () {
      $ipyWatch.refresh(kernel.id, self.expressions);
    }

    function cancelWatches () {
      _.forEach(self.watches, function(watch){
        watch.cancel();
      });
    }

    function selectText ($event){
      $event.target.select();
    }
  }
})(angular);