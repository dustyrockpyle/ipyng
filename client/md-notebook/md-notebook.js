angular.module('md.notebook', ['ipyng', 'md.codecell', 'ngMaterial', 'ng.lodash'])
  .directive('mdNotebook', function(_, $timeout, $q, $animate){
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
        var transitionDelay = 100;
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
        scope.isCommandMode = null;

        // Setup a guid for each cell
        _.forEach(cells, function(cell){
          cell.guid = _.uniqueId();
        });

        scope.onCellLoad = function(index, cm, execute, toggleOutput){
          cells[index].cm = cm;
          cells[index].execute = execute;
          cells[index].toggleOutput = toggleOutput;
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
          insertPromise
            .then(function(){
              scope.selected = index;
            });
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
            commands.selectBelow();
            return insertPromise;
          }
          return $q.when(null);
        };

        // An unfortunately complicated function to swap two adjacent cells in a pretty way.
        var swap = function(moveUp) {
          var selectedNode;
          var targetNode;
          var index;
          var targetTop;
          var selectedTop;
          // Wait for insertions and other swaps to complete before beginning
          insertPromise = insertPromise
            .then(function(){
              index = moveUp ? scope.selected + 1 : scope.selected - 1;
              // if the swap is invalid reject the promise
              if(index < 0 || index >= cells.length) return $q.reject(null);
              // gather the codecells
              var items = _.filter(_.map(element.find('md-whiteframe'), angular.element), function(item){
                return item.hasClass('md-codecell');
              });
              selectedNode = items[scope.selected];
              targetNode = items[index];
              // We need to compute the y translation of the selected and target nodes.
              // This is slightly complicated by the fact that the target node is scaled,
              // hence the addition of the scaleHeight factor.
              var targetRect = targetNode[0].getBoundingClientRect();
              targetTop = targetRect.top;
              var selectedRect = selectedNode[0].getBoundingClientRect();
              selectedTop = selectedRect.top;
              var translateY = targetTop - selectedTop;
              var targetHeight = targetRect.height;
              var selectedHeight = selectedRect.height;
              var scale = targetHeight / targetNode[0].offsetHeight;
              var scaleHeight = targetHeight *(1-scale) / 2;
              var deltaHeight = targetHeight - selectedHeight;
              var newSelectedTop = translateY;
              var newTargetTop = -translateY;
              if(translateY > 0) {
                newSelectedTop += deltaHeight + scaleHeight;
                newTargetTop += scaleHeight;
              } else {
                newSelectedTop -= scaleHeight;
                newTargetTop -= deltaHeight + scaleHeight;
              }
              // Run the animation for each node, and resolve this promise
              // when the animation has finished

              var selectedAnimation = $animate.addClass(selectedNode, 'swapping', {
                from: {position: 'relative', top: 0},
                to: {top: newSelectedTop + 'px'}
              });
              var targetAnimation = $animate.addClass(targetNode, 'swapping', {
                from: {position: 'relative', top: 0},
                to: {top: newTargetTop + 'px'}
              });
              return $q.all([selectedAnimation, targetAnimation]);
            })
            .then(function(){
              // remove the animation styles
              selectedNode[0].removeAttribute("style");
              targetNode[0].removeAttribute("style");
              selectedNode.removeClass('swapping');
              targetNode.removeClass('swapping');
              var targetRect = targetNode[0].getBoundingClientRect();
              // Actually swap the cells
              var selectedCell = cells[scope.selected];
              cells[scope.selected] = cells[index];
              cells[index] = selectedCell;
              scope.selected = index;
              // Seem to need a small delay to allow animation to complete properly
              // in case a bunch of swaps have been cued up. This will need testing
              // on faster/slower machines. There's probably a better solution than this.
              return $timeout(_.noop, 20);
            })
            // Assume the reason the promise failed was that the swap
            // was invalid and that we don't need to clean anything up.
            .catch(function(){
              return null;
            });
        };

        commands.moveUp = function(){
          swap(true);
        };

        commands.moveDown = function() {
          swap(false);
        };

        commands.editMode = function(){
          var selected = scope.selected;
          insertPromise
            .then(function(){
              if(selected == scope.selected){
                cells[selected].cm.getInputField().focus();
              }
            });
        };

        // element to focus for notebook shortcuts
        var notebookElement = element.find('md-content')[0];
        commands.commandMode = function(){
          notebookElement.focus();
        };

        commands.selectCell = function(index) {
          if(index === undefined || index < 0) index = 0;
          if(index == cells.length){
            return commands.insert(index);
          }
          insertPromise
            .then(function(){
              scope.selected = index;
            });
        };

        commands.selectBelow = function() {
          if (scope.selected < cells.length - 1) {
            commands.selectCell(scope.selected + 1);
          }
        };

        commands.selectAbove = function() {
          if (scope.selected > 0) {
            commands.selectCell(scope.selected - 1);
          }
        };

        commands.toggleOutput = function() {
          var selected = scope.selected;
          insertPromise
            .then(function(){
              if(selected == scope.selected) cells[selected].toggleOutput();
            });
        };
        // Initialize directive position
        commands.selectCell(0);
        commands.commandMode();

        // Create hotkeys
        element.bind('keydown', function(event){
          //console.log(event.keyCode);
          scope.$apply(function(){
            if(event.keyCode == 13 && (event.shiftKey || event.ctrlKey || event.altKey)){
              handleExecute(event);
              return;
            }
            var selected = scope.selected;
            var cm = cells[selected].cm;
            // Try to handle the key command using the cached instances
            // of cm, otherwise we can't preventDefault properly
            if(cm !== undefined) {
              if (scope.isCommandMode) handleCommandMode(event, cm);
              else handleEditMode(event, cm);
            } else {
              // An insertion is still resolving; let's prevent the event to be save
              // and then try to resolve the command.
              event.preventDefault();
              insertPromise
                .then(function () {
                  cm = cells[selected].cm;
                  if (scope.isCommandMode) handleCommandMode(event, cm);
                  else handleEditMode(event, cm);
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
          if(!(event.ctrlKey || event.shiftKey || event.altKey)) {
            if (key == 13) { // enter
              event.preventDefault();
              commands.editMode();
            }
            else if (key == 38 || key == 75) { // up or k
              event.preventDefault();
              commands.selectAbove();
            }
            else if (key == 40 || key == 74) { // down or j
              event.preventDefault();
              commands.selectBelow();
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
            else if (key == 79) { // o
              event.preventDefault();
              commands.toggleOutput();
            }
          }
          else if(event.ctrlKey) {
            if(key == 75) { // k
              event.preventDefault();
              commands.moveUp();
            }
            else if(key == 74) { // j
              event.preventDefault();
              commands.moveDown();
            }
          }
        }

        function handleExecute (event) {
          event.preventDefault();
          var selected = scope.selected;
          insertPromise
            .then(function(){
              if(selected != scope.selected) return;
              if(event.shiftKey) {
                executeSelectBelow();
              }
              else if(event.altKey) {
                executeInsert();
              }
              else {
                executeInPlace();
              }
              commands.commandMode();
            });
        }

        function executeInPlace () {
          cells[scope.selected].cm.getInputField().blur();
          cells[scope.selected].execute();
        }

        function executeInsert () {
          cells[scope.selected].cm.getInputField().blur();
          // insert a timeout so output animation doesn't interfere with select animation
          $timeout(cells[scope.selected].execute, transitionDelay);
          commands.insertBelow()
        }

        function executeSelectBelow () {
          cells[scope.selected].cm.getInputField().blur();
          $timeout(cells[scope.selected].execute, transitionDelay);
          commands.selectCell(scope.selected + 1);
        }

        function copyCell (cell) {
          // We need a temporary clone to delete the execute/cm attributes from the cell
          // then we'll call angular copy to clone deep the cell while taking care
          // of any ng-repeat identity crises.
          var temp = _.clone(copied);
          delete temp.execute;
          delete temp.cm;
          delete temp.toggleOutput;
          return angular.copy(temp);
        }
      }
    };
  });