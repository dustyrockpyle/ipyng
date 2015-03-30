angular.module('md.codecell', ['ipyng', 'templates', 'ui.codemirror', 'ipy.output-area', 'ui.utils', 'ngMaterial', 'ui.bootstrap', 'ng.lodash'])
  .directive('mdCodecell', function (_, $q, $timeout) {
    return {
      templateUrl: 'md-codecell.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        cell: '=?',
        execute: '=?',
        cmPromise: '=?'
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

        // Insert a 0ms delay to load codemirror, otherwise codemirror options don't register correctly
        scope.delay = false;
        $timeout(function(){
          scope.delay = true;
        });

        var cmDeferred = $q.defer();
        scope.cmPromise = cmDeferred.promise;
        var onCodeMirrorLoad = function(cmInstance){
          cmDeferred.resolve(cmInstance);
        };
        scope.cmOptions = {
          mode: kernel.language_info.name,
          onLoad: onCodeMirrorLoad,
          scrollbarStyle: null
        };

        scope.execute = function ($event) {
          if($event) $event.preventDefault();
          scope.cell.outputs = [];
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
            })
            .catch(function(error){
              outputs.push(error);
              cell.execution_count = error.execution_count;
              scope.outputs = outputs;
            });
        };
      }
    };
  })
;