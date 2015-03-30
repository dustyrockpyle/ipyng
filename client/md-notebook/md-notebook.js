angular.module('md.notebook', ['ipyng', 'md.codecell', 'ngMaterial', 'ng.lodash'])
  .directive('mdNotebook', function(_, $timeout){
    return {
      templateUrl: 'md-notebook.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        notebook: '=?',
        commands: '=?',
        selected: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        // Timeout before selecting cell to ensure cell exists;
        $timeout(function(){
          scope.commands.selectCell(0);
        });
        scope.cmPromises = {};
        if(!scope.commands) {
          scope.commands = {};
        }
        var commands = scope.commands;
        scope.execute = {};

        element.bind('keypress keydown', function(event){
          if(event.shiftKey && event.charCode == 13){
            scope.execute[scope.selected]();
            event.preventDefault();
            commands.selectCell(scope.selected + 1);
            commands.focus();
          }
        });

        var newCell = function(){
          return {guid: _.uniqueId()};
        };

        commands.insert = function(){
          if(!scope.selected) {
            scope.notebook.cells.push(newCell());
          }
          else{
            scope.notebook.cells.splice(scope.selected + 1, 0, newCell());
          }
        };

        commands.focus = function(){
          // In case the cell was just created, insert a timeout
          // before focusing to ensure the new cell is created
          $timeout(function(){
            scope.cmPromises[scope.selected]
              .then(function(cm){
                cm.focus();
              });
          })
        };

        commands.selectCell = function(index) {
          if(index == scope.notebook.cells.length){
            commands.insert();
          }
          scope.selected = index;
        };

        if(!scope.notebook) {
          scope.notebook = {
            cells: [],
            metadata: {
              language_info: kernel.language_info
            },
            nbformat: 4,
            nbformat_minor: 0
          };
        }

        _.forEach(scope.notebook.cells, function(cell){
          cell.guid = _.uniqueId();
        });
      }
    };
  });