(function(angular){
  'use strict';

  angular.module('ipy.notebook', ['ipyng', 'ipy.codecell', 'ngMaterial', 'ng.lodash'])
    .directive('ipyNotebook', ipyNotebookDirective)
    .controller('ipyNotebookCtrl', ipyNotebookCtrl);

  function ipyNotebookDirective () {
    return {
      templateUrl: 'ipy-notebook.tpl.html',
      restrict: 'E',
      require: ['ipyNotebook', '^kernel'],
      scope: {
        notebook: '=?',
        ctrl: '=?'
      },
      link: function (scope, element, attrs, ctrls) {
        ctrls[0].init(ctrls[1]);
      },
      controller: 'ipyNotebookCtrl',
      bindToController: true,
      controllerAs: 'ctrl'
    };
  }

  function ipyNotebookCtrl ($scope, $element, _, $timeout, $q, $animate){
    var transitionDelay = 100,
      self = this,
      cells,
      kernel;

    self.isCommandMode = null;
    self.init = init;
    self.insertAbove = insertAbove;
    self.insertBelow = insertBelow;
    self.selectCell = selectCell;
    self.selectAbove = selectAbove;
    self.selectBelow = selectBelow;
    self.cut = cut;
    self.copy = copy;
    self.paste = paste;
    self.undo = undo;
    self.merge = merge;
    self.toggleOutput = toggleOutput;
    self.moveUp = moveUp;
    self.moveDown = moveDown;
    self.commandMode = commandMode;
    self.editMode = editMode;

    $scope.onCellLoad = onCellLoad;

    function init (kernel_) {
      kernel = kernel_;

      ///// initialize notebook state
      // default notebook if not provided
      console.log(self.notebook);
      if(!self.notebook) {
        self.notebook = {
          cells: [],
          metadata: {
            language_info: kernel.language_info
          },
          nbformat: 4,
          nbformat_minor: 0
        };
      }
      cells = self.notebook.worksheets[0].cells;

      // Initialize directive position
      selectCell(0);
      commandMode();

      // Bind hotkeys
      $element.bind('keydown', onKeydown);
    }

    function onCellLoad (index, cm, execute, toggleOutput){
      cells[index].cm = cm;
      cells[index].execute = execute;
      cells[index].toggleOutput = toggleOutput;
      if(insertDeferred) insertDeferred.resolve(null);
    }

    function insert (index){
      cells.splice(index, 0, {});
      createInsertPromise();
      insertPromise
        .then(function(){
          self.selected = index;
        });
      return insertPromise;
    }

    function insertAbove (){
      var index = self.selected;
      if(index === undefined) index = 0;
      return insert(index);
    }

    function insertBelow (){
      if(self.selected === undefined) return insert(0);
      else return insert(self.selected + 1);
    }

    // When inserting a cell, we need to wait before resolving other functions
    // for the cells onLoad function to resolve.
    var insertPromise = $q.when(null);
    var insertDeferred = null;
    function createInsertPromise () {
      insertPromise = insertPromise
        .then(function(){
          insertDeferred = $q.defer();
          return insertDeferred.promise;
        });
      return insertPromise;
    }

    var copied = null;
    function copy () {
      copied = cells[self.selected];
    }

    function remove () {
      cells.splice(self.selected, 1);
      if(self.selected == cells.length) {
        selectCell(self.selected - 1);
      }
      else selectCell(self.selected);
      // Need to reenter command mode here in case
      // focus was placed on the element
      // we just removed.
      commandMode();
    }

    function cut () {
      copy();
      remove();
    }

    function paste () {
      if(copied) {
        cells.splice(self.selected + 1, 0, copyCell(copied));
        createInsertPromise();
        selectBelow();
        return insertPromise;
      }
      return $q.when(null);
    }

    function undo() {

    }

    function merge() {

    }

    // An unfortunately complicated function to swap two adjacent cells in a pretty way.
    function swap (moveUp) {
      var selectedNode,
        targetNode,
        index,
        targetTop,
        selectedTop;
      // Wait for insertions and other swaps to complete before beginning
      insertPromise = insertPromise
        .then(function(){
          index = moveUp ? self.selected + 1 : self.selected - 1;
          // if the swap is invalid reject the promise
          if(index < 0 || index >= cells.length) return $q.reject(null);
          // gather the codecells
          var items = _.filter(_.map($element.find('div'), angular.element), function(item){
            return item.hasClass('ipy-codecell');
          });
          selectedNode = items[self.selected];
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
          // Actually swap the cells
          var selectedCell = cells[self.selected];
          cells[self.selected] = cells[index];
          cells[index] = selectedCell;
          self.selected = index;
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
    }

    function moveUp () {
      swap(true);
    }

    function moveDown () {
      swap(false);
    }

    function editMode () {
      var selected = self.selected;
      insertPromise
        .then(function(){
          if(selected == self.selected){
            cells[selected].cm.getInputField().focus();
          }
        });
    }

    // element to focus for notebook shortcuts
    var notebookElement = $element.find('md-content')[0];
    function commandMode () {
      notebookElement.focus();
    }

    function selectCell (index) {
      if(index === undefined || index < 0) index = 0;
      if(index == cells.length){
        return insert(index);
      }
      insertPromise
        .then(function(){
          self.selected = index;
        });
    }

    function selectBelow () {
      if (self.selected < cells.length - 1) {
        selectCell(self.selected + 1);
      }
    }

    function selectAbove () {
      if (self.selected > 0) {
        selectCell(self.selected - 1);
      }
    }

    function toggleOutput () {
      var selected = self.selected;
      insertPromise
        .then(function(){
          if(selected == self.selected) cells[selected].toggleOutput();
        });
    }

    function onKeydown(event) {
      //console.log(event.keyCode);
      $scope.$apply(function(){
        if(event.keyCode == 13 && (event.shiftKey || event.ctrlKey || event.altKey)){
          handleExecute(event);
          return;
        }
        var selected = self.selected;
        var cm = cells[selected].cm;
        // Try to handle the key command using the cached instances
        // of cm, otherwise we can't preventDefault properly
        if(cm !== undefined) {
          if (self.isCommandMode) handleCommandMode(event, cm);
          else handleEditMode(event, cm);
        } else {
          // An insertion is still resolving; let's prevent the event to be save
          // and then try to resolve the command.
          event.preventDefault();
          insertPromise
            .then(function () {
              cm = cells[selected].cm;
              if (self.isCommandMode) handleCommandMode(event, cm);
              else handleEditMode(event, cm);
            });
        }
      });
    }

    function handleEditMode (event, cm) {
      if(event.keyCode == 27) { // esc
        event.preventDefault();
        commandMode();
      }
    }

    function handleCommandMode (event, cm) {
      var key = event.keyCode;
      if(!(event.ctrlKey || event.shiftKey || event.altKey)) {
        if (key == 13) { // enter
          event.preventDefault();
          editMode();
        }
        else if (key == 38 || key == 75) { // up or k
          event.preventDefault();
          selectAbove();
        }
        else if (key == 40 || key == 74) { // down or j
          event.preventDefault();
          selectBelow();
        }
        else if (key == 88) { // x
          event.preventDefault();
          cut();
        }
        else if (key == 86) { // v
          event.preventDefault();
          paste();
        }
        else if (key == 90) { // v
          event.preventDefault();
          undo();
        }
        else if (key == 65) { // a
          event.preventDefault();
          insertAbove();
        }
        else if (key == 66) { // b
          event.preventDefault();
          insertBelow();
        }
        else if (key == 67) { // c
          event.preventDefault();
          copy();
        }
        else if (key == 77) { // m
          event.preventDefault();
          merge();
        }
        else if (key == 79) { // o
          event.preventDefault();
          toggleOutput();
        }
      }
      else if(event.ctrlKey) {
        if(key == 75) { // k
          event.preventDefault();
          moveUp();
        }
        else if(key == 74) { // j
          event.preventDefault();
          moveDown();
        }
      }
    }

    function handleExecute (event) {
      event.preventDefault();
      var selected = self.selected;
      insertPromise
        .then(function(){
          if(selected != self.selected) return;
          if(event.shiftKey) {
            executeSelectBelow();
          }
          else if(event.altKey) {
            executeInsert();
          }
          else {
            executeInPlace();
          }
          commandMode();
        });
    }

    function executeInPlace () {
      cells[self.selected].cm.getInputField().blur();
      cells[self.selected].execute();
    }

    function executeInsert () {
      cells[self.selected].cm.getInputField().blur();
      // insert a timeout so output animation doesn't interfere with select animation
      $timeout(cells[self.selected].execute, transitionDelay);
      insertBelow();
    }

    function executeSelectBelow () {
      cells[self.selected].cm.getInputField().blur();
      $timeout(cells[self.selected].execute, transitionDelay);
      self.selectCell(self.selected + 1);
    }

    function copyCell (cell) {
      // We need a temporary clone to delete the execute/cm attributes from the cell
      // then we'll call angular copy to clone deep the cell while taking care
      // of any ng-repeat identity crises.
      var temp = _.clone(cell);
      delete temp.execute;
      delete temp.cm;
      delete temp.toggleOutput;
      return angular.copy(temp);
    }
  }
})(angular);