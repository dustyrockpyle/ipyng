angular.module('ipy.codecell', ['ipyng', 'templates', 'ipy.codearea', 'ipy.outputarea', 'ngMaterial', 'ng.lodash'])
  .directive('ipyCodecell', function () {
    return {
      templateUrl: 'ipy-codecell.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        cell: '=?',
        onLoad: '&?'
      },
      link: function (scope, element, attrs, kernel) {
        if(!scope.cell) scope.cell = {};
        var cell = scope.cell;
        cell.cell_type = cell.cell_type || 'code';
        cell.execution_count = cell.execution_count || null;
        cell.metadata = cell.metadata || {collapsed: false, trusted: false};
        cell.outputs = cell.outputs || [];
        cell.source = cell.source || '';
        scope.outputs = cell.outputs;
        scope.codeAreaLoad = codeAreaLoad;


        function codeAreaLoad (cm){
          if(scope.onLoad) scope.onLoad({cm: cm, execute: execute, toggleOutput: toggleOutput});
          cell.execute = execute;
          cell.toggleOutput = toggleOutput;
        }

        function execute () {
          cell.outputs = [];
          var outputs = scope.cell.outputs;
          cell.execution_count = '*';
          var stdoutHandler = function(stream) {
            scope.outputs = outputs;
            outputs.push({
              name: 'stdout',
              output_type: 'stream',
              text: stream
            });
          };

          kernel.execute(cell.source, stdoutHandler)
            .then(function (result) {
              cell.execution_count = result.execution_count;
              if(result.data) outputs.push(result);
              scope.outputs = outputs;
              toggleOutput(true);
            })
            .catch(function(error){
              outputs.push(error);
              cell.execution_count = error.execution_count;
              scope.outputs = outputs;
              toggleOutput(true);
            });
        }

        scope.showOutput = true;
        scope.toggleOutput = toggleOutput;
        function toggleOutput (show) {
          if(show === undefined) scope.showOutput = !scope.showOutput;
          else scope.showOutput = show;
        }
      }
    };
  })
;