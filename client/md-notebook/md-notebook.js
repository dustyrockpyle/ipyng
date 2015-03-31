angular.module('md.notebook', ['ipyng', 'md.codecell', 'ngMaterial', 'ng.lodash'])
  .directive('mdNotebook', function(_, $timeout, $q){
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
        ///// initialize notebook state
        // default notebook if not provided
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
        var cells = scope.notebook.cells;

        // Setup a guid for each cell
        _.forEach(cells, function(cell){
          cell.guid = _.uniqueId();
        });

        scope.onCellLoad = function(index, cmInstance, execute){
          cells[index].cmInstance = cmInstance;
          cells[index].execute = execute;
          if(insertDeferred) insertDeferred.resolve(null);
        };

        // Commands exposed for consumers of this directive
        if(!scope.commands) {
          scope.commands = {};
        }
        var commands = scope.commands;

        // Create commands
        commands.insertAbove = function(){
          var index = scope.selected;
          if(index === undefined) index = 0;
          return commands.insert(index);
        };

        commands.insertBelow = function(){
          if(scope.selected === undefined) return commands.insert(0);
          else return commands.insert(scope.selected + 1);
        };

        // When inserting a cell, we need to wait before resolving other functions
        // for the cells onLoad function to resolve.
        var insertPromise = $q.when(null);
        var insertDeferred = null;
        var createInsertPromise = function () {
          insertPromise = insertPromise
            .then(function(){
              insertDeferred = $q.defer();
              return insertDeferred.promise;
            });
          return insertPromise;
        };

        commands.insert = function(index){
          cells.splice(index, 0, {});
          createInsertPromise();
          commands.selectCell(index);
          return insertPromise
        };

        var copied = null;
        commands.copy = function() {
          copied = cells[scope.selected];
        };

        commands.remove = function() {
          cells.splice(scope.selected, 1);
          if(scope.selected == cells.length) {
            commands.selectCell(scope.selected - 1);
          }
          else commands.selectCell(scope.selected);
          // Need to reenter command mode here in case
          // focus was placed on the element
          // we just removed.
          commands.commandMode();
        };

        commands.cut = function() {
          commands.copy();
          commands.remove();
        };

        commands.paste = function() {
          if(copied) {
            cells.splice(scope.selected + 1, 0, copyCell(copied));
            createInsertPromise();
            commands.selectCell(scope.selected + 1);
            return insertPromise;
          }
          return $q.when(null);
        };

        commands.editMode = function(){
          var selected = scope.selected;
          insertPromise
            .then(function(){
              if(selected == scope.selected){
                cells[selected].cmInstance.getInputField().focus();
              }
            });
        };

        // element to focus for notebook shortcuts
        var notebookElement = element.find('md-content')[0];
        commands.commandMode = function(){
          var selected = scope.selected;
          insertPromise
            .then(function(){
              if(selected == scope.selected) {
                cells[selected].cmInstance.getInputField().blur();
                notebookElement.focus();
              }
            });
        };

        commands.selectCell = function(index) {
          if(index === undefined || index < 0) index = 0;
          if(index == cells.length){
            commands.insert(index);
          }
          scope.selected = index;
        };

        // Initialize directive position
        commands.selectCell(0);

        // Create hotkeys
        element.bind('keydown', function(event){
          scope.$apply(function(){
            if(event.keyCode == 13 && (event.shiftKey || event.ctrlKey || event.altKey)){
              handleExecute(event);
              return;
            }
            var selected = scope.selected;
            var cmInstance = cells[selected].cmInstance;
            // Try to handle the key command using the cached instances
            // of cmInstance, otherwise we can't preventDefault properly
            if(cmInstance !== undefined) {
              if (cmInstance.hasFocus()) handleEditMode(event, cmInstance);
              else handleCommandMode(event, cmInstance);
            } else {
              // Well somethings weird so let's just prevent the event
              // and try to resolve the command.
              event.preventDefault();
              insertPromise
                .then(function () {
                  cmInstance = cells[selected].cmInstance;
                  if (cmInstance.hasFocus()) handleEditMode(event, cmInstance);
                  else handleCommandMode(event, cmInstance);
                });
            }
          });
        });

        function handleEditMode (event, cm) {
          if(event.keyCode == 27) { // esc
            event.preventDefault();
            commands.commandMode();
          }
        }

        function handleCommandMode (event, cm) {
          var key = event.keyCode;
          if (key == 13) { // enter
            event.preventDefault();
            commands.editMode();
          }
          else if (key == 38 || key == 75) { // up or k
            event.preventDefault();
            if (scope.selected > 0) {
              commands.selectCell(scope.selected - 1);
            }
          }
          else if (key == 40 || key == 74) { // down or j
            event.preventDefault();
            if (scope.selected < cells.length - 1) {
              commands.selectCell(scope.selected + 1);
            }
          }
          else if (key == 88) { // x
            event.preventDefault();
            commands.cut();
          }
          else if (key == 86) { // v
            event.preventDefault();
            commands.paste();
          }
          else if (key == 90) { // v
            event.preventDefault();
            commands.undo();
          }
          else if (key == 65) { // a
            event.preventDefault();
            commands.insertAbove();
          }
          else if (key == 66) { // b
            event.preventDefault();
            commands.insertBelow();
          }
          else if (key == 67) { // c
            event.preventDefault();
            commands.copy();
          }
          else if (key == 77) { // m
            event.preventDefault();
            commands.merge();
          }
        }

        function handleExecute (event) {
          event.preventDefault();
          var selected = scope.selected;
          insertPromise
            .then(function(){
              if(selected != scope.selected) return;
              cells[selected].execute();
              cells[selected].cmInstance.getInputField().blur();
              if(event.shiftKey) {
                commands.selectCell(scope.selected + 1);
              }
              else if(event.altKey) {
                commands.insertBelow()
              }
              commands.commandMode();
            });
        }

        function copyCell (cell) {
          // We need a temporary clone to delete the execute/cmInstance attributes from the cell
          // then we'll call angular copy to clone deep the cell while taking care
          // of any ng-repeat identity crises.
          var temp = _.clone(copied);
          delete temp.execute;
          delete temp.cmInstance;
          return angular.copy(temp);
        }
      }
    };
  });