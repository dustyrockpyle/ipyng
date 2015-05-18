(function(angular){
  'use strict';

  angular.module('ipy.codecell', ['ipyng', 'templates', 'ipy.codearea', 'ipy.outputarea', 'ngMaterial', 'ng.lodash'])
    .directive('ipyCodecell', ipyCodecellDirective)
    .controller('ipyCodecellCtrl', ipyCodecellCtrl);

  function ipyCodecellDirective () {
    return {
      templateUrl: 'ipy-codecell.tpl.html',
      restrict: 'E',
      require: ['ipyCodecell', '^kernel'],
      scope: {
        cell: '=?',
        onLoad: '&?'
      },
      link: function (scope, element, attrs, ctrls) {
        ctrls[0].init(ctrls[1]);
      },
      controller: 'ipyCodecellCtrl',
      bindToController: true,
      controllerAs: 'ctrl'
    };
  }

  function ipyCodecellCtrl ($scope, _) {
    var self = this,
      cell,
      kernel;

    if(!self.cell) self.cell = {};
    cell = self.cell;
    cell.cell_type = cell.cell_type || 'code';
    cell.execution_count = cell.execution_count || null;
    cell.metadata = cell.metadata || {collapsed: false, trusted: false};
    cell.outputs = cell.outputs || [];
    cell.input = cell.input || [];
    cell.source = cell.input.join('');
    self.showOutput = true;
    self.toggleOutput = toggleOutput;
    self.execute = execute;
    self.init = init;

    $scope.codeAreaLoad = codeAreaLoad;
    $scope.cell = cell;
    $scope.executing = 0;

    function init (kernel_) {
      kernel = kernel_;
    }

    function codeAreaLoad (cm){
      if(self.onLoad) self.onLoad({cm: cm, execute: execute, toggleOutput: toggleOutput});
      cell.execute = execute;
      cell.toggleOutput = toggleOutput;
    }

    function execute () {
      cell.outputs = [];
      var outputs = cell.outputs;
      $scope.executing++;
      var stdoutHandler = function(stream) {
        outputs.push({
          name: 'stdout',
          output_type: 'stream',
          text: stream
        });
      };

      kernel.execute(cell.source, stdoutHandler)
        .then(function (result) {
          if(result.data) outputs.push(result);
          return result;
        })
        .catch(function(error){
          outputs.push(error);
          return error;
        })
        .then(function(result){
          $scope.executing--;
          cell.execution_count = result.execution_count;
          toggleOutput(true);
        });
    }

    function toggleOutput (show) {
      if(show === undefined) self.showOutput = !self.showOutput;
      else self.showOutput = show;
    }
  }
})(angular);