angular.module('md.codecell', ['ipyng', 'templates', 'ui.codemirror', 'ipy.output-area', 'ui.utils', 'ngMaterial', 'ui.bootstrap'])
  .directive('mdCodecell', function () {
    return {
      templateUrl: 'md-codecell.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        cell: '=?',
        execute: '=?',
        selected: '=?'
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
        scope.execute = function ($event) {
          if($event) $event.preventDefault();
          var cell = scope.cell;
          cell.outputs = [];
          cell.execution_count = '*';
          var stdoutHandler = function(stream) {
            scope.outputs = cell.outputs;
            cell.outputs.push({
              name: 'stdout',
              output_type: 'stream',
              text: stream
            });
          };
          kernel.execute(cell.source, stdoutHandler)
            .then(function (result) {
              cell.execution_count = result.execution_count;
              if(result.data) cell.outputs.push(result);
              scope.outputs = cell.outputs;
            })
            .catch(function(error){
              cell.outputs.push(error);
              cell.execution_count = error.execution_count;
              scope.outputs = cell.outputs;
            });
        };
      }
    };
  })
;